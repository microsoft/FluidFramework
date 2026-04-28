/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Internal contract a runtime subsystem implements so the container runtime can
 * drive it through its lifecycle. The runtime calls these methods at the
 * appropriate moments; subsystems that don't care about a phase simply omit
 * the method.
 *
 * This is the inverse of an "extension host" — the runtime calls into features
 * rather than features registering callbacks against a host. Each method has
 * its own typed signature; collection-level dispatch is provided by
 * `RuntimeFeatureCollection` (in container-runtime).
 *
 * Compare with `ContainerExtension` (in `container-runtime-definitions`):
 * extensions are pull-based observational plugins with their own surface
 * (signals, connection events). Runtime features are foundational subsystems
 * the runtime owns; the runtime tells them when significant moments happen.
 */

/**
 * Internal contract a runtime subsystem implements so the container runtime
 * can drive it through its lifecycle.
 *
 * @remarks
 * All methods are optional — implement only the moments your feature needs.
 * The runtime calls each method at most once per occurrence (lifecycle phases
 * fire once per load; `onConnect`/`onDisconnect` may fire repeatedly).
 *
 * @internal
 */
export interface IRuntimeFeature {
	/**
	 * Called once during runtime load, after the snapshot has been parsed and
	 * the runtime is constructed but before any stashed ops have been applied.
	 *
	 * Use this to hydrate per-feature state from the snapshot.
	 */
	readonly onLoadFromSnapshot?: () => Promise<void>;

	/**
	 * Called once during runtime load, after stashed local ops have been
	 * replayed against the local DDS state.
	 */
	readonly onApplyStashedOps?: (seqNum: number) => Promise<void>;

	/**
	 * Called once when the runtime is fully loaded and ready for use, before
	 * connection establishment.
	 */
	readonly onReady?: () => Promise<void>;

	/**
	 * Called each time the runtime gains a service connection.
	 */
	readonly onConnect?: (clientId: string) => void;

	/**
	 * Called each time the runtime loses its service connection.
	 */
	readonly onDisconnect?: () => void;

	/**
	 * Called once when the runtime is being disposed. Features should release
	 * resources synchronously.
	 */
	readonly dispose?: () => void;
}
