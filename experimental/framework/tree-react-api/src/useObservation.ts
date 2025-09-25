/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";

/**
 * Tracks and subscriptions from the latests render of a given instance of the {@link useObservation} hook.
 */
interface Subscriptions {
	/**
	 * If defined, still needs to be called at some point.
	 * @remarks
	 * Clear when called.
	 */
	unsubscribe?: () => void;
}

/**
 * Wrapper around subscriptions to give it an object identity which can be used with FinalizationRegistry.
 * @remarks
 * This indirection is needed so inner can be provided to finalizationRegistry as the heldValue and avoid having that cause a leak.
 * @privateRemarks
 * This is a named class to make looking for leaks of it in heap snapshots easier.
 */
class SubscriptionsWrapper {
	public readonly inner: Subscriptions = {};
}

/**
 * Options for {@link useTreeObservations}.
 * @input
 * @public
 */
export interface ObservationOptions {
	/**
	 * Called when the tracked observations are invalidated.
	 * @remarks
	 * This is not expected to have production use cases, but is useful for testing and debugging.
	 */
	onInvalidation?: () => void;
}

/**
 * Custom hook which invalidates a React Component based on changes to what was observed during `trackDuring`.
 *
 * @param trackDuring - Called synchronously: can make event subscriptions which call the provided `invalidate` function.
 * Any such subscriptions should be cleaned up via the returned `unsubscribe` function which will only be invoked if `invalidate` is not called.
 * If `invalidate` is called, the code calling it should remove any subscriptions before calling it.
 * @remarks
 * React strongly discourages "render" from having side-effects other than idempotent lazy initialization.
 *
 * Tracking observations made during render to subscribe to events for automatic invalidation is a side-effect.
 * This makes the behavior of this hook somewhat unusual from a React perspective, and also rather poorly supported by React.
 *
 * That said, the alternatives more aligned with how React expects things to work have much less friendly APIs, or have gaps where they risk invalidation bugs.
 *
 * For example, this hook could record which observations were made during render, then pass them into a `useEffect` hook to do the subscription.
 * This would be more aligned with React's expectations, but would have a number of issues:
 * - The effect would run after render, so if the observed content changed between render and the effect running, there could be an invalidation bug.
 * - It would require changes to `TreeAlpha.trackObservationsOnce` to support a two phase approach (first track, then subscribe) which would have the same risk of missed invalidation.
 * - It would have slightly higher cost due to the extra effect.
 * Such an approach is implemented in {@link useObservationPure}.
 */
export function useObservation<TResult>(
	trackDuring: (invalidate: () => void) => { result: TResult; unsubscribe: () => void },
	options?: ObservationOptions,
): TResult {
	// Use a React state hook to invalidate this component something tracked by `trackDuring` changes.
	const [subscriptions, setSubscriptions] = React.useState<SubscriptionsWrapper>(
		new SubscriptionsWrapper(),
	);

	// Because `subscriptions` is used in `finalizationRegistry` for cleanup, it is important that nothing save a reference to it which is retained by the invalidation callback.
	// TO help with this, pull out `inner` so it can be closed over without retaining `subscriptions`.
	const inner = subscriptions.inner;

	const invalidate = (): void => {
		// Since below uses trackObservationsOnce, the un-subscription is done before calling this callback,
		// and therefore this must ensure that no further un-subscriptions occur, as well as that the render is invalidated.
		//
		// Note referencing `setSubscriptions` risks transitively holding onto a reference to `subscriptions` depending on how React implements `useState`.
		// If such a transitive reference does exist, it would cause a leak (by preventing finalizationRegistry from running and thus preventing un-subscription after unmount).
		// Experimentally this has been observed not to be the case, and is validated by the "unsubscribe on unmount" tests.
		setSubscriptions(new SubscriptionsWrapper());

		// This cannot do `registry.unregister(subscriptions);` as that would cause a leak by holding onto `subscriptions`
		// since this closure is held onto by the subscribed events.
		// Skipping such an un-registration is fine so long as we ensure the registry does not redundantly unsubscribe.
		// Since trackObservationsOnce already unsubscribed, just clear out the unsubscribe function to ensure it is not called again by the finalizer.
		inner.unsubscribe = undefined;

		options?.onInvalidation?.();
	};

	// If there was a previous rendering of this instance of this hook in the current component, unsubscribe from it.
	// This avoids a memory leak (of the event subscriptions) in the case where a components is rerendered.
	inner.unsubscribe?.();
	inner.unsubscribe = undefined;

	// This is logically pure other than the side effect of registering for invalidation if the observed content changes.
	// This is safe from a React perspective since when the observed content changes, that is reflected in the `useState` above.
	// What is more problematic is avoiding of leaking the event registrations since React does not provide an easy way to do that for code run outside of a hook.
	// That leak is avoided via two separate approaches: the un-subscription for events from previous renders above,
	// and the use of finalizationRegistry below to handle the component unmount case.
	const out = trackDuring(invalidate);

	inner.unsubscribe = out.unsubscribe;

	// There is still the issue of unsubscribing when the component unmounts.
	// This can almost be done using a React effect hook with an empty dependency list.
	// Unfortunately that would have a hard time getting the correct subscriptions to unsubscribe,
	// and if run before unmount, like in StrictMode, it would cause an invalidation bug.
	// Suppressing that invalidation bug with an extra call to setSubscriptions could work, but would produce incorrect warnings about leaks,
	// and might cause infinite rerender depending on how StrictMode works.
	// Such an Effect would look like this:
	// React.useEffect(
	// 	() => () => {
	// 		subscriptions.unsubscribe?.();
	// 		subscriptions.unsubscribe = undefined;
	// 		setSubscriptions({});
	// 	},
	// 	[],
	// );
	// Instead of that, use a FinalizationRegistry to clean up when the subscriptions.
	// As this only needs to run sometime after the component is unmounted, triggering it based on React no longer holding onto the subscriptions state object is sufficient.
	// This should be safe (not unsubscribe too early) as React will hold onto the state object for as long as the component is mounted since if the component rerenders, it will be required.
	// If React decided it would never reuse the component instance (recreate it instead of rerender) but kept it mounted, then it would be possible for this to unsubscribe too early.
	// Currently however, it does not seem like React does or will do that.
	// If such an issue does ever occur, it could be fixed by stuffing a reference to the `subscriptions` object in the DOM: for now such a mitigation appears unnecessary and would add overhead.
	finalizationRegistry.register(subscriptions, inner);

	return out.result;
}

/**
 * Handles unsubscribing from events when the {@link SubscriptionsWrapper} is garbage collected.
 * See comments in {@link useTreeObservations} for details.
 */
const finalizationRegistry = new FinalizationRegistry((subscriptions: Subscriptions) => {
	subscriptions.unsubscribe?.();
	// Clear out the unsubscribe function to ensure it is not called again.
	// This should not be needed, but maintains the invariant that unsubscribe should be removed after being called.
	subscriptions.unsubscribe = undefined;
});

//
// Below here are some alternative approaches.
// Should issues arise with the above, one of these could be used instead.
// These alternatives have user facing downsides (mainly performance and/or gaps where they could miss invalidations)
// so are not being used as long as the above setup seems to be working well enough.
//

/**
 * Options for {@link useTreeObservations}.
 * @input
 */
export interface ObservationPureOptions {
	onSubscribe?: () => void;
	onUnsubscribe?: () => void;
	onPureInvalidation?: () => void;
}

/**
 * Variant of {@link useObservation} where render behaves in a more pure functional way.
 * @remarks
 * Subscriptions are only created in effects, which leaves a gap between when the observations are tracked and the subscriptions are created.
 * @privateRemarks
 * If impureness of the other approaches becomes a problem, this could be used directly instead.
 * Doing so would require changing `TreeAlpha.trackObservationsOnce` return a function to subscribe to the tracked observations instead of subscribing directly.
 * This would be less robust (edits could be missed between render and the effect running) but would avoid the impure aspects of the other approaches.
 * This would remove the need for a finalizationRegistry, and would avoid relying on React not doing something unexpected like rendering a component twice and throwing away the second render instead of the first.
 *
 * If using this directly, ensure it has tests other than via the other hooks which use it.
 */
function useObservationPure<TResult>(
	trackDuring: () => { result: TResult; subscribe: (invalidate: () => void) => () => void },
	options?: ObservationPureOptions,
): TResult {
	// Dummy state used to trigger invalidations.
	const [_subscriptions, setSubscriptions] = React.useState(0);

	const { result, subscribe } = trackDuring();

	React.useEffect(() => {
		// Subscribe to events from the latest render

		const invalidate = (): void => {
			setSubscriptions((n) => n + 1);
			inner.unsubscribe = undefined;
			options?.onPureInvalidation?.();
		};

		options?.onSubscribe?.();
		const inner: Subscriptions = { unsubscribe: subscribe(invalidate) };

		return () => {
			inner.unsubscribe?.();
			inner.unsubscribe = undefined;
			options?.onUnsubscribe?.();
		};
	});
	return result;
}

/**
 * Manages subscription to a one-shot invalidation event (unsubscribes when sent) event where multiple parties may want to subscribe to the event.
 * @remarks
 * When the event occurs, all subscribers are called.
 * Any subscribers added after the event has occurred are immediately called.
 *
 * Since new subscriptions can be added any any time, this can not unsubscribe from the source after the last destination has unsubscribed.
 *
 * Instead the finalizationRegistry is used.
 * @privateRemarks
 * This is a named class to make looking for leaks of it in heap snapshots easier.
 */
class SubscriptionTracker {
	/**
	 * Subscriptions to underlying events.
	 */
	private readonly inner: Subscriptions;
	/**
	 * Hook subscriptions to be trigger by `inner`.
	 */
	private readonly toInvalidate = new Set<() => void>();

	private disposed: boolean = false;

	private constructor(unsubscribe: () => void) {
		this.inner = { unsubscribe };
	}

	private assertNotDisposed(): void {
		if (this.disposed) {
			throw new Error("Already disposed");
		}
	}

	public readonly invalidate = (): void => {
		this.assertNotDisposed();
		if (this.inner.unsubscribe === undefined) {
			throw new Error("Already invalidated");
		}

		this.inner.unsubscribe = undefined;

		for (const invalidate of this.toInvalidate) {
			invalidate();
		}
		this.toInvalidate.clear();
	};

	public static create(unsubscribe: () => void): SubscriptionTracker {
		const tracker = new SubscriptionTracker(unsubscribe);
		finalizationRegistry.register(tracker, tracker.inner);
		return tracker;
	}

	public subscribe(callback: () => void): () => void {
		this.assertNotDisposed();
		if (this.toInvalidate.has(callback)) {
			throw new Error("Already subscribed");
		}

		if (this.inner.unsubscribe === undefined) {
			// Already invalidated, so immediately call back.
			callback();
			return () => {};
		}

		this.toInvalidate.add(callback);

		return () => {
			this.assertNotDisposed();
			if (!this.toInvalidate.has(callback)) {
				throw new Error("Not subscribed");
			}
			this.toInvalidate.delete(callback);
		};
	}

	public dispose(): void {
		this.assertNotDisposed();
		this.disposed = true;
		this.inner.unsubscribe?.();
		this.inner.unsubscribe = undefined;

		if (this.toInvalidate.size > 0) {
			throw new Error("Invalid disposal before unsubscribing all listeners");
		}

		finalizationRegistry.unregister(this.inner);
	}
}

/**
 * {@link useObservation} but more aligned with React expectations.
 * @remarks
 * This is more expensive than {@link useObservation}, and also leaks subscriptions longer.
 * When rendering a component, relies on a finalizer to clean up subscriptions from the previous render.
 *
 * Unlike {@link useObservation}, this behave correctly even if React does something unexpected, like Rendering a component twice, and throwing away the second render instead of the first.
 * {@link useObservation} relies on React not doing such things, assuming that when re-rendering a component, it will be the older render which is discarded.
 *
 * This should also avoid calling `setState` after unmount, which can avoid a React warning.
 *
 * This does not however avoid the finalizer based cleanup: it actually relies on it much more (for rerender and unmount, not just unmount).
 * This simply adds a layer of indirection to the invalidation through useEffect.
 */
export function useObservationWithEffects<TResult>(
	trackDuring: (invalidate: () => void) => { result: TResult; unsubscribe: () => void },
	options?: ObservationOptions & ObservationPureOptions,
): TResult {
	const pureResult = useObservationPure(observationAdapter(trackDuring, options), options);
	return pureResult.innerResult;
}

/**
 * An adapter wrapping `trackDuring` to help implement the {@link useObservation} using {@link useObservationPure}.
 */
function observationAdapter<TResult>(
	trackDuring: (invalidate: () => void) => { result: TResult; unsubscribe: () => void },
	options?: ObservationOptions & ObservationPureOptions,
): () => {
	result: {
		tracker: SubscriptionTracker;
		innerResult: TResult;
	};
	subscribe: (invalidate: () => void) => () => void;
} {
	return () => {
		// The main invalidation function, which only runs once, and is used to create the SubscriptionTracker.
		const invalidateMain = (): void => {
			tracker.invalidate();
			options?.onInvalidation?.();
		};
		const result2 = trackDuring(invalidateMain);
		const tracker = SubscriptionTracker.create(result2.unsubscribe);

		return {
			result: { tracker, innerResult: result2.result },
			subscribe: (invalidate) => {
				return tracker.subscribe(invalidate);
			},
		};
	};
}

/**
 * {@link useObservation} but more strict with its behavior.
 * @remarks
 * This has the eager cleanup on re-render of {@link useObservation}, but has the effect based subscriptions and cleanup on unmount of {@link useObservationWithEffects}.
 *
 * If React behaves in a way which breaks the assumptions of {@link useObservation} (and thus would require the leakier {@link useObservationWithEffects}), this will throw an error.
 * @privateRemarks
 * This is just a {@link useObservationPure}, except with the eager cleanup on re-render from {@link useObservation}.
 */
export function useObservationStrict<TResult>(
	trackDuring: (invalidate: () => void) => { result: TResult; unsubscribe: () => void },
	options?: ObservationOptions & ObservationPureOptions,
): TResult {
	// Used to unsubscribe from the previous render's subscriptions.
	// See `useObservation` for a more documented explanation of this pattern.
	const [subscriptions] = React.useState<{
		previousTracker: SubscriptionTracker | undefined;
	}>({ previousTracker: undefined });

	const pureResult = useObservationPure(observationAdapter(trackDuring, options), options);

	subscriptions.previousTracker?.dispose();
	subscriptions.previousTracker = pureResult.tracker;

	return pureResult.innerResult;
}
