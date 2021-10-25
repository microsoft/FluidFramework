/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IDocumentMessage } from "@fluidframework/protocol-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { MessageSizeValidator } from "../messageSizeValidator";

const generateStringOfSize = (size: number): string => new Array(size + 1).join("0");
const generateMessageOfSize = (size: number): IDocumentMessage => {
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
    message.contents = generateStringOfSize(size - new TextEncoder().encode(JSON.stringify(message)).length);
    return message;
};

describe("Message size validation", () => {
    let logger: MockLogger;
    let validator: MessageSizeValidator;
    const maxMessageSizeInBytes = 10 * 1000;

    beforeEach(() => {
        logger = new MockLogger();
        validator = new MessageSizeValidator(maxMessageSizeInBytes, logger);
    });

    it("Should succeed when message is lower than 25% of max - single", () => {
        assert.equal(validator.validate([[generateMessageOfSize(2 * 1000)]]), true);
        assert(logger.matchEvents([]));
    });

    it("Should succeed when message is lower than 25% of max - multiple", () => {
        assert.equal(validator.validate([[generateMessageOfSize(1 * 1000), generateMessageOfSize(1 * 1000)]]), true);
        assert(logger.matchEvents([]));
    });

    it("Should succeed when message is lower than 50% of max", async () => {
        const size = 4 * 1000;
        assert.equal(validator.validate([[generateMessageOfSize(size)]]), true);
        assert(logger.matchEvents([{
            eventName: "LargeMessage25PercentOfMax",
            category: "performance",
            value: size,
            max: maxMessageSizeInBytes,
        }]));
    });

    it("Should succeed when message is between 50% and 100% of max", () => {
        const size = 6 * 1000;
        assert.equal(validator.validate([[generateMessageOfSize(size)]]), true);
        assert(logger.matchEvents([{
            eventName: "LargeMessage50PercentOfMax",
            category: "performance",
            value: size,
            max: maxMessageSizeInBytes,
        }]));
    });

    it("Should fail when message size is higher than max - single", () => {
        const size = 10 * 1000;
        assert.equal(validator.validate([[generateMessageOfSize(size)]]), false);
        assert(logger.matchEvents([{
            eventName: "LargeMessageLimitExceeded",
            category: "performance",
            value: size,
            max: maxMessageSizeInBytes,
        }]));
    });

    it("Should fail when message size is higher than max - multiple", () => {
        const size = 10 * 1000;
        assert.equal(
            validator.validate([
                [generateMessageOfSize(size / 4), generateMessageOfSize(size / 4)],
                [generateMessageOfSize(size / 4), generateMessageOfSize(size / 4)],
            ]),
            false);
        assert(logger.matchEvents([{
            eventName: "LargeMessageLimitExceeded",
            category: "performance",
            value: size,
            max: maxMessageSizeInBytes,
        }]));
    });
});
