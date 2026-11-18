/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { ScopeType } from "@fluidframework/protocol-definitions";
import {
	generateToken,
	getAuthorizationTokenFromCredentials,
	NetworkError,
} from "@fluidframework/server-services-client";
import type {
	IDocument,
	IDenyList,
	IRevokedTokenChecker,
} from "@fluidframework/server-services-core";
import { StartupCheck } from "@fluidframework/server-services-shared";
import { decode, sign } from "jsonwebtoken";
import * as nconf from "nconf";
import * as sinon from "sinon";
import request from "supertest";

import * as historianApp from "../app";
import { createGitService } from "../routes/utils";
import type {
	IDocumentAccessAuthorizer,
	ITrustedCreateContextResolver,
	RestGitService,
} from "../services";
import { TestCache, TestDocumentManager, TestTenantService } from "./utils";

const tenantId = "tenant";
const documentId = "document";
const storageName = "document-storage";
const summary = { id: "0123456789abcdef0123456789abcdef01234567", trees: [], blobs: [] };
const objectSha = "a".repeat(40);
const treeSha = "b".repeat(40);
const activeDocument: IDocument = {
	version: "1.0",
	createTime: Date.now(),
	tenantId,
	documentId,
	storageName,
	isEphemeralContainer: false,
	scribe: "",
	deli: "",
	session: {
		ordererUrl: "http://orderer",
		deltaStreamUrl: "http://delta",
		historianUrl: "http://historian",
		isSessionAlive: false,
		isSessionActive: false,
	},
};
const accessToken = generateToken(tenantId, documentId, "tenant-key", [
	ScopeType.DocRead,
	ScopeType.DocWrite,
	ScopeType.SummaryWrite,
]);
const authorization = getAuthorizationTokenFromCredentials({
	user: tenantId,
	password: accessToken,
});

describe("document storage recovery", () => {
	const sandbox = sinon.createSandbox();
	let server: Server;
	let config: nconf.Provider;
	let documentManager: TestDocumentManager;
	let readDocument: sinon.SinonStub;
	let operations: string[];
	let initialized: boolean;
	let failureStatus: number;
	let failureCode: unknown;
	let backfillStatus: number;
	let repairSucceeds: boolean;
	let lastRoutingFlag: string | string[] | undefined;
	let storageNameRetriever: {
		get: sinon.SinonStub;
		getForRequest?(
			tenant: string,
			document: string,
			read: () => ReturnType<TestDocumentManager["readDocument"]>,
		): Promise<string>;
		getWithDocumentDetails?(tenant: string, document: IDocument): Promise<string>;
	};

	beforeEach(async () => {
		operations = [];
		initialized = false;
		failureStatus = 409;
		failureCode = "DocumentStorageMetadataMissing";
		backfillStatus = 204;
		repairSucceeds = true;
		lastRoutingFlag = undefined;
		documentManager = new TestDocumentManager();
		readDocument = sandbox.stub(documentManager, "readDocument").resolves(activeDocument);
		storageNameRetriever = { get: sandbox.stub().resolves(storageName) };
		server = createServer((req, res) => {
			operations.push(`${req.method} ${req.url}`);
			lastRoutingFlag = req.headers["is-ephemeral-container"] ?? undefined;
			res.setHeader("Content-Type", "application/json");
			if (req.url?.endsWith("/internal/document-storage/backfill")) {
				initialized = repairSucceeds && backfillStatus === 204;
				res.statusCode = backfillStatus;
				res.end(backfillStatus === 204 ? undefined : JSON.stringify({ message: "Denied" }));
			} else if (req.url?.endsWith("/internal/document-storage/initialize")) {
				res.statusCode = 204;
				res.end();
			} else if (!initialized) {
				res.statusCode = failureStatus;
				res.end(
					JSON.stringify({
						message: "Metadata missing",
						source: "documentStorage:metadataMissing",
						internalErrorCode: failureCode,
					}),
				);
			} else {
				const isSummary =
					req.url?.includes("/git/summaries/") ||
					(req.method === "POST" && req.url?.endsWith("/git/summaries"));
				const value = isSummary
					? summary
					: req.url?.includes("/git/commits/") ||
					  (req.method === "POST" && req.url?.endsWith("/git/commits"))
					? {
							sha: objectSha,
							url: "http://gitrest/commit",
							author: { name: "Test", email: "test@example.com", date: "2026-01-01" },
							committer: {
								name: "Test",
								email: "test@example.com",
								date: "2026-01-01",
							},
							message: "Test commit",
							parents: [],
							tree: { sha: treeSha, url: "http://gitrest/tree" },
					  }
					: req.url?.includes("/git/trees/")
					? { sha: treeSha, url: "http://gitrest/tree", tree: [] }
					: req.url?.includes("/git/blobs/") ||
					  (req.method === "POST" && req.url?.endsWith("/git/blobs"))
					? {
							sha: objectSha,
							url: "http://gitrest/blob",
							content: "",
							encoding: "base64",
							size: 0,
					  }
					: [];
				res.end(JSON.stringify(value));
			}
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		config = new nconf.Provider({}).use("memory").defaults({
			ignoreEphemeralFlag: true,
			storageUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
			restGitService: { gitrestOwnershipValidation: true },
			logger: { morganFormat: "json" },
		});
	});

	afterEach(async () => {
		sandbox.restore();
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	});

	async function createService(isEphemeralContainer?: boolean, cache = new TestCache()) {
		return createGitService({
			config,
			tenantId,
			authorization,
			tenantService: new TestTenantService(),
			documentManager,
			storageNameRetriever,
			isEphemeralContainer,
			cache,
		});
	}

	function createApp(
		options: {
			denyList?: IDenyList;
			revokedTokenChecker?: IRevokedTokenChecker;
			authorizer?: IDocumentAccessAuthorizer;
			resolver?: ITrustedCreateContextResolver;
			cache?: TestCache;
		} = {},
	) {
		return historianApp.create(
			config,
			new TestTenantService(),
			storageNameRetriever,
			new Map(),
			new Map(),
			documentManager,
			new StartupCheck(),
			options.cache ?? new TestCache(),
			options.revokedTokenChecker,
			options.denyList,
			undefined,
			undefined,
			undefined,
			undefined,
			options.authorizer,
			options.resolver,
		);
	}

	it("recovers over the published client's real HTTP transport", async () => {
		const service = await createService();
		assert.deepStrictEqual(await service.getRefs(), []);
		assert.deepStrictEqual(
			operations.map((operation) => operation.split("/").pop()),
			["refs", "backfill", "refs"],
		);
		sinon.assert.calledOnceWithExactly(readDocument, tenantId, documentId);
	});

	it("shares one authoritative read between routing and recovery", async () => {
		storageNameRetriever.getForRequest = async (_tenant, _document, read) => {
			const document = await read();
			assert.ok(document);
			return document.storageName ?? storageName;
		};
		const service = await createService();
		assert.deepStrictEqual(await service.getRefs(), []);
		sinon.assert.calledOnce(readDocument);
		sinon.assert.notCalled(storageNameRetriever.get);
	});

	it("shares recovery between concurrent operations on one service", async () => {
		const service = await createService();
		assert.deepStrictEqual(await Promise.all([service.getRefs(), service.getRefs()]), [[], []]);
		assert.strictEqual(
			operations.filter((operation) => operation.startsWith("POST")).length,
			1,
		);
		sinon.assert.calledOnce(readDocument);
	});

	it("does not read Alfred for storage that already has metadata", async () => {
		initialized = true;
		const service = await createService();
		assert.deepStrictEqual(await service.getRefs(), []);
		sinon.assert.notCalled(readDocument);
	});

	it("does not prevalidate summaries when GitRest enforces ownership", async () => {
		initialized = true;
		await request(createApp())
			.get(`/repos/${tenantId}/git/summaries/${summary.id}`)
			.set("Authorization", authorization)
			.expect(200, summary);
		sinon.assert.notCalled(readDocument);
		assert.strictEqual(operations.length, 1);
	});

	for (const version of ["latest", summary.id]) {
		for (const enabled of [false, true]) {
			it(`${enabled ? "bypasses" : "preserves"} an existing durable ${
				version === "latest" ? "latest" : "SHA"
			} cache entry when GitRest validation is ${
				enabled ? "enabled" : "disabled"
			}`, async () => {
				config.set("restGitService:gitrestOwnershipValidation", false);
				initialized = true;
				const cache = new TestCache();
				const writer = await createService(false, cache);
				await writer.createSummary({
					type: "container",
					entries: [],
					sequenceNumber: 0,
					message: "Initial summary",
				});
				config.set("restGitService:gitrestOwnershipValidation", enabled);
				initialized = false;
				failureStatus = 403;
				readDocument.resetHistory();
				const response = await request(createApp({ cache }))
					.get(`/repos/${tenantId}/git/summaries/${version}`)
					.set("Authorization", authorization);
				assert.strictEqual(response.status, enabled ? 403 : 200);
				if (!enabled) {
					assert.deepStrictEqual(response.body, summary);
				}
				assert.strictEqual(operations.length, enabled ? 2 : 1);
				assert.strictEqual(readDocument.callCount, enabled ? 0 : 1);
			});
		}
	}

	it("validates every durable summary read without an independent access proof", async () => {
		initialized = true;
		const app = createApp({ cache: new TestCache() });
		await request(app)
			.get(`/repos/${tenantId}/git/summaries/latest`)
			.set("Authorization", authorization)
			.expect(200, summary);
		initialized = false;
		failureStatus = 403;
		await request(app)
			.get(`/repos/${tenantId}/git/summaries/latest`)
			.set("Authorization", authorization)
			.expect(403);
		assert.strictEqual(operations.length, 2);
		sinon.assert.notCalled(readDocument);
	});

	it("preserves durable summary caching with fresh independent authorization", async () => {
		initialized = true;
		const authorize = sandbox.stub().resolves({
			tenantId,
			documentId,
			storageAccountName: storageName,
			containerType: "durable",
			lifecycleVersion: "generation-1",
			operation: "read",
			state: "active",
			source: "dc-v1-metadata",
		});
		const app = createApp({ cache: new TestCache(), authorizer: { authorize } });
		for (let i = 0; i < 2; i++) {
			await request(app)
				.get(`/repos/${tenantId}/git/summaries/latest`)
				.set("Authorization", authorization)
				.expect(200, summary);
		}
		sinon.assert.calledTwice(authorize);
		sinon.assert.notCalled(readDocument);
		assert.strictEqual(operations.length, 1);
	});

	it("recovers a legacy summary through the same bounded path", async () => {
		await request(createApp())
			.get(`/repos/${tenantId}/git/summaries/${summary.id}`)
			.set("Authorization", authorization)
			.expect(200, summary);
		sinon.assert.calledOnce(readDocument);
		assert.strictEqual(operations.length, 3);
	});

	for (const { name, read } of [
		{
			name: "blob",
			read: (service: RestGitService) => service.getBlob(tenantId, objectSha, true),
		},
		{ name: "commit", read: (service: RestGitService) => service.getCommit(objectSha, true) },
		{ name: "tree", read: (service: RestGitService) => service.getTree(treeSha, true, true) },
		{ name: "header", read: (service: RestGitService) => service.getHeader(objectSha, true) },
		{
			name: "full tree",
			read: (service: RestGitService) => service.getFullTree(objectSha, true),
		},
	]) {
		for (const mode of ["validated durable", "default-off durable", "ephemeral"] as const) {
			it(`applies ownership cache policy to a warm ${mode} ${name}`, async () => {
				config.set("ignoreEphemeralFlag", false);
				config.set("restGitService:gitrestOwnershipValidation", false);
				initialized = true;
				const cache = new TestCache();
				const ephemeral = mode === "ephemeral";
				const previous = await read(await createService(ephemeral, cache));
				config.set(
					"restGitService:gitrestOwnershipValidation",
					mode !== "default-off durable",
				);
				initialized = false;
				failureStatus = 403;
				const requestsBefore = operations.length;
				const reader = await createService(ephemeral, cache);
				if (mode === "validated durable") {
					await assert.rejects(
						read(reader),
						(error: unknown) => error instanceof NetworkError && error.code === 403,
					);
					assert.strictEqual(operations.length, requestsBefore + 1);
				} else {
					assert.deepStrictEqual(await read(reader), previous);
					assert.strictEqual(operations.length, requestsBefore);
				}
			});
		}
	}

	it("does not prefetch content solely for a disabled durable cache", async () => {
		initialized = true;
		const service = await createService();
		const getBlob = sandbox.spy(service, "getBlob");
		const getTree = sandbox.spy(service, "getTree");
		const getHeader = sandbox.spy(service, "getHeader");
		await service.createBlob({ content: "", encoding: "base64" });
		await service.createCommit({
			author: { name: "Test", email: "test@example.com", date: "2026-01-01" },
			message: "Test commit",
			tree: treeSha,
			parents: [],
		});
		sinon.assert.notCalled(getBlob);
		sinon.assert.notCalled(getTree);
		sinon.assert.notCalled(getHeader);
		assert.strictEqual(operations.length, 2);
	});

	it("keeps content caching with independently validated Alfred fallback proofs", async () => {
		initialized = true;
		const cache = new TestCache();
		const authorize = sandbox.stub().resolves({
			tenantId,
			documentId,
			storageAccountName: storageName,
			containerType: "durable",
			lifecycleVersion: "generation-1",
			operation: "read",
			state: "active",
			source: "alfred-fallback",
		});
		for (let i = 0; i < 2; i++) {
			const service = await createGitService({
				config,
				tenantId,
				authorization,
				tenantService: new TestTenantService(),
				documentManager,
				cache,
				accessOperation: "read",
				documentAccessAuthorizer: { authorize },
			});
			const blob = await service.getBlob(tenantId, objectSha, true);
			assert.strictEqual(blob.sha, objectSha);
			initialized = false;
			failureStatus = 403;
		}
		sinon.assert.calledTwice(authorize);
		assert.strictEqual(operations.length, 1);
		sinon.assert.notCalled(readDocument);
	});

	for (const failure of ["missing", "error"] as const) {
		it(`resolves an ephemeral document authoritatively after ${failure} static properties`, async function () {
			this.timeout(20000);
			config.set("ignoreEphemeralFlag", false);
			config.set("alfredEnforcesServerGeneratedDocumentId", true);
			initialized = true;
			readDocument.resolves({ ...activeDocument, isEphemeralContainer: true });
			const readStatic = sandbox.stub(documentManager, "readStaticProperties");
			if (failure === "missing") {
				readStatic.resolves(undefined);
			} else {
				readStatic.rejects(new NetworkError(404, "Static properties unavailable"));
			}
			const cache = new TestCache();
			await request(createApp({ cache }))
				.get(`/repos/${tenantId}/git/summaries/latest`)
				.set("Authorization", authorization)
				.expect(200, summary);
			assert.strictEqual(lastRoutingFlag, "true");
			assert.strictEqual(
				await cache.get(`isEphemeralContainer:${tenantId}:${documentId}`),
				true,
			);
			sinon.assert.notCalled(storageNameRetriever.get);
			assert.strictEqual(operations.length, 1);
		});
	}

	it("does not cache unknown routing as durable when authoritative lookup is denied", async () => {
		config.set("ignoreEphemeralFlag", false);
		sandbox.stub(documentManager, "readStaticProperties").resolves(undefined);
		readDocument.rejects(new NetworkError(403, "Denied"));
		initialized = true;
		const cache = new TestCache();
		await request(createApp({ cache }))
			.get(`/repos/${tenantId}/git/summaries/latest`)
			.set("Authorization", authorization)
			.expect(403);
		assert.strictEqual(
			await cache.get(`isEphemeralContainer:${tenantId}:${documentId}`),
			undefined,
		);
		assert.deepStrictEqual(operations, []);
	});

	it("uses the summary route's default when ignoreEphemeralFlag is unset", async () => {
		config = new nconf.Provider({}).use("memory").defaults({
			storageUrl: config.get("storageUrl"),
			restGitService: { gitrestOwnershipValidation: true },
			logger: { morganFormat: "json" },
		});
		initialized = true;
		readDocument.resolves({ ...activeDocument, isEphemeralContainer: true });
		const readStatic = sandbox
			.stub(documentManager, "readStaticProperties")
			.resolves({ ...activeDocument, isEphemeralContainer: true });
		await request(createApp())
			.get(`/repos/${tenantId}/git/summaries/latest`)
			.set("Authorization", authorization)
			.expect(200, summary);
		assert.strictEqual(lastRoutingFlag, undefined);
		sinon.assert.notCalled(readStatic);
		sinon.assert.notCalled(readDocument);
	});

	for (const namedDocument of [false, true]) {
		it(`${
			namedDocument ? "rejects a named document on" : "recovers legacy metadata on"
		} the provider default route`, async () => {
			readDocument.resolves({
				...activeDocument,
				storageName: namedDocument ? storageName : undefined,
			});
			const service = await createGitService({
				config,
				tenantId,
				authorization,
				tenantService: new TestTenantService(),
				documentManager,
				cache: new TestCache(),
			});
			if (namedDocument) {
				await assert.rejects(
					service.getRefs(),
					(error: unknown) => error instanceof NetworkError && error.code === 403,
				);
				assert.strictEqual(operations.length, 1);
			} else {
				assert.deepStrictEqual(await service.getRefs(), []);
				assert.strictEqual(operations.length, 3);
				sinon.assert.calledOnce(readDocument);
			}
		});
	}

	it("does not treat an unresolved configured retriever as a provider default route", async () => {
		readDocument.resolves({ ...activeDocument, storageName: undefined });
		storageNameRetriever.get.resolves(undefined);
		await assert.rejects(
			(await createService()).getRefs(),
			(error: unknown) => error instanceof NetworkError && error.code === 403,
		);
		assert.strictEqual(operations.length, 1);
	});

	it("keeps local ephemeral cache hits free of Alfred and durable routing", async () => {
		config.set("ignoreEphemeralFlag", false);
		config.set("alfredEnforcesServerGeneratedDocumentId", true);
		initialized = true;
		const cache = new TestCache();
		await cache.activateSummaryAccessIfNotDeleted(
			tenantId,
			documentId,
			activeDocument.createTime,
			activeDocument.createTime + 24 * 60 * 60 * 1000,
		);
		const readLocalAccess = sandbox.spy(cache, "readSummaryAccess");
		const readStaticProperties = sandbox
			.stub(documentManager, "readStaticProperties")
			.resolves({
				...activeDocument,
				isEphemeralContainer: true,
			});
		const app = createApp({ cache });
		for (let i = 0; i < 2; i++) {
			await request(app)
				.get(`/repos/${tenantId}/git/summaries/latest`)
				.set("Authorization", authorization)
				.expect(200, summary);
		}
		assert.strictEqual(operations.length, 1);
		sinon.assert.calledTwice(readLocalAccess);
		sinon.assert.notCalled(readDocument);
		sinon.assert.notCalled(readStaticProperties);
		sinon.assert.notCalled(storageNameRetriever.get);
	});

	for (const state of ["deleted", "expired"] as const) {
		it(`rejects a ${state} ephemeral document even with a warm summary cache`, async () => {
			config.set("ignoreEphemeralFlag", false);
			config.set("alfredEnforcesServerGeneratedDocumentId", true);
			initialized = true;
			const cache = new TestCache();
			await cache.set(`isEphemeralContainer:${tenantId}:${documentId}`, true);
			await cache.activateSummaryAccessIfNotDeleted(
				tenantId,
				documentId,
				activeDocument.createTime,
				activeDocument.createTime + 24 * 60 * 60 * 1000,
			);
			const app = createApp({ cache });
			await request(app)
				.get(`/repos/${tenantId}/git/summaries/latest`)
				.set("Authorization", authorization)
				.expect(200, summary);
			sandbox.stub(cache, "readSummaryAccess").resolves({
				version: 1,
				state: state === "deleted" ? "deleted" : "active",
				createTime: state === "expired" ? 0 : activeDocument.createTime,
			});
			await request(app)
				.get(`/repos/${tenantId}/git/summaries/latest`)
				.set("Authorization", authorization)
				.expect(404);
			assert.strictEqual(operations.length, 1);
			sinon.assert.notCalled(readDocument);
		});
	}

	it("persists an ephemeral tombstone before sending deletion to GitRest", async () => {
		config.set("ignoreEphemeralFlag", false);
		config.set("alfredEnforcesServerGeneratedDocumentId", true);
		initialized = true;
		readDocument.resolves({ ...activeDocument, isEphemeralContainer: true });
		const cache = new TestCache();
		await cache.set(`isEphemeralContainer:${tenantId}:${documentId}`, true);
		const markDeleted = sandbox.spy(cache, "markSummaryAccessDeleted");
		let tombstonedBeforeDelete = false;
		server.once("request", () => {
			tombstonedBeforeDelete = markDeleted.calledOnce;
		});
		await request(createApp({ cache }))
			.delete(`/repos/${tenantId}/git/summaries`)
			.set("Authorization", authorization)
			.set("Soft-Delete", "true")
			.expect(200);
		assert.strictEqual((await cache.readSummaryAccess(tenantId, documentId))?.state, "deleted");
		assert.ok(tombstonedBeforeDelete);
		sinon.assert.calledOnce(markDeleted);
		assert.strictEqual(operations.length, 1);
		assert.ok(operations[0]?.startsWith("DELETE "));
		sinon.assert.calledOnce(readDocument);
	});

	it("does not delete ephemeral storage when tombstone persistence fails", async () => {
		config.set("ignoreEphemeralFlag", false);
		config.set("alfredEnforcesServerGeneratedDocumentId", true);
		initialized = true;
		readDocument.resolves({ ...activeDocument, isEphemeralContainer: true });
		const cache = new TestCache();
		await cache.set(`isEphemeralContainer:${tenantId}:${documentId}`, true);
		sandbox.stub(cache, "markSummaryAccessDeleted").rejects(new Error("Redis unavailable"));
		await request(createApp({ cache }))
			.delete(`/repos/${tenantId}/git/summaries`)
			.set("Authorization", authorization)
			.set("Soft-Delete", "true")
			.expect(503);
		assert.deepStrictEqual(operations, []);
	});

	it("does not access ephemeral storage when Alfred reports a durable document", async () => {
		config.set("ignoreEphemeralFlag", false);
		config.set("alfredEnforcesServerGeneratedDocumentId", true);
		initialized = true;
		const cache = new TestCache();
		await cache.set(`isEphemeralContainer:${tenantId}:${documentId}`, true);
		await request(createApp({ cache }))
			.get(`/repos/${tenantId}/git/summaries/latest`)
			.set("Authorization", authorization)
			.expect(403);
		assert.deepStrictEqual(operations, []);
		sinon.assert.calledOnce(readDocument);
	});

	it("uses already validated document details to resolve legacy storage", async () => {
		const document = { ...activeDocument, storageName: undefined };
		readDocument.resolves(document);
		const getWithDocumentDetails = sandbox.stub().resolves(storageName);
		storageNameRetriever.getWithDocumentDetails = getWithDocumentDetails;
		const service = await createService();
		assert.deepStrictEqual(await service.getRefs(), []);
		sinon.assert.calledOnceWithExactly(getWithDocumentDetails, tenantId, document);
		sinon.assert.calledOnce(readDocument);
	});

	it("reuses the existing storage retriever for documents without a storage name", async () => {
		readDocument.resolves({ ...activeDocument, storageName: undefined });
		const service = await createService();
		assert.deepStrictEqual(await service.getRefs(), []);
		sinon.assert.calledOnceWithExactly(storageNameRetriever.get, tenantId, documentId);
		sinon.assert.calledOnce(readDocument);
		assert.strictEqual(operations.length, 3);
	});

	it("does not treat an initial upload storage hint as authoritative legacy routing", async () => {
		readDocument.resolves({ ...activeDocument, storageName: undefined });
		const service = await createGitService({
			config,
			tenantId,
			authorization,
			tenantService: new TestTenantService(),
			documentManager,
			storageNameRetriever,
			initialUpload: true,
			storageName: "untrusted-storage",
		});
		await assert.rejects(
			service.getRefs(),
			(error: unknown) => error instanceof NetworkError && error.code === 403,
		);
		sinon.assert.calledOnceWithExactly(storageNameRetriever.get, tenantId, documentId);
		assert.strictEqual(operations.length, 1);
	});

	it("recovers an active durable Alfred fallback proof", async () => {
		const service = await createGitService({
			config,
			tenantId,
			authorization,
			tenantService: new TestTenantService(),
			documentManager,
			storageNameRetriever,
			accessOperation: "read",
			documentAccessAuthorizer: {
				authorize: sandbox.stub().resolves({
					tenantId,
					documentId,
					storageAccountName: storageName,
					containerType: "durable",
					lifecycleVersion: "generation-1",
					operation: "read",
					state: "active",
					source: "alfred-fallback",
				}),
			},
		});
		assert.deepStrictEqual(await service.getRefs(), []);
		sinon.assert.calledOnce(readDocument);
		assert.strictEqual(operations.length, 3);
	});

	for (const source of ["dc-v1-metadata", "dc-v2-metadata", "trusted-create"] as const) {
		it(`does not recover a ${source} proof`, async () => {
			const creating = source === "trusted-create";
			const service = await createGitService({
				config,
				tenantId,
				authorization,
				tenantService: new TestTenantService(),
				documentManager,
				storageNameRetriever,
				accessOperation: creating ? "create" : "read",
				documentAccessAuthorizer: {
					authorize: sandbox.stub().resolves({
						tenantId,
						documentId,
						storageAccountName: storageName,
						containerType: "durable",
						lifecycleVersion: "generation-1",
						operation: creating ? "create" : "read",
						state: creating ? "pending" : "active",
						source,
					}),
				},
			});
			await assert.rejects(
				service.getRefs(),
				(error: unknown) => error instanceof NetworkError && error.code === 409,
			);
			sinon.assert.notCalled(readDocument);
			assert.strictEqual(operations.length, 1);
		});
	}

	it("does not resolve durable storage for ephemeral requests", async () => {
		config.set("ignoreEphemeralFlag", false);
		initialized = true;
		const service = await createService(true);
		assert.deepStrictEqual(await service.getRefs(), []);
		sinon.assert.notCalled(storageNameRetriever.get);
		sinon.assert.notCalled(readDocument);
	});

	for (const testCase of [
		{
			name: "disabled feature",
			enabled: false,
			ephemeral: false,
			status: 409,
			code: "DocumentStorageMetadataMissing",
		},
		{
			name: "ephemeral",
			enabled: true,
			ephemeral: true,
			status: 409,
			code: "DocumentStorageMetadataMissing",
		},
		{ name: "other conflict", enabled: true, ephemeral: false, status: 409, code: "Other" },
		{
			name: "malformed error code",
			enabled: true,
			ephemeral: false,
			status: 409,
			code: { toString: "invalid" },
		},
		{
			name: "not found",
			enabled: true,
			ephemeral: false,
			status: 404,
			code: "DocumentStorageMetadataMissing",
		},
	]) {
		it(`does not recover ${testCase.name}`, async () => {
			config.set("restGitService:gitrestOwnershipValidation", testCase.enabled);
			config.set("ignoreEphemeralFlag", false);
			failureStatus = testCase.status;
			failureCode = testCase.code ?? "DocumentStorageMetadataMissing";
			const service = await createService(testCase.ephemeral);
			readDocument.resetHistory();
			await assert.rejects(
				service.getRefs(),
				(error: unknown) => error instanceof NetworkError && error.code === failureStatus,
			);
			assert.strictEqual(operations.length, 1);
			sinon.assert.notCalled(readDocument);
		});
	}

	for (const testCase of [
		{
			name: "different tenant",
			document: { ...activeDocument, tenantId: "other" },
			status: 404,
		},
		{
			name: "different document",
			document: { ...activeDocument, documentId: "other" },
			status: 404,
		},
		{
			name: "deleted document",
			document: { ...activeDocument, scheduledDeletionTime: "2026-01-01" },
			status: 404,
		},
		{
			name: "different storage",
			document: { ...activeDocument, storageName: "other" },
			status: 403,
		},
		{
			name: "ephemeral document",
			document: { ...activeDocument, isEphemeralContainer: true },
			status: 403,
		},
	]) {
		it(`does not backfill a ${testCase.name}`, async () => {
			readDocument.resolves(testCase.document);
			const service = await createService();
			await assert.rejects(
				service.getRefs(),
				(error: unknown) => error instanceof NetworkError && error.code === testCase.status,
			);
			assert.strictEqual(operations.length, 1);
		});
	}

	it("propagates rejected backfill without retrying the original operation", async () => {
		backfillStatus = 403;
		const service = await createService();
		await assert.rejects(
			service.getRefs(),
			(error: unknown) => error instanceof NetworkError && error.code === 403,
		);
		assert.strictEqual(operations.length, 2);
	});

	for (const status of [401, 403]) {
		it(`honors customer-token reuse when Alfred rejects the caller with ${status}`, async () => {
			config.set("restGitService:reuseCustomerAccessTokenForSummaryOwnership", true);
			readDocument.callsFake(
				async (_tenant: string, _document: string, options?: { accessToken?: string }) => {
					if (options?.accessToken !== undefined) {
						throw new NetworkError(status, "Caller denied");
					}
					return activeDocument;
				},
			);
			const service = await createService();
			await assert.rejects(
				service.getRefs(),
				(error: unknown) => error instanceof NetworkError && error.code === status,
			);
			sinon.assert.calledOnceWithExactly(readDocument, tenantId, documentId, {
				accessToken,
			});
			assert.strictEqual(operations.length, 1);
		});

		it(`does not backfill or retry an Alfred ${status}`, async () => {
			readDocument.rejects(new NetworkError(status, "Denied"));
			const service = await createService();
			await assert.rejects(
				service.getRefs(),
				(error: unknown) => error instanceof NetworkError && error.code === status,
			);
			sinon.assert.calledOnce(readDocument);
			assert.strictEqual(operations.length, 1);
		});
	}

	it("retries the original operation only once", async () => {
		repairSucceeds = false;
		const service = await createService();
		await assert.rejects(
			service.getRefs(),
			(error: unknown) => error instanceof NetworkError && error.code === 409,
		);
		assert.strictEqual(operations.length, 3);
		sinon.assert.calledOnce(readDocument);
	});

	it("forwards authenticated private initialization without reading Alfred", async () => {
		await request(createApp())
			.post(`/repos/${tenantId}/internal/document-storage/initialize`)
			.set("Authorization", authorization)
			.set("StorageName", storageName)
			.expect(204);
		assert.strictEqual(operations.length, 1);
		assert.match(operations[0] ?? "", /\/internal\/document-storage\/initialize$/);
		sinon.assert.notCalled(readDocument);
	});

	it("rejects ephemeral initialization without poisoning its routing cache", async () => {
		config.set("ignoreEphemeralFlag", false);
		const cache = new TestCache();
		const key = `isEphemeralContainer:${tenantId}:${documentId}`;
		await cache.set(key, true);
		await request(createApp({ cache }))
			.post(`/repos/${tenantId}/internal/document-storage/initialize`)
			.set("Authorization", authorization)
			.set("Is-Ephemeral-Container", "true")
			.set("StorageName", storageName)
			.expect(400);
		assert.strictEqual(await cache.get(key), true);
		assert.deepStrictEqual(operations, []);
		sinon.assert.notCalled(readDocument);
	});

	it("does not expose initialization when the feature is disabled", async () => {
		config.set("restGitService:gitrestOwnershipValidation", false);
		await request(createApp())
			.post(`/repos/${tenantId}/internal/document-storage/initialize`)
			.set("Authorization", authorization)
			.expect(404);
		assert.deepStrictEqual(operations, []);
	});

	it("rejects initialization without authentication", async () => {
		await request(createApp())
			.post(`/repos/${tenantId}/internal/document-storage/initialize`)
			.expect(403);
		assert.deepStrictEqual(operations, []);
	});

	it("rejects initialization without document write scope", async () => {
		const readAuthorization = getAuthorizationTokenFromCredentials({
			user: tenantId,
			password: generateToken(tenantId, documentId, "tenant-key", [ScopeType.DocRead]),
		});
		await request(createApp())
			.post(`/repos/${tenantId}/internal/document-storage/initialize`)
			.set("Authorization", readAuthorization)
			.expect(403);
		assert.deepStrictEqual(operations, []);
	});

	it("rejects a revoked initialization token", async () => {
		const claims = decode(
			generateToken(tenantId, documentId, "tenant-key", [ScopeType.DocWrite]),
		);
		assert.ok(claims && typeof claims === "object");
		const revokedAuthorization = getAuthorizationTokenFromCredentials({
			user: tenantId,
			password: sign({ ...claims, jti: "revoked-token" }, "tenant-key"),
		});
		const isTokenRevoked = sandbox.stub().resolves(true);
		await request(createApp({ revokedTokenChecker: { isTokenRevoked } }))
			.post(`/repos/${tenantId}/internal/document-storage/initialize`)
			.set("Authorization", revokedAuthorization)
			.expect(403);
		sinon.assert.calledOnceWithExactly(isTokenRevoked, tenantId, documentId, "revoked-token");
		assert.deepStrictEqual(operations, []);
	});

	it("does not bypass a denied document during initialization", async () => {
		await request(
			createApp({
				denyList: {
					isTenantDenied: () => false,
					isDocumentDenied: (id) => id === documentId,
				},
			}),
		)
			.post(`/repos/${tenantId}/internal/document-storage/initialize`)
			.set("Authorization", authorization)
			.expect(500);
		assert.deepStrictEqual(operations, []);
	});

	it("does not bypass the configured authorizer without trusted create context", async () => {
		await request(
			createApp({
				authorizer: { authorize: sandbox.stub().rejects(new NetworkError(403, "Denied")) },
			}),
		)
			.post(`/repos/${tenantId}/internal/document-storage/initialize`)
			.set("Authorization", authorization)
			.expect(404);
		assert.deepStrictEqual(operations, []);
	});

	it("authenticates the tenant before resolving trusted create context", async () => {
		sandbox
			.stub(TestTenantService.prototype, "getTenant")
			.rejects(new NetworkError(403, "Invalid tenant token"));
		const resolve = sandbox.stub().rejects(new Error("Unexpected context resolution"));
		await request(
			createApp({
				authorizer: { authorize: sandbox.stub() },
				resolver: { resolve },
			}),
		)
			.post(`/repos/${tenantId}/internal/document-storage/initialize`)
			.set("Authorization", authorization)
			.set("Fluid-Create-Context", "opaque-create-context")
			.expect(403);
		sinon.assert.notCalled(resolve);
		assert.deepStrictEqual(operations, []);
	});

	it("authorizes trusted durable initialization before forwarding", async () => {
		const context = {
			tenantId,
			documentId,
			containerType: "durable" as const,
			storageAccountName: storageName,
			lifecycleVersion: "generation-1",
			expiresAtMs: Date.now() + 60_000,
		};
		const authorize = sandbox.stub().resolves({
			...context,
			source: "trusted-create",
			operation: "create",
			state: "pending",
		});
		const resolve = sandbox.stub().resolves(context);
		await request(
			createApp({
				authorizer: { authorize },
				resolver: { resolve },
			}),
		)
			.post(`/repos/${tenantId}/internal/document-storage/initialize`)
			.set("Authorization", authorization)
			.set("Fluid-Create-Context", "opaque-create-context")
			.expect(204);
		sinon.assert.calledOnceWithExactly(resolve, {
			tenantId,
			documentId,
			opaqueToken: "opaque-create-context",
			containerTypeHint: "durable",
		});
		sinon.assert.calledOnceWithMatch(authorize, {
			tenantId,
			documentId,
			operation: "create",
			trustedCreateContext: context,
		});
		assert.strictEqual(operations.length, 1);
	});
});
