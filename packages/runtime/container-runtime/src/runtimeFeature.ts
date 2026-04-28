/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IRuntimeMessagesContent,
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";

import type {
	ContainerMessageType,
	InboundContainerRuntimeMessage,
	InboundSequencedContainerRuntimeMessage,
	LocalContainerRuntimeMessage,
	UnknownContainerRuntimeMessage,
} from "./messageTypes.js";

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
 * The full op-type universe for runtime messages, including the
 * UnknownContainerRuntimeMessage sentinel. Used as the default for
 * {@link IRuntimeFeature}'s `TOps` type parameter.
 *
 * @internal
 */
export type AnyRuntimeOpType = ContainerMessageType | UnknownContainerRuntimeMessage["type"];

/**
 * The {@link InboundSequencedContainerRuntimeMessage} variant whose `type`
 * matches `TOps`, with `contents` removed. Mirrors the shape of the `message`
 * argument {@link IRuntimeFeature.handleOp} receives — per-op contents arrive
 * separately via {@link RuntimeMessagesContentFor}.
 *
 * @internal
 */
export type InboundRuntimeMessageFor<TOps extends AnyRuntimeOpType> = Omit<
	InboundSequencedContainerRuntimeMessage,
	"contents"
> & { type: TOps };

/**
 * The {@link LocalContainerRuntimeMessage} variant whose `type` matches
 * `TOps`. Used for the `message` / `opContents` parameters of
 * {@link IRuntimeFeature.applyStashedOp}, {@link IRuntimeFeature.reSubmitOp},
 * and {@link IRuntimeFeature.rollbackStagedOp}.
 *
 * @internal
 */
export type LocalRuntimeMessageFor<TOps extends AnyRuntimeOpType> =
	LocalContainerRuntimeMessage & { type: TOps };

/**
 * A {@link @fluidframework/runtime-definitions#IRuntimeMessagesContent} whose
 * `contents` is narrowed to the inbound message variant matching `TOps`. Used
 * to strongly type the `messagesContent` array passed to
 * {@link IRuntimeFeature.handleOp} so feature implementations don't cast.
 *
 * @internal
 */
export type RuntimeMessagesContentFor<TOps extends AnyRuntimeOpType> = Omit<
	IRuntimeMessagesContent,
	"contents"
> & {
	readonly contents: (InboundContainerRuntimeMessage & { type: TOps })["contents"];
};

/**
 * Internal contract a runtime subsystem implements so the container runtime
 * can drive it through its lifecycle.
 *
 * @typeParam TOps - The op types this feature claims (narrows the
 * `message`/`opContents` parameter types of the op-routing hooks). Default
 * `AnyRuntimeOpType` for features that don't participate in op routing.
 *
 * @remarks
 * All methods are optional — implement only the moments your feature needs.
 * Connection-state callbacks may fire repeatedly; lifecycle phases fire once
 * per load.
 *
 * @internal
 */
export interface IRuntimeFeature<TOps extends AnyRuntimeOpType = AnyRuntimeOpType> {
	/**
	 * Called once during runtime load, after the snapshot has been parsed and
	 * the runtime is constructed but before any stashed ops have been applied.
	 *
	 * Use this to hydrate per-feature state from the snapshot.
	 */
	readonly onLoadFromSnapshot?: () => Promise<void>;

	/**
	 * Called each time the runtime's connection state changes — including
	 * connect, disconnect, and read-only toggles while connected.
	 *
	 * Named to match the existing `setConnectionState` method on subsystems
	 * (ChannelCollection, GarbageCollector) so they can satisfy this hook
	 * without introducing a wrapper.
	 *
	 * @param canSendOps - Whether the runtime can currently submit ops. False
	 * when disconnected, or when connected but read-only.
	 * @param clientId - The current client id when connected; `undefined` when
	 * disconnected.
	 */
	readonly setConnectionState?: (canSendOps: boolean, clientId: string | undefined) => void;

	/**
	 * Called when the runtime enters or exits staging mode. Features that
	 * change behavior under staging (e.g. data store contexts going read-only)
	 * subscribe here.
	 *
	 * Named to match `ChannelCollection.notifyStagingMode` so that subsystem
	 * satisfies this hook without renaming.
	 *
	 * @param active - True when staging mode is being entered; false when it
	 * is being exited (committed or discarded).
	 */
	readonly notifyStagingMode?: (active: boolean) => void;

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
	 * Op types this feature claims for op-routing hooks
	 * (handleOp / applyStashedOp / reSubmitOp / rollbackStagedOp).
	 *
	 * `RuntimeFeatureCollection` builds per-hook dispatch maps from these
	 * claims at registration and validates that at most one feature claims
	 * each (type, hook) pair. Dispatch is then O(1) per message.
	 *
	 * Features that don't participate in op routing omit this field entirely.
	 */
	readonly supportedOps?: readonly TOps[];

	/**
	 * Called for inbound runtime messages of the feature's
	 * {@link IRuntimeFeature.supportedOps | supported op types}. The
	 * dispatcher has already matched the type — the feature's body just does
	 * the work.
	 */
	handleOp?(
		message: InboundRuntimeMessageFor<TOps>,
		messagesContent: RuntimeMessagesContentFor<TOps>[],
		local: boolean,
		savedOp?: boolean,
	): void;

	/**
	 * Apply a stashed local op (replayed from saved pending state) during
	 * runtime load. Called only for the feature's
	 * {@link IRuntimeFeature.supportedOps | supported op types}. The returned
	 * `result` is the localOpMetadata that the pending-state manager retains
	 * for the resubmit cycle.
	 *
	 * @remarks
	 * Features that intentionally drop their op type on stash (e.g. blob
	 * attach, schema change) return `{ result: undefined }`.
	 */
	applyStashedOp?(
		opContents: LocalRuntimeMessageFor<TOps>,
	): Promise<{ result: unknown } | undefined> | { result: unknown } | undefined;

	/**
	 * Resubmit a pending op. Called only for the feature's
	 * {@link IRuntimeFeature.supportedOps | supported op types}.
	 *
	 * @param message - The local runtime message to resubmit.
	 * @param localOpMetadata - Subsystem-specific metadata captured at submit time.
	 * @param opMetadata - Op-level metadata (e.g. blobId for BlobAttach).
	 * @param squash - True when resubmitting via the squash-rebase path on
	 * staging-mode commit. Most features ignore this; ChannelCollection uses
	 * it to coalesce intermediate states.
	 */
	reSubmitOp?(
		message: LocalRuntimeMessageFor<TOps>,
		localOpMetadata: unknown,
		opMetadata: unknown,
		squash: boolean,
	): void;

	/**
	 * Roll back a staged op (when staged changes are discarded). Called only
	 * for the feature's {@link IRuntimeFeature.supportedOps | supported op
	 * types}.
	 *
	 * @param message - The local runtime message to roll back.
	 * @param localOpMetadata - Subsystem-specific metadata captured at submit time.
	 */
	rollbackStagedOp?(
		message: LocalRuntimeMessageFor<TOps>,
		localOpMetadata: unknown,
	): void;
}
