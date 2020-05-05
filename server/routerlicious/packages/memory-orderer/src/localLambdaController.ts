/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IContext, IQueuedMessage, IPartitionLambda } from "@microsoft/fluid-server-services-core";
import { IKafkaSubscriber, ILocalOrdererSetup } from "./interfaces";
import { LocalKafka } from "./localKafka";

/**
 * Controls lambda startups and subscriptions for localOrderer
 */
export class LocalLambdaController extends EventEmitter implements IKafkaSubscriber {
    public lambda: IPartitionLambda | undefined;

    private closed = false;
    private startTimer: NodeJS.Timeout | undefined;

    constructor(
        private readonly kafaka: LocalKafka,
        private readonly setup: ILocalOrdererSetup,
        public readonly context: IContext,
        private readonly starter: (setup: ILocalOrdererSetup, context: IContext) => Promise<IPartitionLambda>) {
        super();
        this.kafaka.subscribe(this);
    }

    public async start() {
        if (this.closed) {
            return;
        }

        try {
            this.lambda = await this.starter(this.setup, this.context);

            this.emit("started", this.lambda);

            if (this.closed) {
                // Close was probably called while starting
                this.close();
            }
        } catch (ex) {
            // In the event a lambda fails to start, retry it
            this.context.error(ex, true);

            this.startTimer = setTimeout(() => {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                this.start();
            }, 5000);
        }
    }

    public close() {
        this.closed = true;

        if (this.lambda) {
            this.lambda.close();
            this.lambda = undefined;
        }

        if (this.startTimer !== undefined) {
            clearTimeout(this.startTimer);
            this.startTimer = undefined;
        }

        this.removeAllListeners();
    }

    public process(message: IQueuedMessage): void {
        if (!this.lambda) {
            throw new Error("The lambda has not started yet");
        }

        this.lambda.handler(message);
    }
}
