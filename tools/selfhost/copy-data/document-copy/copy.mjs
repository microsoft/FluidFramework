/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateToken } from "@fluidframework/server-services-client";
import { loadConfiguration } from "../configuration/configuration.mjs";
import { verifyDeployment } from "../configuration/check-deployment.mjs";
import {
	withAzureFluidRelayTenantKey2,
	withSelfHostTenantKey2,
} from "../configuration/credentials.mjs";
import { createFailure, safeErrorMessage, StageError } from "../configuration/errors.mjs";
import { confirmIgnoreLogTail, parseCopyOptions } from "../configuration/options.mjs";
import { createMetrics } from "../configuration/metrics.mjs";
import { prepareRun } from "../configuration/resume.mjs";
import { retry } from "../configuration/retry.mjs";
import { CopyError, requestJson } from "./requests.mjs";
import {
	recordSuccess,
	recordWarning,
	writeStageResults,
	withResultsLock,
} from "../configuration/results.mjs";

// The Azure Fluid Relay summary read and self-hosted document creation need these document-scoped permissions.
const scopes = ["doc:read", "doc:write", "summary:write"];
const tokenLifetimeSeconds = 60;
const unresolvedCreateReasons = new Set(["ambiguous-create", "document-id-mismatch"]);

// Historian Git API Authorization
function azureFluidRelayAuthorization(tenantId, documentId, key) {
	try {
		const token = generateToken(
			tenantId,
			documentId,
			key,
			scopes,
			undefined,
			tokenLifetimeSeconds,
		);
		return `Basic ${Buffer.from(`${tenantId}:${token}`).toString("base64")}`;
	} catch {
		throw new CopyError(
			"Unable to generate an Azure Fluid Relay Historian token",
			undefined,
			"azure-fluid-relay-historian",
		);
	}
}

// Session discovery uses the Azure Fluid Relay document token.
function discoveryAuthorization(tenantId, documentId, key) {
	try {
		return `Basic ${generateToken(tenantId, documentId, key, scopes, undefined, tokenLifetimeSeconds)}`;
	} catch {
		throw new CopyError(
			"Unable to generate an Azure Fluid Relay discovery token",
			undefined,
			"azure-fluid-relay-discovery",
		);
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

export async function selfHostDocumentExists(
	selfHostEndpoint,
	selfHostTenantId,
	documentId,
	selfHostKey,
	fetchImplementation = fetch,
	options = {},
) {
	const response = await requestJson(
		`${selfHostEndpoint.replace(/\/$/, "")}/documents/${encodeURIComponent(selfHostTenantId)}/${encodeURIComponent(documentId)}`,
		() => selfHostAuthorization(selfHostTenantId, documentId, selfHostKey),
		"self-host",
		fetchImplementation,
		{ ...options, expectedStatuses: [200, 404], parseBody: false, stage: "existence-check" },
	);
	return response.status === 200;
}

// Build the tenant-scoped Historian repository base URL.
function repositoryUrl(endpoint, tenantId) {
	return `${endpoint.replace(/\/$/, "")}/repos/${encodeURIComponent(tenantId)}`;
}

// Resolve the per-document AFR Historian host from the discovery endpoint.
async function discoverAzureFluidRelayHistorian(
	discoveryEndpoint,
	tenantId,
	documentId,
	key,
	fetchImplementation,
	options,
) {
	try {
		const endpoint = new URL(discoveryEndpoint);
		if (endpoint.protocol !== "https:") throw new Error();
	} catch {
		throw new CopyError(
			"Azure Fluid Relay discovery endpoint must be a valid HTTPS URL",
			undefined,
			"azure-fluid-relay-discovery",
		);
	}
	const session = await requestJson(
		`${discoveryEndpoint.replace(/\/$/, "")}/documents/${encodeURIComponent(tenantId)}/session/${encodeURIComponent(documentId)}`,
		() => discoveryAuthorization(tenantId, documentId, key),
		"azure-fluid-relay-discovery",
		fetchImplementation,
		{ ...options, method: "GET", stage: "discovery" },
	);

	if (typeof session?.historianUrl !== "string")
		throw new CopyError(
			"Azure Fluid Relay session discovery did not return a Historian URL",
			undefined,
			"azure-fluid-relay-discovery",
		);
	try {
		const historianUrl = new URL(session.historianUrl);
		if (historianUrl.protocol !== "https:") throw new Error();
		return historianUrl.toString().replace(/\/$/, "");
	} catch {
		throw new CopyError(
			"Azure Fluid Relay session discovery did not provide an HTTPS Historian URL",
			undefined,
			"azure-fluid-relay-discovery",
		);
	}
}

// Convert flat Historian entries under one path into the nested whole-summary tree Alfred accepts.
function makeWholeTree(entries, blobs, pathPrefix = "") {
	const tree = { type: "tree", entries: [] };
	const children = new Map();
	for (const entry of entries) {
		// Validate untrusted Historian data before reading its fields so malformed entries remain classified.
		if (!entry || typeof entry.path !== "string" || typeof entry.type !== "string") {
			throw new CopyError(
				"Azure Fluid Relay summary entry is missing a path or type",
				undefined,
				"azure-fluid-relay-historian",
			);
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
		if (entry.type !== "blob")
			throw new CopyError(
				`Azure Fluid Relay summary contains an unsupported root entry.`,
				undefined,
				"azure-fluid-relay-historian",
			);
		if (typeof entry.id !== "string")
			throw new CopyError(
				"Azure Fluid Relay summary blob entry is missing an ID",
				undefined,
				"azure-fluid-relay-historian",
			);
		const blob = blobs.get(entry.id);
		if (!blob)
			throw new CopyError(
				"Azure Fluid Relay summary does not include a blob",
				undefined,
				"azure-fluid-relay-historian",
			);
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
function buildCreateRequest(summary, documentId, ignoreLogTail = false) {
	// Historian returns one flat root tree for a whole summary.
	const tree = summary?.trees?.[0];
	if (!tree || !Array.isArray(tree.entries) || !Array.isArray(summary.blobs)) {
		throw new CopyError(
			"Azure Fluid Relay Historian summary is missing its tree entries or blobs",
			undefined,
			"azure-fluid-relay-historian",
		);
	}
	// Resolve flat-entry blob IDs so protocol metadata can be read without logging summary contents.
	const blobs = new Map();
	for (const blob of summary.blobs) {
		// Validate blob records before building the lookup used by protocol and application entries.
		if (
			!blob ||
			typeof blob.id !== "string" ||
			typeof blob.content !== "string" ||
			(blob.encoding !== "base64" && blob.encoding !== "utf-8")
		) {
			throw new CopyError(
				"Azure Fluid Relay summary blob is missing a supported ID, content, or encoding",
				undefined,
				"azure-fluid-relay-historian",
			);
		}
		blobs.set(blob.id, blob);
	}
	const attributesEntry = tree.entries.find(
		(entry) => entry.path === ".protocol/attributes" && entry.type === "blob",
	);
	const quorumValuesEntry = tree.entries.find(
		(entry) => entry.path === ".protocol/quorumValues" && entry.type === "blob",
	);
	const attributes = blobs.get(attributesEntry?.id);
	const quorumValues = blobs.get(quorumValuesEntry?.id);
	if (!attributes || !quorumValues)
		throw new CopyError(
			"Azure Fluid Relay summary is missing required protocol metadata",
			undefined,
			"azure-fluid-relay-historian",
		);
	let sequenceNumber;
	let values;
	try {
		sequenceNumber = JSON.parse(
			attributes.encoding === "base64"
				? Buffer.from(attributes.content, "base64").toString("utf8")
				: attributes.content,
		).sequenceNumber;
		values = JSON.parse(
			quorumValues.encoding === "base64"
				? Buffer.from(quorumValues.content, "base64").toString("utf8")
				: quorumValues.content,
		);
	} catch {
		throw new CopyError(
			"Azure Fluid Relay summary protocol metadata could not be parsed as JSON",
			undefined,
			"azure-fluid-relay-historian",
		);
	}
	if (!Number.isInteger(sequenceNumber) || sequenceNumber < 0 || !Array.isArray(values)) {
		throw new CopyError(
			"Azure Fluid Relay summary protocol metadata was incomplete",
			undefined,
			"azure-fluid-relay-historian",
		);
	}
	if (!tree.entries.some((entry) => entry.path === ".app" || entry.path.startsWith(".app/")))
		throw new CopyError(
			"Azure Fluid Relay summary is missing its application tree",
			undefined,
			"azure-fluid-relay-historian",
		);
	let ignoredLogTailOperations = 0;
	const logTailEntry = tree.entries.find((entry) => entry.path === ".logTail/logTail");
	if (logTailEntry || tree.entries.some((entry) => entry.path === ".logTail")) {
		const tailBlob = blobs.get(logTailEntry?.id);
		if (logTailEntry?.type !== "blob" || !tailBlob)
			throw new CopyError(
				"Azure Fluid Relay summary is missing its operation tail blob",
				undefined,
				"azure-fluid-relay-historian",
			);
		let operations;
		try {
			operations = JSON.parse(
				tailBlob.encoding === "base64"
					? Buffer.from(tailBlob.content, "base64").toString("utf8")
					: tailBlob.content,
			);
		} catch {
			throw new CopyError(
				"Azure Fluid Relay operation tail could not be parsed",
				undefined,
				"azure-fluid-relay-historian",
			);
		}
		if (
			!Array.isArray(operations) ||
			operations.some(
				(op) =>
					!Number.isInteger(op?.sequenceNumber) ||
					op.sequenceNumber < 0 ||
					typeof op.type !== "string",
			)
		)
			throw new CopyError(
				"Azure Fluid Relay operation tail is malformed",
				undefined,
				"azure-fluid-relay-historian",
			);
		// Client summaries can include their own summary/ack and membership traffic after the snapshot.
		const protocolOnly = new Set([
			"noop",
			"join",
			"leave",
			"noClient",
			"summarize",
			"summaryAck",
			"summaryNack",
		]);
		const unappliedOperations = operations.reduce(
			(count, op) =>
				count + (op.sequenceNumber > sequenceNumber && !protocolOnly.has(op.type) ? 1 : 0),
			0,
		);
		if (unappliedOperations > 0 && ignoreLogTail !== true)
			throw new CopyError(
				"Copy refused: the latest summary contains operations not incorporated into its application snapshot. Stop source writes, load the source document, and wait for an acknowledged client summary before retrying. This tool does not replay the operation tail. Use --ignore-logtail only to accept a snapshot-only copy that can omit recent changes.",
				undefined,
				"azure-fluid-relay-historian",
				"unsafe-summary",
			);
		ignoredLogTailOperations = unappliedOperations;
	}
	// Send only `.app`; Alfred creates a new `.protocol` tree for the self-hosted deployment.
	return {
		request: {
			id: documentId,
			summary: makeWholeTree(tree.entries, blobs, ".app/"),
			sequenceNumber,
			values,
			enableDiscovery: true,
			enableAnyBinaryBlobOnFirstSummary: true,
		},
		ignoredLogTailOperations,
	};
}

/** Copy a document with the Azure Fluid Relay Historian and self-hosted Alfred public APIs. */
export async function copyDocument({
	azureFluidRelayEndpoint,
	azureFluidRelayTenantId,
	selfHostEndpoint,
	selfHostTenantId,
	documentId,
	azureFluidRelayKey,
	selfHostKey,
	ignoreLogTail = false,
	fetchImplementation = fetch,
	policy = {},
	metrics,
	onAttempt,
	maxBytes = 64 * 1024 ** 2,
}) {
	const requestOptions = { policy, metrics, maxBytes, onAttempt };
	let step = "azure-fluid-relay-discovery";
	try {
		// Discover the Azure Fluid Relay storage host, then load the most recent summary commit and payload.
		const azureFluidRelayHistorianEndpoint = await discoverAzureFluidRelayHistorian(
			azureFluidRelayEndpoint,
			azureFluidRelayTenantId,
			documentId,
			azureFluidRelayKey,
			fetchImplementation,
			requestOptions,
		);
		step = "azure-fluid-relay-authorization";
		const azureFluidRelayAuth = () =>
			azureFluidRelayAuthorization(azureFluidRelayTenantId, documentId, azureFluidRelayKey);
		// Request only this document's ref, which points to its latest summary commit.
		step = "azure-fluid-relay-ref-read";
		const refName = `heads/${documentId}`;
		const ref = await requestJson(
			`${repositoryUrl(azureFluidRelayHistorianEndpoint, azureFluidRelayTenantId)}/git/refs/${encodeURIComponent(refName)}`,
			azureFluidRelayAuth,
			"azure-fluid-relay-historian",
			fetchImplementation,
			{ ...requestOptions, expectedStatuses: [200], stage: "ref-read" },
		);
		const commitSha = ref?.object?.sha;
		if (typeof commitSha !== "string")
			throw new CopyError(
				"Azure Fluid Relay document ref does not include a summary commit",
				undefined,
				"azure-fluid-relay-historian",
			);
		// Download the complete flat summary, including application blobs and protocol metadata.
		step = "azure-fluid-relay-summary-read";
		const summary = await requestJson(
			`${repositoryUrl(azureFluidRelayHistorianEndpoint, azureFluidRelayTenantId)}/git/summaries/${encodeURIComponent(commitSha)}`,
			azureFluidRelayAuth,
			"azure-fluid-relay-historian",
			fetchImplementation,
			{ ...requestOptions, expectedStatuses: [200], stage: "summary-download" },
		);

		// Convert the flat Historian summary into Alfred's nested initial-summary payload.
		step = "summary-conversion";
		const convert = async () => {
			const converted = buildCreateRequest(summary, documentId, ignoreLogTail);
			const body = JSON.stringify(converted.request);
			if (Buffer.byteLength(body) > maxBytes)
				throw new CopyError(
					"Create payload exceeds --max-summary-mib",
					undefined,
					"self-host",
					"payload-too-large",
				);
			return { body, ignoredLogTailOperations: converted.ignoredLogTailOperations };
		};
		const { body, ignoredLogTailOperations } = await (metrics
			? metrics.measure("summary-conversion", convert)
			: convert());
		step = "self-host-create";
		const created = await retry(
			async (attempt) => {
				try {
					const response = await requestJson(
						`${selfHostEndpoint.replace(/\/$/, "")}/documents/${encodeURIComponent(selfHostTenantId)}`,
						() => selfHostAuthorization(selfHostTenantId, undefined, selfHostKey),
						"self-host",
						fetchImplementation,
						{
							...requestOptions,
							onAttempt: (event) => onAttempt?.({ ...event, attempt }),
							policy: { ...policy, attempts: 1 },
							method: "POST",
							stage: "destination-create",
							headers: { "Content-Type": "application/json" },
							body,
							expectedStatuses: [201],
						},
					);
					return response;
				} catch (error) {
					error.attempts = attempt;
					const mayHaveCreated =
						error.retryable ||
						["conflict", "invalid-summary"].includes(error.reason) ||
						(error.status >= 200 && error.status < 300) ||
						error.status >= 500;
					if (!mayHaveCreated) throw error;
					let exists;
					try {
						exists = await selfHostDocumentExists(
							selfHostEndpoint,
							selfHostTenantId,
							documentId,
							selfHostKey,
							fetchImplementation,
							requestOptions,
						);
					} catch {
						throw new CopyError(
							"Create outcome could not be reconciled; verify the destination before retrying",
							undefined,
							"self-host",
							"ambiguous-create",
							{ attempts: attempt },
						);
					}
					if (exists)
						throw new CopyError(
							"Destination exists after an uncertain create; its state is NOT verified and it was not overwritten",
							error.status,
							"self-host",
							"ambiguous-create",
							{ attempts: attempt },
						);
					if (error.reason !== "throttled" && error.reason !== "conflict")
						throw new CopyError(
							"Create outcome is uncertain even though the destination is not yet visible; creation was NOT repeated",
							error.status,
							"self-host",
							"ambiguous-create",
							{ attempts: attempt },
						);
					throw error;
				}
			},
			{ ...policy, onRetry: () => metrics?.retry() },
		);
		// Accept both response formats, but require the ID used for safe rerun detection.
		step = "self-host-response-validation";
		const selfHostDocumentId = typeof created === "string" ? created : created?.id;
		if (typeof selfHostDocumentId !== "string" || selfHostDocumentId === "") {
			throw new CopyError(
				"Self-hosted create response is missing the document ID",
				undefined,
				"self-host",
				"ambiguous-create",
			);
		}
		if (selfHostDocumentId !== documentId)
			throw new CopyError(
				"Destination returned a different document ID; verify the deployment and do not repeat creation",
				undefined,
				"self-host",
				"document-id-mismatch",
			);
		return {
			result: "success",
			documentId: selfHostDocumentId,
			...(ignoredLogTailOperations > 0 ? { ignoredLogTailOperations } : {}),
		};
	} catch (error) {
		if (error instanceof CopyError) throw error;
		const endpoint = step.startsWith("self-host")
			? "self-host"
			: step === "azure-fluid-relay-discovery"
				? "azure-fluid-relay-discovery"
				: "azure-fluid-relay-historian";
		throw new CopyError("Document copy failed unexpectedly", undefined, endpoint);
	}
}

async function workers(items, limit, operation) {
	let cursor = 0;
	let fatal;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (!fatal && cursor < items.length) {
				const item = items[cursor++];
				try {
					await operation(item);
				} catch (error) {
					fatal ??= error;
				}
			}
		}),
	);
	if (fatal) throw fatal;
}

/** Copy a reviewed inventory with tenant-scoped keys, bounded workers, and a single results writer. */
export async function copyInventory(
	{ config, inventory, resultsDirectory, options = {} },
	dependencies = {},
) {
	const settings = { ...parseCopyOptions(["--execute"]), ...options };
	const limit = Math.min(
		settings.concurrency,
		Math.floor(settings.memoryBudgetBytes / (2 * settings.maxSummaryBytes)),
	);
	const {
		sourceKey = withAzureFluidRelayTenantKey2,
		destinationKey = withSelfHostTenantKey2,
		fetchImplementation = fetch,
		log = console.log,
		metrics = createMetrics(),
		persist = writeStageResults,
		retryPolicy = {},
	} = dependencies;
	const policy = {
		attempts: settings.attempts,
		timeoutMs: settings.timeoutMs,
		...retryPolicy,
	};
	const withKey = async (stage, acquire, parameters, operation) => {
		const stop = metrics.start(stage);
		try {
			return await acquire(parameters, async (key) => {
				stop();
				return operation(key);
			});
		} finally {
			stop();
		}
	};
	return withResultsLock(resultsDirectory, async () => {
		const { results, work, priorStages } = await prepareRun(
			config,
			inventory,
			settings.failedOnly,
		);
		if (settings.ignoreLogTail === true)
			log(
				"WARNING: --ignore-logtail copies application snapshots without replaying unapplied tail operations. Recent changes may be lost; existing destinations are not overwritten or repaired.",
			);
		let processed = 0;
		let resultsPath;
		const save = async () => {
			results.metrics = metrics.snapshot(processed);
			try {
				resultsPath = await metrics.measure("results-persistence", () =>
					persist(resultsDirectory, "document-copy", results, { priorStages }),
				);
			} catch {
				throw new StageError(
					"Results persistence failed; migration stopped. Review the last durable results and destination state before resuming.",
				);
			}
		};
		const previousFailures = new Map(
			Object.entries(results.tenants).map(([id, tenant]) => [
				id,
				new Map(tenant.failed.map((failure) => [failure.documentId, failure.reason])),
			]),
		);
		// Persist pending work before requests, so an interrupted run can select unfinished documents.
		for (const [id, tenant] of Object.entries(work.tenants)) {
			const outcomes = results.tenants[id];
			for (const documentId of tenant.documents) {
				const priorReason = previousFailures.get(id)?.get(documentId);
				for (const key of ["successful", "warnings", "failed"])
					outcomes[key] = outcomes[key].filter((entry) => entry.documentId !== documentId);
				outcomes.failed.push({
					documentId,
					stage: "document-copy",
					reason: unresolvedCreateReasons.has(priorReason) ? priorReason : "interrupted",
					message: "Document has not completed in this run",
				});
			}
		}
		await save();
		log(
			`Document workers: ${limit} (requested ${settings.concurrency}); payload reservation ${(2 * settings.maxSummaryBytes * limit) / 1024 ** 2} MiB.`,
		);
		for (const [id, tenant] of Object.entries(work.tenants)) {
			const source = config.azureFluidRelayTenants[id];
			const selfHostTenantId = (tenant.selfHostTenantId || id).toLowerCase();
			const outcomes = results.tenants[id];
			const finished = new Set();
			const requestHistory = new Map(tenant.documents.map((documentId) => [documentId, []]));
			const complete = async (documentId, result, error, endpoint) => {
				outcomes.failed = outcomes.failed.filter(
					(failure) => failure.documentId !== documentId,
				);
				let status;
				if (error) {
					const priorReason = previousFailures.get(id)?.get(documentId);
					const failure = {
						...createFailure(documentId, "document-copy", error, { endpoint }),
						message: safeErrorMessage(error),
					};
					status = failure.reason;
					// A later request failure does not reconcile an earlier uncertain create.
					if (unresolvedCreateReasons.has(priorReason)) failure.reason = priorReason;
					outcomes.failed.push(failure);
					log(`Failed ${id}/${documentId}: ${failure.reason}: ${failure.message}`);
				} else if (result.result === "success") {
					recordSuccess(
						results,
						id,
						documentId,
						result.documentId,
						result.ignoredLogTailOperations,
					);
					status = "success";
					if (result.ignoredLogTailOperations > 0)
						log(
							`WARNING: ${id}/${documentId} ignored ${result.ignoredLogTailOperations} unapplied log-tail operation(s); copied snapshot only, so recent changes may be lost.`,
						);
					log(`Copied ${id}/${documentId} as ${result.documentId}.`);
				} else {
					recordWarning(results, id, documentId, result);
					status = "unverified-existing";
					log(`Skipped ${id}/${documentId}: destination data was NOT verified or repaired.`);
				}
				results.history[id] ??= {};
				results.history[id][documentId] ??= [];
				results.history[id][documentId].push({
					completedAt: new Date().toISOString(),
					outcome: status,
					requests: requestHistory.get(documentId),
					...(result?.ignoredLogTailOperations > 0
						? { ignoredLogTailOperations: result.ignoredLogTailOperations }
						: {}),
				});
				requestHistory.delete(documentId);
				finished.add(documentId);
				processed++;
				await save();
				log(`Tenant ${id}: ${finished.size}/${tenant.documents.length} processed.`);
			};
			log(
				`Starting tenant ${id} -> ${selfHostTenantId}: ${tenant.documents.length} document(s).`,
			);
			try {
				await withKey(
					"destination-key",
					destinationKey,
					{
						...config.selfHost,
						selfHostNamespace: config.selfHostNamespace,
						selfHostTenantId,
					},
					async (selfHostKey) => {
						const pending = [];
						await workers(tenant.documents, limit, async (documentId) => {
							let result;
							let failure;
							try {
								const exists = await selfHostDocumentExists(
									config.selfHost.alfredEndpoint,
									selfHostTenantId,
									documentId,
									selfHostKey,
									fetchImplementation,
									{
										policy,
										metrics,
										maxBytes: settings.maxSummaryBytes,
										onAttempt: (event) => requestHistory.get(documentId).push(event),
									},
								);
								const priorReason = previousFailures.get(id)?.get(documentId);
								if (
									unresolvedCreateReasons.has(priorReason) ||
									(priorReason === "interrupted" && exists)
								)
									throw new CopyError(
										"Earlier create outcome is unresolved; creation was NOT repeated. Verify destination state and review a separate inventory before another attempt.",
										undefined,
										"self-host",
										"ambiguous-create",
									);
								if (!exists) {
									pending.push(documentId);
									return;
								}
								result = {
									result: "warning",
									message: "Destination already exists; its data was NOT verified or repaired",
								};
							} catch (error) {
								failure = error;
							}
							await complete(documentId, result, failure, "self-host");
						});
						if (pending.length === 0) return;
						try {
							await withKey("source-key", sourceKey, source, async (azureFluidRelayKey) => {
								await workers(pending, limit, async (documentId) => {
									let result;
									let failure;
									metrics.enter();
									try {
										result = await copyDocument({
											azureFluidRelayEndpoint: source.azureFluidRelayEndpoint,
											azureFluidRelayTenantId: id,
											selfHostEndpoint: config.selfHost.alfredEndpoint,
											selfHostTenantId,
											documentId,
											azureFluidRelayKey,
											selfHostKey,
											ignoreLogTail: settings.ignoreLogTail,
											fetchImplementation,
											policy,
											metrics,
											onAttempt: (event) => requestHistory.get(documentId).push(event),
											maxBytes: settings.maxSummaryBytes,
										});
									} catch (error) {
										failure = error;
									} finally {
										metrics.leave();
									}
									await complete(documentId, result, failure, "self-host");
								});
							});
						} catch (error) {
							if (error.name !== "CredentialError") throw error;
							for (const documentId of pending)
								if (!finished.has(documentId))
									await complete(
										documentId,
										undefined,
										error,
										"azure-fluid-relay-credentials",
									);
						}
					},
				);
			} catch (error) {
				if (error.name !== "CredentialError") throw error;
				for (const documentId of tenant.documents)
					if (!finished.has(documentId))
						await complete(documentId, undefined, error, "self-host-credentials");
			}
			log(
				`Completed tenant ${id} (cumulative outcomes): ${outcomes.successful.length} copied, ${outcomes.warnings.length} unverified existing, ${outcomes.failed.length} failed.`,
			);
		}
		await save();
		const totals = Object.values(results.tenants).reduce(
			(total, tenant) => ({
				copied: total.copied + tenant.successful.length,
				skipped: total.skipped + tenant.warnings.length,
				failed: total.failed + tenant.failed.length,
			}),
			{ copied: 0, skipped: 0, failed: 0 },
		);
		log(
			`Migration cumulative totals: ${totals.copied} copied, ${totals.skipped} unverified existing, ${totals.failed} failed. Wrote ${resultsPath}`,
		);
		return { ...totals, results };
	});
}

export async function main(argv) {
	const options = parseCopyOptions(argv, { command: "copy.mjs" });
	if (!options) return;
	await confirmIgnoreLogTail(options);
	const { config, configDirectory, inventory, warnings } = await loadConfiguration(
		options.configPath,
	);
	await prepareRun(config, inventory, options.failedOnly);
	await verifyDeployment(config);
	for (const warning of warnings) console.warn(`Warning: ${warning}`);
	const outcome = await copyInventory({
		config,
		inventory,
		resultsDirectory: path.resolve(configDirectory, config.resultsDirectory),
		options,
	});
	if (outcome.failed > 0) process.exitCode = 1;
	return outcome;
}

// Run the CLI only when this file is invoked directly, not when tests import its functions.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	// Report a safe classification for failures that occur before per-document error handling.
	try {
		await main(process.argv.slice(2));
	} catch (error) {
		console.error(`Document copy failed: ${safeErrorMessage(error)}`);
		process.exitCode = 1;
	}
}
