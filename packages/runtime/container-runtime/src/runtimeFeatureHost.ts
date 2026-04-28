/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	RuntimeFeatureHost,
	RuntimeFeatureLifecyclePhase,
} from "@fluidframework/runtime-definitions/internal";

/**
 * Concrete {@link RuntimeFeatureHost} used internally by `ContainerRuntime`.
 *
 * @remarks
 * Subsystems receive a host reference and register lifecycle callbacks against
 * it. The runtime drives the lifecycle by invoking {@link RuntimeFeatureHostImpl.runPhase};
 * each phase fans out to its registered callbacks in registration order.
 *
 * A given phase may be invoked at most once during a runtime's lifetime, with
 * the exception of `connect`/`disconnect` which alternate. Calling a one-shot
 * phase a second time throws.
 *
 * Subsystem registration must happen before the corresponding phase fires.
 * Registering a callback for a phase that has already fired throws — the
 * subsystem is too late.
 *
 * @internal
 */
export class RuntimeFeatureHostImpl implements RuntimeFeatureHost {
	private readonly callbacks: Map<
		RuntimeFeatureLifecyclePhase,
		(() => void | Promise<void>)[]
	> = new Map();

	/** Phases that fire at most once during a runtime lifetime. */
	private static readonly oneShotPhases: ReadonlySet<RuntimeFeatureLifecyclePhase> = new Set([
		"construct",
		"loadFromSnapshot",
		"loadPendingAttachments",
		"applyStashedOps",
		"ready",
		"dispose",
	]);

	private readonly firedOneShots: Set<RuntimeFeatureLifecyclePhase> = new Set();

	public on(phase: RuntimeFeatureLifecyclePhase, callback: () => void | Promise<void>): void {
		if (RuntimeFeatureHostImpl.oneShotPhases.has(phase) && this.firedOneShots.has(phase)) {
			throw new Error(
				`RuntimeFeatureHost: cannot register for phase "${phase}" — phase has already fired.`,
			);
		}
		const list = this.callbacks.get(phase);
		if (list === undefined) {
			this.callbacks.set(phase, [callback]);
		} else {
			list.push(callback);
		}
	}

	/**
	 * Invoke all registered callbacks for `phase` in registration order. Awaits
	 * each (callbacks may be sync or async). On exception, the remaining
	 * callbacks for the phase are still invoked, and the first error is
	 * rethrown after all callbacks have run.
	 */
	public async runPhase(phase: RuntimeFeatureLifecyclePhase): Promise<void> {
		if (RuntimeFeatureHostImpl.oneShotPhases.has(phase) && this.firedOneShots.has(phase)) {
			throw new Error(
				`RuntimeFeatureHost: phase "${phase}" has already fired — cannot run again.`,
			);
		}
		if (RuntimeFeatureHostImpl.oneShotPhases.has(phase)) {
			this.firedOneShots.add(phase);
		}
		const list = this.callbacks.get(phase) ?? [];
		let firstError: Error | undefined;
		for (const cb of list) {
			try {
				await cb();
			} catch (error) {
				firstError ??= error instanceof Error ? error : new Error(String(error));
			}
		}
		if (firstError !== undefined) {
			throw firstError;
		}
	}
}
