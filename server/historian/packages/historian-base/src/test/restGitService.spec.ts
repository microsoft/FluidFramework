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
		const cacheKey = `ownership-v2:tenant:document:durable:::::${canonicalSha}`;
		await cache.set(cacheKey, commit);
		const cacheGet = sandbox.spy(cache, "get");

		assert.strictEqual(await service.getCommit(canonicalSha, true), commit);

		sinon.assert.calledOnceWithExactly(cacheGet, cacheKey);
	});

	describe("RestGitService content-cache isolation", () => {
		const sandbox = sinon.createSandbox();
		const commit = {
			sha: canonicalSha,
			url: "http://storage/commit",
			author: {
				name: "author",
				email: "author@example.com",
				date: "2026-08-07T00:00:00.000Z",
			},
			committer: {
				name: "author",
				email: "author@example.com",
				date: "2026-08-07T00:00:00.000Z",
			},
			message: "message",
			tree: { sha: canonicalSha, url: "http://storage/tree" },
			parents: [],
		};

		afterEach(() => sandbox.restore());

		for (const resource of [
			{
				name: "commit",
				value: commit,
				read: async (service: RestGitService) => service.getCommit(canonicalSha, true),
			},
			{
				name: "blob",
				value: {
					sha: canonicalSha,
					url: "http://storage/blob",
					content: "aGVsbG8=",
					encoding: "base64",
					size: 5,
				},
				read: async (service: RestGitService) =>
					service.getBlob(tenantId, canonicalSha, true),
			},
			{
				name: "tree",
				value: { sha: canonicalSha, url: "http://storage/tree", tree: [] },
				read: async (service: RestGitService) => service.getTree(canonicalSha, false, true),
			},
		]) {
			for (const scope of [
				{ name: "tenant", tenant: "other-tenant", document: documentId },
				{ name: "document", tenant: tenantId, document: "other-document" },
				{ name: "container type", tenant: tenantId, document: documentId, ephemeral: true },
				{
					name: "storage account",
					tenant: tenantId,
					document: documentId,
					storage: "other",
				},
			]) {
				it(`isolates cached ${resource.name}s by ${scope.name} without an access proof`, async () => {
					const cache = new TestCache();
					const first = new RestGitService(storage, false, tenantId, documentId, cache);
					const second = new RestGitService(
						storage,
						false,
						scope.tenant,
						scope.document,
						cache,
						scope.storage,
						undefined,
						scope.ephemeral,
					);
					const notFound = new NetworkError(
						404,
						"Object not found in this document.",
						false,
					);
					const downstream = sandbox.stub(BasicRestWrapper.prototype, "get");
					downstream.onFirstCall().resolves(resource.value);
					downstream.onSecondCall().rejects(notFound);

					assert.strictEqual(await resource.read(first), resource.value);
					assert.strictEqual(await resource.read(first), resource.value);
					sinon.assert.calledOnce(downstream);
					await assert.rejects(
						resource.read(second),
						(error: unknown) => error === notFound,
					);
					sinon.assert.calledTwice(downstream);
				});
			}
		}

		it("ignores an old raw cache entry without an access proof", async () => {
			const cache = new TestCache();
			await cache.set(canonicalSha, commit);
			const service = new RestGitService(storage, false, tenantId, documentId, cache);
			const notFound = new NetworkError(404, "Document not found.", false);
			const downstream = sandbox.stub(BasicRestWrapper.prototype, "get").rejects(notFound);
			const cacheSet = sandbox.spy(cache, "set");

			await assert.rejects(
				service.getCommit(canonicalSha, true),
				(error: unknown) => error === notFound,
			);

			sinon.assert.calledOnce(downstream);
			sinon.assert.notCalled(cacheSet);
		});

		it("serves a warm cache read with one cache get and no downstream call", async () => {
			const cache = new TestCache();
			const service = new RestGitService(storage, false, tenantId, documentId, cache);
			const downstream = sandbox.stub(BasicRestWrapper.prototype, "get").resolves(commit);
			await service.getCommit(canonicalSha, true);
			downstream.resetHistory();
			const cacheGet = sandbox.spy(cache, "get");

			assert.strictEqual(await service.getCommit(canonicalSha, true), commit);

			sinon.assert.calledOnce(cacheGet);
			sinon.assert.notCalled(downstream);
		});

		it("uses the same isolated namespace for background blob fills", async () => {
			const cache = new TestCache();
			const service = new RestGitService(storage, false, tenantId, documentId, cache);
			const blob = {
				sha: canonicalSha,
				url: "http://storage/blob",
				content: "aGVsbG8=",
				encoding: "base64",
				size: 5,
			};
			sandbox
				.stub(BasicRestWrapper.prototype, "post")
				.resolves({ sha: canonicalSha, url: blob.url });
			const downstream = sandbox.stub(BasicRestWrapper.prototype, "get").resolves(blob);

			await service.createBlob({ content: blob.content, encoding: "base64" });
			await new Promise<void>((resolve) => setImmediate(resolve));
			sinon.assert.calledOnce(downstream);
			downstream.resetHistory();

			assert.strictEqual(await service.getBlob(tenantId, canonicalSha, true), blob);
			assert.strictEqual(await cache.get(`${tenantId}:${canonicalSha}`), undefined);
			sinon.assert.notCalled(downstream);
		});

		for (const ephemeral of [false, true]) {
			it(`keeps summary body, latest SHA and invalidation scoped for ephemeral=${ephemeral}`, async () => {
				const cache = new TestCache();
				const service = new RestGitService(
					storage,
					false,
					tenantId,
					documentId,
					cache,
					undefined,
					undefined,
					ephemeral,
				);
				const other = new RestGitService(
					storage,
					false,
					tenantId,
					documentId,
					cache,
					undefined,
					undefined,
					!ephemeral,
				);
				const summary = { id: canonicalSha, trees: [], blobs: [] };
				const otherSummary = { id: "other-summary", trees: [], blobs: [] };
				sandbox.stub(BasicRestWrapper.prototype, "post").resolves(summary);
				const downstream = sandbox
					.stub(BasicRestWrapper.prototype, "get")
					.resolves(otherSummary);
				sandbox.stub(BasicRestWrapper.prototype, "delete").resolves(true);

				await service.createSummary(
					{ type: "container", message: "summary", sequenceNumber: 0, entries: [] },
					true,
				);
				assert.strictEqual(await service.getSummary("latest", false), summary);
				assert.strictEqual(await service.getSummary(canonicalSha, false), summary);
				sinon.assert.notCalled(downstream);
				assert.strictEqual(await other.getSummary("latest", false), otherSummary);

				assert.strictEqual(await service.deleteSummary(false), true);
				assert.strictEqual(await other.getSummary("latest", false), otherSummary);
				sinon.assert.calledOnce(downstream);
				const notFound = new NetworkError(404, "Summary not found.", false);
				downstream.rejects(notFound);
				await assert.rejects(
					service.getSummary("latest", false),
					(error: unknown) => error === notFound,
				);
				sinon.assert.calledTwice(downstream);
			});
		}
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
			containerType: "durable",
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

	it("namespaces cached summaries by authorized storage identity", async () => {
		const requestedStorageIdentities: string[] = [];
		const server = createServer((request, response) => {
			const physicalContainerName = String(request.headers["fluid-document-container-name"]);
			const lifecycleVersion = String(request.headers["fluid-document-lifecycle-version"]);
			const storageIdentity = `${physicalContainerName}:${lifecycleVersion}`;
			requestedStorageIdentities.push(storageIdentity);
			response.writeHead(200, { "Content-Type": "application/json" });
			response.end(JSON.stringify({ id: storageIdentity, trees: [], blobs: [] }));
		});
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(0, "127.0.0.1", resolve);
		});
		const address = server.address() as AddressInfo;
		const routedStorage = {
			...storage,
			url: `http://127.0.0.1:${address.port}`,
			credentials: undefined,
		};
		const createProof = (
			physicalContainerName: string,
			lifecycleVersion: string,
		): IDocumentAccessProof => ({
			tenantId,
			documentId,
			operation: "read",
			source: "dc-v2-metadata",
			containerType: "durable",
			storageAccountName: "document-storage",
			physicalContainerName,
			layoutVersion: "v2",
			lifecycleVersion,
			state: "active",
		});
		const createService = (proof: IDocumentAccessProof): RestGitService =>
			new RestGitService(
				routedStorage,
				false,
				tenantId,
				documentId,
				cache,
				proof.storageAccountName,
				undefined,
				false,
				undefined,
				undefined,
				proof,
			);
		const container1 = "pd2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		const container2 = "pd2-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
		const generation1 = createService(createProof(container1, "generation-1"));
		const generation2 = createService(createProof(container1, "generation-2"));
		const differentRoot = createService(createProof(container2, "generation-2"));

		try {
			assert.strictEqual(
				(await generation1.getSummary("latest", false)).id,
				`${container1}:generation-1`,
			);
			assert.strictEqual(
				(await generation2.getSummary("latest", false)).id,
				`${container1}:generation-2`,
			);
			assert.strictEqual(
				(await differentRoot.getSummary("latest", false)).id,
				`${container2}:generation-2`,
			);
			assert.strictEqual(
				(await generation1.getSummary("latest", false)).id,
				`${container1}:generation-1`,
			);
		} finally {
			await new Promise<void>((resolve, reject) => {
				server.close((error) => (error === undefined ? resolve() : reject(error)));
			});
		}

		assert.deepStrictEqual(requestedStorageIdentities, [
			`${container1}:generation-1`,
			`${container1}:generation-2`,
			`${container2}:generation-2`,
		]);
	});

	for (const testCase of [
		{
			name: "document",
			targetDocumentId: "other-document",
			targetPhysicalContainer: "pd2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			targetLifecycleVersion: "generation-1",
		},
		{
			name: "physical container",
			targetDocumentId: documentId,
			targetPhysicalContainer: "pd2-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			targetLifecycleVersion: "generation-1",
		},
		{
			name: "lifecycle generation",
			targetDocumentId: documentId,
			targetPhysicalContainer: "pd2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			targetLifecycleVersion: "generation-2",
		},
	] as const) {
		it(`does not reuse cached Git objects across an authorized ${testCase.name}`, async () => {
			const cachedCommit = {
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
				message: "source document commit",
				tree: {
					sha: canonicalSha,
					url: "http://storage/tree",
				},
				parents: [],
			};
			const notFound = new NetworkError(404, "Commit does not exist in authorized root.");
			const downstream = sandbox
				.stub(BasicRestWrapper.prototype, "get")
				.onFirstCall()
				.resolves(cachedCommit)
				.onSecondCall()
				.rejects(notFound);
			const sourceProof: IDocumentAccessProof = {
				tenantId,
				documentId,
				operation: "read",
				source: "dc-v2-metadata",
				containerType: "durable",
				storageAccountName: "document-storage",
				physicalContainerName: "pd2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				layoutVersion: "v2",
				lifecycleVersion: "generation-1",
				state: "active",
			};
			const targetProof: IDocumentAccessProof = {
				...sourceProof,
				documentId: testCase.targetDocumentId,
				physicalContainerName: testCase.targetPhysicalContainer,
				lifecycleVersion: testCase.targetLifecycleVersion,
			};
			const sourceService = new RestGitService(
				storage,
				false,
				tenantId,
				documentId,
				cache,
				sourceProof.storageAccountName,
				undefined,
				false,
				undefined,
				undefined,
				sourceProof,
			);
			const targetService = new RestGitService(
				storage,
				false,
				tenantId,
				testCase.targetDocumentId,
				cache,
				targetProof.storageAccountName,
				undefined,
				false,
				undefined,
				undefined,
				targetProof,
			);

			assert.strictEqual(await sourceService.getCommit(canonicalSha, true), cachedCommit);
			await assert.rejects(
				targetService.getCommit(canonicalSha, true),
				(error: unknown) => error === notFound,
			);
			sinon.assert.calledTwice(downstream);
		});
	}
});
