/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execFile } from "node:child_process";
import { writeFile, chmod, mkdir } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { safeErrorMessage } from "../configuration/errors.mjs";
import { redact } from "../configuration/redaction.mjs";

const execFileAsync = promisify(execFile);

const DEFAULT_OUTPUT = path.join(import.meta.dirname, "document-inventory.json");

const MAX_BUFFER = 64 * 1024 * 1024;

/** Owner read/write only. */
const OUTPUT_MODE = 0o600;

function log(message) {
	console.log(redact(message));
}

/** An Azure CLI error with safe status codes. */
class AzError extends Error {
	constructor(message, codes = {}) {
		super(message);
		this.name = "AzError";
		this.codes = codes;
	}
}

/** Extract safe status codes and discard Azure CLI output. */
function getAzFailureCodes(err) {
	const exitCode = typeof err?.code === "number" ? err.code : undefined;
	const httpStatus = Number(/\b([45]\d\d)\b/.exec(String(err?.stderr ?? ""))?.[1]) || undefined;
	return { exitCode, httpStatus };
}

/** Run Azure CLI with argument-array execution and parse JSON output. */
async function az(args) {
	const argv = [...args, "--output", "json"];

	let stdout;
	try {
		({ stdout } = await execFileAsync("az", argv, { maxBuffer: MAX_BUFFER }));
	} catch (err) {
		if (err?.code === "ENOENT") {
			throw new AzError("Azure CLI (`az`) was not found on PATH");
		}
		throw new AzError("Azure CLI failed", getAzFailureCodes(err));
	}

	const trimmed = stdout.trim();
	if (trimmed === "") return undefined;
	try {
		return JSON.parse(trimmed);
	} catch {
		throw new AzError("Azure CLI returned output that could not be parsed as JSON");
	}
}

function resourceGroupOf(resource) {
	if (resource?.resourceGroup) return resource.resourceGroup;
	throw new AzError(
		"Unable to get resource group from Azure Fluid Relay server response. " +
		"Verify that 'az fluid-relay server list' returns the expected ARM schema.",
	);
}

function parseArgs(argv) {
	const options = {
		resourceGroup: undefined,
		subscription: undefined,
		tenantId: undefined,
		output: DEFAULT_OUTPUT,
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = () => {
			const value = argv[++i];
			if (value === undefined) throw new Error(`Missing value for ${arg}`);
			return value;
		};
		switch (arg) {
			case "--resource-group":
			case "-g":
				options.resourceGroup = next();
				break;
			case "--subscription":
				options.subscription = next();
				break;
			case "--tenant-id":
				options.tenantId = next();
				break;
			case "--output":
			case "-o":
				options.output = next();
				break;
			case "--help":
			case "-h":
				options.help = true;
				break;
			default:
				throw new Error(`Unknown argument: ${arg}`);
		}
	}
	return options;
}

function usage() {
	log(`
Document inventory for Azure Fluid Relay.

Lists every Fluid Relay document visible to the signed-in Azure CLI account.

Usage:
  node inventory.mjs [options]

Options:
  -g, --resource-group <rg>    Limit to one resource group (default: whole subscription)
      --subscription <id>      Subscription to query (default: az CLI active subscription)
      --tenant-id <id>         Limit to one Fluid tenant (frsTenantId).
  -o, --output <file>          Output path (default: ${DEFAULT_OUTPUT})
  -h, --help                   Show this message

Prerequisites:
  az login
  az extension add --name fluid-relay
`);
}

/** Global arguments applied to every Azure CLI call. */
function scopeArgs(options) {
	return options.subscription ? ["--subscription", options.subscription] : [];
}

/** Confirm the CLI is installed and signed in. */
async function resolveAccount(options) {
	const account = await az(["account", "show", ...scopeArgs(options)]);
	if (!account) throw new Error("az account show returned no account. Run `az login`.");
	return {
		subscriptionId: account.id,
		subscriptionName: account.name,
	};
}

/** List Fluid Relay servers, optionally scoped to a single resource group. */
async function listServers(options) {
	const args = ["fluid-relay", "server", "list", ...scopeArgs(options)];
	if (options.resourceGroup) args.push("--resource-group", options.resourceGroup);
	const servers = await az(args);
	return Array.isArray(servers) ? servers : [];
}

/** List the documents (ARM containers) belonging to a single server. */
async function listDocuments(server, options) {
	const resourceGroup = resourceGroupOf(server);
	const containers = await az([
		"fluid-relay",
		"container",
		"list",
		...scopeArgs(options),
		"--resource-group",
		resourceGroup,
		"--server-name",
		server.name,
	]);
	return Array.isArray(containers) ? containers : [];
}

/** Get the required details from a Fluid Relay server resource. */
function describeServer(server) {
	return {
		name: server.name,
		resourceGroup: resourceGroupOf(server),
		// The Fluid tenant ID — not the Azure AD tenant ID. May be absent, in
		// which case the tenant is only knowable from the server's containers.
		frsTenantId: server?.frsTenantId,
	};
}

/**
 * Get the (tenant, document) pair from an ARM container resource.
 */
function describeDocument(container, server) {
	return {
		tenantId: container?.frsTenantId ?? server?.frsTenantId ?? "unknown",
		documentId: container?.frsContainerId,
	};
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		usage();
		return 0;
	}

	const account = await resolveAccount(options);
	log(`Subscription: ${account.subscriptionName} (${account.subscriptionId})`);

	const serverResources = await listServers(options);
	if (serverResources.length === 0) {
		const scope = options.resourceGroup
			? `resource group '${options.resourceGroup}'`
			: "this subscription";
		log(`No Fluid Relay servers found in ${scope}.`);
	} else {
		log(`Found ${serverResources.length} Fluid Relay server(s).`);
	}
	if (options.tenantId) log(`Filtering to Fluid tenant: ${options.tenantId}`);

	// Collect each Fluid Relay server's document IDs under its tenant.
	const tenantDocuments = new Map();
	const errors = [];
	let total = 0;

	for (const serverResource of serverResources) {
		const server = describeServer(serverResource);

		// Skip a non-matching server before listing its containers. Only safe when
		// the server reports a tenant; if it doesn't, filter per document,
		// since the tenant may only be visible on the containers.
		if (options.tenantId && server.frsTenantId && server.frsTenantId !== options.tenantId) {
			continue;
		}

		try {
			const containers = await listDocuments(serverResource, options);
			let matched = 0;
			for (const container of containers) {
				const { tenantId, documentId } = describeDocument(container, serverResource);
				if (options.tenantId && tenantId !== options.tenantId) {
					continue;
				}
				if (!tenantDocuments.has(tenantId)) tenantDocuments.set(tenantId, new Set());
				tenantDocuments.get(tenantId).add(documentId);
				matched++;
			}
			total += matched;
			log(`  ${server.name}: ${matched} document(s)`);
		} catch (err) {
			const codes = err instanceof AzError ? err.codes : {};
			errors.push({ server: server.name, ...codes });
			const codeSummary = [
				codes.exitCode === undefined ? undefined : `exit ${codes.exitCode}`,
				codes.httpStatus === undefined ? undefined : `HTTP ${codes.httpStatus}`,
			].filter(Boolean).join(", ");
			log(`  ${server.name}: failed to list documents${codeSummary ? ` (${codeSummary})` : ""}`);
		}
	}

	const tenants = {};
	for (const [tenantId, documentIds] of tenantDocuments) {
		const documents = [...documentIds].sort();
		tenants[tenantId] = {
			selfHostTenantId: null,
			documentCount: documents.length,
			documents,
		};
	}

	const inventory = {
		generatedAt: new Date().toISOString(),
		documentCount: total,
		// Present only when filtered, so a consumer can tell a scoped inventory
		// from a complete one.
		...(options.tenantId ? { tenantFilter: options.tenantId } : {}),
		tenants,
		errors,
	};

	const outputPath = path.resolve(options.output);
	// Redact any unexpected credentials.
	const serialized = redact(`${JSON.stringify(inventory, undefined, 2)}\n`);
	await mkdir(path.dirname(outputPath), { recursive: true });
	// Apply owner-only permissions to new and existing files.
	await writeFile(outputPath, serialized, { encoding: "utf-8", mode: OUTPUT_MODE });
	await chmod(outputPath, OUTPUT_MODE);

	log(`\nWrote ${total} document(s) across ${Object.keys(tenants).length} tenant(s) to ${outputPath}`);
	if (errors.length > 0) {
		log(`${errors.length} server(s) could not be read; see "errors" in the output.`);
		return 1;
	}
	return 0;
}

main().then(
	(code) => process.exit(code),
	(err) => {
		console.error(`\nError: ${redact(safeErrorMessage(err))}`);
		process.exit(1);
	},
);
