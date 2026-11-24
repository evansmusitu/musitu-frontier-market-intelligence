#!/usr/bin/env python3
"""Build a new deterministic V9.4 transport from the recovered exact source files.

This does not reconstruct the historical compressed bytes or deploy anything.
"""
import argparse
import base64
import gzip
import hashlib
import io
import json
from pathlib import Path
import tarfile

EXPECTED = {
    'edge/fmi-global/worker.js': (151555, 'a26e9c088e64df46a257f575f84f1274e9e26f6f669fc0a9c4ee810bf1179338'),
    'edge/fmi-market-data/router.js': (15554, '2251c0867137a06f6caf4994c626361c54b67411857866afa75cd5748850cb34'),
    'edge/fmi-market-data/providers/twelve-data-adapter.js': (11493, '4fb2104432df98bbb2d59bd8fc0c2f9de0482bec030e2217cfe99fc6eda0fbe1'),
    'edge/fmi-market-data/RIGHTS_POLICY_CONTRACT.md': (3148, '03b3daee9ba8fba5340d6282f8cc1d2e573bca4636c3347df360daae5d0c8440'),
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def build(root, out):
    files = {}
    for name, (size, digest) in EXPECTED.items():
        data = (root / name).read_bytes()
        if len(data) != size or sha(data) != digest:
            raise ValueError('source integrity mismatch: ' + name)
        files[name] = data
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode='w', format=tarfile.USTAR_FORMAT) as tar:
        for name, data in sorted(files.items()):
            info = tarfile.TarInfo(name)
            info.size, info.mode, info.mtime = len(data), 0o644, 0
            tar.addfile(info, io.BytesIO(data))
    compressed = io.BytesIO()
    with gzip.GzipFile(filename='', mode='wb', fileobj=compressed, mtime=0) as gz:
        gz.write(raw.getvalue())
    bundle = compressed.getvalue()
    with tarfile.open(fileobj=io.BytesIO(bundle), mode='r:gz') as tar:
        if set(tar.getnames()) != set(files):
            raise ValueError('archive membership mismatch')
        for name, data in files.items():
            if tar.extractfile(name).read() != data:
                raise ValueError('archive round-trip mismatch: ' + name)
    encoded = base64.b64encode(bundle)
    parts = [encoded[i:i+8000] for i in range(0, len(encoded), 8000)]
    chunks = [{'file': f'chunk_{i:02d}.b64', 'size': len(part), 'sha256': sha(part)}
              for i, part in enumerate(parts)]
    manifest = {
        'schema': 'musitu.fmi.v9-4-control-transport.recovered.v1',
        'original_compressed_transport_reproduced': False,
        'base64_size': len(encoded), 'base64_sha256': sha(encoded),
        'tar_gz_size': len(bundle), 'tar_gz_sha256': sha(bundle),
        'chunks': chunks,
        'payload_manifest': {'schema': 'musitu.fmi.v9-4-control-payload.v1', 'files': [
            {'path': name, 'size': size, 'sha256': digest}
            for name, (size, digest) in sorted(EXPECTED.items())]},
    }
    out.mkdir(parents=True, exist_ok=False)
    for chunk, part in zip(chunks, parts):
        (out / chunk['file']).write_bytes(part)
    (out / 'TRANSPORT_MANIFEST.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    reread = b''.join((out / x['file']).read_bytes() for x in chunks)
    if sha(reread) != manifest['base64_sha256'] or base64.b64decode(reread, validate=True) != bundle:
        raise ValueError('written transport round-trip mismatch')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--out', type=Path, required=True, help='New, nonexistent output directory')
    args = parser.parse_args()
    result = build(args.root, args.out)
    print(json.dumps({'status': 'RECOVERED_TRANSPORT_INTEGRITY_PASS', 'files': len(EXPECTED),
                      'tar_gz_sha256': result['tar_gz_sha256'], 'chunks': len(result['chunks'])}, sort_keys=True))
