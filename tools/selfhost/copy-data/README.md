# Copy Data

This tool is used to copy Azure Fluid Relay documents to a self-hosted deployment.
It does not remove the documents from Azure Fluid Relay.

## Prerequisites

- Node.js 22 or later.
- Install this tool's dependencies before running any migration stages:

	```bash
	cd tools/selfhost/copy-data
	pnpm install --ignore-workspace
	```

	The standalone install does not require a repository-wide build.
	Run the remaining commands in this guide from `tools/selfhost/copy-data`.
- `kubectl`, with permission to inspect and execute a read-only configuration check in the Alfred pods.
- Azure CLI signed in to subscriptions containing the Azure Fluid Relay servers
	and self-hosted deployment:

	```bash
	az login
	az extension add --name fluid-relay
	```

- Permission to read the Azure Fluid Relay servers, retrieve each Azure Fluid
	Relay tenant's `key2`, and create tenants in the self-hosted
	deployment.
- Stop application writes to the source documents and ensure an acknowledged client summary contains the state you intend to migrate.
	A service summary alone is not enough: it can retain an older application snapshot with newer edits only in its operation tail.
	The tool rejects tails with unapplied application or unknown operations rather than silently omitting them.
	It does not replay operations or check for newer writes that have not reached a summary.
- Every Alfred replica must explicitly set `alfred.enforceServerGeneratedDocumentId` to `false`.
	The selfhost Helm values set this explicitly.
	Migration checks the running replicas before creating tenants and again before copying documents.
	This controls document IDs, not tenant IDs.

## Important
Rotate both the self-hosted Fluid tenant keys and the Azure Fluid Relay tenant
key 2 after copying the data.

## Workflow

1. [Inventory Azure Fluid Relay documents](inventory/README.md): creates a
	read-only inventory of Azure Fluid Relay documents.
2. [Configuration](configuration/README.md): records the self-hosted
	deployment details and the Azure Fluid Relay-to-self-hosted tenant map
	required to copy the data.
3. Validate locally with `node configuration/validate-config.mjs`, then run the [combined command](#command).
	It checks dependencies and the running Alfred configuration, creates missing self-hosted tenants, and copies the reviewed documents.

You do not need to run tenant creation and document copy separately.
The [tenant-creation](tenant-creation/README.md) and [document-copy](document-copy/README.md) commands remain available for individual-stage troubleshooting.

## Command

Run only after reviewing the inventory and configuration file:

```bash
node copy-data.mjs --execute
```

Use `--config <path>` to override the default
`configuration/parameters/copy-data.config.json`.

The migration preflight uses a private temporary kubeconfig and does not change your current Kubernetes context.
No tenant or document is created if that preflight fails.
During document copy, the tool prints each tenant's source/destination IDs, document count, progress, elapsed time, and completion totals.
Existing destination documents are skipped, not overwritten or repaired; verify previously copied data before treating a rerun as validation.

### Performance and recovery

Signing keys are retrieved once per tenant, not once per document.
Keys are retained only inside that tenant's callback and are not written to results.
Request tokens are generated immediately before each request attempt.
The default is still one document worker; enable bounded parallel copy explicitly:

```bash
node copy-data.mjs --execute --concurrency 2
```

The maximum is four workers in one tenant at a time.
The tool reserves space for two maximum-sized serialized payloads per worker.
It reduces the effective worker count when the reservation would exceed `--memory-budget-mib`.
Defaults are a 64 MiB limit for each response/create payload and a 512 MiB serialized-payload budget.
These limits are not a process RSS limit: decoded JavaScript objects, temporary encoding buffers, the inventory, and results require additional memory.
Oversized payloads fail explicitly without creating a truncated document.
Use `--max-summary-mib` and `--memory-budget-mib` together when a reviewed large document needs a larger limit.

Read-only HTTP requests retry transient transport errors, 408, 429, and selected 5xx responses.
The default is three attempts with jittered exponential backoff and `Retry-After`.
If a server asks to wait longer than the 60-second retry-delay budget, the request fails instead of ignoring that hint.
Each request, including its response body, has a 45-second deadline, below the signing token's 60-second lifetime.
Use `--attempts` and `--request-timeout-ms` to reduce or adjust these bounds; the deadline cannot exceed 45 seconds.
Authentication, missing summaries, malformed data, and unsafe operation tails are not retried automatically.
An unknown 404 remains `not-found`, not a claim that the document was deleted.
Only allowlisted structured service codes distinguish deletion or a missing summary repository.

An uncertain create is checked using the original document ID.
A network timeout, connection loss, or 5xx does **not** cause an automatic re-POST, even if that ID is not yet visible.
A throttled create can retry after an existence check confirms the ID is absent.
An existing document after an uncertain attempt remains an unresolved failure requiring manual state verification.

After reviewing results, retry only failed or interrupted documents:

```bash
node copy-data.mjs --execute --concurrency 2 \
  --failed-only results/copy-data-results.json
```

Resume validates source and destination identities before creating tenants or copying documents.
Every selected failed document must remain in the reviewed inventory.
Successful outcomes, other stages, and per-document attempt history are retained.
Previously ambiguous creates or mismatched destination IDs remain unresolved in failed-only mode, even when the original ID is absent.
After manually verifying those outcomes, use a separately reviewed, pruned inventory without `--failed-only` if another creation attempt is appropriate.
Older results without version 2 mapping metadata cannot be resumed safely through this flag; use a separately reviewed, pruned inventory instead.
Existing documents are never overwritten or described as repaired.

Only one document-copy process may use a results directory at a time.
Results use serialized, owner-only writes and an atomic publish after flushing the temporary file.
After a hard interruption, first confirm the process has exited, then remove only the stale `copy-data.run.lock` or `copy-data.write.lock` file in that results directory.
Do not remove a live process's locks.
The last durable results contain unfinished documents as `interrupted`, so they can be selected with `--failed-only`.
If a document was created before its result became durable, resume leaves it unresolved rather than declaring its state correct.
Review destination state manually in that case.

Results include stage timings, bounded-histogram p50/p95 upper bounds, response byte totals, retries, peak workers, and documents per minute.
Metrics describe the current invocation; outcome totals also retain prior successes when resuming.
Timing samples and results never contain keys, JWTs, response bodies, or document contents.
Use `node copy-data.mjs --help` for all flags.

**Rotate the Azure Fluid Relay key 2 and both self-hosted tenant keys after the documents are copied.**

## Benchmark and service follow-up

Run the controlled, no-Azure-write benchmark from this directory:

```bash
node document-copy/benchmark.mjs
```

It compares per-document credentials against tenant-scoped credentials with 1, 2, and 4 workers using fixed fixture delays.
It is not a prediction of Azure throughput.
See [implementation results and the bulk API assessment](PERFORMANCE-PLAN.md).
