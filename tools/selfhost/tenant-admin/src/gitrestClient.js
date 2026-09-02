/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Thin client for gitrest's repository API -- the snapshot storage backing a tenant.
//
// Riddler's tenant-creation API does NOT provision storage. Only riddler's own bootstrap path
// (runnerFactory, for tenants listed in the Helm `riddler.tenants` values) calls
// getOrCreateRepository. A tenant created through `POST /api/tenants/:id` therefore has a
// storage config pointing at a repository that does not exist yet, and document operations fail
// with "Repo does not exist" until it is created.
//
// gitrest exposes no delete-repository route (verified: only `POST /:owner/repos` and the git
// read routes exist), so removing a repository is a manual operation on the snapshot volume.

"use strict";

const { requestOk, request } = require("./httpClient");

const DEFAULT_GITREST_URL = "http://gitrest";
// Matches the owner already used by the stack's built-in "fluid" tenant, so every tenant lives
// under one owner with repository == tenantId.
const DEFAULT_STORAGE_OWNER = "fluid";

class GitrestClient {
	constructor({
		baseUrl = DEFAULT_GITREST_URL,
		owner = DEFAULT_STORAGE_OWNER,
		timeoutMs,
		correlationId,
	} = {}) {
		this.baseUrl = baseUrl.replace(/\/+$/, "");
		this.owner = owner;
		this.timeoutMs = timeoutMs;
		this.correlationId = correlationId;
	}

	/**
	 * @returns {Promise<boolean>} true when the repository already exists
	 */
	async repositoryExists(repository) {
		const res = await request({
			baseUrl: this.baseUrl,
			timeoutMs: this.timeoutMs,
			correlationId: this.correlationId,
			method: "GET",
			path: `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(repository)}`,
		});
		return res.status >= 200 && res.status < 300;
	}

	/**
	 * Create the repository if it is not already present. Idempotent, so a retried tenant
	 * creation reuses the repository instead of failing.
	 */
	async ensureRepository(repository) {
		if (await this.repositoryExists(repository)) {
			return { created: false, owner: this.owner, repository };
		}
		await requestOk({
			baseUrl: this.baseUrl,
			timeoutMs: this.timeoutMs,
			correlationId: this.correlationId,
			method: "POST",
			path: `/${encodeURIComponent(this.owner)}/repos`,
			body: { name: repository },
		});
		return { created: true, owner: this.owner, repository };
	}
}

module.exports = {
	GitrestClient,
	DEFAULT_GITREST_URL,
	DEFAULT_STORAGE_OWNER,
};
