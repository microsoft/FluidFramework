/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IContext,
    IKafkaMessage,
    IPartitionLambda,
    IPartitionLambdaFactory,
    ISequencedOperationMessage,
} from "@microsoft/fluid-server-services-core";
import * as assert from "assert";
import { EventEmitter } from "events";
import { Provider } from "nconf";

export class TestLambda implements IPartitionLambda {
    public handleCalls = 0;

    private documentId: string;
    private failHandler = false;
    private throwHandler = false;

    constructor(config: Provider, private context: IContext) {
        this.documentId = config.get("documentId");
        assert(this.documentId);
    }

    public handler(message: IKafkaMessage): void {
        this.handleCalls++;
        const sequencedMessage = message.value as ISequencedOperationMessage;
        assert.equal(this.documentId, sequencedMessage.documentId);

        if (this.failHandler) {
            this.context.error("Test failure", true);
        } else if (this.throwHandler) {
            throw new Error("Test Error");
        } else {
            this.context.checkpoint(message.offset);
        }
    }

    public close() {
        return;
    }

    public setThrowExceptionInHandler(value: boolean) {
        this.throwHandler = value;
    }

    public setFailHandlers(value: boolean) {
        this.failHandler = value;
    }
}

export class TestLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    public lambdas: TestLambda[] = [];
    public disposed = false;
    private failCreatelambda = false;

    constructor() {
        super();
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        if (this.failCreatelambda) {
            return Promise.reject("Test failure");
        } else {
            const lambda = new TestLambda(config, context);
            this.lambdas.push(lambda);
            return lambda;
        }
    }

    public async dispose(): Promise<void> {
        this.disposed = true;
        return;
    }

    public setFailCreateLambda(value: boolean) {
        this.failCreatelambda = value;
    }

    public setThrowExceptionInHandler(value: boolean) {
        for (const lambda of this.lambdas) {
            lambda.setThrowExceptionInHandler(value);
        }
    }

    public setFailHandlers(value: boolean) {
        for (const lambda of this.lambdas) {
            lambda.setFailHandlers(value);
        }
    }
}

export function create(config: Provider): IPartitionLambdaFactory {
    return new TestLambdaFactory();
}

export interface ITestLambdaModule {
    create: () => TestLambdaFactory;
    factories: TestLambdaFactory[];
}

export function createTestModule(): ITestLambdaModule {
    const factories: TestLambdaFactory[] = [];
    return {
        create: () => {
            const factory = new TestLambdaFactory();
            factories.push(factory);
            return factory;
        },
        factories,
    };
}
