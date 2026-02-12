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

/**
 * Wraps a structured concurrency scope into a class-based interface suitable
 * for integration with existing imperative lifecycle patterns.
 *
 * Provides three key capabilities:
 * - `run()`: Execute an operation within this scope
 * - `addCleanup()`: Register a synchronous cleanup function that runs on scope close
 * - `close()`: Destroy the scope, halting all tasks and running all cleanups
 */
export class SafeScope {
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
		// Task is intentionally spawned into the scope's lifetime; awaiting it would
		// block forever (it calls suspend()). The scope owns the task and tears it down on close().
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		this.scope.run(function* () {
			yield* ensure(() => {
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

/**
 * Timer implementation backed by structured concurrency sleep.
 * Timers are automatically cancelled when their owning scope closes.
 */
export class SafeTimer {
	private task: Task<void> | undefined;

	public constructor(
		private readonly scope: SafeScope,
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
		const clearTask = (): void => {
			this.task = undefined;
		};
		this.task = this.scope.run(function* () {
			yield* sleep(timeoutMs);
			// Clear task reference before invoking the callback so that hasTimer
			// returns false during re-entrant scheduling (matching setTimeout behavior
			// where the timer id is invalid after the callback fires).
			clearTask();
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
		// We only need to initiate the halt; the scope's structured concurrency
		// guarantees proper teardown regardless of whether we await the result.
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		this.task.halt();
		this.task = undefined;
	}
}

// ── Bridge utilities ─────────────────────────────────────────────────────────

/**
 * Creates an AbortController that automatically aborts when the owning
 * scope closes. This bridges cooperative cancellation with existing
 * AbortSignal-based patterns.
 *
 * @param scope - The SafeScope that owns this controller's lifetime.
 * @returns An AbortController that will abort when `scope.close()` is called.
 */
export function createScopedAbortController(scope: SafeScope): AbortController {
	const controller = new AbortController();
	scope.addCleanup(() => {
		if (!controller.signal.aborted) {
			controller.abort("Scope closed");
		}
	});
	return controller;
}

/**
 * Creates a promise that resolves after a delay, but rejects if the owning
 * scope closes first. This is a scope-aware replacement for
 * `new Promise(resolve => setTimeout(resolve, delayMs))`.
 *
 * @param scope - The SafeScope that can cancel this delay.
 * @param delayMs - Delay in milliseconds.
 * @returns Promise that resolves after delay or rejects on scope cancellation.
 */
export async function createScopedDelay(scope: SafeScope, delayMs: number): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const timeoutId = setTimeout(resolve, delayMs);
		scope.addCleanup(() => {
			clearTimeout(timeoutId);
			reject(new Error("Delay cancelled by scope closure"));
		});
	});
}
