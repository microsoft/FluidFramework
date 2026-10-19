# Migration performance and recovery investigation

This is a proposed follow-up plan, not implemented functionality.
It covers improvement items 14–17 from end-to-end selfhost testing.
Credential caching, parallel copy, bulk export, retries, and failed-only resume are deliberately not part of the accompanying implementation.

## Baseline and constraints

The reported sample averaged approximately 18 seconds per document across five documents.
At that rate, 3,000 documents would take approximately 15 hours sequentially.
This is an extrapolation from a small sample, not a throughput guarantee.

`document-copy/copy.mjs` currently processes one document at a time.
For each new document it retrieves a destination key, checks destination existence, retrieves a source key, discovers the source session, reads the latest ref and whole summary, and posts a destination creation request.
It then rewrites the aggregate results file.

`configuration/credentials.mjs` invokes `tenant-admin.sh get-key` for each destination document.
That shell command retrieves AKS credentials, creates a temporary ConfigMap and administration pod, waits for readiness, executes the CLI, and deletes the temporary resources.
This repeats substantially more work than an HTTP request.
Source key retrieval also invokes Azure CLI once per new document.
These are strong candidates for overhead, but their contribution has not been separately timed.

Before optimizing, measure non-sensitive durations for destination key retrieval, existence check, source key retrieval, discovery, ref read, summary download/conversion, destination creation, and results persistence.
Record document counts, payload sizes, throughput, and latency percentiles without keys, tokens, request bodies, or document contents.
Use controlled fixtures and an explicitly authorized test deployment; do not overwrite existing migrated documents to benchmark.

## 14. Reuse credentials within a tenant

Keep the callback-scoped credential helpers, but move their use outside the document loop.
Retrieve the destination key once per destination tenant and the source key once per source tenant, then release references after that tenant's work finishes.
Do not create a process-wide or on-disk key cache.
If multiple source tenants map to one destination, prefer bounded tenant-scoped reuse before introducing a wider cache.

Cache signing keys, not JWTs.
JWTs remain document-scoped and should be generated immediately before the applicable requests.
The current 60-second lifetime needs testing for large downloads and retries; queued work must not mint tokens in advance.
Treat key rotation explicitly rather than retrying every 403 with a newly fetched key.
JavaScript reference cleanup reduces retention but does not guarantee physical zeroization.

Acceptance tests should prove that N documents in one tenant perform one source and one destination key retrieval, other tenants never share credentials, tokens name the correct document, and cleanup occurs on success and failure.
Compare measured stage durations and documents/minute against the sequential baseline before claiming an improvement.

## 15. Add bounded concurrency

First make result persistence safe for concurrent completions.
`configuration/results.mjs` currently read-modify-writes the full results object through one fixed `.tmp` path.
Parallel calls can overwrite each other's updates, collide on rename, or lose another stage.
Serialize result updates through one writer and test crash-safe persistence before adding workers.

Then introduce a small document worker limit within one tenant, benchmark limits 1, 2, and 4, and increase only when evidence supports it.
Keep keys scoped to that tenant, retain per-document discovery, and consider a payload/memory budget because whole summaries are held in memory.
Do not run unbounded `Promise.all` over the inventory.
Have the coordinator own counters, progress, and the durable results snapshot.

Acceptance tests should verify the concurrency ceiling, one final outcome per document, no lost results on out-of-order completion, unchanged source/destination mappings, bounded memory, and clear behavior after interruption.
Include 429 responses and `Retry-After` in fault injection.
Implement the retry policy below before recommending concurrent production migration.

## 16. Assess bulk export/import

The installed public `az fluid-relay container --help` exposes `list`, `show`, and `delete`; it does not expose document-content export.
Container inventory is ARM metadata, not application state.
The public Historian summary read is scoped to one tenant and commit, and Alfred creation is scoped to one document request.
The current tool uses no bulk content API.
This does not establish whether the managed AFR service has an internal or planned bulk capability.

First ask the service owners to confirm whether there is a supported export contract.
It would need a consistent document version, application state plus unapplied operations, referenced blobs/attachments, region/session routing, deletion status, authorization, and a resumable manifest.
A new Azure CLI wrapper around today's endpoints would still issue per-document requests; it would not itself provide server-side bulk transfer.

If no supported bulk API exists, prioritize credential reuse and controlled concurrency without a service change.
Treat a true service-side export/import API as a separate design with ownership, compatibility, security, and data-fidelity review.
Do not bypass Historian/Alfred by copying raw storage or database records.

## 17. Classify failures and add retry/resume

The copier currently preserves HTTP status/endpoint metadata but discards API response details.
Deleted-document discovery and other 404s therefore cannot safely be distinguished from status alone.
Known missing-summary repositories may return 400.
Add only allowlisted, bounded, non-sensitive service error codes to distinguish these cases; do not print arbitrary response bodies.
Keep unknown failures visible rather than declaring every 400 corrupt or every 404 deleted.

`configuration/retry.mjs` exists but is not wired into document copying.
Its default retries every error, so do not use it unchanged.
Define an explicit predicate for transport timeouts, 408, 429, and selected 5xx responses, with bounded attempts, jittered backoff, and `Retry-After`.
Do not automatically retry validation failures, missing summaries, confirmed deletion, authentication failures, or the unapplied-operation safety rejection.

A timed-out destination POST may have succeeded.
Before retrying creation, reconcile using the original document ID; never blindly repeat a potentially successful create.
Document-ID preservation is essential here.
Refresh short-lived request tokens as necessary without silently rotating tenant keys.

Add a failed-only mode that reads a reviewed prior results file, validates the source-to-destination mapping against the current configuration, and selects only failed documents.
Preserve successful outcomes and prior stages, record attempt history without secrets, and distinguish skipped-existing from state-verified copies.
A rerun must not present an older lossy destination document as repaired.

Acceptance tests should cover deleted documents, missing summaries, 403, 429 with retry hints, network timeouts, an uncertain POST that actually created the document, exhausted retry budgets, interrupted result writes, and failed-only selection.
Finish with tenant and overall counts plus meaningful stage errors and a nonzero exit status for unresolved failures.

## Suggested implementation order

Measure the baseline, implement tenant-scoped credential reuse, define failure semantics and safe result persistence, then add bounded retries and workers.
Benchmark each change independently.
Investigate the bulk API contract in parallel, without making it a prerequisite for these local optimizations.
