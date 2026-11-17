# @fluidframework/gitrest-base

The `@fluidframework/gitrest-base` package exports base GitRest constructs consumable by service providers.

Creating or updating a Git reference requires a `sha` value with exactly 40 lowercase hexadecimal characters.
Noncanonical values are rejected with HTTP 400 by both the routes and the repository manager.

## Internal durable-storage operations

Providers can implement the optional `IRepositoryManagerFactory.initializeDocumentStorage` and
`backfillDocumentStorage` hooks.
GitRest exposes these hooks at `POST /repos/:owner/:repo/internal/document-storage/initialize`
and `POST /repos/:owner/:repo/internal/document-storage/backfill`.
These routes require the repository-per-document model and reject ephemeral containers.
An unconfigured hook returns HTTP 501.
The hooks do not open a repository or run during ordinary document reads and writes.

These are trusted service-to-service operations, not public client APIs.
Deployments must restrict access to the routes.
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
