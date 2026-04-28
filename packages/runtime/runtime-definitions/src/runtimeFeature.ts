/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Internal facade exposed by the container runtime to subsystems that participate
 * in its lifecycle. This is a structuring tool inside `ContainerRuntime`, not a
 * public extension point. Subsystems (summarizer, garbage collector, etc.) receive
 * a host reference and register lifecycle callbacks against it instead of being
 * plumbed with manual constructor arguments and direct calls. The runtime drives
 * the lifecycle by calling host methods; the host fans out to registered
 * callbacks.
 *
 * Compare with `ContainerExtension` (in `container-runtime-definitions`):
 * extensions are pull-based observational plugins (Presence is the canonical
 * example), whereas runtime features are foundational subsystems that the
 * runtime owns and constructs.
 */

/**
 * Named lifecycle phases the runtime drives during load and shutdown.
 *
 * @remarks
 * Ordering during load: `construct`, then `loadFromSnapshot`, then
 * `loadPendingAttachments`, then `applyStashedOps`, then `ready`.
 *
 * Connection lifecycle (post-load, possibly many times): `connect`, then `disconnect`.
 *
 * Shutdown: `dispose`. Fires once when the runtime is being disposed.
 *
 * @internal
 */
export type RuntimeFeatureLifecyclePhase =
	| "construct"
	| "loadFromSnapshot"
	| "loadPendingAttachments"
	| "applyStashedOps"
	| "ready"
	| "connect"
	| "disconnect"
	| "dispose";

/**
 * Runtime surface exposed to a runtime feature/subsystem.
 *
 * @remarks
 * Methods are added incrementally as subsystems migrate to use the host.
 * Initial surface covers lifecycle phases only; op routing, summary
 * contribution, metadata access, and dependency resolution are follow-ups.
 *
 * @internal
 */
export interface RuntimeFeatureHost {
	/**
	 * Register a callback for a lifecycle phase. May be called multiple times
	 * for the same phase; callbacks fire in registration order.
	 */
	on(phase: RuntimeFeatureLifecyclePhase, callback: () => void | Promise<void>): void;
}
