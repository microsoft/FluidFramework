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
		// Note referencing `setSubscriptions` here will hold onto if React's implementation of `setSubscriptions`:
		// if that holds onto `subscriptions` it would cause a leak (by preventing finalizationRegistry from running and thus preventing un-subscription after unmount).
		// Experimentally this has been observed not to be the case.
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
