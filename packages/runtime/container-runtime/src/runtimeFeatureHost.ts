/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	OneShotLifecyclePhase,
	RepeatingLifecyclePhase,
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
 * The phase set splits into two kinds:
 *
 * - One-shot phases (registered via {@link RuntimeFeatureHostImpl.once}) fire exactly once per runtime lifetime. Registering after the phase has already fired throws.
 * - Repeating phases (registered via {@link RuntimeFeatureHostImpl.on}) — the `connect`/`disconnect` pair — may fire any number of times.
 *
 * @internal
 */
export class RuntimeFeatureHostImpl implements RuntimeFeatureHost {
	private readonly onceCallbacks: Map<OneShotLifecyclePhase, (() => void | Promise<void>)[]> =
		new Map();

	private readonly onCallbacks: Map<RepeatingLifecyclePhase, (() => void | Promise<void>)[]> =
		new Map();

	private readonly firedOneShots: Set<OneShotLifecyclePhase> = new Set();

	public once(phase: OneShotLifecyclePhase, callback: () => void | Promise<void>): void {
		if (this.firedOneShots.has(phase)) {
			throw new Error(
				`RuntimeFeatureHost: cannot register for phase "${phase}" — phase has already fired.`,
			);
		}
		const list = this.onceCallbacks.get(phase);
		if (list === undefined) {
			this.onceCallbacks.set(phase, [callback]);
		} else {
			list.push(callback);
		}
	}

	public on(phase: RepeatingLifecyclePhase, callback: () => void | Promise<void>): void {
		const list = this.onCallbacks.get(phase);
		if (list === undefined) {
			this.onCallbacks.set(phase, [callback]);
		} else {
			list.push(callback);
		}
	}

	/**
	 * Invoke all registered callbacks for `phase` in registration order. Awaits
	 * each (callbacks may be sync or async). On exception, the remaining
	 * callbacks for the phase are still invoked, and the first error is
	 * rethrown after all callbacks have run.
	 *
	 * One-shot phases throw if invoked a second time.
	 */
	public async runPhase(phase: RuntimeFeatureLifecyclePhase): Promise<void> {
		const list = this.getCallbacks(phase);
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

	private getCallbacks(
		phase: RuntimeFeatureLifecyclePhase,
	): readonly (() => void | Promise<void>)[] {
		if (RuntimeFeatureHostImpl.isOneShot(phase)) {
			if (this.firedOneShots.has(phase)) {
				throw new Error(
					`RuntimeFeatureHost: phase "${phase}" has already fired — cannot run again.`,
				);
			}
			this.firedOneShots.add(phase);
			return this.onceCallbacks.get(phase) ?? [];
		}
		return this.onCallbacks.get(phase) ?? [];
	}

	private static isOneShot(
		phase: RuntimeFeatureLifecyclePhase,
	): phase is OneShotLifecyclePhase {
		return phase !== "connect" && phase !== "disconnect";
	}
}
