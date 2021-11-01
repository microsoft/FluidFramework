/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IDocumentMessage } from "@fluidframework/protocol-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { MessageSizeValidator } from "../messageSizeValidator";

const generateStringOfSize = (sizeInBytes: number): string => new Array(sizeInBytes + 1).join("0");
const generateMessageOfSize = (sizeInBytes: number): IDocumentMessage => {
    const envelope = {
        clientSequenceNumber: 1,
        metadata: {
            meta: "data",
            other: "data",
        },
        referenceSequenceNumber: 0,
        type: "test",
    };

    const message = (envelope as IDocumentMessage);
    message.contents = generateStringOfSize(sizeInBytes - new TextEncoder().encode(JSON.stringify(message)).length);
    return message;
};

describe("Message size validation", () => {
    let logger: MockLogger;
    let validator: MessageSizeValidator;
    const maxMessageSizeInBytes = 10 * 1000;
    const maxPayloadSizeInBytes = 100 * maxMessageSizeInBytes;

    beforeEach(() => {
        logger = new MockLogger();
        validator = new MessageSizeValidator(maxMessageSizeInBytes, maxPayloadSizeInBytes, logger);
    });

    it("Should fail when message size is max", () => {
        assert(!validator.validate([[generateMessageOfSize(maxMessageSizeInBytes)]]));
        assert(logger.matchEvents([{
            eventName: "OpSizeLimitExceeded",
            category: "performance",
            value: maxMessageSizeInBytes,
            max: maxMessageSizeInBytes,
        }]));
    });

    it("Should succeed when payload is lower than 25% of max", () => {
        assert(validator.validate([[generateMessageOfSize(maxMessageSizeInBytes - 1)]]));
        assert(logger.matchEvents([]));
    });

    it("Should succeed when payload is lower than 50% of max", async () => {
        const size = 26 * (maxMessageSizeInBytes - 1);
        assert(validator.validate([Array(26).fill(generateMessageOfSize(maxMessageSizeInBytes - 1))]));
        assert(logger.matchEvents([{
            eventName: "OpsPayloadSize25PcOfMax",
            category: "performance",
            value: size,
            max: maxPayloadSizeInBytes,
        }]));
    });

    it("Should succeed when payload is between 50% and 100% of max", () => {
        const size = 51 * (maxMessageSizeInBytes - 1);
        assert(validator.validate([Array(51).fill(generateMessageOfSize(maxMessageSizeInBytes - 1))]));
        assert(logger.matchEvents([{
            eventName: "OpsPayloadSize50PcOfMax",
            category: "performance",
            value: size,
            max: maxPayloadSizeInBytes,
        }]));
    });

    it("Should fail when payload size is higher than max", () => {
        const size = 101 * (maxMessageSizeInBytes - 1);
        assert(!validator.validate([Array(101).fill(generateMessageOfSize(maxMessageSizeInBytes - 1))]));
        assert(logger.matchEvents([{
            eventName: "OpsPayloadSizeLimitExceeded",
            category: "performance",
            value: size,
            max: maxPayloadSizeInBytes,
        }]));
    });

    it("Should fail when payload size is higher than max and message is larger than max", () => {
        const size = 100 * (maxMessageSizeInBytes);
        assert(!validator.validate([Array(100).fill(generateMessageOfSize(maxMessageSizeInBytes))]));
        assert(logger.matchEvents([{
            eventName: "OpSizeLimitExceeded",
            category: "performance",
            value: maxMessageSizeInBytes,
            max: maxMessageSizeInBytes,
        }, {
            eventName: "OpsPayloadSizeLimitExceeded",
            category: "performance",
            value: size,
            max: maxPayloadSizeInBytes,
        }]));
    });
});
