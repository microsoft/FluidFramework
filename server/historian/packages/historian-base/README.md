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
document manager. Summary routes do not perform a redundant ownership precheck.

Recovery requires HTTP 409 with `internalErrorCode: "DocumentStorageMetadataMissing"`.
The code is `InternalErrorCode.DocumentStorageMetadataMissing` in the server client.
Do not use the error message or `source` as the recovery protocol: older published clients
replace `source`, but already preserve `internalErrorCode`.
This lets Historian keep its existing published server dependencies without a patched client
or an unpublished cross-release dependency.

Before backfill, Historian validates the authoritative tenant, document, deletion state,
durable container type, and storage account. It then calls GitRest's private backfill endpoint
and retries the original operation once. Concurrent operations share recovery; a failed
validation, backfill, or retry is propagated. Ephemeral requests never enter recovery or
resolve a durable storage account.

Storage-name retrievers can optionally implement `getForRequest(tenantId, documentId, readDocument)`
to share the request's document read, and `getWithDocumentDetails(tenantId, document)` to resolve
legacy storage from an already validated document.

The option also enables authenticated
`POST /repos/:ignored?/:tenantId/internal/document-storage/initialize`.
It requires document-write scope and honors token revocation and tenant/document deny lists.
When an access authorizer is configured, initialization also requires a validated
`Fluid-Create-Context` and an authorized pending creation proof.
Deployments must restrict these private initialization/backfill operations to trusted services.

After publishing the server client, GitRest, and Historian packages from the integrated source,
consumers should upgrade their packages and keep only their storage-provider implementation.
That implementation must emit the structured missing-metadata error code and implement the
conditional initialize/backfill hooks. No client transport or Historian source patch is needed.
