/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { validateMessages } from "../driverUtils.js";

describe("driver utils tests", () => {
	describe("validateMessagesTests", () => {
		const mockLogger = new MockLogger();
		const generateOps = (start: number, count: number) => {
			const ops: ISequencedDocumentMessage[] = [];
			let i = 0;
			while (i < count) {
				ops.push({ sequenceNumber: start + i } as any as ISequencedDocumentMessage);
				i++;
			}
			return ops;
		};

		beforeEach(() => {
			mockLogger.clear();
		});

		it("from not equal to start", () => {
			const ops = generateOps(1, 5);
			validateMessages("test1", ops, 0, mockLogger.toTelemetryLogger(), true);
			assert(ops.length === 0, "no ops should be returned");
			assert(
				mockLogger.matchEventStrict([
					{
						eventName: "OpsFetchViolation",
						reason: "test1",
						from: 0,
						start: 1,
						last: 5,
						length: 5,
						details: JSON.stringify({
							validLength: 0,
							lastValidOpSeqNumber: undefined,
							strict: true,
						}),
					},
				]),
				"Ops fetch violation event not correctly recorded",
			);
		});

		it("contiguous ops", () => {
			const ops = generateOps(1, 5);
			validateMessages("test2", ops, 1, mockLogger.toTelemetryLogger(), true);
			assert(ops.length === 5, "ops should be returned");
			assert(mockLogger.events.length === 0, "no events should be there");
		});

		it("non contiguous ops: strict = true", () => {
			const ops = generateOps(1, 5);
			// Change seq number of last op
			ops[4].sequenceNumber = 7;
			validateMessages("test", ops, 1, mockLogger.toTelemetryLogger(), true);
			assert(ops.length === 0, "no ops should be returned as strict == true");
			assert(
				mockLogger.matchEventStrict([
					{
						eventName: "OpsFetchViolation",
						reason: "test",
						from: 1,
						start: 1,
						last: 7,
						length: 5,
						details: JSON.stringify({
							validLength: 0,
							lastValidOpSeqNumber: undefined,
							strict: true,
						}),
					},
				]),
				"Ops fetch violation event not correctly recorded",
			);
		});

		it("non contiguous ops: strict = false", () => {
			const ops = generateOps(1, 5);
			// Change seq number of last op
			ops[4].sequenceNumber = 7;
			validateMessages("test", ops, 1, mockLogger.toTelemetryLogger(), false);
			assert(ops.length === 4, "some should be returned as strict == false");
			assert(
				mockLogger.matchEventStrict([
					{
						eventName: "OpsFetchViolation",
						reason: "test",
						from: 1,
						start: 1,
						last: 7,
						length: 5,
						details: JSON.stringify({
							validLength: 4,
							lastValidOpSeqNumber: 4,
							strict: false,
						}),
					},
				]),
				"Ops fetch violation event not correctly recorded",
			);
		});

		it("only 1 op: strict = false", () => {
			const ops = generateOps(1, 1);
			validateMessages("test", ops, 1, mockLogger.toTelemetryLogger(), false);
			assert(ops.length === 1, "some should be returned as strict == false");
			assert(mockLogger.events.length === 0, "no events should be there");
		});
	});
});
