/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ScopeType } from "@fluidframework/protocol-definitions";
import {
	generateToken,
	getAuthorizationTokenFromCredentials,
	NetworkError,
} from "@fluidframework/server-services-client";
import type { IDocument } from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import * as nconf from "nconf";
import * as sinon from "sinon";

import {
	createGitService,
	createGitServiceFromValidatedDocument,
	validateInitialSummaryUpload,
	validateSummaryDocument,
} from "../routes/utils";
import { TestCache, TestDocumentManager, TestTenantService } from "./utils";

const tenantId = "tenant/a";
const documentId = "shared:id";
const authorization = getAuthorizationTokenFromCredentials({
	user: tenantId,
	password: generateToken(tenantId, documentId, "tenant-key", [
		ScopeType.DocRead,
		ScopeType.DocWrite,
		ScopeType.SummaryWrite,
	]),
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

	describe("initial summary bootstrap", () => {
		it("permits bootstrap when the fresh Alfred lookup returns null", async () => {
			const documentManager = new TestDocumentManager();
			const readDocument = sandbox.stub(documentManager, "readDocument").resolves(null);
			const info = sandbox.spy(Lumberjack, "info");

			await validateInitialSummaryUpload({
				tenantId,
				authorization,
				documentManager,
			});

			sinon.assert.calledOnceWithExactly(readDocument, tenantId, documentId);
			sinon.assert.calledWithMatch(
				info,
				"HistorianSummaryDocumentOwnershipValidation",
				sinon.match({
					tenantId,
					documentId,
					operation: "post",
					routeType: "notApplicable",
					outcome: "allowed",
				}),
			);
		});

		it("permits bootstrap when Alfred returns a direct 404", async () => {
			const clock = sandbox.useFakeTimers();
			const documentManager = new TestDocumentManager();
			const readDocument = sandbox
				.stub(documentManager, "readDocument")
				.rejects(new NetworkError(404, "Alfred document not found"));
			const info = sandbox.spy(Lumberjack, "info");

			const validation = validateInitialSummaryUpload({
				tenantId,
				authorization,
				documentManager,
			});
			await clock.runAllAsync();
			await validation;

			sinon.assert.callCount(readDocument, 4);
			sinon.assert.calledWithMatch(
				info,
				"HistorianSummaryDocumentOwnershipValidation",
				sinon.match({ operation: "post", outcome: "allowed" }),
			);
		});

		for (const testCase of [
			{ name: "active", document: activeDocument },
			{
				name: "scheduled-for-deletion",
				document: {
					...activeDocument,
					scheduledDeletionTime: "2026-07-31T18:00:00.000Z",
				},
			},
		]) {
			it(`rejects an ${testCase.name} document as an initial replay`, async () => {
				const documentManager = new TestDocumentManager();
				sandbox.stub(documentManager, "readDocument").resolves(testCase.document);
				const info = sandbox.spy(Lumberjack, "info");

				await assert.rejects(
					validateInitialSummaryUpload({
						tenantId,
						authorization,
						documentManager,
					}),
					(error: unknown) =>
						error instanceof NetworkError &&
						error.code === 404 &&
						error.message === "Document is deleted and cannot be accessed.",
				);
				sinon.assert.calledWithMatch(
					info,
					"HistorianSummaryDocumentOwnershipValidation",
					sinon.match({
						operation: "post",
						routeType: "notApplicable",
						outcome: "initialReplay",
					}),
				);
			});
		}

		it("propagates Alfred dependency failures", async () => {
			const clock = sandbox.useFakeTimers();
			const dependencyError = new NetworkError(503, "Alfred unavailable");
			const documentManager = new TestDocumentManager();
			sandbox.stub(documentManager, "readDocument").rejects(dependencyError);
			const logError = sandbox.spy(Lumberjack, "error");

			const rejection = assert.rejects(
				validateInitialSummaryUpload({
					tenantId,
					authorization,
					documentManager,
				}),
				(error) => error === dependencyError,
			);
			await clock.runAllAsync();
			await rejection;

			sinon.assert.calledWithMatch(
				logError,
				"HistorianSummaryDocumentOwnershipValidation",
				sinon.match({
					operation: "post",
					outcome: "dependencyError",
					dependencyStatus: 503,
				}),
			);
		});

		it("rejects a malformed successful Alfred response as a dependency error", async () => {
			const documentManager = new TestDocumentManager();
			sandbox.stub(documentManager, "readDocument").resolves({
				...activeDocument,
				createTime: Number.NaN,
			});
			const logError = sandbox.spy(Lumberjack, "error");

			await assert.rejects(
				validateInitialSummaryUpload({
					tenantId,
					authorization,
					documentManager,
				}),
				(error: unknown) =>
					error instanceof NetworkError &&
					error.code === 502 &&
					error.message === "Invalid document response from Alfred.",
			);
			sinon.assert.calledWithMatch(
				logError,
				"HistorianSummaryDocumentOwnershipValidation",
				sinon.match({ operation: "post", outcome: "dependencyError" }),
			);
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
			sandbox.stub(documentManager, "readDocument").resolves(testCase.document);
			const info = sandbox.spy(Lumberjack, "info");

			await assert.rejects(
				validateSummaryDocument({
					tenantId,
					authorization,
					documentManager,
					operation: "get",
					routeType: "sha",
					ephemeralDocumentTTLSec: 24 * 60 * 60,
				}),
				(error: unknown) =>
					error instanceof NetworkError &&
					error.code === 404 &&
					error.message === "Document is deleted and cannot be accessed.",
			);
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

	for (const testCase of [
		{ name: "network failure", error: new Error("socket reset"), status: undefined },
		{
			name: "timeout",
			error: new NetworkError(504, "Alfred timed out"),
			status: 504,
		},
		{
			name: "5xx",
			error: new NetworkError(503, "Alfred unavailable"),
			status: 503,
		},
	]) {
		it(`propagates Alfred ${testCase.name} as a dependency error`, async () => {
			const clock = sandbox.useFakeTimers();
			const documentManager = new TestDocumentManager();
			const logError = sandbox.spy(Lumberjack, "error");
			sandbox.stub(documentManager, "readDocument").rejects(testCase.error);

			const rejection = assert.rejects(
				validateSummaryDocument({
					tenantId,
					authorization,
					documentManager,
					operation: "delete",
					routeType: "notApplicable",
					ephemeralDocumentTTLSec: 24 * 60 * 60,
				}),
				(error) => error === testCase.error,
			);
			await clock.runAllAsync();
			await rejection;
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
		sandbox
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
			}),
			(error: unknown) =>
				error instanceof NetworkError &&
				error.code === 404 &&
				error.message === "Document is deleted and cannot be accessed.",
		);
		await clock.runAllAsync();
		await rejection;
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

	it("uses validated document properties without reading positive caches", async () => {
		const cache = new TestCache();
		const cacheGet = sandbox.spy(cache, "get");
		const cacheSet = sandbox.spy(cache, "set");
		const documentManager = new TestDocumentManager();
		const readStaticProperties = sandbox.spy(documentManager, "readStaticProperties");
		const config = new nconf.Provider({}).defaults({
			ignoreEphemeralFlag: false,
			storageUrl: "http://localhost",
		});

		await createGitServiceFromValidatedDocument(
			{
				config,
				tenantId,
				authorization,
				tenantService: new TestTenantService(),
				documentManager,
				cache,
				ephemeralDocumentTTLSec: 24 * 60 * 60,
			},
			activeDocument,
		);

		sinon.assert.notCalled(cacheGet);
		sinon.assert.notCalled(readStaticProperties);
		sinon.assert.calledWithExactly(
			cacheSet,
			"isEphemeralContainer:tenant%2Fa:shared%3Aid",
			false,
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
			}),
		);
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

		for (const currentTenantId of ["tenant-a", "tenant-b"]) {
			const currentAuthorization = getAuthorizationTokenFromCredentials({
				user: currentTenantId,
				password: generateToken(currentTenantId, currentDocumentId, "tenant-key", [
					ScopeType.DocRead,
				]),
			});
			await createGitServiceFromValidatedDocument(
				{
					config,
					tenantId: currentTenantId,
					authorization: currentAuthorization,
					tenantService: new TestTenantService(),
					documentManager,
					cache,
					ephemeralDocumentTTLSec: 24 * 60 * 60,
				},
				{
					...activeDocument,
					documentId: currentDocumentId,
					tenantId: currentTenantId,
					isEphemeralContainer: currentTenantId === "tenant-b",
				},
			);
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
		});

		sinon.assert.calledWith(cacheGet, "isEphemeralContainer:tenant-a:shared%3Aid");
		assert.strictEqual(cacheGet.calledWith("isEphemeralContainer:shared:id"), false);
	});
});
