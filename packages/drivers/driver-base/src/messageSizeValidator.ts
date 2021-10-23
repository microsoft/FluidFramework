/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { IDocumentMessage } from "@fluidframework/protocol-definitions";
import { ThresholdCounter } from "@fluidframework/telemetry-utils";

export class MessageSizeValidator {
    private readonly messageSizeCounters = [
        {
            counter: new ThresholdCounter(this.maxMessageSizeInBytes / 4, this.logger),
            eventName: "LargeMessage25PercentOfMax",
        },
        {
            counter: new ThresholdCounter(this.maxMessageSizeInBytes / 2, this.logger),
            eventName: "LargeMessage50PercentOfMax",
        },
        {
            counter: new ThresholdCounter(this.maxMessageSizeInBytes, this.logger),
            eventName: "LargeMessageLimitExceeded",
        },
    ];

    constructor(
        private readonly maxMessageSizeInBytes: number,
        private readonly logger: ITelemetryLogger,
    ) {
    }

    private track(sizeInBytes: number) {
        this.messageSizeCounters.forEach((x) => x.counter.sendIfMultiple(x.eventName, sizeInBytes));
    }

    public validate(messages: IDocumentMessage[][]): boolean {
        let sizeInBytes = 0;
        for (const inner of messages) {
            for (const message of inner) {
                sizeInBytes = sizeInBytes + MessageSizeValidator.sizeInBytes(message);
            }
        }

        this.track(sizeInBytes);
        return sizeInBytes < this.maxMessageSizeInBytes;
    }

    private static sizeInBytes(message: IDocumentMessage): number {
        const { contents, ...restOfObject } = message;
        // `contents` is already stringified. Re-stringifying the whole message will
        // lead to additional escape characters which will increase the size artificially.
        return new TextEncoder().encode(message.contents).length
            + new TextEncoder().encode(JSON.stringify(restOfObject)).length;
    }
}
