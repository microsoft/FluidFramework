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

**Rotate the Azure Fluid Relay key 2 and both self-hosted tenant keys after the documents are copied.**

## Contributor follow-up

Credential reuse, concurrency, bulk export, and retry/resume remain unimplemented.
See the [investigation and proposed plan](PERFORMANCE-PLAN.md).
