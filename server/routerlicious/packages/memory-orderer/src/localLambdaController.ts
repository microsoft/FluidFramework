/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IContext, IQueuedMessage, IPartitionLambda, LambdaCloseType } from "@fluidframework/server-services-core";
import { IKafkaSubscriber, ILocalOrdererSetup } from "./interfaces";
import { LocalKafka } from "./localKafka";

export type LocalLambdaControllerState = "created" | "starting" | "started" | "closed";

/**
 * Controls lambda startups and subscriptions for localOrderer
 */
export class LocalLambdaController extends EventEmitter implements IKafkaSubscriber {
    public lambda: IPartitionLambda | undefined;

    private _state: LocalLambdaControllerState = "created";
    private startTimer: NodeJS.Timeout | undefined;

    constructor(
        private readonly kafaka: LocalKafka,
        private readonly setup: ILocalOrdererSetup,
        public readonly context: IContext,
        private readonly starter: (setup: ILocalOrdererSetup, context: IContext) => Promise<IPartitionLambda>) {
        super();
        this.kafaka.subscribe(this);
    }

    public get state() {
        return this._state;
    }

    public async start() {
        if (this._state === "closed") {
            return;
        }
        try {
            this.lambda = await this.starter(this.setup, this.context);
            if (this._state === "created") {
                this._state = "started";
            }
            this.emit("started", this.lambda);
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            if (this._state === "closed") {
                // Close was probably called while starting
                this.close();
            }
        } catch (ex) {
            // In the event a lambda fails to start, retry it
            this.context.error(ex, { restart: true });

            this.startTimer = setTimeout(() => {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                this.start();
            }, 5000);
        }
    }

    public close() {
        this._state = "closed";

        if (this.lambda) {
            this.lambda.close(LambdaCloseType.Stop);
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
