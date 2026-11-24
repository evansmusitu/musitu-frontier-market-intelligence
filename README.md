# MUSITU Frontier Market Intelligence (FMI)

Dedicated public development repository for FMI. Migrated from nine pinned FMI branches in `evansmusitu/mft-axiom-build`.

## Source layout

- `app/` — customer worker and flagship V1/V2 assets.
- `admin/` — administration worker.
- `scripts/` — FMI build, provider controls, billing and deployment tooling.
- `tests/` — migrated V9 provider and rights tests.
- `deploy_payload/` — inspected V8 and V9.1 transport bundles.
- `migration/legacy-workflows/` — archived, inactive workflow definitions.
- `migration/legacy-variants/` — distinct historical reconciliation versions.
- `migration/source-inventory.json` — original Git blob and branch provenance for every inventoried path/version, including held material.

## Build and validation (offline, no deployment)

```sh
python scripts/verify_fmi_flagship_v2_assets.py
FLAGSHIP_WORKER_OUT=/tmp/fmi-flagship-worker.mjs python scripts/build_fmi_flagship_worker.py
node --check /tmp/fmi-flagship-worker.mjs
PYTHONPATH=scripts python -m pytest -q tests
```

These commands are proposed validation steps, not a claim that the suite has passed. Some legacy tests or scripts may require a separate runtime payload or additional setup. Do not run legacy deployment scripts or activate archived workflows against live services until independent qualification.

## Migration boundary

138 of 185 inventoried path/blob versions were transferred exactly. The original repo remains intact. The V9.4 transport is blocked by upstream chunk size and digest mismatch. Historical launch archives and operational evidence remain referenced at pinned source commits pending review. No credentials, production cutover, license grant or live readiness certification is implied.
