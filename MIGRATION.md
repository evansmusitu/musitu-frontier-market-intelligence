# FMI migration and recovery ledger

All 185 inventoried source path/blob versions have a recorded disposition in `migration/source-inventory.json`.

| Disposition | Count |
|---|---:|
| Exact original Git blobs | 167 |
| Public-safe redacted evidence | 1 |
| Superseded V9.4 transport paths | 10 |
| Superseded damaged historical launch fragments | 7 |

## Recovery evidence

- V9.4: authoritative internal V9.3 candidate ZIP, 1,125,879 bytes, SHA-256 `80e31e274705afb9acadc36fdfd736200dd7f4ba327d6811c730b5217703db59`. ZIP integrity passed; four extracted runtime files match the original transport payload manifest exactly. Their Git blobs were verified in this repository. The original corrupt chunk was not silently repaired. New transport builder produced identical output in two local runs, digest `eacb83b3acf1e78280f78564cfd97e8fe9e7ae809de1082651cb67be9cf840ae`.
- Historical launch: authoritative ZIP, 333,338 bytes, SHA-256 `c87009714befc99bf88c81d882aad98cd7dfa32f56daa1c8a5a38987f978152e`. ZIP integrity and all 168 manifest file checks passed. Eighteen source fragments matched exactly and were preserved; seven did not match and remain referenced to the verified private ZIP. It is classified as a private transport for paper/shadow use only and is not republished whole.
- Operational evidence: eleven exact imports, one internal identifier redacted with upstream provenance retained.

Original AXIOM source branches and production deployments remain intact. This is a source recovery and provenance milestone, not a complete standalone product qualification. No active deployment workflow, credential migration or live trading authority is established.
