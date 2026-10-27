/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { BasicRestWrapper, NetworkError } from "@fluidframework/server-services-client";
import type { ITenantStorage } from "@fluidframework/server-services-core";
import * as sinon from "sinon";

import { type IDocumentAccessProof, RestGitService } from "../services";
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

	describe("ref SHA validation", () => {
		for (const testCase of [
			{
				name: "create",
				method: "post",
				write: (sha: string) => service.createRef({ ref: "refs/heads/main", sha }),
			},
			{
				name: "update",
				method: "patch",
				write: (sha: string) => service.updateRef("heads/main", { sha, force: true }),
			},
		] as const) {
			for (const sha of [
				"refs/heads/main",
				"../heads/main",
				"",
				canonicalSha.slice(1),
				`${canonicalSha}0`,
				canonicalSha.toUpperCase(),
				`g${canonicalSha.slice(1)}`,
				`${canonicalSha}\n`,
			]) {
				it(`rejects ${testCase.name} with noncanonical SHA ${JSON.stringify(
					sha,
				)} before forwarding`, async () => {
					const downstream = sandbox
						.stub(BasicRestWrapper.prototype, testCase.method)
						.resolves();

					await assert.rejects(testCase.write(sha), invalidGitShaError);

					sinon.assert.notCalled(downstream);
				});
			}

			it(`forwards ${testCase.name} with a canonical SHA`, async () => {
				const ref = {
					ref: "refs/heads/main",
					url: "http://storage/ref",
					object: { sha: canonicalSha, type: "", url: "" },
				};
				const downstream = sandbox
					.stub(BasicRestWrapper.prototype, testCase.method)
					.resolves(ref);

				assert.strictEqual(await testCase.write(canonicalSha), ref);

				const expectedPath =
					testCase.method === "post"
						? "/repos/owner/repository/git/refs"
						: "/repos/owner/repository/git/refs/heads/main";
				sinon.assert.calledOnce(downstream);
				assert.strictEqual(downstream.firstCall.args[0], expectedPath);
				assert.deepStrictEqual(
					downstream.firstCall.args[1],
					testCase.method === "post"
						? { ref: "refs/heads/main", sha: canonicalSha, config: { enabled: false } }
						: { sha: canonicalSha, force: true, config: { enabled: false } },
				);
			});
		}
	});

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

	it("sends the authorized physical root to GitRest", async () => {
		let capturedHeaders: Record<string, string | string[] | undefined> = {};
		const server = createServer((request, response) => {
			capturedHeaders = request.headers;
			response.writeHead(200, { "Content-Type": "application/json" });
			response.end(JSON.stringify({ id: canonicalSha, trees: [], blobs: [] }));
		});
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(0, "127.0.0.1", resolve);
		});
		const address = server.address() as AddressInfo;
		const proof: IDocumentAccessProof = {
			tenantId,
			documentId,
			operation: "read",
			source: "dc-v2-metadata",
			storageAccountName: "document-storage",
			physicalContainerName: "pd2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			layoutVersion: "v2",
			lifecycleVersion: "generation-1",
			state: "active",
		};
		const routedStorage = {
			...storage,
			url: `http://127.0.0.1:${address.port}`,
			credentials: undefined,
		};

		try {
			const routedService = new RestGitService(
				routedStorage,
				false,
				tenantId,
				documentId,
				undefined,
				proof.storageAccountName,
				undefined,
				false,
				undefined,
				undefined,
				proof,
			);

			await routedService.getSummary("latest", false);
		} finally {
			await new Promise<void>((resolve, reject) => {
				server.close((error) => (error === undefined ? resolve() : reject(error)));
			});
		}

		assert.strictEqual(
			capturedHeaders["fluid-document-container-name"],
			proof.physicalContainerName,
		);
		assert.strictEqual(capturedHeaders["fluid-document-storage-layout"], proof.layoutVersion);
		assert.strictEqual(
			capturedHeaders["fluid-document-lifecycle-version"],
			proof.lifecycleVersion,
		);
	});
});
