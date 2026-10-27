/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ScopeType } from "@fluidframework/protocol-definitions";
import {
	BasicRestWrapper,
	generateToken,
	getAuthorizationTokenFromCredentials,
	NetworkError,
} from "@fluidframework/server-services-client";
import type { IDocument } from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import * as nconf from "nconf";
import * as sinon from "sinon";

import { createGitService, validateSummaryDocument } from "../routes/utils";
import type { IDocumentAccessProof } from "../services";
import { TestCache, TestDocumentManager, TestTenantService } from "./utils";

const tenantId = "tenant/a";
const documentId = "shared:id";
const accessToken = generateToken(tenantId, documentId, "tenant-key", [
	ScopeType.DocRead,
	ScopeType.DocWrite,
	ScopeType.SummaryWrite,
]);
const authorization = getAuthorizationTokenFromCredentials({
	user: tenantId,
	password: accessToken,
});
const activeDocument: IDocument = {
	version: "1.0",
	createTime: Date.now(),
	documentId,
	tenantId,
	session: {
		ordererUrl: "http://orderer",
		deltaStreamUrl: "http://delta",
		historianUrl: "http://historian",
		isSessionAlive: false,
		isSessionActive: false,
	},
	scribe: "",
	deli: "",
	storageName: "document-storage",
	isEphemeralContainer: false,
};

describe("summary ownership", function () {
	const sandbox = sinon.createSandbox();

	afterEach(() => sandbox.restore());

	it("returns the exact active Alfred document", async () => {
		const documentManager = new TestDocumentManager();
		const readDocument = sandbox.stub(documentManager, "readDocument").resolves(activeDocument);

		const result = await validateSummaryDocument({
			tenantId,
			authorization,
			documentManager,
			operation: "get",
			routeType: "latest",
			ephemeralDocumentTTLSec: 24 * 60 * 60,
		});

		assert.strictEqual(result, activeDocument);
		sinon.assert.calledOnceWithExactly(readDocument, tenantId, documentId);
	});

	it("forwards the customer access token when reuse is enabled", async () => {
		const documentManager = new TestDocumentManager();
		const readDocument = sandbox.stub(documentManager, "readDocument").resolves(activeDocument);

		const result = await validateSummaryDocument({
			tenantId,
			authorization,
			documentManager,
			operation: "get",
			routeType: "latest",
			ephemeralDocumentTTLSec: 24 * 60 * 60,
			reuseCustomerAccessToken: true,
		});

		assert.strictEqual(result, activeDocument);
		sinon.assert.calledOnceWithExactly(readDocument, tenantId, documentId, {
			accessToken,
		});
	});

	for (const testCase of [
		{ name: "missing", document: null, outcome: "notFound" },
		{
			name: "tenant mismatch",
			document: { ...activeDocument, tenantId: "victim" },
			outcome: "identityMismatch",
		},
		{
			name: "document mismatch",
			document: { ...activeDocument, documentId: "victim-id" },
			outcome: "identityMismatch",
		},
		{
			name: "scheduled deletion",
			document: {
				...activeDocument,
				scheduledDeletionTime: "2026-07-31T18:00:00.000Z",
			},
			outcome: "scheduledDeletion",
		},
	]) {
		it(`returns the same 404 for ${testCase.name}`, async () => {
			const documentManager = new TestDocumentManager();
			const readDocument = sandbox
				.stub(documentManager, "readDocument")
				.resolves(testCase.document);
			const info = sandbox.spy(Lumberjack, "info");

			await assert.rejects(
				validateSummaryDocument({
					tenantId,
					authorization,
					documentManager,
					operation: "get",
					routeType: "sha",
					ephemeralDocumentTTLSec: 24 * 60 * 60,
					reuseCustomerAccessToken: true,
				}),
				(error: unknown) =>
					error instanceof NetworkError &&
					error.code === 404 &&
					error.message === "Document is deleted and cannot be accessed.",
			);
			sinon.assert.calledOnceWithExactly(readDocument, tenantId, documentId, {
				accessToken,
			});
			sinon.assert.calledWithMatch(
				info,
				"HistorianSummaryDocumentOwnershipValidation",
				sinon.match({
					tenantId,
					documentId,
					operation: "get",
					routeType: "sha",
					outcome: testCase.outcome,
				}),
			);
		});
	}

	it("uses createTime from the fresh document to reject expired ephemeral state", async () => {
		const documentManager = new TestDocumentManager();
		const info = sandbox.spy(Lumberjack, "info");
		sandbox.stub(documentManager, "readDocument").resolves({
			...activeDocument,
			createTime: 0,
			isEphemeralContainer: true,
		});

		await assert.rejects(
			validateSummaryDocument({
				tenantId,
				authorization,
				documentManager,
				operation: "post",
				routeType: "notApplicable",
				ephemeralDocumentTTLSec: 1,
				reuseCustomerAccessToken: true,
			}),
			(error: NetworkError) => error.code === 404,
		);
		sinon.assert.calledWithMatch(
			info,
			"HistorianSummaryDocumentOwnershipValidation",
			sinon.match({
				operation: "post",
				routeType: "notApplicable",
				outcome: "notFound",
			}),
		);
	});

	it("skips ephemeral expiry when ignoreEphemeralFlag is enabled", async () => {
		const documentManager = new TestDocumentManager();
		const expiredEphemeralDocument = {
			...activeDocument,
			createTime: 0,
			isEphemeralContainer: true,
		};
		sandbox.stub(documentManager, "readDocument").resolves(expiredEphemeralDocument);

		const result = await validateSummaryDocument({
			tenantId,
			authorization,
			documentManager,
			operation: "get",
			routeType: "latest",
			ephemeralDocumentTTLSec: 1,
			ignoreEphemeralFlag: true,
		});

		assert.strictEqual(result, expiredEphemeralDocument);
	});

	it("still rejects scheduled deletion when ignoreEphemeralFlag is enabled", async () => {
		const documentManager = new TestDocumentManager();
		sandbox.stub(documentManager, "readDocument").resolves({
			...activeDocument,
			createTime: 0,
			isEphemeralContainer: true,
			scheduledDeletionTime: "2026-07-31T18:00:00.000Z",
		});

		await assert.rejects(
			validateSummaryDocument({
				tenantId,
				authorization,
				documentManager,
				operation: "get",
				routeType: "latest",
				ephemeralDocumentTTLSec: 1,
				ignoreEphemeralFlag: true,
			}),
			(error: unknown) => error instanceof NetworkError && error.code === 404,
		);
	});

	for (const testCase of [
		{
			name: "unclassified failure",
			error: new Error("socket reset"),
			status: undefined,
			expectedCallCount: 1,
		},
		{
			name: "timeout",
			error: new NetworkError(504, "Alfred timed out", true, false),
			status: 504,
			expectedCallCount: 4,
		},
		{
			name: "5xx",
			error: new NetworkError(503, "Alfred unavailable", true, false),
			status: 503,
			expectedCallCount: 4,
		},
	]) {
		it(`propagates Alfred ${testCase.name} as a dependency error`, async () => {
			const clock = sandbox.useFakeTimers();
			const documentManager = new TestDocumentManager();
			const logError = sandbox.spy(Lumberjack, "error");
			const readDocument = sandbox
				.stub(documentManager, "readDocument")
				.rejects(testCase.error);

			const rejection = assert.rejects(
				validateSummaryDocument({
					tenantId,
					authorization,
					documentManager,
					operation: "delete",
					routeType: "notApplicable",
					ephemeralDocumentTTLSec: 24 * 60 * 60,
					reuseCustomerAccessToken: true,
				}),
				(error) => error === testCase.error,
			);
			await clock.runAllAsync();
			await rejection;
			sinon.assert.callCount(readDocument, testCase.expectedCallCount);
			sinon.assert.alwaysCalledWithExactly(readDocument, tenantId, documentId, {
				accessToken,
			});
			sinon.assert.calledWithMatch(
				logError,
				"HistorianSummaryDocumentOwnershipValidation",
				sinon.match({
					operation: "delete",
					routeType: "notApplicable",
					outcome: "dependencyError",
					dependencyStatus: testCase.status,
				}),
			);
		});
	}

	it("maps an Alfred 404 to the non-disclosing not-found response", async () => {
		const clock = sandbox.useFakeTimers();
		const documentManager = new TestDocumentManager();
		const info = sandbox.spy(Lumberjack, "info");
		const readDocument = sandbox
			.stub(documentManager, "readDocument")
			.rejects(new NetworkError(404, "Alfred document not found"));

		const rejection = assert.rejects(
			validateSummaryDocument({
				tenantId,
				authorization,
				documentManager,
				operation: "get",
				routeType: "latest",
				ephemeralDocumentTTLSec: 24 * 60 * 60,
				reuseCustomerAccessToken: true,
			}),
			(error: unknown) =>
				error instanceof NetworkError &&
				error.code === 404 &&
				error.message === "Document is deleted and cannot be accessed.",
		);
		await clock.runAllAsync();
		await rejection;
		sinon.assert.calledOnceWithExactly(readDocument, tenantId, documentId, {
			accessToken,
		});
		sinon.assert.calledWithMatch(
			info,
			"HistorianSummaryDocumentOwnershipValidation",
			sinon.match({
				operation: "get",
				routeType: "latest",
				outcome: "notFound",
			}),
		);
	});

	it("treats a malformed successful Alfred response as a dependency error", async () => {
		const documentManager = new TestDocumentManager();
		const logError = sandbox.spy(Lumberjack, "error");
		sandbox.stub(documentManager, "readDocument").resolves({
			...activeDocument,
			createTime: Number.NaN,
		});

		await assert.rejects(
			validateSummaryDocument({
				tenantId,
				authorization,
				documentManager,
				operation: "get",
				routeType: "latest",
				ephemeralDocumentTTLSec: 24 * 60 * 60,
				reuseCustomerAccessToken: true,
			}),
			(error: unknown) =>
				error instanceof NetworkError &&
				error.code === 502 &&
				error.message === "Invalid document response from Alfred.",
		);
		sinon.assert.calledWithMatch(
			logError,
			"HistorianSummaryDocumentOwnershipValidation",
			sinon.match({
				operation: "get",
				routeType: "latest",
				outcome: "dependencyError",
				dependencyStatus: 502,
			}),
		);
	});

	for (const statusCode of [401, 403]) {
		it(`does not retry or change credentials after an Alfred ${statusCode}`, async () => {
			const dependencyError = new NetworkError(
				statusCode,
				"Alfred rejected customer token",
				false,
				true,
			);
			const documentManager = new TestDocumentManager();
			const readDocument = sandbox
				.stub(documentManager, "readDocument")
				.rejects(dependencyError);

			await assert.rejects(
				validateSummaryDocument({
					tenantId,
					authorization,
					documentManager,
					operation: "get",
					routeType: "latest",
					ephemeralDocumentTTLSec: 24 * 60 * 60,
					reuseCustomerAccessToken: true,
				}),
				(error) => error === dependencyError,
			);
			sinon.assert.calledOnceWithExactly(readDocument, tenantId, documentId, {
				accessToken,
			});
		});
	}

	it("treats an ephemeral document as durable when the flag is ignored", async () => {
		const cache = new TestCache();
		const cacheSet = sandbox.spy(cache, "set");
		const documentManager = new TestDocumentManager();
		const postEphemeralContainerCheck = sandbox
			.stub()
			.callsFake(
				async (
					_currentTenantId: string,
					_currentDocumentId: string,
					isEphemeral: boolean,
				) => isEphemeral,
			);
		const config = new nconf.Provider({}).defaults({
			ignoreEphemeralFlag: true,
			storageUrl: "http://localhost",
		});

		await createGitService({
			config,
			tenantId,
			authorization,
			tenantService: new TestTenantService(),
			documentManager,
			cache,
			ephemeralDocumentTTLSec: 24 * 60 * 60,
			postEphemeralContainerChecker: { postEphemeralContainerCheck },
			accessOperation: "read",
		});

		sinon.assert.calledOnceWithMatch(
			postEphemeralContainerCheck,
			tenantId,
			documentId,
			false,
			sinon.match.object,
		);
		sinon.assert.notCalled(cacheSet);
	});

	it("authorizes a lifecycle-derived proof before using it", async () => {
		const proof: IDocumentAccessProof = {
			tenantId,
			documentId,
			operation: "read",
			source: "ec-lifecycle-redis",
			lifecycleVersion: "generation-1",
			state: "active",
		};
		const authorizer = {
			authorize: sandbox.stub().resolves(proof),
		};

		await createGitService({
			config: new nconf.Provider({}).defaults({
				ignoreEphemeralFlag: true,
				storageUrl: "http://localhost",
			}),
			tenantId,
			authorization,
			tenantService: new TestTenantService(),
			documentManager: new TestDocumentManager(),
			accessOperation: "read",
			existingAccessProof: proof,
			documentAccessAuthorizer: authorizer,
		});

		sinon.assert.calledOnceWithExactly(authorizer.authorize, {
			tenantId,
			documentId,
			operation: "read",
			containerTypeHint: undefined,
			trustedCreateContext: undefined,
			existingProof: proof,
		});
	});

	it("keeps legacy summary cache identity when no authorizer is configured", async () => {
		const summary = {
			id: "summary-1",
			trees: [],
			blobs: [],
		};
		sandbox.stub(BasicRestWrapper.prototype, "get").resolves(summary);
		const cache = new TestCache();
		const proof: IDocumentAccessProof = {
			tenantId,
			documentId,
			operation: "read",
			source: "ec-lifecycle-redis",
			lifecycleVersion: "generation-1",
			state: "active",
		};

		const service = await createGitService({
			config: new nconf.Provider({}).defaults({
				ignoreEphemeralFlag: false,
				storageUrl: "http://localhost",
			}),
			tenantId,
			authorization,
			tenantService: new TestTenantService(),
			documentManager: new TestDocumentManager(),
			cache,
			accessOperation: "read",
			existingAccessProof: proof,
			summaryAccessContext: {
				tenantId,
				documentId,
				isEphemeralContainer: true,
				createTime: activeDocument.createTime,
				source: "localEphemeral",
				accessProof: proof,
			},
		});

		await service.getSummary("latest", false);

		assert.deepStrictEqual(
			await cache.get(`${tenantId}:${documentId}:summary:container`),
			summary,
		);
	});

	it("fails authorization before tenant lookup or document storage access", async () => {
		const denial = new NetworkError(404, "Document is deleted and cannot be accessed.");
		const tenantService = new TestTenantService();
		const getTenant = sandbox.spy(tenantService, "getTenant");
		const documentManager = new TestDocumentManager();
		const readStaticProperties = sandbox.spy(documentManager, "readStaticProperties");

		await assert.rejects(
			createGitService({
				config: new nconf.Provider({}).defaults({
					ignoreEphemeralFlag: false,
					storageUrl: "http://localhost",
				}),
				tenantId,
				authorization,
				tenantService,
				documentManager,
				accessOperation: "read",
				documentAccessAuthorizer: {
					authorize: sandbox.stub().rejects(denial),
				},
			}),
			(error: unknown) => error === denial,
		);

		sinon.assert.notCalled(getTenant);
		sinon.assert.notCalled(readStaticProperties);
	});

	it("rejects a proof that does not exactly match the authorized request", async () => {
		const tenantService = new TestTenantService();
		const getTenant = sandbox.spy(tenantService, "getTenant");

		await assert.rejects(
			createGitService({
				config: new nconf.Provider({}).defaults({
					ignoreEphemeralFlag: true,
					storageUrl: "http://localhost",
				}),
				tenantId,
				authorization,
				tenantService,
				documentManager: new TestDocumentManager(),
				accessOperation: "read",
				documentAccessAuthorizer: {
					authorize: sandbox.stub().resolves({
						tenantId: "other-tenant",
						documentId,
						operation: "read",
						source: "dc-v2-metadata",
						storageAccountName: "document-storage",
						physicalContainerName:
							"pd2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
						layoutVersion: "v2",
						lifecycleVersion: "generation-1",
						state: "active",
					}),
				},
			}),
			/Document access authorizer returned an invalid proof/,
		);

		sinon.assert.notCalled(getTenant);
	});

	for (const testCase of [
		{
			name: "active initial-create state",
			accessOperation: "create" as const,
			trustedCreateContext: {
				tenantId,
				documentId,
				lifecycleVersion: "generation-1",
				expiresAtMs: Date.now() + 60_000,
			},
			proof: {
				tenantId,
				documentId,
				operation: "create",
				source: "trusted-create",
				lifecycleVersion: "generation-1",
				state: "active",
			},
		},
		{
			name: "pending read state",
			accessOperation: "read" as const,
			trustedCreateContext: undefined,
			proof: {
				tenantId,
				documentId,
				operation: "read",
				source: "dc-v2-metadata",
				lifecycleVersion: "generation-1",
				state: "pending",
			},
		},
		{
			name: "mismatched initial-create generation",
			accessOperation: "create" as const,
			trustedCreateContext: {
				tenantId,
				documentId,
				lifecycleVersion: "generation-1",
				expiresAtMs: Date.now() + 60_000,
			},
			proof: {
				tenantId,
				documentId,
				operation: "create",
				source: "trusted-create",
				lifecycleVersion: "generation-2",
				state: "pending",
			},
		},
	]) {
		it(`rejects ${testCase.name}`, async () => {
			const tenantService = new TestTenantService();
			const getTenant = sandbox.spy(tenantService, "getTenant");

			await assert.rejects(
				createGitService({
					config: new nconf.Provider({}).defaults({
						ignoreEphemeralFlag: true,
						storageUrl: "http://localhost",
					}),
					tenantId,
					authorization,
					tenantService,
					documentManager: new TestDocumentManager(),
					accessOperation: testCase.accessOperation,
					trustedCreateContext: testCase.trustedCreateContext,
					documentAccessAuthorizer: {
						authorize: sandbox.stub().resolves(testCase.proof),
					},
				}),
				/Document access authorizer returned an invalid proof/,
			);

			sinon.assert.notCalled(getTenant);
		});
	}

	it("uses proof storage instead of caller, retriever, or tenant-default routing", async () => {
		const tenantService = new TestTenantService();
		const tenant = await tenantService.getTenant(tenantId, accessToken);
		sandbox.stub(tenantService, "getTenant").resolves({
			...tenant,
			customData: { storageName: "tenant-default-storage" },
		});
		const storageNameRetriever = {
			get: sandbox.stub().resolves("retrieved-storage"),
		};
		const info = sandbox.spy(Lumberjack, "info");

		await createGitService({
			config: new nconf.Provider({}).defaults({
				ignoreEphemeralFlag: true,
				storageUrl: "http://localhost",
			}),
			tenantId,
			authorization,
			tenantService,
			storageNameRetriever,
			documentManager: new TestDocumentManager(),
			initialUpload: true,
			storageName: "caller-storage",
			accessOperation: "create",
			documentAccessAuthorizer: {
				authorize: sandbox.stub().resolves({
					tenantId,
					documentId,
					operation: "create",
					source: "trusted-create",
					storageAccountName: "authorized-storage",
					physicalContainerName:
						"pd2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
					layoutVersion: "v2",
					lifecycleVersion: "generation-1",
					state: "pending",
				}),
			},
		});

		sinon.assert.notCalled(storageNameRetriever.get);
		const creationEvent = info
			.getCalls()
			.find(
				(call) =>
					typeof call.args[0] === "string" &&
					call.args[0].startsWith("Created RestGitService:"),
			);
		assert.ok(creationEvent);
		assert.match(creationEvent.args[0], /"Storage-Name":"authorized-storage"/);
		assert.doesNotMatch(
			creationEvent.args[0],
			/caller-storage|retrieved-storage|tenant-default-storage/,
		);
	});

	it("emits structured allowed ownership telemetry", async () => {
		const info = sandbox.spy(Lumberjack, "info");
		const documentManager = new TestDocumentManager();
		sandbox.stub(documentManager, "readDocument").resolves(activeDocument);

		await validateSummaryDocument({
			tenantId,
			authorization,
			documentManager,
			operation: "get",
			routeType: "sha",
			ephemeralDocumentTTLSec: 24 * 60 * 60,
		});

		sinon.assert.calledWithMatch(
			info,
			"HistorianSummaryDocumentOwnershipValidation",
			sinon.match({
				tenantId,
				documentId,
				operation: "get",
				routeType: "sha",
				outcome: "allowed",
				source: "alfred",
			}),
		);
		const allowedEvents = info.getCalls().filter((call) => {
			const properties = call.args[1];
			return (
				call.args[0] === "HistorianSummaryDocumentOwnershipValidation" &&
				!(properties instanceof Map) &&
				properties?.outcome === "allowed"
			);
		});
		assert.strictEqual(allowedEvents.length, 1);
	});

	it("does not collide ephemeral cache entries for duplicate document IDs", async () => {
		const cache = new TestCache();
		const cacheSet = sandbox.spy(cache, "set");
		const config = new nconf.Provider({}).defaults({
			ignoreEphemeralFlag: false,
			storageUrl: "http://localhost",
		});
		const documentManager = new TestDocumentManager();
		const currentDocumentId = "shared:id";
		sandbox
			.stub(documentManager, "readStaticProperties")
			.callsFake(async (currentTenantId: string) => ({
				...activeDocument,
				documentId: currentDocumentId,
				tenantId: currentTenantId,
				isEphemeralContainer: currentTenantId === "tenant-b",
			}));

		for (const currentTenantId of ["tenant-a", "tenant-b"]) {
			const currentAuthorization = getAuthorizationTokenFromCredentials({
				user: currentTenantId,
				password: generateToken(currentTenantId, currentDocumentId, "tenant-key", [
					ScopeType.DocRead,
				]),
			});
			await createGitService({
				config,
				tenantId: currentTenantId,
				authorization: currentAuthorization,
				tenantService: new TestTenantService(),
				documentManager,
				cache,
				ephemeralDocumentTTLSec: 24 * 60 * 60,
				accessOperation: "read",
			});
		}

		sinon.assert.calledWithExactly(
			cacheSet,
			"isEphemeralContainer:tenant-a:shared%3Aid",
			false,
		);
		sinon.assert.calledWithExactly(cacheSet, "isEphemeralContainer:tenant-b:shared%3Aid", true);
	});

	it("never reads the legacy document-only ephemeral key", async () => {
		const cache = new TestCache();
		await cache.set("isEphemeralContainer:shared:id", true);
		const cacheGet = sandbox.spy(cache, "get");
		const documentManager = new TestDocumentManager();
		sandbox.stub(documentManager, "readStaticProperties").resolves({
			...activeDocument,
			tenantId: "tenant-a",
			documentId: "shared:id",
			isEphemeralContainer: false,
		});
		const currentAuthorization = getAuthorizationTokenFromCredentials({
			user: "tenant-a",
			password: generateToken("tenant-a", "shared:id", "tenant-key", [ScopeType.DocRead]),
		});
		const config = new nconf.Provider({}).defaults({
			ignoreEphemeralFlag: false,
			storageUrl: "http://localhost",
		});

		await createGitService({
			config,
			tenantId: "tenant-a",
			authorization: currentAuthorization,
			tenantService: new TestTenantService(),
			documentManager,
			cache,
			ephemeralDocumentTTLSec: 24 * 60 * 60,
			accessOperation: "read",
		});

		sinon.assert.calledWith(cacheGet, "isEphemeralContainer:tenant-a:shared%3Aid");
		assert.strictEqual(cacheGet.calledWith("isEphemeralContainer:shared:id"), false);
	});
});
