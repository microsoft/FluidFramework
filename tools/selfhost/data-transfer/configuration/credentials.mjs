/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { execFile } from "node:child_process";
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
async function getSourceTenantKey2({ sourceResourceGroup, sourceServerName, subscription }) {
	const args = [
		"fluid-relay",
		"server",
		"list-key",
		"--resource-group",
		requiredString(sourceResourceGroup, "sourceResourceGroup"),
		"--server-name",
		requiredString(sourceServerName, "sourceServerName"),
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
