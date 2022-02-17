/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import EventEmitter from "events";
import { BatchTracker } from "../batchTracker";

describe("Runtime", () => {
    const emitter = new EventEmitter();
    let mockLogger: MockLogger;

    beforeEach(async () => {
        mockLogger = new MockLogger();
    });

    it("Track only batches with op count over a threshold", async () => {
        let ticks = 0;
        new BatchTracker(emitter, mockLogger, 5, 100, () => ticks);

        emitter.emit("batchBegin", batchMessage(1))
        emitter.emit("batchEnd", /* error */ undefined, batchMessage(5));

        emitter.emit("batchBegin", batchMessage(1))
        ticks += 10;
        emitter.emit("batchEnd", /* error */ undefined, batchMessage(6));

        emitter.emit("batchBegin", batchMessage(1))
        ticks += 20;
        emitter.emit("batchEnd", new Error(), batchMessage(8));

        mockLogger.assertMatch([
            {
                eventName: "Batching:TooManyOps",
                opCount: 5,
                referenceSequenceNumber: 6,
                batchEndSequenceNumber: 6,
                timeSpanMs: 10,
                batchError: false,
                category: "error",
            }, {
                eventName: "Batching:TooManyOps",
                opCount: 7,
                referenceSequenceNumber: 8,
                batchEndSequenceNumber: 8,
                timeSpanMs: 20,
                batchError: true,
                category: "error",
            },
        ]);
    });

    it("Track batch sizes based on rate", async () => {
        let ticks = 0;
        new BatchTracker(emitter, mockLogger, 100, 3, () => ticks);

        for (let i = 1; i <= 10; i++) {
            emitter.emit("batchBegin", batchMessage(1))
            ticks += i;
            emitter.emit("batchEnd", /* error */ undefined, batchMessage(1 + i));
        }

        mockLogger.assertMatch([
            {
                eventName: "Batching:OpCount",
                opCount: 3,
                referenceSequenceNumber: 4,
                batchEndSequenceNumber: 4,
                timeSpanMs: 3,
                category: "performance",
            }, {
                eventName: "Batching:OpCount",
                opCount: 6,
                referenceSequenceNumber: 7,
                batchEndSequenceNumber: 7,
                timeSpanMs: 6,
                category: "performance",
            }, {
                eventName: "Batching:OpCount",
                opCount: 9,
                referenceSequenceNumber: 10,
                batchEndSequenceNumber: 10,
                timeSpanMs: 9,
                category: "performance",
            },
        ]);
    });

    const batchMessage = (sequenceNumber: number): ISequencedDocumentMessage => ({
        sequenceNumber,
        referenceSequenceNumber: sequenceNumber,
    } as ISequencedDocumentMessage)
});
