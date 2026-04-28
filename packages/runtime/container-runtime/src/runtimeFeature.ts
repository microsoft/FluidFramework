/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";

/*
 * Internal contract a runtime subsystem implements so the container runtime can
 * drive it through its lifecycle. The runtime calls these methods at the
 * appropriate moments; subsystems that don't care about a phase simply omit
 * the method.
 *
 * This is the inverse of an "extension host" — the runtime calls into features
 * rather than features registering callbacks against a host. Each method has
 * its own typed signature; collection-level dispatch is provided by
 * `RuntimeFeatureCollection`.
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
 * Connection-state callbacks may fire repeatedly; lifecycle phases fire once
 * per load.
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
	 * Called each time the runtime's connection state changes — including
	 * connect, disconnect, and read-only toggles while connected.
	 *
	 * @param canSendOps - Whether the runtime can currently submit ops. False
	 * when disconnected, or when connected but read-only.
	 * @param clientId - The current client id when connected; `undefined` when
	 * disconnected.
	 */
	readonly onConnectionStateChange?: (
		canSendOps: boolean,
		clientId: string | undefined,
	) => void;

	/**
	 * Called once when the runtime is being disposed. Features should release
	 * resources synchronously.
	 */
	readonly dispose?: () => void;

	/**
	 * Called during summary generation. Features that contribute to the summary
	 * tree should mutate `summaryTree` directly (e.g. via
	 * `addSummarizeResultToSummary`) using their own well-known key.
	 *
	 * @param summaryTree - The container summary tree being built. Mutate
	 * in place to add this feature's contribution.
	 * @param fullTree - When true, generate a complete summary tree without
	 * incremental optimizations.
	 * @param trackState - When true, track which nodes have changed for
	 * incremental summaries.
	 * @param telemetryContext - Optional telemetry context for the summary.
	 */
	readonly contributeSummary?: (
		summaryTree: ISummaryTreeWithStats,
		fullTree: boolean,
		trackState: boolean,
		telemetryContext?: ITelemetryContext,
	) => void;

	/**
	 * Called for each inbound runtime message. The feature returns `true` if it
	 * handled the message; `false` otherwise. Features check the message type
	 * themselves and decline messages they don't own.
	 *
	 * The collection short-circuits on the first feature that returns `true` —
	 * each message is owned by at most one feature.
	 *
	 * @remarks
	 * The runtime passes `Omit<InboundSequencedContainerRuntimeMessage, "contents">`
	 * for `message` and `IRuntimeMessagesContent[]` for `messagesContent`. The
	 * signature uses `unknown` here so the interface can live in
	 * `runtime-definitions/internal` (or wherever stays light on dependencies)
	 * without dragging the full container-runtime message-type graph through
	 * api-extractor. Each implementing feature casts inside, where it already
	 * knows the types involved.
	 */
	readonly handleOp?: (
		message: unknown,
		messagesContent: unknown[],
		local: boolean,
		savedOp?: boolean,
	) => boolean;
}
