/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

export function summary(value = 7) {
	return {
		trees: [
			{
				entries: [
					{ path: ".app", type: "tree" },
					{ path: ".app/counter", type: "blob", id: "counter" },
					{ path: ".protocol/attributes", type: "blob", id: "attributes" },
					{ path: ".protocol/quorumValues", type: "blob", id: "values" },
				],
			},
		],
		blobs: [
			{ id: "counter", content: JSON.stringify({ value }), encoding: "utf-8" },
			{ id: "attributes", content: '{"sequenceNumber":5}', encoding: "utf-8" },
			{ id: "values", content: "[]", encoding: "utf-8" },
		],
	};
}

/** Controlled in-memory service fixture; it never contacts Azure or persists credentials. */
export function fixture({ tenants = 1, documents = 4, latencyMs = 0, keyLatencyMs = 0 } = {}) {
	const config = {
		selfHost: {
			alfredEndpoint: "https://alfred.example",
			subscriptionId: "destination-sub",
			resourceGroup: "destination-group",
			aksName: "aks",
		},
		selfHostNamespace: "default",
		azureFluidRelayTenants: {},
	};
	const inventory = { errors: [], tenants: {} };
	for (let index = 1; index <= tenants; index++) {
		const id = `source-${index}`;
		config.azureFluidRelayTenants[id] = {
			azureFluidRelayEndpoint: "https://discovery.example",
			azureFluidRelaySubscriptionId: "source-sub",
			azureFluidRelayResourceGroup: "source-group",
			azureFluidRelayServerName: id,
		};
		inventory.tenants[id] = {
			selfHostTenantId: `destination-${index}`,
			documents: Array.from({ length: documents }, (_, doc) => `doc-${index}-${doc}`),
		};
	}
	const state = {
		config,
		inventory,
		events: [],
		created: new Map(),
		acquired: [],
		released: [],
		activeKeys: new Set(),
	};
	const key = (tenant) => `fixture-key-${tenant}`;
	const withKey = (kind, getTenant) => async (parameters, operation) => {
		const tenant = getTenant(parameters);
		state.acquired.push(`${kind}:${tenant}`);
		await delay(keyLatencyMs);
		state.activeKeys.add(tenant);
		try {
			return await operation(key(tenant));
		} finally {
			state.activeKeys.delete(tenant);
			state.released.push(`${kind}:${tenant}`);
		}
	};
	state.dependencies = {
		sourceKey: withKey("source", (parameters) => parameters.azureFluidRelayServerName),
		destinationKey: withKey("destination", (parameters) => parameters.selfHostTenantId),
		log: () => {},
		retryPolicy: { sleep: async () => {}, random: () => 0.5 },
		fetchImplementation: async (url, options) => {
			await delay(latencyMs);
			let token = options.headers.Authorization.slice("Basic ".length);
			if (!token.startsWith("ey"))
				token = Buffer.from(token, "base64").toString().split(":").at(-1);
			const [header, payload, signature] = token.split(".");
			const claims = JSON.parse(Buffer.from(payload, "base64url"));
			assert.equal(
				createHmac("sha256", key(claims.tenantId))
					.update(`${header}.${payload}`)
					.digest("base64url"),
				signature,
			);
			const parts = new URL(url).pathname.split("/").map(decodeURIComponent);
			state.events.push({ url, method: options.method ?? "GET", claims });
			if (parts.includes("session"))
				return Response.json({ historianUrl: `https://historian-${claims.tenantId}.example` });
			if (parts.includes("refs")) return Response.json({ object: { sha: claims.documentId } });
			if (parts.includes("summaries")) return Response.json(summary());
			if (options.method === "POST") {
				assert.equal(claims.documentId ?? "", "");
				const body = JSON.parse(options.body);
				const id = `${claims.tenantId}/${body.id}`;
				assert.equal(state.created.has(id), false, "A document must never be created twice");
				state.created.set(id, body);
				return Response.json({ id: body.id }, { status: 201 });
			}
			return Response.json(
				{},
				{ status: state.created.has(`${parts[2]}/${parts[3]}`) ? 200 : 404 },
			);
		},
	};
	return state;
}
