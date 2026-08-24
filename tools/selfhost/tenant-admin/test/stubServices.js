/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// In-process stubs for riddler and gitrest, used by the unit tests.
//
// Both services are served from one HTTP server so that a single ordered call log can be
// asserted against -- the storage-before-tenant-record ordering is the main invariant this
// package has to preserve, and it is only observable as a sequence.

"use strict";

const http = require("node:http");
const { randomBytes } = require("node:crypto");

/**
 * Start a stub server implementing the subset of riddler + gitrest that tenant-admin uses.
 * @param {object} [options]
 * @param {Map<string, object>} [options.tenants] pre-existing tenants, keyed by id
 * @param {Set<string>} [options.repositories] pre-existing "owner/repo" strings
 * @param {(req: {method: string, path: string}) => ({status: number, body: string} | undefined)} [options.fail]
 *   hook to force a failure response for a matching request
 */
async function startStubServices(options = {}) {
	const tenants = options.tenants ?? new Map();
	const repositories = options.repositories ?? new Set();
	const calls = [];

	const server = http.createServer((req, res) => {
		let raw = "";
		req.on("data", (c) => {
			raw += c;
		});
		req.on("end", () => {
			const url = new URL(req.url, "http://stub");
			const path = url.pathname;
			const body = raw === "" ? undefined : JSON.parse(raw);
			calls.push({
				method: req.method,
				path,
				body,
				correlationId: req.headers["x-correlation-id"],
			});

			const forced = options.fail?.({ method: req.method, path });
			if (forced) {
				res.writeHead(forced.status, { "Content-Type": "application/json" });
				res.end(forced.body);
				return;
			}

			const send = (status, payload) => {
				res.writeHead(status, { "Content-Type": "application/json" });
				res.end(payload === undefined ? "" : JSON.stringify(payload));
			};

			// ---- gitrest ----------------------------------------------------------------
			// GET /repos/:owner/:repo
			let m = /^\/repos\/([^/]+)\/([^/]+)$/.exec(path);
			if (m && req.method === "GET") {
				return repositories.has(`${m[1]}/${m[2]}`)
					? send(200, { name: m[2] })
					: send(400, { error: "repo does not exist" });
			}
			// POST /:owner/repos
			m = /^\/([^/]+)\/repos$/.exec(path);
			if (m && req.method === "POST" && !path.startsWith("/api/")) {
				repositories.add(`${m[1]}/${body.name}`);
				return send(201, { name: body.name });
			}

			// ---- riddler ----------------------------------------------------------------
			// GET /api/tenants
			if (path === "/api/tenants" && req.method === "GET") {
				const includeDisabled = url.searchParams.get("includeDisabledTenant") === "true";
				return send(
					200,
					[...tenants.values()]
						.filter((t) => includeDisabled || !t.disabled)
						.map(toTenantConfig),
				);
			}
			// POST /api/tenants/:id
			m = /^\/api\/tenants\/([^/]+)$/.exec(path);
			if (m && req.method === "POST") {
				const id = decodeURIComponent(m[1]);
				if (tenants.has(id)) {
					return send(500, {
						error: `E11000 duplicate key error collection: admin.tenants _id: "${id}"`,
					});
				}
				const key = randomBytes(16).toString("hex");
				const secondaryKey = randomBytes(16).toString("hex");
				tenants.set(id, {
					_id: id,
					key,
					secondaryKey,
					storage: body.storage,
					orderer: body.orderer,
					customData: { ...body.customData, encryptionKeyVersion: "2022" },
					disabled: false,
				});
				return send(200, {
					...toTenantConfig(tenants.get(id)),
					key,
					secondaryKey,
				});
			}
			// GET /api/tenants/:id
			// Mirrors riddler's getTenantDocument: a disabled (soft-deleted) tenant is hidden
			// unless includeDisabledTenant=true, and a miss is a 500 with "Could not find
			// tenant", not a 404.
			if (m && req.method === "GET") {
				const id = decodeURIComponent(m[1]);
				const includeDisabled =
					url.searchParams.get("includeDisabledTenant") === "true";
				const tenant = tenants.get(id);
				const visible = tenant && (includeDisabled || !tenant.disabled);
				return visible
					? send(200, toTenantConfig(tenant))
					: send(500, { error: `Could not find tenant: ${id}` });
			}
			// DELETE /api/tenants/:id
			if (m && req.method === "DELETE") {
				const id = decodeURIComponent(m[1]);
				const scheduled = body?.scheduledDeletionTime
					? new Date(body.scheduledDeletionTime)
					: undefined;
				const soft = !scheduled || scheduled.getTime() > Date.now();
				if (soft) {
					tenants.get(id).disabled = true;
					tenants.get(id).scheduledDeletionTime = body?.scheduledDeletionTime;
				} else {
					tenants.delete(id);
				}
				return send(200, {});
			}
			// GET /api/tenants/:id/keys
			m = /^\/api\/tenants\/([^/]+)\/keys$/.exec(path);
			if (m && req.method === "GET") {
				const tenant = tenants.get(decodeURIComponent(m[1]));
				return tenant
					? send(200, { key1: tenant.key, key2: tenant.secondaryKey })
					: send(500, { error: "Could not find tenant" });
			}
			// PUT /api/tenants/:id/key
			m = /^\/api\/tenants\/([^/]+)\/key$/.exec(path);
			if (m && req.method === "PUT") {
				const tenant = tenants.get(decodeURIComponent(m[1]));
				const fresh = randomBytes(16).toString("hex");
				if (body.keyName === "key2") {
					tenant.secondaryKey = fresh;
				} else {
					tenant.key = fresh;
				}
				return send(200, { key1: tenant.key, key2: tenant.secondaryKey });
			}
			// PUT /api/tenants/:id/customData
			m = /^\/api\/tenants\/([^/]+)\/customData$/.exec(path);
			if (m && req.method === "PUT") {
				const tenant = tenants.get(decodeURIComponent(m[1]));
				tenant.customData = body;
				return send(200, body);
			}

			send(404, { error: "not found" });
		});
	});

	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address();

	return {
		baseUrl: `http://127.0.0.1:${port}`,
		calls,
		tenants,
		repositories,
		async close() {
			await new Promise((resolve) => server.close(resolve));
		},
	};
}

function toTenantConfig(tenant) {
	return {
		id: tenant._id,
		storage: tenant.storage,
		orderer: tenant.orderer,
		customData: tenant.customData,
		disabled: tenant.disabled,
		scheduledDeletionTime: tenant.scheduledDeletionTime,
	};
}

module.exports = { startStubServices };
