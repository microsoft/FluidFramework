/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IQueuedMessage } from "@fluidframework/server-services-core";
import * as Deque from "double-ended-queue";
import { IKafkaSubscriber } from "./interfaces";

/**
 * A subscription for a single lambda
 *  todo: use context checkpoints
 */
export class LocalKafkaSubscription extends EventEmitter {
    public queueOffset: number = 0;

    private closed = false;
    private processing = false;
    private retryTimer: NodeJS.Timeout | undefined;

    constructor(private readonly subscriber: IKafkaSubscriber, private readonly queue: Deque<IQueuedMessage>) {
        super();
    }

    public close() {
        this.closed = true;

        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = undefined;
        }

        this.removeAllListeners();
    }

    public process() {
        if (this.queue.length <= this.queueOffset || this.processing || this.retryTimer !== undefined || this.closed) {
            return;
        }

        const message = this.queue.get(this.queueOffset);

        try {
            this.processing = true;

            this.subscriber.process(message);

            this.queueOffset++;

            this.emit("processed", this.queueOffset);
        } catch (ex) {
            // Lambda failed to process the message
            this.subscriber.context.error(ex, { restart: false });

            this.retryTimer = setTimeout(() => {
                this.retryTimer = undefined;
                this.process();
            }, 500);

            return;
        } finally {
            this.processing = false;
        }

        // Process the next one
        this.process();
    }
}
