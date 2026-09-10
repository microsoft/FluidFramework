/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** A safe-to-display credential retrieval error. */
export class CredentialError extends Error {
	constructor(message) {
		super(message);
		this.name = "CredentialError";
	}
}

function requiredString(value, name) {
	if (typeof value !== "string" || value.trim() === "") {
		throw new CredentialError(`${name} is required to retrieve the source tenant key`);
	}
	return value;
}

/** Retrieve key2 without logging or persisting either key. */
async function getSourceTenantKey2({ azureFluidRelayResourceGroup, azureFluidRelayServerName, subscription }) {
	const args = [
		"fluid-relay",
		"server",
		"list-key",
		"--resource-group",
		requiredString(azureFluidRelayResourceGroup, "azureFluidRelayResourceGroup"),
		"--server-name",
		requiredString(azureFluidRelayServerName, "azureFluidRelayServerName"),
		"--query",
		"key2",
		"--output",
		"tsv",
	];
	if (subscription !== undefined) {
		args.push("--subscription", requiredString(subscription, "subscription"));
	}

	let output;
	try {
		({ stdout: output } = await execFileAsync("az", args, { maxBuffer: 4096 }));
	} catch (error) {
		if (error?.code === "ENOENT") {
			throw new CredentialError("Azure CLI (`az`) was not found on PATH");
		}
		throw new CredentialError("Unable to retrieve the source tenant secondary key from Azure Fluid Relay");
	}

	const key2 = output.trim();
	output = undefined;
	if (key2 === "") {
		throw new CredentialError("Azure Fluid Relay returned no secondary key");
	}
	return key2;
}

/** Run an operation with key2, then release this helper's reference. */
export async function withSourceTenantKey2(sourceServer, operation) {
	if (typeof operation !== "function") {
		throw new TypeError("operation must be a function");
	}

	let key2 = await getSourceTenantKey2(sourceServer);
	try {
		return await operation(key2);
	} finally {
		key2 = undefined;
	}
}

async function getTargetTenantKey2({ subscriptionId, resourceGroup, aksName, targetNamespace, selfHostTenantId }) {
	const tenantId = requiredString(selfHostTenantId, "selfHostTenantId");
	const selfhostRoot = path.resolve(import.meta.dirname, "..", "..");
	const tenantAdmin = path.join(selfhostRoot, "tenant-admin", "tenant-admin.sh");
	let output;
	try {
		({ stdout: output } = await execFileAsync(tenantAdmin, [
			"--subscription", requiredString(subscriptionId, "subscriptionId"),
			"--resource-group", requiredString(resourceGroup, "resourceGroup"),
			"--aks-name", requiredString(aksName, "aksName"),
			"--namespace", requiredString(targetNamespace, "targetNamespace"),
			"get-key", tenantId, "--key", "key2",
		], { maxBuffer: 4096 }));
	} catch {
		throw new CredentialError("Unable to retrieve the target tenant secondary key");
	}

	let key2;
	try {
		key2 = JSON.parse(output).key2;
	} catch {
		throw new CredentialError("Target tenant key response was invalid");
	} finally {
		output = undefined;
	}
	if (typeof key2 !== "string" || key2 === "") {
		throw new CredentialError("Target deployment returned no secondary key");
	}
	return key2;
}

/** Run an operation with the target key2, then release this helper's reference. */
export async function withTargetTenantKey2(target, operation) {
	if (typeof operation !== "function") {
		throw new TypeError("operation must be a function");
	}

	let key2 = await getTargetTenantKey2(target);
	try {
		return await operation(key2);
	} finally {
		key2 = undefined;
	}
}
