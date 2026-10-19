/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Listenable, Listeners, Off } from "@fluidframework/core-interfaces";

/**
 * Options for {@link waitForEvent}.
 * @legacy @beta
 */
export interface WaitForEventOptions<TListeners extends object> {
	/**
	 * When provided, the returned promise rejects with the signal's
	 * {@link https://developer.mozilla.org/docs/Web/API/AbortSignal/reason | reason} as soon as the signal
	 * is (or becomes) aborted, guaranteeing the wait never hangs even if the awaited event never fires.
	 *
	 * @remarks
	 * Wire this to a cancellation source such as a container's disposal. For example:
	 * ```ts
	 * const abortController = new AbortController();
	 * container.once("disposed", () => abortController.abort(new Error("Container disposed")));
	 * await waitForEvent(source, "done", { abortSignal: abortController.signal });
	 * ```
	 */
	readonly abortSignal?: AbortSignal;

	/**
	 * Event(s) which, when emitted, reject the returned promise instead of resolving it. The first argument
	 * passed to the emitted event is used as the rejection reason.
	 */
	readonly rejectOn?: readonly (keyof Listeners<TListeners>)[];
}

/**
 * Returns a promise that resolves the next time one of the given events is emitted from the provided
 * {@link @fluidframework/core-interfaces#Listenable}, and (optionally) rejects on cancellation or when a
 * failure event is emitted.
 *
 * @param listenable - The event source to subscribe to.
 * @param resolveOn - The event (or events) whose emission resolves the returned promise.
 * @param options - See {@link WaitForEventOptions}. Use `abortSignal` to guarantee the wait settles even if
 * the awaited event never fires (for example because the owning container was disposed), and `rejectOn` to
 * reject when a failure event fires.
 *
 * @remarks
 * All event subscriptions (and the abort listener) are removed before the returned promise settles, so this
 * helper never leaks listeners regardless of how it completes.
 *
 * Because it only subscribes when called, it observes the _next_ emission of the given events. If the event
 * of interest may already have fired, either subscribe (call this) before that can happen, or first check
 * any queryable state the source exposes.
 * @legacy @beta
 */
export async function waitForEvent<TListeners extends object>(
	listenable: Listenable<TListeners>,
	resolveOn: NoInfer<keyof Listeners<TListeners> | readonly (keyof Listeners<TListeners>)[]>,
	options?: NoInfer<WaitForEventOptions<TListeners>>,
): Promise<void> {
	const resolveEvents = (
		Array.isArray(resolveOn) ? resolveOn : [resolveOn]
	) as readonly (keyof Listeners<TListeners>)[];
	const rejectEvents = options?.rejectOn ?? [];
	const abortSignal = options?.abortSignal;

	return new Promise<void>((resolve, reject) => {
		const offHandlers: Off[] = [];
		let onAbort: (() => void) | undefined;
		const cleanup = (): void => {
			for (const off of offHandlers) {
				off();
			}
			offHandlers.length = 0;
			if (onAbort !== undefined) {
				abortSignal?.removeEventListener("abort", onAbort);
				onAbort = undefined;
			}
		};

		// If already aborted, reject synchronously without subscribing to anything.
		if (abortSignal?.aborted === true) {
			// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- propagate the caller-provided abort reason as-is
			reject(abortSignal.reason);
			return;
		}

		const subscribe = (
			event: keyof Listeners<TListeners>,
			listener: (reason?: unknown) => void,
		): void => {
			// The cast is safe: every listener type on a Listenable is a `(...args) => void`, so a function
			// which accepts (and ignores) the emitted arguments is an acceptable listener for any event.
			offHandlers.push(listenable.on(event, listener as TListeners[typeof event]));
		};

		for (const event of resolveEvents) {
			subscribe(event, () => {
				cleanup();
				resolve();
			});
		}
		for (const event of rejectEvents) {
			subscribe(event, (reason?: unknown) => {
				cleanup();
				// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- propagate the emitted failure reason as-is
				reject(reason);
			});
		}
		if (abortSignal !== undefined) {
			onAbort = (): void => {
				cleanup();
				// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- propagate the caller-provided abort reason as-is
				reject(abortSignal.reason);
			};
			abortSignal.addEventListener("abort", onAbort);
		}
	});
}

/**
 * Minimal shape of a disposable event source whose disposal should abort an in-flight operation.
 *
 * @remarks
 * This is satisfied structurally by {@link @fluidframework/container-definitions#IContainer} (which exposes
 * a `disposed` flag and a `"disposed"` event), so a container can be passed directly.
 * @legacy @beta
 */
export interface IDisposalEventSource {
	/**
	 * Whether the source has already been disposed. When `true`, the operation is aborted immediately.
	 */
	readonly disposed?: boolean;
	/**
	 * Subscribe to the `"disposed"` event.
	 */
	once(event: "disposed", listener: (...args: unknown[]) => void): unknown;
	/**
	 * Unsubscribe from the `"disposed"` event.
	 */
	off(event: "disposed", listener: (...args: unknown[]) => void): unknown;
}

/**
 * Runs an async operation with an {@link https://developer.mozilla.org/docs/Web/API/AbortSignal | AbortSignal}
 * that aborts as soon as the provided source is disposed, so the operation can never outlive its source.
 *
 * @param source - The disposable source (for example a container) whose disposal should abort the operation.
 * @param operation - The operation to run. It receives an `AbortSignal` that aborts when `source` is
 * disposed, and should observe it (for example by forwarding it to {@link waitForEvent} or
 * {@link waitForPayloadUploaded}).
 * @returns The result of `operation`, or a rejection if `operation` rejects (including because it observed
 * the abort).
 *
 * @remarks
 * The disposal subscription is always removed once the operation settles - on success as well as on failure -
 * so this never leaks a listener on `source`, unlike wiring an `AbortController` to the `"disposed"` event by
 * hand. If `source` is already disposed, the operation runs with an already-aborted signal.
 * @legacy @beta
 */
export async function withDisposalAbort<T>(
	source: IDisposalEventSource,
	operation: (abortSignal: AbortSignal) => Promise<T>,
): Promise<T> {
	const abortController = new AbortController();
	const onDisposed = (): void => {
		abortController.abort(new Error("Operation aborted because its source was disposed"));
	};
	if (source.disposed === true) {
		onDisposed();
	} else {
		source.once("disposed", onDisposed);
	}
	try {
		return await operation(abortController.signal);
	} finally {
		source.off("disposed", onDisposed);
	}
}
