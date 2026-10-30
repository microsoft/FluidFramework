/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { ConfigurationError } from "./configuration.mjs";
import { createResults } from "./results.mjs";

function endpoint(value) {
	let parsed;
	try {
		parsed = new URL(value);
	} catch {
		throw new ConfigurationError([
			"Migration endpoints must be HTTPS URLs without credentials or query strings",
		]);
	}
	if (
		parsed.protocol !== "https:" ||
		parsed.username ||
		parsed.password ||
		parsed.search ||
		parsed.hash
	)
		throw new ConfigurationError([
			"Migration endpoints must be HTTPS URLs without credentials or query strings",
		]);
	return parsed.toString().replace(/\/$/, "");
}

/** Persist only the non-secret identity of each source and destination. */
export function createMapping(config, inventory) {
	return Object.fromEntries(
		Object.entries(inventory.tenants)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([id, tenant]) => {
				const source = config.azureFluidRelayTenants[id];
				return [
					id,
					{
						source: {
							endpoint: endpoint(source.azureFluidRelayEndpoint),
							subscriptionId: source.azureFluidRelaySubscriptionId,
							resourceGroup: source.azureFluidRelayResourceGroup,
							serverName: source.azureFluidRelayServerName,
						},
						destination: {
							tenantId: (tenant.selfHostTenantId || id).toLowerCase(),
							endpoint: endpoint(config.selfHost.alfredEndpoint),
							subscriptionId: config.selfHost.subscriptionId,
							resourceGroup: config.selfHost.resourceGroup,
							aksName: config.selfHost.aksName,
							namespace: config.selfHostNamespace,
						},
					},
				];
			}),
	);
}

export async function prepareRun(config, inventory, failedOnly) {
	for (const [id, tenant] of Object.entries(inventory.tenants)) {
		if (
			["__proto__", "constructor", "prototype"].includes(id) ||
			!Array.isArray(tenant.documents) ||
			tenant.documents.some(
				(documentId) =>
					typeof documentId !== "string" ||
					!documentId ||
					["__proto__", "constructor", "prototype"].includes(documentId),
			) ||
			new Set(tenant.documents).size !== tenant.documents.length
		)
			throw new ConfigurationError([
				"Inventory requires unique, non-empty document IDs and ordinary tenant/document keys",
			]);
	}
	const mapping = createMapping(config, inventory);
	const destinations = new Set();
	for (const [id, tenant] of Object.entries(inventory.tenants)) {
		for (const documentId of tenant.documents) {
			const destination = JSON.stringify([mapping[id].destination.tenantId, documentId]);
			if (destinations.has(destination))
				throw new ConfigurationError([
					"Multiple source documents map to the same destination tenant/document; resolve the mapping before copying",
				]);
			destinations.add(destination);
		}
	}
	if (!failedOnly) {
		const results = { ...createResults(inventory), version: 2, mapping, history: {} };
		return { results, work: inventory };
	}
	let results;
	let previous;
	try {
		previous = JSON.parse(await readFile(failedOnly, "utf8"));
		results = previous.stages?.["document-copy"];
	} catch {
		throw new ConfigurationError([
			"Unable to read --failed-only results; check the reviewed file and its JSON",
		]);
	}
	const record = (value) =>
		value !== null && typeof value === "object" && !Array.isArray(value);
	if (
		results?.version !== 2 ||
		!record(results.mapping) ||
		!record(results.tenants) ||
		!record(results.history) ||
		!Object.keys(results.tenants).length
	)
		throw new ConfigurationError([
			"Failed-only resume requires version 2 document-copy results with source/destination mappings; legacy outcomes cannot establish a safe mapping",
		]);
	const tenants = {};
	for (const [id, prior] of Object.entries(results.tenants)) {
		if (!record(prior))
			throw new ConfigurationError(["Resume results have an invalid tenant record"]);
		if (
			!Object.hasOwn(mapping, id) ||
			!record(results.mapping[id]) ||
			!isDeepStrictEqual(results.mapping[id], mapping[id])
		)
			throw new ConfigurationError([
				"Resume source/destination mapping differs from the current configuration; no documents were copied",
			]);
		if (
			!Array.isArray(prior.failed) ||
			!Array.isArray(prior.successful) ||
			!Array.isArray(prior.warnings)
		)
			throw new ConfigurationError(["Resume results have invalid outcome collections"]);
		const all = [...prior.failed, ...prior.successful, ...prior.warnings].map(
			(entry) => entry?.documentId,
		);
		if (
			all.some((id) => typeof id !== "string") ||
			new Set(all).size !== all.length ||
			(results.history[id] !== undefined && !record(results.history[id])) ||
			Object.values(results.history[id] ?? {}).some((attempts) => !Array.isArray(attempts))
		)
			throw new ConfigurationError([
				"Resume results have duplicate outcomes or invalid attempt history",
			]);
		const documents = prior.failed.map((failure) => failure?.documentId);
		if (
			documents.some(
				(documentId) =>
					typeof documentId !== "string" ||
					!inventory.tenants[id]?.documents.includes(documentId),
			) ||
			new Set(documents).size !== documents.length
		)
			throw new ConfigurationError([
				"Every failed document must occur once in the current reviewed inventory",
			]);
		if (documents.length) tenants[id] = { ...inventory.tenants[id], documents };
	}
	return { results, work: { ...inventory, tenants }, priorStages: previous.stages };
}
