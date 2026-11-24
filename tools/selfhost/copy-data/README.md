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
	The tool copies the application snapshot, not later operations or unsummarized writes.
- Every Alfred replica must explicitly set `alfred.enforceServerGeneratedDocumentId` to `false`.
	The supplied Helm values include this setting.

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

Review progress in the terminal and outcomes in `results/copy-data-results.json`.
Existing destination documents are skipped, not overwritten or repaired; verify previously copied data before treating a rerun as validation.

To copy more than one document at a time, set `--concurrency` (default 1, maximum 4):

```bash
node copy-data.mjs --execute --concurrency 2
```

Use `node copy-data.mjs --help` for all options, including document-size and memory limits.

### Retry failed documents

Review the results, resolve reported errors, then retry only failed or interrupted documents:

```bash
node copy-data.mjs --execute --concurrency 2 \
  --failed-only results/copy-data-results.json
```

Keep the same source/destination configuration and include every failed document in the inventory.
If results report `ambiguous-create` or `document-id-mismatch`, verify destination state manually before another creation attempt.
Those outcomes are not retried by `--failed-only`.
After verification, use a separate inventory containing only the documents safe to create, without `--failed-only`.
Results without version 2 mapping metadata also require a separately reviewed inventory instead of `--failed-only`.

To retry failed documents while explicitly accepting an older application snapshot, add `--ignore-logtail`:

```bash
node copy-data.mjs --execute --concurrency 2 \
  --failed-only results/copy-data-results.json --ignore-logtail
```

**This can lose recent changes.**
`--ignore-logtail` copies the older application snapshot without replaying later operations.
Use it only if you accept losing those changes.
Before document copying starts, confirm the warning with `y` at the terminal prompt; the default is No.
This option cannot run without an interactive terminal.
It does not bypass malformed summaries or overwrite existing destinations.

Only one document-copy process may use a results directory at a time.
After a hard interruption, first confirm the process has exited, then remove only the stale `copy-data.run.lock` or `copy-data.write.lock` file in that results directory.
Do not remove a live process's locks.
