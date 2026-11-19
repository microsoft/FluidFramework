# @fluidframework/historian-base

The historian base package exports base historian constructs consumable by service providers.

Creating or updating a Git reference requires a `sha` value with exactly 40 lowercase hexadecimal characters.
Historian rejects noncanonical values with HTTP 400 before forwarding the request to GitRest.

## GitRest-owned durable storage validation

Set `restGitService:gitrestOwnershipValidation` to `true` only when GitRest and its storage
provider enforce ownership on every storage operation. The option is off by default.
Historian does not access the filesystem or database in this mode. GitRest validates existing
metadata, and Historian consults the document manager for authoritative recovery when legacy
durable storage has no metadata. Container-type and storage-account routing may also use the
document manager. Durable summary routes do not perform a redundant ownership precheck.
Ephemeral summaries retain local expiry/deletion checks and the existing Alfred fallback
when local authorization is unavailable.

Recovery requires HTTP 409 with `internalErrorCode: "DocumentStorageMetadataMissing"`.
The code is `InternalErrorCode.DocumentStorageMetadataMissing` in the server client.
Do not use the error message or `source` as the recovery protocol: older published clients
replace `source`, but already preserve `internalErrorCode`.
This lets Historian keep its existing published server dependencies without a patched client
or an unpublished cross-release dependency.

Before backfill, Historian validates the authoritative tenant, document, deletion state,
durable container type, and storage account. It then calls GitRest's private backfill endpoint
and retries the original operation once. Concurrent operations on the same service instance
share recovery; a failed validation, backfill, or retry is propagated.
Failed recovery is cleared so a later operation on that instance can try again;
concurrent operations still share an in-flight recovery attempt.
Failed attempts also clear memoized document and storage-name lookups, so later
attempts validate fresh state. The first attempt still shares its routing lookups.
The configured customer-token reuse policy also applies to recovery validation.
Active durable `alfred-fallback` proofs can recover missing metadata; metadata-backed
and pending creation proofs do not enter recovery.
Ephemeral requests never enter recovery or
resolve a durable storage account.

Storage-name retrievers can optionally implement `getForRequest(tenantId, documentId, readDocument)`
to share the request's document read, and `getWithDocumentDetails(tenantId, document)` to resolve
legacy storage from an already validated document. The original `get` contract remains
supported, and its result is reused within the request.
When no retriever is configured and neither routing nor the authoritative document names an
account, recovery can use the provider's configured default route. The provider must validate
that default route before writing metadata. An unresolved configured retriever or a mismatch
between a named account and the default route is rejected.

Missing or failed static container-type lookups remain unknown until authoritative validation
succeeds; they are not cached as durable in this mode. This fallback does not run on local
ephemeral lifecycle hits. Summary routes pass their effective `ignoreEphemeralFlag` setting to
the service factory, including the route's default when the setting is omitted.

The option also enables authenticated
`POST /repos/:ignored?/:tenantId/internal/document-storage/initialize`.
It requires document-write scope and honors token revocation and tenant/document deny lists.
It is exposed through the shared route factory's `summaries` router as well as the app,
and uses the configured general per-tenant throttler before tenant lookup or storage writes.
Requests marked ephemeral are rejected before changing their routing cache.
Initialization and backfill reject tenant/document IDs containing `:` rather than
targeting a truncated identity through the existing colon-separated routing header.
When an access authorizer is configured, initialization also requires a validated
`Fluid-Create-Context` and an authorized pending creation proof.
Deployments must restrict these private initialization/backfill operations to trusted services.

After publishing the server client, GitRest, and Historian packages from the integrated source,
consumers should upgrade their packages and keep only their storage-provider implementation.
Their durable-document creation flow must call `initializeDocumentStorage` before uploading
the initial summary; the shared creation flow does not opt providers into this operation.
That implementation must emit the structured missing-metadata error code and implement the
conditional initialize/backfill hooks. No client transport or Historian source patch is needed.

Without an independent access proof, durable content in this mode does not use Historian's
content cache. Summaries (including version-SHA reads), blobs, commits, trees, headers, and full
trees must reach GitRest. Cache writes and cache-only background prefetches are also disabled.
Summary writes and deletes still invalidate existing cached summaries. Bypassed writers also
remove the cached latest-SHA pointer, so instances with validation disabled cannot pair an old
pointer with a newly cached summary during mixed-mode operation.
Version-specific cache reads also check the cached summary's own ID before returning it;
an inconsistent pointer/body pair falls back to fetching the requested version.
A direct object read adds one GitRest request for a former cache hit; a composite header or
full-tree read may require several object requests. No Alfred ownership precheck is added.
Ephemeral content, default-off deployments, and requests authorized by an independent access
proof retain their existing cache behavior.
