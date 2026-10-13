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
import * as sinon from "sinon";

import { type IResolveSummaryAccessArgs, resolveSummaryAccess } from "../routes/summaryAccess";
import { MalformedEphemeralSummaryAccessRecordError } from "../services";
import { TestCache, TestDocumentManager } from "./utils";

const tenantId = "tenant/a";
const documentId = "shared:id";
const ttlSec = 24 * 60 * 60;
const ttlMs = ttlSec * 1000;
const accessToken = generateToken(tenantId, documentId, "tenant-key", [
	ScopeType.DocRead,
	ScopeType.DocWrite,
	ScopeType.SummaryWrite,
]);
const authorization = getAuthorizationTokenFromCredentials({
	user: tenantId,
	password: accessToken,
});

describe("summary access resolver", () => {
	const sandbox = sinon.createSandbox();
	let cache: TestCache;
	let documentManager: TestDocumentManager;
	let activeDocument: IDocument;

	beforeEach(() => {
		cache = new TestCache();
		documentManager = new TestDocumentManager();
		activeDocument = {
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
	});

	afterEach(() => sandbox.restore());

	function getArgs(
		overrides: Partial<IResolveSummaryAccessArgs> = {},
	): IResolveSummaryAccessArgs {
		return {
			tenantId,
			authorization,
			documentManager,
			operation: "get",
			routeType: "latest",
			ephemeralDocumentTTLSec: ttlSec,
			accessStore: cache,
			...overrides,
		};
	}

	it("returns an active local EC context without Alfred", async () => {
		await cache.activateSummaryAccessIfNotDeleted(
			tenantId,
			documentId,
			activeDocument.createTime,
			activeDocument.createTime + ttlMs,
		);
		const readDocument = sandbox.spy(documentManager, "readDocument");
		const info = sandbox.spy(Lumberjack, "info");

		const context = await resolveSummaryAccess(getArgs());

		assert.deepStrictEqual(context, {
			tenantId,
			documentId,
			isEphemeralContainer: true,
			createTime: activeDocument.createTime,
			storageName: undefined,
			source: "localEphemeral",
		});
		sinon.assert.notCalled(readDocument);
		sinon.assert.calledWithMatch(
			info,
			"HistorianSummaryDocumentOwnershipValidation",
			sinon.match({
				outcome: "allowed",
				source: "localEphemeral",
				localOutcome: "active",
			}),
		);
	});

	it("denies a deleted local EC before Alfred", async () => {
		const readDocument = sandbox.spy(documentManager, "readDocument");
		await cache.markSummaryAccessDeleted(
			tenantId,
			documentId,
			activeDocument.createTime,
			activeDocument.createTime + ttlMs,
		);

		await assert.rejects(
			resolveSummaryAccess(getArgs()),
			(error: unknown) => error instanceof NetworkError && error.code === 404,
		);
		sinon.assert.notCalled(readDocument);
	});

	it("denies an expired local EC before Alfred", async () => {
		const readDocument = sandbox.spy(documentManager, "readDocument");
		await cache.activateSummaryAccessIfNotDeleted(tenantId, documentId, 0, ttlMs);

		await assert.rejects(
			resolveSummaryAccess(getArgs()),
			(error: unknown) => error instanceof NetworkError && error.code === 404,
		);
		sinon.assert.notCalled(readDocument);
	});

	it("backfills a missing active EC record after Alfred validation", async () => {
		sandbox.stub(documentManager, "readDocument").resolves({
			...activeDocument,
			isEphemeralContainer: true,
		});
		const activate = sandbox.spy(cache, "activateSummaryAccessIfNotDeleted");
		const info = sandbox.spy(Lumberjack, "info");

		const context = await resolveSummaryAccess(getArgs());

		assert.strictEqual(context.source, "alfred");
		assert.strictEqual(context.isEphemeralContainer, true);
		sinon.assert.calledOnceWithExactly(
			activate,
			tenantId,
			documentId,
			activeDocument.createTime,
			activeDocument.createTime + ttlMs,
		);
		sinon.assert.calledWithMatch(
			info,
			"HistorianSummaryDocumentOwnershipValidation",
			sinon.match({
				outcome: "allowed",
				source: "alfred",
				localOutcome: "miss",
				fallbackReason: "cleanMiss",
				activationOutcome: "created",
			}),
		);
	});

	it("proceeds when concurrent activation already created active access", async () => {
		sandbox.stub(documentManager, "readDocument").resolves({
			...activeDocument,
			isEphemeralContainer: true,
		});
		sandbox.stub(cache, "activateSummaryAccessIfNotDeleted").resolves("alreadyActive");
		const info = sandbox.spy(Lumberjack, "info");

		const context = await resolveSummaryAccess(getArgs());

		assert.strictEqual(context.isEphemeralContainer, true);
		sinon.assert.calledWithMatch(
			info,
			"HistorianSummaryDocumentOwnershipValidation",
			sinon.match({
				outcome: "allowed",
				activationOutcome: "alreadyActive",
			}),
		);
	});

	it("does not cache an Alfred-validated DC", async () => {
		sandbox.stub(documentManager, "readDocument").resolves(activeDocument);
		const activate = sandbox.spy(cache, "activateSummaryAccessIfNotDeleted");

		const context = await resolveSummaryAccess(getArgs());

		assert.strictEqual(context.isEphemeralContainer, false);
		assert.strictEqual(context.storageName, "document-storage");
		sinon.assert.notCalled(activate);
	});

	it("allows a DC when the local store read fails", async () => {
		sandbox.stub(cache, "readSummaryAccess").rejects(new Error("redis unavailable"));
		sandbox.stub(documentManager, "readDocument").resolves(activeDocument);

		const context = await resolveSummaryAccess(getArgs());

		assert.strictEqual(context.isEphemeralContainer, false);
		assert.strictEqual(context.source, "alfred");
	});

	it("rejects an EC when the local store read fails", async () => {
		sandbox.stub(cache, "readSummaryAccess").rejects(new Error("redis unavailable"));
		sandbox.stub(documentManager, "readDocument").resolves({
			...activeDocument,
			isEphemeralContainer: true,
		});

		await assert.rejects(
			resolveSummaryAccess(getArgs()),
			(error: unknown) => error instanceof NetworkError && error.code === 503,
		);
	});

	it("records malformed local state while allowing an Alfred-validated DC", async () => {
		sandbox
			.stub(cache, "readSummaryAccess")
			.rejects(
				new MalformedEphemeralSummaryAccessRecordError(
					"Malformed ephemeral summary access record.",
				),
			);
		sandbox.stub(documentManager, "readDocument").resolves(activeDocument);
		const logError = sandbox.spy(Lumberjack, "error");
		const info = sandbox.spy(Lumberjack, "info");

		assert.strictEqual((await resolveSummaryAccess(getArgs())).source, "alfred");
		sinon.assert.calledWithMatch(
			logError,
			"HistorianSummaryDocumentOwnershipValidation",
			sinon.match({
				source: "localEphemeral",
				localOutcome: "malformed",
				fallbackReason: "localDependencyError",
			}),
		);
		sinon.assert.calledWithMatch(
			info,
			"HistorianSummaryDocumentOwnershipValidation",
			sinon.match({
				source: "alfred",
				localOutcome: "malformed",
				fallbackReason: "localDependencyError",
			}),
		);
	});

	it("rejects an Alfred-validated EC after malformed local state", async () => {
		sandbox
			.stub(cache, "readSummaryAccess")
			.rejects(
				new MalformedEphemeralSummaryAccessRecordError(
					"Malformed ephemeral summary access record.",
				),
			);
		sandbox.stub(documentManager, "readDocument").resolves({
			...activeDocument,
			isEphemeralContainer: true,
		});

		await assert.rejects(
			resolveSummaryAccess(getArgs()),
			(error: unknown) => error instanceof NetworkError && error.code === 503,
		);
	});

	it("denies when atomic activation observes concurrent deletion", async () => {
		sandbox.stub(documentManager, "readDocument").resolves({
			...activeDocument,
			isEphemeralContainer: true,
		});
		sandbox.stub(cache, "activateSummaryAccessIfNotDeleted").resolves("deleted");
		const info = sandbox.spy(Lumberjack, "info");

		await assert.rejects(
			resolveSummaryAccess(getArgs()),
			(error: unknown) => error instanceof NetworkError && error.code === 404,
		);
		sinon.assert.calledWithMatch(
			info,
			"HistorianSummaryDocumentOwnershipValidation",
			sinon.match({
				outcome: "notFound",
				source: "alfred",
				localOutcome: "miss",
				fallbackReason: "cleanMiss",
				activationOutcome: "deleted",
			}),
		);
	});

	it("fails closed when atomic activation observes malformed local state", async () => {
		sandbox.stub(documentManager, "readDocument").resolves({
			...activeDocument,
			isEphemeralContainer: true,
		});
		sandbox
			.stub(cache, "activateSummaryAccessIfNotDeleted")
			.rejects(
				new MalformedEphemeralSummaryAccessRecordError(
					"Malformed ephemeral summary access record.",
				),
			);
		const logError = sandbox.spy(Lumberjack, "error");
		const info = sandbox.spy(Lumberjack, "info");

		await assert.rejects(
			resolveSummaryAccess(getArgs()),
			(error: unknown) => error instanceof NetworkError && error.code === 503,
		);
		sinon.assert.calledWithMatch(
			logError,
			"HistorianSummaryDocumentOwnershipValidation",
			sinon.match({
				outcome: "dependencyError",
				source: "localEphemeral",
				localOutcome: "malformed",
				fallbackReason: "localDependencyError",
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
		assert.strictEqual(allowedEvents.length, 0);
	});

	it("logs a write error but preserves the fresh Alfred authorization", async () => {
		sandbox.stub(documentManager, "readDocument").resolves({
			...activeDocument,
			isEphemeralContainer: true,
		});
		sandbox
			.stub(cache, "activateSummaryAccessIfNotDeleted")
			.rejects(new Error("redis unavailable"));
		const logError = sandbox.spy(Lumberjack, "error");
		const info = sandbox.spy(Lumberjack, "info");

		const context = await resolveSummaryAccess(getArgs());

		assert.strictEqual(context.source, "alfred");
		sinon.assert.calledWithMatch(
			logError,
			"HistorianSummaryDocumentOwnershipValidation",
			sinon.match({
				outcome: "dependencyError",
				source: "alfred",
				activationOutcome: "writeError",
			}),
		);
		sinon.assert.calledWithMatch(
			info,
			"HistorianSummaryDocumentOwnershipValidation",
			sinon.match({
				outcome: "allowed",
				source: "alfred",
				activationOutcome: "writeError",
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
		const properties = allowedEvents[0].args[1];
		assert.ok(!(properties instanceof Map));
		assert.strictEqual(properties.accessToken, undefined);
		assert.strictEqual(properties.authorization, undefined);
		assert.strictEqual(properties.error, undefined);
	});

	it("forwards the customer access token during Alfred fallback", async () => {
		const readDocument = sandbox.stub(documentManager, "readDocument").resolves(activeDocument);

		await resolveSummaryAccess(getArgs({ reuseCustomerAccessToken: true }));

		sinon.assert.calledOnceWithExactly(readDocument, tenantId, documentId, {
			accessToken,
		});
	});

	it("normalizes a null storage name to undefined", async () => {
		sandbox.stub(documentManager, "readDocument").resolves({
			...activeDocument,
			storageName: null,
		});

		const context = await resolveSummaryAccess(getArgs());

		assert.strictEqual(context.storageName, undefined);
	});

	for (const testCase of [
		{
			name: "tenant mismatch",
			getDocument: () => ({ ...activeDocument, tenantId: "victim" }),
		},
		{
			name: "document mismatch",
			getDocument: () => ({ ...activeDocument, documentId: "victim-id" }),
		},
		{
			name: "scheduled deletion",
			getDocument: () => ({
				...activeDocument,
				scheduledDeletionTime: "2026-07-31T18:00:00.000Z",
			}),
		},
	]) {
		it(`returns the non-disclosing denial for ${testCase.name}`, async () => {
			sandbox.stub(documentManager, "readDocument").resolves(testCase.getDocument());

			await assert.rejects(
				resolveSummaryAccess(getArgs()),
				(error: unknown) =>
					error instanceof NetworkError &&
					error.code === 404 &&
					error.message === "Document is deleted and cannot be accessed.",
			);
		});
	}

	it("retries transient Alfred failures", async () => {
		const clock = sandbox.useFakeTimers();
		const dependencyError = new NetworkError(503, "Alfred unavailable", true, false);
		const readDocument = sandbox.stub(documentManager, "readDocument");
		readDocument.onCall(0).rejects(dependencyError);
		readDocument.onCall(1).rejects(dependencyError);
		readDocument.onCall(2).rejects(dependencyError);
		readDocument.onCall(3).resolves(activeDocument);

		const resolution = resolveSummaryAccess(getArgs());
		await clock.runAllAsync();
		assert.strictEqual((await resolution).source, "alfred");
		sinon.assert.callCount(readDocument, 4);
	});

	it("does not retry a non-transient Alfred failure", async () => {
		const dependencyError = new NetworkError(
			403,
			"Alfred rejected customer token",
			false,
			true,
		);
		const readDocument = sandbox.stub(documentManager, "readDocument").rejects(dependencyError);

		await assert.rejects(resolveSummaryAccess(getArgs()), (error) => error === dependencyError);
		sinon.assert.calledOnce(readDocument);
	});

	it("propagates malformed Alfred responses as dependency errors", async () => {
		sandbox.stub(documentManager, "readDocument").resolves({
			...activeDocument,
			createTime: Number.NaN,
		});

		await assert.rejects(
			resolveSummaryAccess(getArgs()),
			(error: unknown) =>
				error instanceof NetworkError &&
				error.code === 502 &&
				error.message === "Invalid document response from Alfred.",
		);
	});

	it("rejects an expired Alfred EC", async () => {
		sandbox.stub(documentManager, "readDocument").resolves({
			...activeDocument,
			createTime: 0,
			isEphemeralContainer: true,
		});

		await assert.rejects(
			resolveSummaryAccess(getArgs({ ephemeralDocumentTTLSec: 1 })),
			(error: unknown) => error instanceof NetworkError && error.code === 404,
		);
	});

	it("bypasses local state and normalizes EC to durable when the flag is ignored", async () => {
		await cache.markSummaryAccessDeleted(
			tenantId,
			documentId,
			activeDocument.createTime,
			activeDocument.createTime + ttlMs,
		);
		const readLocal = sandbox.spy(cache, "readSummaryAccess");
		sandbox.stub(documentManager, "readDocument").resolves({
			...activeDocument,
			isEphemeralContainer: true,
		});

		const context = await resolveSummaryAccess(getArgs({ ignoreEphemeralFlag: true }));

		assert.strictEqual(context.isEphemeralContainer, false);
		assert.strictEqual(context.source, "alfred");
		sinon.assert.notCalled(readLocal);
	});

	for (const operation of ["post", "delete"] as const) {
		it(`bypasses local state for ${operation}`, async () => {
			await cache.markSummaryAccessDeleted(
				tenantId,
				documentId,
				activeDocument.createTime,
				activeDocument.createTime + ttlMs,
			);
			const readLocal = sandbox.spy(cache, "readSummaryAccess");
			sandbox.stub(documentManager, "readDocument").resolves(activeDocument);

			const context = await resolveSummaryAccess(
				getArgs({ operation, routeType: "notApplicable" }),
			);

			assert.strictEqual(context.source, "alfred");
			sinon.assert.notCalled(readLocal);
		});
	}

	it("uses Alfred when no access store is available", async () => {
		sandbox.stub(documentManager, "readDocument").resolves(activeDocument);

		const context = await resolveSummaryAccess(getArgs({ accessStore: undefined }));

		assert.strictEqual(context.source, "alfred");
	});
});
