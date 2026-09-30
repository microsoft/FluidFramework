/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { NetworkError } from "@fluidframework/server-services-client";
import type { ITenantStorage } from "@fluidframework/server-services-core";
import * as sinon from "sinon";

import { RestGitService } from "../services";
import { TestCache } from "./utils";

const tenantId = "tenant";
const documentId = "document";
const canonicalSha = "0123456789abcdef0123456789abcdef01234567";
const invalidGitShaError = (error: unknown): boolean =>
	error instanceof NetworkError &&
	error.code === 400 &&
	error.message === "Invalid Git object SHA.";
const storage: ITenantStorage = {
	historianUrl: "http://historian",
	internalHistorianUrl: "http://historian",
	url: "http://storage",
	owner: "owner",
	repository: "repository",
	credentials: {
		user: "user",
		password: "password",
	},
};

describe("RestGitService Git object SHA validation", () => {
	const sandbox = sinon.createSandbox();
	let cache: TestCache;
	let service: RestGitService;

	beforeEach(() => {
		cache = new TestCache();
		service = new RestGitService(storage, false, tenantId, documentId, cache);
	});

	afterEach(() => sandbox.restore());

	for (const testCase of [
		{
			name: "blob",
			read: (sha: string) => service.getBlob(tenantId, sha, true),
		},
		{
			name: "commit",
			read: (sha: string) => service.getCommit(sha, true),
		},
		{
			name: "tree",
			read: (sha: string) => service.getTree(sha, false, true),
		},
	]) {
		it(`rejects a cache-key injection through ${testCase.name} before cache access`, async () => {
			const cacheGet = sandbox.spy(cache, "get");

			await assert.rejects(
				testCase.read(`${tenantId}:${documentId}:summary:container`),
				invalidGitShaError,
			);

			sinon.assert.notCalled(cacheGet);
		});
	}

	for (const invalidSha of [
		"0123456789abcdef0123456789abcdef0123456",
		"0123456789abcdef0123456789abcdef012345678",
		"g123456789abcdef0123456789abcdef01234567",
		"0123456789ABCDEF0123456789ABCDEF01234567",
	]) {
		it(`rejects noncanonical SHA ${invalidSha}`, async () => {
			const cacheGet = sandbox.spy(cache, "get");

			await assert.rejects(service.getCommit(invalidSha, true), invalidGitShaError);

			sinon.assert.notCalled(cacheGet);
		});
	}

	it("allows a canonical SHA to reach the cache", async () => {
		const commit = {
			sha: canonicalSha,
			url: "http://storage/commit",
			author: {
				name: "author",
				email: "author@example.com",
				date: "2026-08-07T00:00:00.000Z",
			},
			committer: {
				name: "committer",
				email: "committer@example.com",
				date: "2026-08-07T00:00:00.000Z",
			},
			message: "message",
			tree: {
				sha: canonicalSha,
				url: "http://storage/tree",
			},
			parents: [],
		};
		await cache.set(canonicalSha, commit);
		const cacheGet = sandbox.spy(cache, "get");

		assert.strictEqual(await service.getCommit(canonicalSha, true), commit);

		sinon.assert.calledOnceWithExactly(cacheGet, canonicalSha);
	});
});
