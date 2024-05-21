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
	IPartitionLambdaFactory,
	IContextErrorData,
} from "@fluidframework/server-services-core";

export class TestLambda implements IPartitionLambda {
	private lastOffset: number;

	constructor(
		private readonly factory: TestPartitionLambdaFactory,
		private readonly throwHandler: boolean,
		private readonly context: IContext,
	) {}

	/**
	 * {@inheritDoc IPartitionLambda.handler}
	 */
	public handler(message: IQueuedMessage): undefined {
		if (this.throwHandler) {
			throw new Error("Requested failure");
		}

		assert.ok(this.lastOffset === undefined || this.lastOffset + 1 === message.offset);
		this.lastOffset = message.offset;
		this.factory.handleCount++;
		this.context.checkpoint(message);

		return undefined;
	}

	public close(): void {
		return;
	}

	public error(error: string, errorData: IContextErrorData) {
		this.context.error(error, errorData);
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

	public async create(config: undefined, context: IContext): Promise<IPartitionLambda> {
		if (this.failCreate) {
			throw new Error("Set to fail create");
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
	public closeLambdas(error: string, errorData: IContextErrorData) {
		for (const lambda of this.lambdas) {
			lambda.error(error, errorData);
		}
	}
}
