/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { loadConfiguration } from "../configuration/configuration.mjs";
import { safeErrorMessage, StageError } from "../configuration/errors.mjs";

const execFileAsync = promisify(execFile);
const maxTenantAdminOutputBytes = 8 * 1024 * 1024;

class ConfirmationError extends Error {
	constructor() {
		super("Use --execute to create missing self-hosted tenants");
		this.name = "ConfirmationError";
	}
}

function parseArgs(argv) {
	const options = {
		configPath: path.join(
			import.meta.dirname,
			"..",
			"configuration",
			"parameters",
			"copy-data.config.json",
		),
		execute: false,
	};
	for (let index = 0; index < argv.length; index++) {
		switch (argv[index]) {
			case "--config":
				options.configPath = argv[++index];
				break;
			case "--execute":
				options.execute = true;
				break;
			case "--help":
			case "-h":
				console.log("Usage: node tenant-creation.mjs [--config <path>] --execute");
				return undefined;
			default:
				throw new Error(`Unknown argument: ${argv[index]}`);
		}
	}
	if (!options.execute) throw new ConfirmationError();
	return options;
}

function tenantAdminArguments(selfHost, namespace, command, tenantId) {
	const argumentsList = [
		"--subscription",
		selfHost.subscriptionId,
		"--resource-group",
		selfHost.resourceGroup,
		"--aks-name",
		selfHost.aksName,
		"--namespace",
		namespace,
		command,
	];
	if (tenantId !== undefined) argumentsList.push(tenantId);
	return argumentsList;
}

async function runTenantAdmin(command, argumentsList, execute = execFileAsync) {
	const tenantAdmin = path.resolve(
		import.meta.dirname,
		"..",
		"..",
		"tenant-admin",
		"tenant-admin.sh",
	);
	let output;
	try {
		try {
			({ stdout: output } = await execute(tenantAdmin, argumentsList, {
				maxBuffer: maxTenantAdminOutputBytes,
			}));
		} catch (error) {
			let detail;
			if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER")
				detail = "exceeded the 8 MiB output limit";
			else if (error.code === "ENOENT")
				detail =
					"could not start; check that tenant-admin and its required tools are installed";
			else if (error.code === "EACCES")
				detail = "could not start; check executable permissions";
			else
				detail = `failed${Number.isInteger(error.code) ? ` with exit code ${error.code}` : ""}; check Azure access, AKS connectivity, and tenant-admin pod readiness`;
			throw new StageError(
				`tenant-admin ${command} ${detail}.${command === "create" ? " Creation may have completed; rerun this stage to check existing tenants before another creation attempt." : ""}`,
			);
		}
		try {
			return JSON.parse(output);
		} catch {
			throw new StageError(
				`tenant-admin ${command} returned invalid JSON.${command === "create" ? " Creation may have completed; rerun this stage to check existing tenants before another creation attempt." : ""}`,
			);
		}
	} finally {
		output = undefined;
	}
}

/** Create missing self-host tenants without exposing generated tenant keys. */
export async function createMissingTenants(config, inventory, execute) {
	const existingTenants = await runTenantAdmin(
		"list",
		tenantAdminArguments(config.selfHost, config.selfHostNamespace, "list"),
		execute,
	);
	if (
		!Array.isArray(existingTenants) ||
		existingTenants.some(
			(tenant) => !tenant || typeof tenant.id !== "string" || tenant.id.trim() === "",
		)
	)
		throw new StageError(
			"tenant-admin list returned an invalid tenant collection; no tenants were created",
		);
	const existingIds = new Set(existingTenants.map((tenant) => tenant.id));
	const created = [];
	for (const [azureFluidRelayTenantId, tenant] of Object.entries(inventory.tenants)) {
		const selfHostTenantId = (
			tenant.selfHostTenantId || azureFluidRelayTenantId
		).toLowerCase();
		if (!existingIds.has(selfHostTenantId)) {
			console.log(`Creating new tenant: ${selfHostTenantId}`);
			await runTenantAdmin(
				"create",
				[
					...tenantAdminArguments(
						config.selfHost,
						config.selfHostNamespace,
						"create",
						selfHostTenantId,
					),
					"--contact",
					config.selfHost.contact,
				],
				execute,
			);
			existingIds.add(selfHostTenantId);
			created.push(selfHostTenantId);
		}
	}
	return created;
}

export async function main(argv) {
	const options = parseArgs(argv);
	if (options !== undefined) {
		const { config, inventory, warnings } = await loadConfiguration(options.configPath);
		for (const warning of warnings) console.warn(`Warning: ${warning}`);
		const created = await createMissingTenants(config, inventory);
		console.log(
			created.length === 0
				? "All self-hosted tenants already exist."
				: `Created ${created.length} self-hosted tenant(s).`,
		);
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		await main(process.argv.slice(2));
	} catch (error) {
		console.error(
			error instanceof ConfirmationError
				? error.message
				: `Tenant creation failed: ${safeErrorMessage(error)}`,
		);
		process.exitCode = 1;
	}
}
