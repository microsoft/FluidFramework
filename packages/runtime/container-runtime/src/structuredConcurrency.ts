/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createScope,
	ensure,
	sleep,
	suspend,
	type Operation,
	type Scope,
	type Task,
} from "effection";

type CleanupFn = () => void;

export class EffectionScope {
	private readonly scope: Scope;
	private readonly destroy: () => Promise<void>;
	private closed = false;

	public constructor() {
		[this.scope, this.destroy] = createScope();
	}

	public run<T>(operation: () => Operation<T>): Task<T> {
		return this.scope.run(operation);
	}

	public addCleanup(cleanup: CleanupFn): void {
		this.scope.run(function* () {
			yield* ensure(function* () {
				cleanup();
			});
			yield* suspend();
		});
	}

	public async close(): Promise<void> {
		if (this.closed) {
			return;
		}
		this.closed = true;
		await this.destroy();
	}
}

export class EffectionTimer {
	private task: Task<void> | undefined;

	public constructor(
		private readonly scope: EffectionScope,
		private readonly defaultTimeoutMs: number,
		private readonly defaultCallback: () => void,
	) {}

	public get hasTimer(): boolean {
		return this.task !== undefined;
	}

	public start(
		timeoutMs: number = this.defaultTimeoutMs,
		callback: () => void = this.defaultCallback,
	): void {
		this.clear();
		this.task = this.scope.run(function* () {
			yield* sleep(timeoutMs);
			callback();
		});
	}

	public restart(
		timeoutMs: number = this.defaultTimeoutMs,
		callback: () => void = this.defaultCallback,
	): void {
		this.start(timeoutMs, callback);
	}

	public clear(): void {
		if (this.task === undefined) {
			return;
		}
		this.task.halt();
		this.task = undefined;
	}
}
