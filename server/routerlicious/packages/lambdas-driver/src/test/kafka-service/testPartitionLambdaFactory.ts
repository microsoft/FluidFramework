/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { EventEmitter } from "events";
import {
    IContext,
    IQueuedMessage,
    IPartitionLambda,
    IPartitionLambdaFactory,
} from "@fluidframework/server-services-core";
import { Provider } from "nconf";

export class TestLambda implements IPartitionLambda {
    private lastOffset: number;

    constructor(
        private readonly factory: TestPartitionLambdaFactory,
        private readonly throwHandler: boolean,
        private readonly context: IContext) {
    }

    public handler(message: IQueuedMessage): void {
        if (this.throwHandler) {
            throw new Error("Requested failure");
        }

        assert.ok((this.lastOffset === undefined) || (this.lastOffset + 1 === message.offset));
        this.lastOffset = message.offset;
        this.factory.handleCount++;
        this.context.checkpoint(message);
    }

    public close(): void {
        return;
    }

    public error(error: string, restart: boolean) {
        this.context.error(error, restart);
    }
}

export class TestPartitionLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    public handleCount = 0;
    private failCreate = false;
    private throwHandler = false;
    private readonly lambdas: TestLambda[] = [];

    constructor() {
        super();
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        if (this.failCreate) {
            return Promise.reject("Set to fail create");
        }

        const lambda = new TestLambda(this, this.throwHandler, context);
        this.lambdas.push(lambda);
        return lambda;
    }

    public async dispose(): Promise<void> {
        return;
    }

    public setFailCreate(value: boolean) {
        this.failCreate = value;
    }

    public setThrowHandler(value: boolean) {
        this.throwHandler = value;
    }

    /**
     * Closes all created lambdas
     */
    public closeLambdas(error: string, restart: boolean) {
        for (const lambda of this.lambdas) {
            lambda.error(error, restart);
        }
    }
}
