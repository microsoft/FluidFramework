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
		throw new CredentialError(`${name} is required to retrieve the Azure Fluid Relay tenant key`);
	}
	return value;
}

/** Retrieve key2 without logging or persisting either key. */
async function getAzureFluidRelayTenantKey2({ azureFluidRelayResourceGroup, azureFluidRelayServerName, azureFluidRelaySubscriptionId }) {
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
	args.push("--subscription", requiredString(azureFluidRelaySubscriptionId, "azureFluidRelaySubscriptionId"));

	let output;
	try {
		({ stdout: output } = await execFileAsync("az", args, { maxBuffer: 4096 }));
	} catch (error) {
		if (error?.code === "ENOENT") {
			throw new CredentialError("Azure CLI (`az`) was not found on PATH");
		}
		throw new CredentialError("Unable to retrieve the Azure Fluid Relay tenant secondary key");
	}

	const key2 = output.trim();
	output = undefined;
	if (key2 === "") {
		throw new CredentialError("Azure Fluid Relay returned no secondary key");
	}
	return key2;
}

/** Run an operation with the Azure Fluid Relay Key2. */
export async function withAzureFluidRelayTenantKey2(azureFluidRelayServer, operation) {
	if (typeof operation !== "function") {
		throw new TypeError("operation must be a function");
	}

	let key2 = await getAzureFluidRelayTenantKey2(azureFluidRelayServer);
	try {
		return await operation(key2);
	} finally {
		key2 = undefined;
	}
}

async function getSelfHostTenantKey2({ subscriptionId, resourceGroup, aksName, selfHostNamespace, selfHostTenantId }) {
	const tenantId = requiredString(selfHostTenantId, "selfHostTenantId");
	const selfhostRoot = path.resolve(import.meta.dirname, "..", "..");
	const tenantAdmin = path.join(selfhostRoot, "tenant-admin", "tenant-admin.sh");
	let output;
	try {
		({ stdout: output } = await execFileAsync(tenantAdmin, [
			"--subscription", requiredString(subscriptionId, "subscriptionId"),
			"--resource-group", requiredString(resourceGroup, "resourceGroup"),
			"--aks-name", requiredString(aksName, "aksName"),
			"--namespace", requiredString(selfHostNamespace, "selfHostNamespace"),
			"get-key", tenantId, "--key", "key2",
		], { maxBuffer: 4096 }));
	} catch {
		throw new CredentialError("Unable to retrieve the self-hosted tenant secondary key");
	}

	let key2;
	try {
		key2 = JSON.parse(output).key2;
	} catch {
		throw new CredentialError("Self-hosted tenant key response was invalid");
	} finally {
		output = undefined;
	}
	if (typeof key2 !== "string" || key2 === "") {
		throw new CredentialError("Self-hosted deployment returned no secondary key");
	}
	return key2;
}

/** Run an operation with the self-host key2. */
export async function withSelfHostTenantKey2(selfHost, operation) {
	if (typeof operation !== "function") {
		throw new TypeError("operation must be a function");
	}

	let key2 = await getSelfHostTenantKey2(selfHost);
	try {
		return await operation(key2);
	} finally {
		key2 = undefined;
	}
}
