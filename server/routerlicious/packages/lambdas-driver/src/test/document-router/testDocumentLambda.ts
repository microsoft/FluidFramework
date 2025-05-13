/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitter } from "events";
import {
	IContext,
	IQueuedMessage,
	IPartitionLambda,
	IPartitionLambdaConfig,
	IPartitionLambdaFactory,
	ISequencedOperationMessage,
} from "@fluidframework/server-services-core";

export class TestLambda implements IPartitionLambda {
	public handleCalls = 0;

	private readonly documentId: string;
	private failHandler = false;
	private throwHandler = false;

	constructor(
		config: IPartitionLambdaConfig,
		private readonly context: IContext,
	) {
		this.documentId = config.documentId;
		assert(this.documentId);
	}

	/**
	 * {@inheritDoc IPartitionLambda.handler}
	 */
	public handler(message: IQueuedMessage): undefined {
		this.handleCalls++;
		const sequencedMessage = message.value as ISequencedOperationMessage;
		assert.equal(this.documentId, sequencedMessage.documentId);

		if (this.failHandler) {
			this.context.error("Test failure", { restart: true });
		} else if (this.throwHandler) {
			throw new Error("Test Error");
		} else {
			this.context.checkpoint(message);
		}

		return undefined;
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

	public async create(
		config: IPartitionLambdaConfig,
		context: IContext,
	): Promise<IPartitionLambda> {
		if (this.failCreatelambda) {
			throw new Error("Test failure");
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

export const create = (): IPartitionLambdaFactory => new TestLambdaFactory();

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
