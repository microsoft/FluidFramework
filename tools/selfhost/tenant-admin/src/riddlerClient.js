/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Thin client for riddler's tenant-management REST API.
//
// IMPORTANT -- riddler has no authentication of any kind. Every route below is reachable by any
// caller that can open a TCP connection to the riddler Service, and `GET /api/tenants/:id/keys`
// returns tenant keys in the clear. This is a property of upstream Routerlicious. The mitigation
// here is that riddler stays a ClusterIP with no Ingress and this CLI runs inside the cluster;
// an authenticated service in front of riddler is the alternative. Do NOT expose riddler.
//
// Route shapes verified against @fluidframework/server-routerlicious-base
// (dist/riddler/api.js) for the revision this stack is built from.

"use strict";

const { requestOk, request } = require("./httpClient");

const DEFAULT_RIDDLER_URL = "http://fluid-riddler";

class RiddlerClient {
	/**
	 * @param {object} options
	 * @param {string} [options.baseUrl] riddler base URL
	 * @param {number} [options.timeoutMs]
	 * @param {string} [options.correlationId]
	 */
	constructor({ baseUrl = DEFAULT_RIDDLER_URL, timeoutMs, correlationId } = {}) {
		this.baseUrl = baseUrl.replace(/\/+$/, "");
		this.timeoutMs = timeoutMs;
		this.correlationId = correlationId;
	}

	#common(extra) {
		return {
			baseUrl: this.baseUrl,
			timeoutMs: this.timeoutMs,
			correlationId: this.correlationId,
			...extra,
		};
	}

	/**
	 * Create a tenant. Riddler generates key1/key2 itself -- a caller-supplied key is NOT
	 * supported by the API -- and returns them in the response.
	 * @returns {Promise<object>} tenant config plus { key, secondaryKey }
	 */
	async createTenant(tenantId, { storage, orderer, customData }) {
		const res = await requestOk(
			this.#common({
				method: "POST",
				path: `/api/tenants/${encodeURIComponent(tenantId)}`,
				body: {
					storage,
					// riddler stores `orderer` verbatim; the self-host's existing "fluid" tenant
					// has no orderer field and works, so it is only sent when explicitly supplied.
					...(orderer ? { orderer } : {}),
					customData,
					enableSharedKeyAccess: true,
					enablePrivateKeyAccess: false,
				},
				describeError: (status, _json, raw) =>
					isDuplicateKeyError(raw)
						? `Tenant "${tenantId}" already exists. Choose a different tenant id.`
						: undefined,
			}),
		);
		return res.json;
	}

	/**
	 * Fetch a tenant's config. Returns undefined when the tenant does not exist.
	 *
	 * Riddler HIDES soft-deleted (disabled) tenants unless includeDisabled is set -- its
	 * getTenantDocument returns undefined for `found.disabled && !includeDisabledTenant`. Any
	 * caller that needs to act on a soft-deleted tenant (purging it, or explaining why its id is
	 * unavailable) must pass includeDisabled, or the tenant looks absent while its document and
	 * its unique _id are still very much present.
	 */
	async tryGetTenant(tenantId, { includeDisabled = false } = {}) {
		const res = await request(
			this.#common({
				method: "GET",
				path: `/api/tenants/${encodeURIComponent(tenantId)}${
					includeDisabled ? "?includeDisabledTenant=true" : ""
				}`,
			}),
		);
		if (res.status === 404) {
			return undefined;
		}
		if (res.status < 200 || res.status >= 300) {
			// Riddler answers a missing tenant with a 500 carrying "Could not find tenant"
			// rather than a 404, so treat that as "absent" too.
			if (/could not find tenant|tenant is disabled/i.test(res.body)) {
				return undefined;
			}
			throw new Error(
				`GET /api/tenants/${tenantId} returned HTTP ${res.status}: ${res.body}`,
			);
		}
		return res.json;
	}

	async getTenant(tenantId, { includeDisabled = false } = {}) {
		const tenant = await this.tryGetTenant(tenantId, { includeDisabled });
		if (!tenant) {
			throw new Error(`Tenant "${tenantId}" not found.`);
		}
		return tenant;
	}

	async listTenants({ includeDisabled = false } = {}) {
		const res = await requestOk(
			this.#common({
				method: "GET",
				path: `/api/tenants${includeDisabled ? "?includeDisabledTenant=true" : ""}`,
			}),
		);
		return res.json ?? [];
	}

	/**
	 * Fetch a tenant's shared keys. PRIVILEGED -- returns plaintext signing keys.
	 * @returns {Promise<{key1: string, key2: string}>}
	 */
	async getTenantKeys(tenantId) {
		const res = await requestOk(
			this.#common({
				method: "GET",
				path: `/api/tenants/${encodeURIComponent(tenantId)}/keys`,
			}),
		);
		return res.json;
	}

	/**
	 * Rotate one of the two shared keys. PRIVILEGED.
	 * Rotating a single key at a time is what makes zero-downtime rotation possible: clients
	 * signing with the other key keep working while consumers move over.
	 * @param {"key1"|"key2"} keyName
	 */
	async rotateTenantKey(tenantId, keyName) {
		const res = await requestOk(
			this.#common({
				method: "PUT",
				path: `/api/tenants/${encodeURIComponent(tenantId)}/key`,
				body: { keyName },
			}),
		);
		return res.json;
	}

	/**
	 * Replace a tenant's customData. Riddler's PUT replaces the whole object, so callers must
	 * read-modify-write (see TenantManager#alterCustomData).
	 */
	async updateCustomData(tenantId, customData) {
		const res = await requestOk(
			this.#common({
				method: "PUT",
				path: `/api/tenants/${encodeURIComponent(tenantId)}/customData`,
				body: customData,
			}),
		);
		return res.json;
	}

	/**
	 * Delete a tenant.
	 * With no scheduledDeletionTime (or one in the future) riddler performs a SOFT delete: the
	 * document is kept and flagged `disabled: true`. Only a scheduledDeletionTime in the past
	 * removes the document outright. Either way the tenant's cached keys are invalidated.
	 * @param {Date} [scheduledDeletionTime]
	 */
	async deleteTenant(tenantId, scheduledDeletionTime) {
		await requestOk(
			this.#common({
				method: "DELETE",
				path: `/api/tenants/${encodeURIComponent(tenantId)}`,
				body: {
					scheduledDeletionTime: scheduledDeletionTime?.toISOString(),
				},
			}),
		);
	}
}

/**
 * Mongo surfaces a unique-index violation as error code 11000 ("E11000 duplicate key error").
 * Riddler passes the driver error through, so match on the wire text.
 */
function isDuplicateKeyError(rawBody) {
	return (
		typeof rawBody === "string" &&
		(rawBody.includes("E11000") || /duplicate key/i.test(rawBody))
	);
}

module.exports = { RiddlerClient, DEFAULT_RIDDLER_URL, isDuplicateKeyError };
