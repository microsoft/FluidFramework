#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { loadConfiguration } from "../configuration/configuration.mjs";
import { classifyError } from "../configuration/errors.mjs";

const execFileAsync = promisify(execFile);

class ConfirmationError extends Error {
	constructor() {
		super("Use --execute to create missing self-hosted tenants");
		this.name = "ConfirmationError";
	}
}

function parseArgs(argv) {
	const options = { configPath: path.join(import.meta.dirname, "..", "configuration", "parameters", "copy-data.config.json"), execute: false };
	for (let index = 0; index < argv.length; index++) {
		switch (argv[index]) {
			case "--config": options.configPath = argv[++index]; break;
			case "--execute": options.execute = true; break;
			case "--help": case "-h":
				console.log("Usage: node tenant-creation.mjs [--config <path>] --execute");
				return undefined;
			default: throw new Error(`Unknown argument: ${argv[index]}`);
		}
	}
	if (!options.execute) throw new ConfirmationError();
	return options;
}

function tenantAdminArguments(selfHost, namespace, command, tenantId) {
	const argumentsList = ["--subscription", selfHost.subscriptionId, "--resource-group", selfHost.resourceGroup, "--aks-name", selfHost.aksName, "--namespace", namespace, command];
	if (tenantId !== undefined) argumentsList.push(tenantId);
	return argumentsList;
}

async function runTenantAdmin(target, namespace, argumentsList, execute = execFileAsync) {
	const tenantAdmin = path.resolve(import.meta.dirname, "..", "..", "tenant-admin", "tenant-admin.sh");
	let output;
	try {
		({ stdout: output } = await execute(tenantAdmin, argumentsList, { maxBuffer: 4096 }));
		return JSON.parse(output);
	} finally {
		output = undefined;
	}
}

/** Create missing self-host tenants without exposing generated tenant keys. */
export async function createMissingTenants(config, inventory, execute) {
	const existingTenants = await runTenantAdmin(config.selfHost, config.selfHostNamespace, tenantAdminArguments(config.selfHost, config.selfHostNamespace, "list"), execute);
	const existingIds = new Set(existingTenants.map((tenant) =>  tenant.id));
	const created = [];
	for (const [azureFluidRelayTenantId, tenant] of Object.entries(inventory.tenants)) {
		const selfHostTenantId = (tenant.selfHostTenantId || azureFluidRelayTenantId).toLowerCase();
		if (!existingIds.has(selfHostTenantId)) {
			console.log(`Creating new tenant: ${selfHostTenantId}`);
			await runTenantAdmin(config.selfHost, config.selfHostNamespace, [...tenantAdminArguments(config.selfHost, config.selfHostNamespace, "create", selfHostTenantId), "--contact", config.selfHost.contact], execute);
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
		console.log(created.length === 0 ? "All self-hosted tenants already exist." : `Created ${created.length} self-hosted tenant(s).`);
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		await main(process.argv.slice(2));
	} catch (error) {
			console.error(error instanceof ConfirmationError ? error.message : `Tenant creation failed: ${classifyError(error)}.`);
		process.exitCode = 1;
	}
}
