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
 * Lifecycle phases that fire exactly once during a runtime's lifetime.
 *
 * @remarks
 * Ordering during load: `construct`, then `loadFromSnapshot`, then
 * `loadPendingAttachments`, then `applyStashedOps`, then `ready`. On shutdown,
 * `dispose` fires once.
 *
 * Subsystems use {@link RuntimeFeatureHost.once} to register for these phases.
 *
 * @internal
 */
export type OneShotLifecyclePhase =
	| "construct"
	| "loadFromSnapshot"
	| "loadPendingAttachments"
	| "applyStashedOps"
	| "ready"
	| "dispose";

/**
 * Lifecycle phases that may fire repeatedly during a runtime's lifetime.
 *
 * @remarks
 * `connect` and `disconnect` alternate as the runtime gains and loses its
 * service connection. Subsystems use {@link RuntimeFeatureHost.on} to register
 * for these phases; callbacks fire each time the phase runs.
 *
 * @internal
 */
export type RepeatingLifecyclePhase = "connect" | "disconnect";

/**
 * Union of all lifecycle phases.
 *
 * @internal
 */
export type RuntimeFeatureLifecyclePhase = OneShotLifecyclePhase | RepeatingLifecyclePhase;

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
	 * Register a callback for a one-shot lifecycle phase. The callback fires
	 * exactly once, when the phase runs.
	 *
	 * Throws if the phase has already fired — registration is too late.
	 */
	once(phase: OneShotLifecyclePhase, callback: () => void | Promise<void>): void;

	/**
	 * Register a callback for a repeating lifecycle phase. The callback fires
	 * each time the phase runs, in registration order.
	 */
	on(phase: RepeatingLifecyclePhase, callback: () => void | Promise<void>): void;
}
