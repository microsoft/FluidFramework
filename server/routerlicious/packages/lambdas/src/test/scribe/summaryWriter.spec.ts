/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MessageType } from "@fluidframework/protocol-definitions";
import { SummaryWriter } from "../..";
import { TestDeltaManager, TestTenantManager } from "@fluidframework/server-test-utils";
import Sinon from "sinon";
import { strict as assert } from "assert";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import {
	ISequencedOperationMessage,
	SequencedOperationType,
} from "@fluidframework/server-services-core";

describe("Routerlicious", () => {
	describe("Scribe", () => {
		describe("SummaryWriter", () => {
			const testTenantId = "test";
			const testDocumentId = "test";
			describe("getLogTail", () => {
				let sandbox: Sinon.SinonSandbox;
				let testTenantManager: TestTenantManager;
				let testDeltaManager: TestDeltaManager;
				let testGitManager: any;
				const opStorage = undefined;
				const enableWholeSummaryUpload = true;
				const getDeltasViaAlfred = true;
				beforeEach(async () => {
					sandbox = Sinon.createSandbox();
					testTenantManager = new TestTenantManager();
					testDeltaManager = new TestDeltaManager();
					testGitManager = await testTenantManager.getTenantGitManager(
						testTenantId,
						testDocumentId,
					);
				});

				afterEach(async () => {
					sandbox.restore();
				});
				it("Should not try fetch remote if current summary fill the range", async () => {
					const lastSummaryMessages = generateOps(1, 10, 1).map((op) => op.operation);
					const testingSummaryWriter = new SummaryWriter(
						testTenantId,
						testDocumentId,
						testGitManager,
						testDeltaManager,
						opStorage,
						enableWholeSummaryUpload,
						lastSummaryMessages,
						getDeltasViaAlfred,
					);
					const lumberJackSpy = sandbox.spy(Lumberjack, "info");
					const deltaServiceSpy = sandbox.spy(testDeltaManager, "getDeltas");
					const result = await testingSummaryWriter["getLogTail"](0, 11, []);
					assert.strictEqual(
						JSON.stringify(result.map((op) => op.sequenceNumber)),
						JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
					);
					assert.strictEqual(false, deltaServiceSpy.called);
					const logMessage = lumberJackSpy.getCalls()[0].args[0];
					assert.strictEqual(
						"LogTail of length 10 fetched from seq no 0 to 11",
						logMessage,
					);
					const logProperties = lumberJackSpy.getCalls()[0].args[1];
					verifyLogResult(
						logMessage,
						logProperties,
						"LogTail of length 10 fetched from seq no 0 to 11",
						[[1, 10]],
						[],
						[[1, 10]],
						[],
						[],
						[[1, 10]],
					);
				});

				it("Should not try fetch remote if pending ops fill the range", async () => {
					const pendingOps = generateOps(1, 10, 1);
					const testingSummaryWriter = new SummaryWriter(
						testTenantId,
						testDocumentId,
						testGitManager,
						testDeltaManager,
						opStorage,
						enableWholeSummaryUpload,
						[],
						getDeltasViaAlfred,
					);
					const lumberJackSpy = sandbox.spy(Lumberjack, "info");
					const deltaServiceSpy = sandbox.spy(testDeltaManager, "getDeltas");
					const result = await testingSummaryWriter["getLogTail"](0, 11, pendingOps);
					assert.strictEqual(
						JSON.stringify(result.map((op) => op.sequenceNumber)),
						JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
					);
					assert.strictEqual(false, deltaServiceSpy.called);
					const logMessage = lumberJackSpy.getCalls()[0].args[0];
					const logProperties = lumberJackSpy.getCalls()[0].args[1];
					verifyLogResult(
						logMessage,
						logProperties,
						"LogTail of length 10 fetched from seq no 0 to 11",
						[],
						[[1, 10]],
						[[1, 10]],
						[],
						[],
						[[1, 10]],
					);
				});

				it("Should not try fetch remote if current summary and pending ops work together fill the range", async () => {
					const lastSummaryMessages = generateOps(1, 6, 1).map((op) => op.operation);
					const pendingOps = generateOps(4, 10, 1);
					const testingSummaryWriter = new SummaryWriter(
						testTenantId,
						testDocumentId,
						testGitManager,
						testDeltaManager,
						opStorage,
						enableWholeSummaryUpload,
						lastSummaryMessages,
						getDeltasViaAlfred,
					);
					const lumberJackSpy = sandbox.spy(Lumberjack, "info");
					const deltaServiceSpy = sandbox.spy(testDeltaManager, "getDeltas");
					const result = await testingSummaryWriter["getLogTail"](0, 11, pendingOps);
					assert.strictEqual(
						JSON.stringify(result.map((op) => op.sequenceNumber)),
						JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
					);
					assert.strictEqual(false, deltaServiceSpy.called);
					const logMessage = lumberJackSpy.getCalls()[0].args[0];
					const logProperties = lumberJackSpy.getCalls()[0].args[1];
					verifyLogResult(
						logMessage,
						logProperties,
						"LogTail of length 10 fetched from seq no 0 to 11",
						[[1, 6]],
						[[4, 10]],
						[[1, 10]],
						[],
						[],
						[[1, 10]],
					);
				});

				it("Should try fetch remote if current summary and pending ops work together not able to fill the range", async () => {
					const lastSummaryMessages = generateOps(1, 3, 1).map((op) => op.operation);
					const pendingOps = generateOps(7, 10, 1);
					const testingSummaryWriter = new SummaryWriter(
						testTenantId,
						testDocumentId,
						testGitManager,
						testDeltaManager,
						opStorage,
						enableWholeSummaryUpload,
						lastSummaryMessages,
						getDeltasViaAlfred,
					);
					const lumberJackSpy = sandbox.spy(Lumberjack, "info");
					const mockDeltas = generateOps(4, 4, 1).concat(generateOps(6, 6, 1));
					const deltaManagerStub = sandbox
						.stub(testDeltaManager, "getDeltas")
						.resolves(mockDeltas.map((op) => op.operation));
					const result = await testingSummaryWriter["getLogTail"](0, 11, pendingOps);
					assert.strictEqual(
						JSON.stringify(result.map((op) => op.sequenceNumber)),
						JSON.stringify([1, 2, 3, 4, 6, 7, 8, 9, 10]),
					);
					assert.strictEqual(true, deltaManagerStub.calledOnce);
					const logMessage = lumberJackSpy.getCalls()[0].args[0];
					const logProperties = lumberJackSpy.getCalls()[0].args[1];
					verifyLogResult(
						logMessage,
						logProperties,
						"LogTail of length 9 fetched from seq no 0 to 11",
						[[1, 3]],
						[[7, 10]],
						[
							[1, 3],
							[7, 10],
						],
						[[4, 6]],
						[
							[
								[4, 4],
								[6, 6],
							],
						],
						[
							[1, 4],
							[6, 10],
						],
					);
				});

				it("Should try fetch remote if current summary and pending ops work together not able to fill the range, dedupe and preserve the order", async () => {
					const lastSummaryMessages = generateOps(1, 1, 1)
						.concat(generateOps(3, 4, 1))
						.map((op) => op.operation);
					const pendingOps = generateOps(7, 10, 1);
					const testingSummaryWriter = new SummaryWriter(
						testTenantId,
						testDocumentId,
						testGitManager,
						testDeltaManager,
						opStorage,
						enableWholeSummaryUpload,
						lastSummaryMessages,
						getDeltasViaAlfred,
					);
					const lumberJackSpy = sandbox.spy(Lumberjack, "info");
					const mockDeltas = generateOps(2, 8, 1);
					const deltaManagerStub = sandbox
						.stub(testDeltaManager, "getDeltas")
						.resolves(mockDeltas.map((op) => op.operation));
					const result = await testingSummaryWriter["getLogTail"](0, 11, pendingOps);
					assert.strictEqual(
						JSON.stringify(result.map((op) => op.sequenceNumber)),
						JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
					);
					assert.strictEqual(true, deltaManagerStub.calledTwice);
					const logMessage = lumberJackSpy.getCalls()[0].args[0];
					const logProperties = lumberJackSpy.getCalls()[0].args[1];
					verifyLogResult(
						logMessage,
						logProperties,
						"LogTail of length 10 fetched from seq no 0 to 11",
						[
							[1, 1],
							[3, 4],
						],
						[[7, 10]],
						[
							[1, 1],
							[3, 4],
							[7, 10],
						],
						[
							[2, 2],
							[5, 6],
						],
						[[[2, 8]], [[2, 8]]],
						[[1, 10]],
					);
				});
			});
		});
	});
});

function generateOps(
	fromInclusive: number,
	toInclusive: number,
	step: number,
): ISequencedOperationMessage[] {
	return Array.from(
		{ length: (toInclusive - fromInclusive) / step + 1 },
		(_, i) => fromInclusive + i * step,
	).map(
		(sequenceNumber) =>
			({
				type: SequencedOperationType,
				operation: {
					clientId: "Some client ID",
					clientSequenceNumber: sequenceNumber,
					minimumSequenceNumber: 0,
					sequenceNumber: sequenceNumber,
					type: MessageType.Operation,
				},
			}) as ISequencedOperationMessage,
	);
}

function verifyLogResult(
	actualLogMessage: string,
	actualLogProperties: any,
	expectedLogMessage: string,
	expectedLogtailRangeFromLastSummary: number[][],
	expectedLogtailRangeFromPending: number[][],
	expectedLogtailRangeFromMemory: number[][],
	expectedLogtailGaps: number[][],
	expectedRetrievedGapsRange: number[][][],
	expectedFinalLogtailRange: number[][],
) {
	assert.strictEqual(actualLogMessage, expectedLogMessage);
	assert.deepStrictEqual(
		actualLogProperties["logtailRangeFromLastSummary"],
		expectedLogtailRangeFromLastSummary,
	);
	assert.deepStrictEqual(
		actualLogProperties["logtailRangeFromPending"],
		expectedLogtailRangeFromPending,
	);
	assert.deepStrictEqual(
		actualLogProperties["logtailRangeFromMemory"],
		expectedLogtailRangeFromMemory,
	);
	assert.deepStrictEqual(actualLogProperties["logtailGaps"], expectedLogtailGaps);
	assert.deepStrictEqual(actualLogProperties["retrievedGapsRange"], expectedRetrievedGapsRange);
	assert.deepStrictEqual(actualLogProperties["finalLogtailRange"], expectedFinalLogtailRange);
}
