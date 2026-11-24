# MUSITU FMI Provider Rights Policy Contract — V9.3 Candidate

Status: `CANDIDATE_TESTED_NOT_AUTHORIZED_NOT_BOUND`.

This contract is a technical fail-closed enforcement layer. It is **not evidence that MUSITU possesses provider rights**, and setting environment variables cannot self-certify a license, redistribution permission, external API permission, or waiver. Runtime values must reflect a genuine external agreement before deployment.

## Deny-by-default provider gates

The Twelve Data candidate adapter must reject a snapshot **before any upstream provider request** unless all configured gates are valid:

- `TWELVE_DATA_LICENSE_AUTHORIZED=true`
- `TWELVE_DATA_REDISTRIBUTION_AUTHORIZED=true`
- `TWELVE_DATA_EXTERNAL_API_AUTHORIZED=true`
- non-empty `TWELVE_DATA_RIGHTS_REFERENCE` (never returned raw)
- valid current `TWELVE_DATA_RIGHTS_EFFECTIVE_AT` and `TWELVE_DATA_RIGHTS_EXPIRES_AT`
- integer `TWELVE_DATA_MAX_RETENTION_SECONDS`
- `TWELVE_DATA_ALLOWED_MARKET_CLASSES` includes the requested market class
- explicit `TWELVE_DATA_ATTRIBUTION_REQUIRED=true|false`
- when attribution is required, configured attribution text and HTTPS URL
- private API key, entitlement label and freshness label

The raw rights reference is hashed to `rights_reference_hash`. The normalized public-safe rights object is hashed to `rights_hash`.

## Rights proof

The provider adapter returns only normalized public-safe rights metadata:

- provider
- rights reference hash
- license / redistribution / external API authorization booleans
- requested market class
- maximum retention seconds
- effective / expiry timestamps
- attribution requirement + configured public display metadata
- `raw_provider_data_persisted=false`

No raw contract reference, API key, customer bearer, or customer ID may enter the proof.

## Independent verification

The provider-neutral router must independently validate and recompute `rights_hash`. A malformed, expired, provider-mismatched, market-class-mismatched, or tampered successful rights proof is an `INTEGRITY_FAILURE` and **must not trigger fallback**.

The FMI public edge must independently validate the router rights proof again. It binds `rights` and `rights_hash` into the market-context hash and may persist only public-safe proof metadata such as the hashes, market class, expiry, retention policy and attribution-required boolean. Raw provider bars and raw contract references are not persisted by this rights layer.

## Caching / retention boundary

Market-context JSON remains `cache-control: no-store`. `max_retention_seconds` is a contractual policy ceiling carried in evidence, not permission to retain raw provider data. The V9.3 candidate declares `raw_provider_data_persisted=false` and adds no provider-data cache.

## Promotion boundary

V9.3 must remain unbound and undeployed until the existing V9.2 manual read-only preflight genuinely returns `promotion_ready=true` from externally established provider rights and private credentials against unchanged production. No live trading, broker execution, autonomous trading, profitability or superiority authority is created by this contract.
