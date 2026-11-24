# MUSITU Frontier Market Intelligence (FMI)

Dedicated public FMI development repository. Nine historical FMI branches in `evansmusitu/mft-axiom-build` have been inventoried.

## Source layout

- `app/` — customer worker and flagship V1/V2 assets.
- `admin/` — administration worker.
- `edge/` — recovered exact V9.4 edge runtime, market-data router, adapter and rights contract.
- `scripts/` — build, provider controls, billing and deployment tooling.
- `tests/` — migrated provider and rights tests.
- `deploy_payload/` — V8, V9.1 transport bundles and V9.4 recovery record.
- `migration/legacy-workflows/` — inactive historical workflow definitions.
- `migration/legacy-variants/` — historical reconciliation variants.
- `migration/legacy-launch-fragments/` — verified historical fragments; not a complete ZIP.
- `migration/source-inventory.json` — source provenance and disposition of all 185 inventoried path/blob versions.

## Validation (no deployment)

```sh
python scripts/verify_fmi_flagship_v2_assets.py
FLAGSHIP_WORKER_OUT=/tmp/fmi-flagship-worker.mjs python scripts/build_fmi_flagship_worker.py
node --check /tmp/fmi-flagship-worker.mjs
PYTHONPATH=scripts python -m pytest -q tests
python scripts/rebuild_fmi_v9_4_transport.py --out /tmp/fmi-v94-recovered
```

The V9.4 rebuild was tested twice locally using the exact recovered source bytes. The other validation commands have not yet been executed against this consolidated repository. Historical workflows remain inactive; do not execute operational scripts against production without independent qualification.

## Historical recovery boundary

167 of 185 inventoried versions are exact imports, one evidence record is redacted, ten defective V9.4 transport paths are superseded by four hash-verified runtime files and a reproducible new transport, and seven damaged launch fragments are superseded by the private authoritative ZIP (333,338 bytes; all 168 controlled files verified). The original compressed V9.4 transport has not been reproduced. The private full launch archive remains in the owner's Drive and was not republished wholesale.

No production cutover, live trading, historical commit-graph migration, license grant or production readiness certification is implied. See MIGRATION.md for details.
