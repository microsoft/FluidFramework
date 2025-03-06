/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitter } from "events";
import { Deferred } from "@fluidframework/server-common-utils";
import {
	IContext,
	IQueuedMessage,
	ILogger,
	IContextErrorData,
} from "@fluidframework/server-services-core";
import { Lumberjack, TestEngine1 } from "@fluidframework/server-services-telemetry";
import { DebugLogger } from "./logger";

interface IWaitOffset {
	deferred: Deferred<void>;
	value: number;
}

/**
 * @internal
 */
export class TestContext extends EventEmitter implements IContext {
	public offset: number = -1;
	private waits: IWaitOffset[] = [];

	constructor(public readonly log: ILogger = DebugLogger.create("fluid-server:TestContext")) {
		super();
		const lumberjackEngine = new TestEngine1();

		if (!Lumberjack.isSetupCompleted()) {
			Lumberjack.setup([lumberjackEngine]);
		}
	}

	public checkpoint(queuedMessage: IQueuedMessage) {
		assert(queuedMessage.offset > this.offset, `${queuedMessage.offset} > ${this.offset}`);
		this.offset = queuedMessage.offset;

		// Use filter to update the waiting array and also trigger the callback for those that are filtered out
		this.waits = this.waits.filter((wait) => {
			if (wait.value <= queuedMessage.offset) {
				wait.deferred.resolve();
				return false;
			} else {
				return true;
			}
		});
	}

	public error(error: any, errorData: IContextErrorData) {
		this.emit("error", error, errorData);
	}

	public async waitForOffset(value: number): Promise<void> {
		if (value <= this.offset) {
			return;
		}

		const deferred = new Deferred<void>();
		this.waits.push({ deferred, value });
		return deferred.promise;
	}

	public getContextError() {
		return;
	}

	public pause(offset: number, reason?: any): void {
		this.emit("pause", offset, reason);
	}

	public resume(): void {
		this.emit("resume");
	}
}
