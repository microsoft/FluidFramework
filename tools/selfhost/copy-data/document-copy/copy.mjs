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
import { classifyError, createFailure } from "../configuration/errors.mjs";
import { createResults, recordFailure, recordSuccess, writeStageResults } from "../configuration/results.mjs";

// The Azure Fluid Relay summary read and self-hosted document creation need these document-scoped permissions.
const scopes = ["doc:read", "doc:write", "summary:write"];
const tokenLifetimeSeconds = 60;

// Carries only safe HTTP and endpoint metadata into results and console output.
class TransferError extends Error {
	constructor(message, code, status, endpoint) {
		super(message);
		this.name = "TransferError";
		this.code = code;
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
		throw new TransferError("Unable to generate an Azure Fluid Relay Historian token", "azure-fluid-relay-historian-token-generation-failed", undefined, "azure-fluid-relay-historian");
	}
}

// Session discovery uses the Azure Fluid Relay document token.
function discoveryAuthorization(tenantId, documentId, key) {
	try {
		return `Basic ${generateToken(tenantId, documentId, key, scopes, undefined, tokenLifetimeSeconds)}`;
	} catch {
		throw new TransferError("Unable to generate an Azure Fluid Relay discovery token", "azure-fluid-relay-discovery-token-generation-failed", undefined, "azure-fluid-relay-discovery");
	}
}

// Alfred document APIs accept the short-lived JWT directly in the Basic header.
function selfHostAuthorization(tenantId, documentId, key) {
	try {
		return `Basic ${generateToken(tenantId, documentId, key, scopes, undefined, tokenLifetimeSeconds)}`;
	} catch {
		throw new TransferError("Unable to generate a self-hosted API token", "token-generation-failed", undefined, "self-host");
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
		throw new TransferError("Transfer API request failed", "request-failed", undefined, endpoint);
	}
	if (!response || !Number.isInteger(response.status) || typeof response.json !== "function") {
		throw new TransferError("Transfer API returned an invalid response", "invalid-response", undefined, endpoint);
	}
	// Preserve only the HTTP status for a non-successful API response.
	if (!expectedStatuses.includes(response.status)) {
		throw new TransferError(`Transfer API request failed with HTTP ${response.status}`, "http-request-failed", response.status, endpoint);
	}
	try {
		return await response.json();
	} catch {
		throw new TransferError("Transfer API response was invalid", "invalid-response", undefined, endpoint);
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
		throw new TransferError("Azure Fluid Relay discovery endpoint must be a valid HTTPS URL", "invalid-discovery-endpoint", undefined, "azure-fluid-relay-discovery");
	}
	const authorization = discoveryAuthorization(tenantId, documentId, key);
	let response;
	try {
		response = await fetchImplementation(`${discoveryEndpoint.replace(/\/$/, "")}/documents/${encodeURIComponent(tenantId)}/session/${encodeURIComponent(documentId)}`, {
			method: "GET",
			headers: { Authorization: authorization },
		});
	} catch {
		throw new TransferError("Azure Fluid Relay session discovery request failed", "request-failed", undefined, "azure-fluid-relay-discovery");
	}
	if (response.status !== 200) {
		throw new TransferError("Azure Fluid Relay session discovery request failed", "http-request-failed", response.status, "azure-fluid-relay-discovery");
	}
	let session;
	try {
		session = await response.json();
	} catch {
		throw new TransferError("Azure Fluid Relay session discovery response was invalid", "invalid-response", undefined, "azure-fluid-relay-discovery");
	}

	if (typeof session?.historianUrl !== "string") throw new TransferError("Azure Fluid Relay session discovery did not return a Historian URL", "missing-historian-url", undefined, "azure-fluid-relay-discovery");
	try {
		const historianUrl = new URL(session.historianUrl);
		if (historianUrl.protocol !== "https:") throw new Error();
		return historianUrl.toString().replace(/\/$/, "");
	} catch {
		throw new TransferError("Azure Fluid Relay session discovery returned an invalid Historian URL", "invalid-historian-url", undefined, "azure-fluid-relay-discovery");
	}
}

function safeErrorMessage(error) {
	if (typeof error?.message !== "string") return "no message";
	return error.message
		.replace(/Basic\s+[^\s]+/gi, "Basic [redacted]")
		.replace(/\beyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2}\b/g, "[redacted-jwt]")
		.replace(/https?:\/\/[^\s)]+/gi, "[redacted-url]")
		.slice(0, 256);
}

// Convert flat Historian entries under one path into the nested whole-summary tree Alfred accepts.
function makeWholeTree(entries, blobs, pathPrefix = "") {
	const tree = { type: "tree", entries: [] };
	const children = new Map();
	for (const entry of entries) {
		// Validate untrusted Historian data before reading its fields so malformed entries remain classified.
		if (!entry || typeof entry.path !== "string" || typeof entry.type !== "string") {
			throw new TransferError("Source summary contains an invalid entry", "invalid-summary-entry", undefined, "source-historian");
		}
		if (!entry.path.startsWith(pathPrefix)) continue;
		const relativePath = entry.path.slice(pathPrefix.length);
		// The tree entry itself does not become a child entry in the reconstructed payload.
		if (relativePath === "") continue;
		const slash = relativePath.indexOf("/");
		if (slash >= 0) {
			// Recursively process nested directories
			const name = relativePath.slice(0, slash);
			if (!children.has(name)) children.set(name, undefined);
			continue;
		}
		// Source handles cannot be reused because they reference Git objects in the source repository.
		if (entry.type === "tree") {
			children.set(relativePath, entry);
			continue;
		}
		if (entry.type !== "blob") throw new TransferError(`Source summary contains an unsupported root entry.`, "unsupported-summary-entry", undefined, "source-historian");
		if (typeof entry.id !== "string") throw new TransferError("Source summary blob entry lacks an ID", "missing-summary-blob-id", undefined, "source-historian");
		const blob = blobs.get(entry.id);
		if (!blob) throw new TransferError("Source summary omitted a blob", "missing-summary-blob", undefined, "source-historian");
		tree.entries.push({ path: relativePath, type: "blob", value: { type: "blob", content: blob.content, encoding: blob.encoding } });
	}
	// Recursively recreate each child tree
	for (const [name, sourceEntry] of children) {
		tree.entries.push({
			path: name,
			type: "tree",
			...(sourceEntry?.unreferenced === true && { unreferenced: true }),
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
		throw new TransferError("Source Historian returned an invalid summary", "invalid-summary", undefined, "source-historian");
	}
	// Resolve flat-entry blob IDs so protocol metadata can be read without logging summary contents.
	const blobs = new Map();
	for (const blob of summary.blobs) {
		// Validate blob records before building the lookup used by protocol and application entries.
		if (!blob || typeof blob.id !== "string" || typeof blob.content !== "string" || (blob.encoding !== "base64" && blob.encoding !== "utf-8")) {
			throw new TransferError("Source summary contains an invalid blob", "invalid-summary-blob", undefined, "source-historian");
		}
		blobs.set(blob.id, blob);
	}
	const attributesEntry = tree.entries.find((entry) => entry.path === ".protocol/attributes" && entry.type === "blob");
	const quorumValuesEntry = tree.entries.find((entry) => entry.path === ".protocol/quorumValues" && entry.type === "blob");
	// Attributes determine the transferred sequence number; quorum values preserve code and proposal state.
	const attributes = blobs.get(attributesEntry?.id);
	const quorumValues = blobs.get(quorumValuesEntry?.id);
	if (!attributes || !quorumValues) throw new TransferError("Source summary lacks required protocol metadata", "missing-protocol-metadata", undefined, "source-historian");
	// The target constructs its own protocol tree from these source compatibility values.
	let sequenceNumber;
	let values;
	try {
		sequenceNumber = JSON.parse(attributes.encoding === "base64" ? Buffer.from(attributes.content, "base64").toString("utf8") : attributes.content).sequenceNumber;
 		values = JSON.parse(quorumValues.encoding === "base64" ? Buffer.from(quorumValues.content, "base64").toString("utf8") : quorumValues.content);
	} catch {
		throw new TransferError("Source summary protocol metadata was invalid", "invalid-protocol-metadata", undefined, "source-historian");
	}
	if (!Number.isInteger(sequenceNumber) || !Array.isArray(values)) {
		throw new TransferError("Source summary protocol metadata was incomplete", "incomplete-protocol-metadata", undefined, "source-historian");
	}
	// Send only `.app`; Alfred creates a new `.protocol` tree for the target deployment.
	return { id: documentId, summary: makeWholeTree(tree.entries, blobs, ".app/"), sequenceNumber, values, enableDiscovery: true, enableAnyBinaryBlobOnFirstSummary: true };
}

/** Transfer a document with the Azure Fluid Relay Historian and self-hosted Alfred public APIs. */
export async function transferDocument({ azureFluidRelayEndpoint, azureFluidRelayTenantId, selfHostEndpoint, selfHostTenantId, documentId, azureFluidRelayKey, selfHostKey, fetchImplementation = fetch }) {
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
		if (typeof commitSha !== "string") throw new TransferError("Azure Fluid Relay document has no transferable summary", "missing-summary", undefined, "azure-fluid-relay-historian");
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
			throw new TransferError("Self-hosted create response omitted the document ID", "missing-self-host-document-id", undefined, "self-host");
		}
		return selfHostDocumentId;
	} catch (error) {
		if (error instanceof TransferError) throw error;
		const endpoint = step.startsWith("self-host") ? "self-host" : step === "azure-fluid-relay-discovery" ? "azure-fluid-relay-discovery" : "azure-fluid-relay-historian";
		throw new TransferError("Document transfer failed unexpectedly", `unexpected-${step}`, undefined, endpoint);
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
	if (!options.execute) throw new Error("Pass --execute to transfer documents");
	return options;
}

// Transfer every inventoried document and write only non-sensitive outcomes after each attempt.
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
			let failureContext = { errorCode: "azure-fluid-relay-key-retrieval", endpoint: "azure-fluid-relay-credentials" };
			try {
				// Retrieve each tenant key only around the corresponding document operation.
				const selfHostDocumentId = await withAzureFluidRelayTenantKey2(azureFluidRelayTenant, (azureFluidRelayKey) => {
					failureContext = { errorCode: "self-host-key-retrieval", endpoint: "self-host-credentials" };
					return withSelfHostTenantKey2({ ...config.selfHost, selfHostNamespace: config.selfHostNamespace, selfHostTenantId }, (selfHostKey) => {
						failureContext = { errorCode: "transfer-operation", endpoint: "self-host" };
						return transferDocument({ azureFluidRelayEndpoint: azureFluidRelayTenant.azureFluidRelayEndpoint, azureFluidRelayTenantId, selfHostEndpoint: config.selfHost.alfredEndpoint, selfHostTenantId, documentId, azureFluidRelayKey, selfHostKey });
					});
				});
				recordSuccess(results, azureFluidRelayTenantId, documentId, selfHostDocumentId);
				console.log(`Transferred document ${documentId} as ${selfHostDocumentId}.`);
			} catch (error) {
				const failure = createFailure(documentId, "document-copy", error, failureContext);
				recordFailure(results, azureFluidRelayTenantId, failure);
				console.error(`Failed to transfer document ${documentId}: ${failure.reason} (${failure.errorCode}) from ${failure.endpoint}: ${safeErrorMessage(error)}.`);
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
	try { await main(process.argv.slice(2)); } catch (error) { console.error(`Document transfer failed: ${classifyError(error)}.`); process.exitCode = 1; }
}
