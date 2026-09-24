/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISummaryContext } from "@fluidframework/driver-definitions/internal";

import type { IApplicationProjectionSummary } from "../containerRuntime.js";

/**
 * The reference sequence number and accepted parent used to generate an application summary subtree.
 * @legacy @beta
 */
export interface ISummaryGenerationContext {
	/**
	 * Whether this attempt must write all content without prior-summary handles.
	 */
	readonly fullTree: boolean;
	/**
	 * Whether summarizer nodes track the state of this attempt.
	 */
	readonly trackState: boolean;
	/**
	 * The reference sequence number identifying the document state being summarized.
	 */
	readonly referenceSequenceNumber: number;
	/**
	 * The exact accepted or loaded parent against which summary handles resolve.
	 * Undefined for attach summaries and when no parent exists.
	 * This parent's reference sequence number is not the reference sequence number of the current attempt.
	 */
	readonly previousSummary: ISummaryContext | undefined;
}

/**
 * Controls summary generation and an additional application-owned root subtree.
 * Supplied by the application runtime factory, independently of summary scheduling configuration.
 * These options are not persisted and must be supplied again when loading another runtime,
 * including a summarizer client.
 * @legacy @beta
 */
export interface ISummaryGenerationOptions {
	/**
	 * Select when the runtime must write complete summaries instead of reusing summary handles.
	 * Defaults to `"default"`.
	 *
	 * - `"default"`: preserve ordinary summary behavior, including an explicit `fullTree` request.
	 * - `"untilFirstAck"`: require full summaries until a full proposal submitted by this runtime is acknowledged
	 * and adopted by its summarizer nodes, garbage collector, and application summary tracking.
	 * - `"always"`: require full summaries for this runtime's entire lifetime, including retries.
	 *
	 * @remarks
	 * Use `"untilFirstAck"` when the loaded state was constructed in memory and its summary paths do not yet exist in storage.
	 * With summary heuristics enabled, the elected summarizer requests an initial summary without waiting for application edits.
	 * An attached interactive client requests a writer connection through the loader to participate in election,
	 * without submitting an application operation or bypassing connection and permission restrictions.
	 * This automatic connection request requires a loader that supplies `IContainerContext.requestWriteConnection`.
	 * Disabled heuristics and on-demand summarization still require an explicit request.
	 * After adoption, ordinary incremental generation and scheduling resume.
	 *
	 * Generating, uploading, or receiving an untracked acknowledgment does not end this policy.
	 * If adoption fails, the runtime closes rather than reuse an incomplete baseline.
	 * An explicit full-tree request is honored under every policy, including after the first accepted summary.
	 * This policy does not inline attachment blob payloads or force full garbage-collection graph regeneration.
	 * The runtime captures the option at load time and never mutates the caller's configuration.
	 */
	readonly fullTreePolicy?: "default" | "untilFirstAck" | "always";

	/**
	 * One application-owned subtree added at the runtime summary root, outside `.channels`.
	 */
	readonly additionalRootTree?: {
		/**
		 * A single, nonempty path segment unchanged by URI encoding.
		 * Dot-prefixed names, `gc`, and JavaScript prototype property names are reserved.
		 * The key must not collide with existing root entries.
		 * The application selects this key; `applicationProjection` is a convention, not a runtime requirement.
		 */
		readonly key: string;
		/**
		 * Read the state being summarized and return its additional tree and optional acceptance callback.
		 * The returned tree may specify a `groupId`. Its statistics are calculated by the runtime.
		 *
		 * @remarks
		 * Called by normal asynchronous summarization, even when unchanged descendants are represented by handles.
		 * The runtime awaits the result. Throwing, rejecting, or returning an invalid result aborts the attempt;
		 * this callback cannot omit the projection.
		 *
		 * This callback must only read state from this runtime at the reference sequence number being summarized.
		 * It may asynchronously realize and serialize state, but must not mutate the document, emit ops, or read
		 * later revisions across awaits. Normal summary submission pauses inbound processing through generation;
		 * direct summarize callers must provide equivalent checkpoint consistency themselves.
		 * Do not await incoming operations or acknowledgments: their processing is paused.
		 * Cancellation is checked after this work settles, so the callback must complete or reject its own I/O.
		 * Return a fresh tree whose contents will not subsequently be mutated.
		 * Reuse handles only when `fullTree` is false and the captured application state belongs to `context.previousSummary`.
		 * Newly loaded application revisions are not automatically comparable to revisions captured by a previous runtime instance.
		 */
		readonly summarize: (
			context: ISummaryGenerationContext,
		) => IApplicationProjectionSummary | Promise<IApplicationProjectionSummary>;
		/**
		 * Synchronously read state for ContainerRuntime.createSummary during attachment or detached serialization.
		 *
		 * @remarks
		 * Optional: omitting this callback or returning `undefined` omits the application subtree on these paths.
		 * Returning an empty tree instead writes an empty subtree. The runtime never falls back to `summarize`.
		 * All required state must already be realized; this callback must not mutate the document, emit ops,
		 * or return a promise. Returned trees follow the same ownership and validation rules as `summarize`,
		 * but always require full output without previous-summary handles. Their `onAccepted` callback is not called.
		 *
		 * The existing runtime API does not distinguish attachment from detached serialization, so no reason
		 * is supplied. Attached pending-state capture does not call this API; omission does not strip projections
		 * or required seed content from an existing pending-state snapshot.
		 */
		readonly createSummary?: (
			context: ISummaryGenerationContext,
		) => IApplicationProjectionSummary | undefined;
	};
}
