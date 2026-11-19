# @fluidframework/gitrest-base

The `@fluidframework/gitrest-base` package exports base GitRest constructs consumable by service providers.

Creating or updating a Git reference requires a `sha` value with exactly 40 lowercase hexadecimal characters.
Noncanonical values are rejected with HTTP 400 by both the routes and the repository manager.

## Internal durable-storage operations

Providers initialize new durable ownership in their existing repository factory `create`
operation before writing content. A missing repository (HTTP 400) or storage container
(HTTP 404, durable storage only) on a per-document write enters this existing create path.
No separate initialization endpoint or client round trip is required.

Providers can implement the optional `IRepositoryManagerFactory.backfillDocumentStorage` hook.
GitRest exposes it at `POST /repos/:owner/:repo/internal/document-storage/backfill`.
This route requires the repository-per-document model and rejects ephemeral containers.
An unconfigured hook returns HTTP 501.
The backfill hook does not open a repository or run during ordinary document reads and writes.

This is a trusted service-to-service operation, not a public client API.
Deployments must restrict access to the route.
Before calling backfill, the caller must validate the tenant, document, and storage account
against the authoritative document record.
The provider hook must validate its routing parameters and write ownership metadata conditionally,
without overwriting a conflicting owner.

If existing durable storage has no ownership metadata, return HTTP 409 with
`internalErrorCode: "DocumentStorageMetadataMissing"` (the server client's
`InternalErrorCode.DocumentStorageMetadataMissing`).
Historian uses this exact code to trigger authoritative validation and conditional backfill.
An error `source` is diagnostic only; older clients replace it in transit.
Other ownership failures must not use the missing-metadata code.
