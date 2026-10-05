# Ephemeral Summary GET Ownership Fast Path

**Status:** Approved design  
**Date:** 2026-10-05  
**Security issue:** MSRC 130146

## Summary

Historian currently performs a fresh Alfred document lookup before every protected summary GET,
non-initial POST, and DELETE. That check repaired the cross-tenant disclosure, but production
telemetry shows that it also added roughly one Alfred document GET per protected summary request
and materially increased Riddler, network, Redis, and Historian load.

This design preserves the existing ownership invariant while adding a narrow fast path for
Ephemeral Container (EC) summary GETs. Historian stores a tenant-qualified, lifecycle-aware EC
access record in its existing Redis deployment. An active record authorizes an EC GET without
calling Alfred. A missing record falls back to the existing authoritative Alfred validation and is
backfilled only after validation succeeds. Durable Container (DC) GETs, non-initial POSTs, and
DELETEs retain authoritative Alfred validation.

The change does not use the GetSession/static-document-property cache and does not introduce the
persistent deletion-generation machinery from closed PR #28333.

## Relationship to Existing Ownership Fixes

The implementation builds on, and does not revert, these merged changes:

- PR #27821: introduced Historian's authoritative document ownership boundary.
- PR #27876: restricted ownership retries to transient failures.
- PR #27901: accepted Mongo-shaped `storageName: null` as an absent optional value.
- PR #28215: removed the initial-upload replay check and added customer-token reuse.
- PR #28220: consumed the server packages required for customer-token ownership reads.

PR #28333 is superseded and closed. Its GetSession/static-cache design, persistent generation
fences, Alfred deletion wiring, and custom document-manager adapter are not part of this change.

## Goals

- Remove the Alfred ownership lookup from repeated EC summary GETs.
- Preserve non-disclosing cross-tenant denial before summary cache or storage access.
- Preserve authoritative Alfred validation for DC GET, non-initial POST, and DELETE.
- Reuse the authoritative Alfred response directly for routing when fallback occurs.
- Prevent a concurrent fallback from recreating an active EC record after deletion has been marked.
- Preserve EC expiration and deletion behavior without permanent tombstones.
- Avoid increasing the steady-state number of Redis reads for an EC GET.
- Keep the implementation small enough for a sunset service.

## Non-goals

- Caching DC ownership or routing metadata.
- Optimizing non-initial POST or DELETE away from Alfred.
- Changing initial-summary authorization.
- Making GitRest independently tenant-aware.
- Supporting reuse of a deleted EC `documentId` within its original EC lifetime.
- Replacing the existing summary cache.
- Adding a feature flag.
- Retaining any implementation from PR #28333 merely for code reuse.

## Security Invariants

Before a protected summary operation accesses the summary cache or GitRest, Historian must have one
of these proofs for the authenticated `(tenantId, documentId)`:

1. a valid active EC access record for the unexpired EC lifetime; or
2. a fresh authoritative Alfred document that exactly matches the authenticated identity and is
   active.

Additional invariants:

- A deleted EC record is terminal until the EC's natural expiration time.
- An active record must never overwrite a deleted record.
- Caller-provided `Is-Ephemeral-Container` and `StorageName` values do not select the protected GET
  backend.
- A DC request is never authorized from the EC access store.
- Summary cache access occurs only after access resolution succeeds.
- Failure to mark an EC deleted prevents the metadata deletion path from proceeding.

## Architecture

### Summary access context

Protected routes consume one resolved context instead of validating a document and then separately
re-resolving ephemeral state and storage routing:

```ts
interface ISummaryAccessContext {
    tenantId: string;
    documentId: string;
    isEphemeralContainer: boolean;
    createTime: number;
    storageName?: string;
    source: "localEphemeral" | "alfred";
}
```

`createGitService` accepts this context for protected operations. When a context is present, it uses
the context's `isEphemeralContainer` and `storageName` directly and does not call the existing
ephemeral/static-property cache path or `storageNameRetriever`.

Initial POST remains the only path that constructs a service from caller-supplied creation
metadata.

### Summary access resolver

`SummaryAccessResolver` is the only protected-route component that chooses between local EC state
and Alfred:

- GET uses the local-EC-first algorithm below.
- Non-initial POST and DELETE always use the existing Alfred validator.
- The resolver returns the same `ISummaryAccessContext` shape regardless of source.

Routes do not contain separate EC and DC authorization branches.

### EC access store

Historian introduces an `IEphemeralSummaryAccessStore` backed by the existing Redis connection and
the existing `git` namespace.

Key:

```text
summaryAccess:v1:{encodeURIComponent(tenantId)}:{encodeURIComponent(documentId)}
```

Logical value:

```ts
interface IEphemeralSummaryAccessRecord {
    version: 1;
    state: "active" | "deleted";
    createTime: number;
}
```

The concrete Redis representation may use a compact, strictly parsed string rather than JSON. The
representation is private to the store.

The store exposes:

```ts
read(tenantId, documentId)
activateIfNotDeleted(tenantId, documentId, createTime, expiresAt)
markDeleted(tenantId, documentId, createTime, expiresAt)
```

`activateIfNotDeleted` is atomic. It returns a deleted outcome without modifying the key when a
deleted record already exists. `markDeleted` atomically replaces active or missing state with
deleted state and is idempotent.

Both active and deleted records expire at the EC's natural expiration time:

```text
expiresAt = createTime + ephemeralDocumentTTLSec
```

The resolver also checks `createTime` on every hit, so Redis TTL rounding cannot authorize an
expired EC.

Because EC document IDs are not reused within their original lifetime, no generation counter or
permanent tombstone is required.

## Request Flows

### EC GET local hit

1. Run existing request parameter, token, scope, expiry, revocation, and deny-list validation.
2. Extract the authenticated `tenantId` and token-bound `documentId`.
3. Read the tenant-qualified EC access record.
4. Validate record version, state, `createTime`, and EC expiration.
5. For an active unexpired record, return an EC `ISummaryAccessContext` with source
   `localEphemeral`.
6. Construct `RestGitService` directly from the context.
7. Read the summary cache or tenant-qualified EC GitRest namespace.

No Alfred lookup, static-property lookup, ephemeral-flag lookup, or storage-name lookup occurs.

### Local miss with Alfred fallback

1. Perform the existing authoritative Alfred read, including customer-token reuse when configured.
2. Validate exact tenant/document identity, scheduled deletion, response shape, and EC expiration.
3. If Alfred returns DC, return an Alfred-sourced DC context and do not write the EC access store.
4. If Alfred returns EC, call `activateIfNotDeleted` with the authoritative `createTime`.
5. If the atomic activation reports an existing deleted record, return the normal non-disclosing
   404.
6. Otherwise return an Alfred-sourced EC context. A non-terminal cache write failure is logged and
   does not invalidate the fresh Alfred proof for the current in-flight request.

### Local read failure

The resolver distinguishes a clean miss from an unavailable or malformed security record.

- It performs Alfred validation to determine whether the document is DC or EC.
- A validated DC may proceed because DC does not depend on local deletion state.
- A validated EC fails closed with a dependency error because the resolver cannot exclude a local
  deleted state.

Malformed records are retained for diagnosis and treated as dependency failures. The resolver does
not delete a malformed record because doing so could erase a corrupted representation of a deleted
state.

### Non-initial POST

Non-initial POST continues to use the authoritative Alfred validator. The returned document is
converted directly into `ISummaryAccessContext`, so service construction does not repeat ephemeral
or storage-routing lookups.

No EC local positive record authorizes a write.

### DELETE

DELETE continues to use the authoritative Alfred validator.

For EC:

1. Derive `expiresAt` from the authoritative `createTime`.
2. Call `markDeleted` before summary cache or GitRest deletion.
3. If marking fails, fail the DELETE and do not proceed.
4. Clear summary cache and perform the requested GitRest soft or hard delete.

For DC, deletion behavior remains unchanged.

If GitRest deletion fails after the EC record is marked deleted, access remains fail-closed until
the EC's natural expiration time. This bounded availability trade-off is intentional.

### Deli EC cleanup

Within the EC lifetime, Deli always calls Historian DELETE before changing Mongo document metadata:

- `enableEphemeralContainerSummaryCleanup=true`: hard delete, preserving current behavior.
- `enableEphemeralContainerSummaryCleanup=false`: soft delete, which revokes access and writes the
  GitRest `.softDeleted` marker without physically removing the repository.

If Historian DELETE fails, Deli does not schedule or perform metadata deletion. After the EC lifetime
has expired, the access record and Redis summary storage have naturally expired, so Deli may retain
the existing skip behavior.

## Concurrency Semantics

A successful ownership observation authorizes the current in-flight request, matching the existing
fresh Alfred check. Deletion does not attempt to cancel a request that already observed active
state.

Deletion affects subsequently starting requests:

- A fallback that races with deletion cannot overwrite deleted state because activation is atomic.
- A request that reads active state before deletion may complete.
- A request that reads after `markDeleted` completes receives 404 before summary cache access.

The design intentionally performs one ownership-record read per local EC GET. It does not add a
second pre-response marker check.

## Error Semantics

- Missing Alfred document, identity mismatch, scheduled deletion, expired EC, or deleted local
  record: non-disclosing 404.
- Alfred 5xx, network failure, timeout, or malformed response: existing dependency error behavior.
- Unavailable/malformed local store followed by validated EC: dependency error/fail closed.
- Unavailable/malformed local store followed by validated DC: proceed using Alfred context.
- Active-store write failure after a clean miss and successful Alfred validation: log and proceed
  for the current request without caching.
- Atomic activation observing deleted state: non-disclosing 404.
- Deleted-state write failure: fail DELETE and prevent subsequent metadata deletion.

No error path defaults an unknown document to DC, trusts caller routing headers, or serves summary
cache content before access resolution.

## Component and File Impact

Expected upstream files:

- `server/historian/packages/historian-base/src/services/definitions.ts`
- new Historian summary access store implementation and contract
- `server/historian/packages/historian-base/src/routes/utils.ts`
- `server/historian/packages/historian-base/src/routes/summaries.ts`
- `server/historian/packages/historian-base/src/runnerFactory.ts`
- focused Historian store, resolver, route, and ownership tests
- `server/routerlicious/packages/lambdas/src/deli/lambdaFactory.ts`
- focused Deli cleanup tests

The implementation should not require changes to:

- Alfred document deletion;
- GitRest routing or repository management;
- GetSession/static document property caching;
- `server-services` `DocumentManager`;
- custom document-manager contracts; or
- FRS deployment YAML.

If implementation discovery proves one of these changes is required for correctness, the design
must be revisited before expanding scope.

## Telemetry

Extend the existing Historian ownership event with bounded fields:

- `source`: `localEphemeral` or `alfred`;
- local outcome: `active`, `deleted`, `miss`, `expired`, `malformed`, or `dependencyError`;
- fallback reason;
- activation outcome: `created`, `alreadyActive`, `deleted`, or `writeError`;
- operation and route type, retaining existing values.

Metrics must allow operators to measure:

- EC local hit rate;
- Alfred fallback rate split by EC/DC;
- local-store failures;
- deleted denials;
- average and percentile Historian summary latency; and
- Alfred document GET reduction.

Telemetry must not include tokens, authorization headers, summary content, or unbounded errors.

## Test Strategy

### Store tests

- Tenant-qualified keys isolate identical document IDs.
- Active and deleted values round-trip and reject malformed values.
- TTL is bounded by authoritative EC expiration.
- `activateIfNotDeleted` creates active state on miss.
- `activateIfNotDeleted` cannot overwrite deleted state.
- `markDeleted` is terminal and idempotent.

### Resolver tests

- Active EC hit returns local context and does not call Alfred.
- Deleted record denies before service construction.
- Expired record denies.
- Miss plus valid EC Alfred response backfills active state.
- Miss plus valid DC Alfred response does not write EC state.
- Redis read failure plus DC succeeds through Alfred.
- Redis read failure plus EC fails closed.
- Activation/deletion race returns deleted denial.
- Customer-token reuse is forwarded on fallback.
- `storageName: null` remains accepted as absent.
- Exact tenant/document matching and scheduled-deletion denial remain unchanged.

### Route tests

- EC latest and explicit-SHA GET local hits do not call Alfred.
- Deleted EC state cannot return a cached latest summary.
- Initial POST behavior is unchanged.
- Non-initial POST and DELETE still call Alfred.
- Protected service construction uses resolved context without secondary static, ephemeral, or
  storage-name lookup.
- Same-document-ID cross-tenant requests cannot share records or summary cache entries.
- DELETE marks EC deleted before invoking storage deletion.
- Deleted-state write failure prevents storage deletion.

### Deli tests

- Cleanup enabled performs hard Historian delete before metadata deletion.
- Cleanup disabled performs soft Historian delete before metadata deletion.
- Historian delete failure prevents metadata mutation.
- Expired EC retains the existing skip behavior.

### Validation

- Historian package compilation and test compilation.
- Focused store, resolver, route, and ownership tests.
- Full Historian test suite.
- Lambdas package compilation and focused Deli tests.
- Targeted formatter and linter runs.
- `git diff --check`.

## Delivery

The implementation is one upstream FluidFramework PR from current `main`. Its diff contains the
five merged ownership fixes through normal branch ancestry but contains no commits or code from
closed PR #28333.

After upstream merge and package publication, FRS package consumption is handled separately. There
is no deployment feature flag or YAML change in this design.
