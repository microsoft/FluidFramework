#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateToken } from "@fluidframework/server-services-client";
import { loadConfiguration } from "../configuration/configuration.mjs";
import { withSourceTenantKey2, withTargetTenantKey2 } from "../configuration/credentials.mjs";
import { classifyError, createFailure } from "../configuration/errors.mjs";
import { createResults, recordFailure, recordSuccess, writeStageResults } from "../configuration/results.mjs";

// The source summary read and target document creation need these document-scoped permissions.
const scopes = ["doc:read", "doc:write", "summary:write"];

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
function sourceAuthorization(tenantId, documentId, key) {
	try {
		const token = generateToken(tenantId, documentId, key, scopes, undefined, 60);
		return `Basic ${Buffer.from(`${tenantId}:${token}`).toString("base64")}`;
	} catch {
		throw new TransferError("Unable to generate a source Historian token", "source-historian-token-generation-failed", undefined, "source-historian");
	}
}

// Session discovery uses the source document token
function discoveryAuthorization(tenantId, documentId, key) {
	try {
		return `Basic ${generateToken(tenantId, documentId, key, scopes, undefined, 60)}`;
	} catch {
		throw new TransferError("Unable to generate a source discovery token", "source-discovery-token-generation-failed", undefined, "source-discovery");
	}
}

// Alfred document APIs accept the short-lived JWT directly in the Basic header.
function targetAuthorization(tenantId, documentId, key) {
	try {
		return `Basic ${generateToken(tenantId, documentId, key, scopes, undefined, 60)}`;
	} catch {
		throw new TransferError("Unable to generate a target API token", "token-generation-failed", undefined, "target");
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
async function discoverSourceHistorian(discoveryEndpoint, tenantId, documentId, key, fetchImplementation) {
	try {
		const endpoint = new URL(discoveryEndpoint);
		if (endpoint.protocol !== "https:") throw new Error();
	} catch {
		throw new TransferError("Source discovery endpoint must be a valid HTTPS URL", "invalid-discovery-endpoint", undefined, "source-discovery");
	}
	const authorization = discoveryAuthorization(tenantId, documentId, key);
	let response;
	try {
		response = await fetchImplementation(`${discoveryEndpoint.replace(/\/$/, "")}/documents/${encodeURIComponent(tenantId)}/session/${encodeURIComponent(documentId)}`, {
			method: "GET",
			headers: { Authorization: authorization },
		});
	} catch {
		throw new TransferError("Source session discovery request failed", "request-failed", undefined, "source-discovery");
	}
	if (response.status !== 200) {
		throw new TransferError("Source session discovery request failed", "http-request-failed", response.status, "source-discovery");
	}
	let session;
	try {
		session = await response.json();
	} catch {
		throw new TransferError("Source session discovery response was invalid", "invalid-response", undefined, "source-discovery");
	}

	if (typeof session?.historianUrl !== "string") throw new TransferError("Source session discovery did not return a Historian URL", "missing-historian-url", undefined, "source-discovery");
	try {
		const historianUrl = new URL(session.historianUrl);
		if (historianUrl.protocol !== "https:") throw new Error();
		return historianUrl.toString().replace(/\/$/, "");
	} catch {
		throw new TransferError("Source session discovery returned an invalid Historian URL", "invalid-historian-url", undefined, "source-discovery");
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
			if (!children.has(name)) children.set(name, true);
			continue;
		}
		// Source handles cannot be reused because they reference Git objects in the source repository.
		if (entry.type === "tree") {
			children.set(relativePath, true);
			continue;
		}
		if (entry.type !== "blob") throw new TransferError(`Source summary contains an unsupported root entry.`, "unsupported-summary-entry", undefined, "source-historian");
		if (typeof entry.id !== "string") throw new TransferError("Source summary blob entry lacks an ID", "missing-summary-blob-id", undefined, "source-historian");
		const blob = blobs.get(entry.id);
		if (!blob) throw new TransferError("Source summary omitted a blob", "missing-summary-blob", undefined, "source-historian");
		tree.entries.push({ path: relativePath, type: "blob", value: { type: "blob", content: blob.content, encoding: blob.encoding } });
	}
	// Recursively recreate each child tree
	for (const name of children.keys()) {
		tree.entries.push({ path: name, type: "tree", value: makeWholeTree(entries, blobs, `${pathPrefix}${name}/`) });
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
		sequenceNumber = JSON.parse(attributes.content).sequenceNumber;
		values = JSON.parse(quorumValues.content);
	} catch {
		throw new TransferError("Source summary protocol metadata was invalid", "invalid-protocol-metadata", undefined, "source-historian");
	}
	if (!Number.isInteger(sequenceNumber) || !Array.isArray(values)) {
		throw new TransferError("Source summary protocol metadata was incomplete", "incomplete-protocol-metadata", undefined, "source-historian");
	}
	// Send only `.app`; Alfred creates a new `.protocol` tree for the target deployment.
	return { id: documentId, summary: makeWholeTree(tree.entries, blobs, ".app/"), sequenceNumber, values, enableDiscovery: true, enableAnyBinaryBlobOnFirstSummary: true };
}

/** Transfer a document through the source Historian and target Alfred public APIs. */
export async function transferDocument({ sourceEndpoint, sourceTenantId, targetEndpoint, targetTenantId, documentId, sourceKey, targetKey, fetchImplementation = fetch }) {
	let step = "source-discovery";
	try {
		// Discover the source storage host, then load the most recent summary commit and payload.
		const sourceHistorianEndpoint = await discoverSourceHistorian(sourceEndpoint, sourceTenantId, documentId, sourceKey, fetchImplementation);
		step = "source-authorization";
		const sourceAuth = sourceAuthorization(sourceTenantId, documentId, sourceKey);
		// Request only this document's ref, which points to its latest summary commit.
		step = "source-ref-read";
		const refName = `heads/${documentId}`;
		const ref = await requestJson(`${repositoryUrl(sourceHistorianEndpoint, sourceTenantId)}/git/refs/${encodeURIComponent(refName)}`, sourceAuth, "source-historian", fetchImplementation, { expectedStatuses: [200] });
		const commitSha = ref?.object?.sha;
		if (typeof commitSha !== "string") throw new TransferError("Source document has no transferable summary", "missing-summary", undefined, "source-historian");
		// Download the complete flat summary, including application blobs and protocol metadata.
		step = "source-summary-read";
		const summary = await requestJson(`${repositoryUrl(sourceHistorianEndpoint, sourceTenantId)}/git/summaries/${encodeURIComponent(commitSha)}`, sourceAuth, "source-historian", fetchImplementation, { expectedStatuses: [200] });

		// Convert the flat Historian summary into Alfred's nested initial-summary payload.
		step = "summary-conversion";
		const createRequest = buildCreateRequest(summary, documentId);
		step = "target-create";
		const created = await requestJson(`${targetEndpoint.replace(/\/$/, "")}/documents/${encodeURIComponent(targetTenantId)}`, targetAuthorization(targetTenantId, documentId, targetKey), "target", fetchImplementation, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(createRequest),
			expectedStatuses: [201],
		});
		// Support both the legacy string response and modern response object to retain any target remapping.
		step = "target-response-validation";
		const targetDocumentId = typeof created === "string" ? created : created?.id;
		if (typeof targetDocumentId !== "string" || targetDocumentId === "") {
			throw new TransferError("Target create response omitted the document ID", "missing-target-document-id", undefined, "target");
		}
		return targetDocumentId;
	} catch (error) {
		if (error instanceof TransferError) throw error;
		const endpoint = step.startsWith("target") ? "target" : step === "source-discovery" ? "source-discovery" : "source-historian";
		throw new TransferError("Document transfer failed unexpectedly", `unexpected-${step}`, undefined, endpoint);
	}
}

// Require an execution flag before creating the documents
function parseArgs(argv) {
	const options = { configPath: "configuration/parameters/data-transfer.config.json", execute: false };
	for (let index = 0; index < argv.length; index++) {
		switch (argv[index]) {
			case "--config": options.configPath = argv[++index]; break;
			case "--execute": options.execute = true; break;
			case "--help": case "-h": console.log("Usage: node transfer.mjs [--config <path>] --execute"); return undefined;
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
	for (const [sourceTenantId, tenant] of Object.entries(inventory.tenants)) {
		const sourceTenant = config.sourceTenants[sourceTenantId];
		const targetTenantId = (tenant.selfHostTenantId || sourceTenantId).toLowerCase();
		for (const documentId of tenant.documents) {
			let failureContext = { errorCode: "source-key-retrieval", endpoint: "source-credentials" };
			try {
				// Retrieve each tenant key only around the corresponding document operation.
				const targetDocumentId = await withSourceTenantKey2(sourceTenant, (sourceKey) => {
					failureContext = { errorCode: "target-key-retrieval", endpoint: "target-credentials" };
					return withTargetTenantKey2({ ...config.target, targetNamespace: config.targetNamespace, selfHostTenantId: targetTenantId }, (targetKey) => {
						failureContext = { errorCode: "transfer-operation", endpoint: "target" };
						return transferDocument({ sourceEndpoint: sourceTenant.sourceFluidRelayEndpoint, sourceTenantId, targetEndpoint: config.target.alfredEndpoint, targetTenantId, documentId, sourceKey, targetKey });
					});
				});
				recordSuccess(results, sourceTenantId, documentId, targetDocumentId);
				console.log(`Transferred document ${documentId} as ${targetDocumentId}.`);
			} catch (error) {
				const failure = createFailure(documentId, "document-transfer", error, failureContext);
				recordFailure(results, sourceTenantId, failure);
				console.error(`Failed to transfer document ${documentId}: ${failure.reason} (${failure.errorCode}) from ${failure.endpoint}: ${safeErrorMessage(error)}.`);
			}
			// Write the result to the result file
			await writeStageResults(resultsDirectory, "document-transfer", results);
		}
	}
	if (Object.values(results.tenants).some((tenant) => tenant.failed.length > 0)) process.exitCode = 1;
}

// Run the CLI only when this file is invoked directly, not when tests import its functions.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	// Report a safe classification for failures that occur before per-document error handling.
	try { await main(process.argv.slice(2)); } catch (error) { console.error(`Document transfer failed: ${classifyError(error)}.`); process.exitCode = 1; }
}
