/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { IDocumentMessage } from "@fluidframework/protocol-definitions";
import { ThresholdCounter } from "@fluidframework/telemetry-utils";

export class MessageSizeValidator {
    private readonly payloadSizeCountersWithEvents = [
        // The order here matters, in order to save telemetry quota.
        // The first counter to exceed its limit will short-circuit
        // event publishing.
        {
            counter: new ThresholdCounter(this.maxPayloadSizeInBytes, this.logger),
            eventName: "OpsPayloadSizeLimitExceeded",
        },
        {
            counter: new ThresholdCounter(this.maxPayloadSizeInBytes / 2, this.logger),
            eventName: "OpsPayloadSize50PcOfMax",
        },
        {
            counter: new ThresholdCounter(this.maxPayloadSizeInBytes / 4, this.logger),
            eventName: "OpsPayloadSize25PcOfMax",
        },
    ];

    private readonly messageSizeCounter = new ThresholdCounter(this.maxMessageSizeInBytes, this.logger);
    private readonly messageSizeEvent = "OpSizeLimitExceeded";

    constructor(
        private readonly maxMessageSizeInBytes: number,
        private readonly maxPayloadSizeInBytes: number,
        private readonly logger: ITelemetryLogger,
    ) {
    }

    private trackPayload(payloadSizeInBytes: number) {
        for (const x of this.payloadSizeCountersWithEvents) {
            if (x.counter.send(x.eventName, payloadSizeInBytes, { max: this.maxPayloadSizeInBytes })) {
                break;
            }
        }
    }

    private trackMessage(messageSizeInBytes: number) {
        this.messageSizeCounter.send(this.messageSizeEvent, messageSizeInBytes, { max: this.maxMessageSizeInBytes });
    }

    public validate(messages: IDocumentMessage[][]): boolean {
        let payloadSizeInBytes = 0;
        let allMessagesUnderLimit = true;

        for (const inner of messages) {
            for (const message of inner) {
                const messageSize = MessageSizeValidator.sizeInBytes(message);
                allMessagesUnderLimit &&= messageSize < this.maxMessageSizeInBytes;
                payloadSizeInBytes = payloadSizeInBytes + messageSize;
                this.trackMessage(messageSize);
            }
        }

        this.trackPayload(payloadSizeInBytes);
        return allMessagesUnderLimit && payloadSizeInBytes < this.maxPayloadSizeInBytes;
    }

    public static sizeInBytes(message: IDocumentMessage): number {
        const { contents, ...restOfObject } = message;
        // `contents` is already stringified. Re-stringifying the whole message will
        // lead to additional escape characters which will increase the size artificially.
        return new TextEncoder().encode(message.contents).length
            + new TextEncoder().encode(JSON.stringify(restOfObject)).length;
    }
}
