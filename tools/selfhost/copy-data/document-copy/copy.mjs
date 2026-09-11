#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateToken } from "@fluidframework/server-services-client";
import { loadConfiguration } from "../configuration/configuration.mjs";
import { withAzureFluidRelayTenantKey2, withSelfHostTenantKey2 } from "../configuration/credentials.mjs";
import { classifyError, createFailure, logAndAddError } from "../configuration/errors.mjs";
import { createResults, recordSuccess, writeStageResults } from "../configuration/results.mjs";

// The Azure Fluid Relay summary read and self-hosted document creation need these document-scoped permissions.
const scopes = ["doc:read", "doc:write", "summary:write"];
const tokenLifetimeSeconds = 60;

// Carries only safe HTTP and endpoint metadata into results and console output.
class CopyError extends Error {
	constructor(message, status, endpoint) {
		super(message);
		this.name = "CopyError";
		this.status = status;
		this.endpoint = endpoint;
	}
}

// Historian Git API Authorization
function azureFluidRelayAuthorization(tenantId, documentId, key) {
	try {
		const token = generateToken(tenantId, documentId, key, scopes, undefined, tokenLifetimeSeconds);
		return `Basic ${Buffer.from(`${tenantId}:${token}`).toString("base64")}`;
	} catch {
		throw new CopyError("Unable to generate an Azure Fluid Relay Historian token", undefined, "azure-fluid-relay-historian");
	}
}

// Session discovery uses the Azure Fluid Relay document token.
function discoveryAuthorization(tenantId, documentId, key) {
	try {
		return `Basic ${generateToken(tenantId, documentId, key, scopes, undefined, tokenLifetimeSeconds)}`;
	} catch {
		throw new CopyError("Unable to generate an Azure Fluid Relay discovery token", undefined, "azure-fluid-relay-discovery");
	}
}

// Alfred document APIs accept the short-lived JWT directly in the Basic header.
function selfHostAuthorization(tenantId, documentId, key) {
	try {
		return `Basic ${generateToken(tenantId, documentId, key, scopes, undefined, tokenLifetimeSeconds)}`;
	} catch {
		throw new CopyError("Unable to generate a self-hosted API token", undefined, "self-host");
	}
}

// Make a JSON request without retaining or reporting raw response/error data.
async function requestJson(url, authorization, endpoint, fetchImplementation, options = {}) {
	const { expectedStatuses, headers, ...requestOptions } = options;
	let response;
	try {
		// Supply credentials only for this request; callers never receive the header value.
		response = await fetchImplementation(url, { ...requestOptions, headers: { Authorization: authorization, ...headers } });
	} catch {
		// Do not include transport error details because they may contain request metadata.
		throw new CopyError("Copy API request failed", undefined, endpoint);
	}
	if (!response || !Number.isInteger(response.status) || typeof response.json !== "function") {
		throw new CopyError("Copy API response did not include the expected status or JSON body", undefined, endpoint);
	}
	// Preserve only the HTTP status for a non-successful API response.
	if (!expectedStatuses.includes(response.status)) {
		throw new CopyError(`Copy API request failed with HTTP ${response.status}`, response.status, endpoint);
	}
	try {
		return await response.json();
	} catch {
		throw new CopyError("Copy API response could not be parsed as JSON", undefined, endpoint);
	}
}

// Build the tenant-scoped Historian repository base URL.
function repositoryUrl(endpoint, tenantId) {
	return `${endpoint.replace(/\/$/, "")}/repos/${encodeURIComponent(tenantId)}`;
}

// Resolve the per-document AFR Historian host from the discovery endpoint.
async function discoverAzureFluidRelayHistorian(discoveryEndpoint, tenantId, documentId, key, fetchImplementation) {
	try {
		const endpoint = new URL(discoveryEndpoint);
		if (endpoint.protocol !== "https:") throw new Error();
	} catch {
		throw new CopyError("Azure Fluid Relay discovery endpoint must be a valid HTTPS URL", undefined, "azure-fluid-relay-discovery");
	}
	const authorization = discoveryAuthorization(tenantId, documentId, key);
	let response;
	try {
		response = await fetchImplementation(`${discoveryEndpoint.replace(/\/$/, "")}/documents/${encodeURIComponent(tenantId)}/session/${encodeURIComponent(documentId)}`, {
			method: "GET",
			headers: { Authorization: authorization },
		});
	} catch {
		throw new CopyError("Azure Fluid Relay session discovery request failed", undefined, "azure-fluid-relay-discovery");
	}
	if (response.status !== 200) {
		throw new CopyError("Azure Fluid Relay session discovery request failed", response.status, "azure-fluid-relay-discovery");
	}
	let session;
	try {
		session = await response.json();
	} catch {
		throw new CopyError("Azure Fluid Relay session discovery response could not be parsed as JSON", undefined, "azure-fluid-relay-discovery");
	}

	if (typeof session?.historianUrl !== "string") throw new CopyError("Azure Fluid Relay session discovery did not return a Historian URL", undefined, "azure-fluid-relay-discovery");
	try {
		const historianUrl = new URL(session.historianUrl);
		if (historianUrl.protocol !== "https:") throw new Error();
		return historianUrl.toString().replace(/\/$/, "");
	} catch {
		throw new CopyError("Azure Fluid Relay session discovery did not provide an HTTPS Historian URL", undefined, "azure-fluid-relay-discovery");
	}
}

// Convert flat Historian entries under one path into the nested whole-summary tree Alfred accepts.
function makeWholeTree(entries, blobs, pathPrefix = "") {
	const tree = { type: "tree", entries: [] };
	const children = new Map();
	for (const entry of entries) {
		// Validate untrusted Historian data before reading its fields so malformed entries remain classified.
		if (!entry || typeof entry.path !== "string" || typeof entry.type !== "string") {
			throw new CopyError("Azure Fluid Relay summary entry is missing a path or type", undefined, "azure-fluid-relay-historian");
		}
		if (!entry.path.startsWith(pathPrefix)) continue;
		const relativePath = entry.path.slice(pathPrefix.length);
		// The tree entry itself does not become a child entry in the reconstructed payload.
		if (relativePath === "") continue;
		const slash = relativePath.indexOf("/");
		if (slash >= 0) {
			// Recursively process nested directories
			const name = relativePath.slice(0, slash);
			if (!children.has(name)) children.set(name, { unreferenced: false });
			continue;
		}
		if (entry.type === "tree") {
			children.set(relativePath, entry);
			continue;
		}
		if (entry.type !== "blob") throw new CopyError(`Azure Fluid Relay summary contains an unsupported root entry.`, undefined, "azure-fluid-relay-historian");
		if (typeof entry.id !== "string") throw new CopyError("Azure Fluid Relay summary blob entry is missing an ID", undefined, "azure-fluid-relay-historian");
		const blob = blobs.get(entry.id);
		if (!blob) throw new CopyError("Azure Fluid Relay summary does not include a blob", undefined, "azure-fluid-relay-historian");
		tree.entries.push({
			path: relativePath,
			type: "blob",
			...(entry.unreferenced === true && { unreferenced: true }),
			value: { type: "blob", content: blob.content, encoding: blob.encoding },
		});
	}
	// Recursively recreate each child tree
	for (const [name, sourceEntry] of children) {
		tree.entries.push({
			path: name,
			type: "tree",
			...(sourceEntry.unreferenced === true && { unreferenced: true }),
			value: makeWholeTree(entries, blobs, `${pathPrefix}${name}/`),
		});
	}
	return tree;
}

// Generate the request to create the new document
function buildCreateRequest(summary, documentId) {
	// Historian returns one flat root tree for a whole summary.
	const tree = summary?.trees?.[0];
	if (!tree || !Array.isArray(tree.entries) || !Array.isArray(summary.blobs)) {
		throw new CopyError("Azure Fluid Relay Historian summary is missing its tree entries or blobs", undefined, "azure-fluid-relay-historian");
	}
	// Resolve flat-entry blob IDs so protocol metadata can be read without logging summary contents.
	const blobs = new Map();
	for (const blob of summary.blobs) {
		// Validate blob records before building the lookup used by protocol and application entries.
		if (!blob || typeof blob.id !== "string" || typeof blob.content !== "string" || (blob.encoding !== "base64" && blob.encoding !== "utf-8")) {
			throw new CopyError("Azure Fluid Relay summary blob is missing a supported ID, content, or encoding", undefined, "azure-fluid-relay-historian");
		}
		blobs.set(blob.id, blob);
	}
	const attributesEntry = tree.entries.find((entry) => entry.path === ".protocol/attributes" && entry.type === "blob");
	const quorumValuesEntry = tree.entries.find((entry) => entry.path === ".protocol/quorumValues" && entry.type === "blob");
	const attributes = blobs.get(attributesEntry?.id);
	const quorumValues = blobs.get(quorumValuesEntry?.id);
	if (!attributes || !quorumValues) throw new CopyError("Azure Fluid Relay summary is missing required protocol metadata", undefined, "azure-fluid-relay-historian");
	let sequenceNumber;
	let values;
	try {
		sequenceNumber = JSON.parse(attributes.encoding === "base64" ? Buffer.from(attributes.content, "base64").toString("utf8") : attributes.content).sequenceNumber;
 		values = JSON.parse(quorumValues.encoding === "base64" ? Buffer.from(quorumValues.content, "base64").toString("utf8") : quorumValues.content);
	} catch {
		throw new CopyError("Azure Fluid Relay summary protocol metadata could not be parsed as JSON", undefined, "azure-fluid-relay-historian");
	}
	if (!Number.isInteger(sequenceNumber) || !Array.isArray(values)) {
		throw new CopyError("Azure Fluid Relay summary protocol metadata was incomplete", undefined, "azure-fluid-relay-historian");
	}
	// Send only `.app`; Alfred creates a new `.protocol` tree for the self-hosted deployment.
	return { id: documentId, summary: makeWholeTree(tree.entries, blobs, ".app/"), sequenceNumber, values, enableDiscovery: true, enableAnyBinaryBlobOnFirstSummary: true };
}

/** Copy a document with the Azure Fluid Relay Historian and self-hosted Alfred public APIs. */
export async function copyDocument({ azureFluidRelayEndpoint, azureFluidRelayTenantId, selfHostEndpoint, selfHostTenantId, documentId, azureFluidRelayKey, selfHostKey, fetchImplementation = fetch }) {
	let step = "azure-fluid-relay-discovery";
	try {
		// Discover the Azure Fluid Relay storage host, then load the most recent summary commit and payload.
		const azureFluidRelayHistorianEndpoint = await discoverAzureFluidRelayHistorian(azureFluidRelayEndpoint, azureFluidRelayTenantId, documentId, azureFluidRelayKey, fetchImplementation);
		step = "azure-fluid-relay-authorization";
		const azureFluidRelayAuth = azureFluidRelayAuthorization(azureFluidRelayTenantId, documentId, azureFluidRelayKey);
		// Request only this document's ref, which points to its latest summary commit.
		step = "azure-fluid-relay-ref-read";
		const refName = `heads/${documentId}`;
		const ref = await requestJson(`${repositoryUrl(azureFluidRelayHistorianEndpoint, azureFluidRelayTenantId)}/git/refs/${encodeURIComponent(refName)}`, azureFluidRelayAuth, "azure-fluid-relay-historian", fetchImplementation, { expectedStatuses: [200] });
		const commitSha = ref?.object?.sha;
		if (typeof commitSha !== "string") throw new CopyError("Azure Fluid Relay document ref does not include a summary commit", undefined, "azure-fluid-relay-historian");
		// Download the complete flat summary, including application blobs and protocol metadata.
		step = "azure-fluid-relay-summary-read";
		const summary = await requestJson(`${repositoryUrl(azureFluidRelayHistorianEndpoint, azureFluidRelayTenantId)}/git/summaries/${encodeURIComponent(commitSha)}`, azureFluidRelayAuth, "azure-fluid-relay-historian", fetchImplementation, { expectedStatuses: [200] });

		// Convert the flat Historian summary into Alfred's nested initial-summary payload.
		step = "summary-conversion";
		const createRequest = buildCreateRequest(summary, documentId);
		step = "self-host-create";
		const created = await requestJson(`${selfHostEndpoint.replace(/\/$/, "")}/documents/${encodeURIComponent(selfHostTenantId)}`, selfHostAuthorization(selfHostTenantId, documentId, selfHostKey), "self-host", fetchImplementation, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(createRequest),
			expectedStatuses: [201],
		});
		// Support both the legacy string response and modern response object to retain any self-host remapping.
		step = "self-host-response-validation";
		const selfHostDocumentId = typeof created === "string" ? created : created?.id;
		if (typeof selfHostDocumentId !== "string" || selfHostDocumentId === "") {
			throw new CopyError("Self-hosted create response is missing the document ID", undefined, "self-host");
		}
		return selfHostDocumentId;
	} catch (error) {
		if (error instanceof CopyError) throw error;
		const endpoint = step.startsWith("self-host") ? "self-host" : step === "azure-fluid-relay-discovery" ? "azure-fluid-relay-discovery" : "azure-fluid-relay-historian";
		throw new CopyError("Document copy failed unexpectedly", undefined, endpoint);
	}
}

// Require an execution flag before creating the documents
function parseArgs(argv) {
	const options = { configPath: path.join(import.meta.dirname, "..", "configuration", "parameters", "copy-data.config.json"), execute: false };
	for (let index = 0; index < argv.length; index++) {
		switch (argv[index]) {
			case "--config": options.configPath = argv[++index]; break;
			case "--execute": options.execute = true; break;
			case "--help": case "-h": console.log("Usage: node copy.mjs [--config <path>] --execute"); return undefined;
			default: throw new Error(`Unknown argument: ${argv[index]}`);
		}
	}
	if (!options.execute) throw new Error("Use --execute to copy documents");
	return options;
}

// Copy every inventoried document and write only non-sensitive outcomes after each attempt.
export async function main(argv) {
	const options = parseArgs(argv);
	if (options === undefined) return;
	const { config, configDirectory, inventory, warnings } = await loadConfiguration(options.configPath);
	const resultsDirectory = path.resolve(configDirectory, config.resultsDirectory);
	for (const warning of warnings) console.warn(`Warning: ${warning}`);
	const results = createResults(inventory);
	// Process one tenant and document at a time so keys have the shortest practical lifetime.
	for (const [azureFluidRelayTenantId, tenant] of Object.entries(inventory.tenants)) {
		const azureFluidRelayTenant = config.azureFluidRelayTenants[azureFluidRelayTenantId];
		const selfHostTenantId = (tenant.selfHostTenantId || azureFluidRelayTenantId).toLowerCase();
		for (const documentId of tenant.documents) {
			let failureContext = { endpoint: "azure-fluid-relay-credentials" };
			try {
				// Retrieve each tenant key only around the corresponding document operation.
				const selfHostDocumentId = await withAzureFluidRelayTenantKey2(azureFluidRelayTenant, (azureFluidRelayKey) => {
					failureContext = { endpoint: "self-host-credentials" };
					return withSelfHostTenantKey2({ ...config.selfHost, selfHostNamespace: config.selfHostNamespace, selfHostTenantId }, (selfHostKey) => {
						failureContext = { endpoint: "self-host" };
						return copyDocument({ azureFluidRelayEndpoint: azureFluidRelayTenant.azureFluidRelayEndpoint, azureFluidRelayTenantId, selfHostEndpoint: config.selfHost.alfredEndpoint, selfHostTenantId, documentId, azureFluidRelayKey, selfHostKey });
					});
				});
				recordSuccess(results, azureFluidRelayTenantId, documentId, selfHostDocumentId);
				console.log(`Copied document ${documentId} as ${selfHostDocumentId}.`);
			} catch (error) {
				const failure = createFailure(documentId, "document-copy", error, failureContext);
				const tenantResults = results.tenants[azureFluidRelayTenantId];
				logAndAddError(tenantResults.failed, error, failure, `Failed to copy document ${documentId}: ${failure.reason} from ${failure.endpoint}`);
			}
			// Write the result to the result file
			await writeStageResults(resultsDirectory, "document-copy", results);
		}
	}
	if (Object.values(results.tenants).some((tenant) => tenant.failed.length > 0)) process.exitCode = 1;
}

// Run the CLI only when this file is invoked directly, not when tests import its functions.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	// Report a safe classification for failures that occur before per-document error handling.
	try { await main(process.argv.slice(2)); } catch (error) { console.error(`Document copy failed: ${classifyError(error)}.`); process.exitCode = 1; }
}
