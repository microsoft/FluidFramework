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
	 * Generating, uploading, or receiving an untracked acknowledgment does not end this policy.
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
		 * Synchronously read the state being summarized and return its additional tree and optional acceptance callback.
		 * The returned tree may specify a `groupId`. Its statistics are calculated by the runtime.
		 *
		 * @remarks
		 * Called on every attach/detached summary and every normal summary attempt,
		 * even when unchanged descendants are represented by handles. Throwing aborts the attempt.
		 *
		 * This callback must only read state from this runtime at the reference sequence number being summarized.
		 * It must not mutate state, emit ops, or perform asynchronous work.
		 * The current contract also serves synchronous attach summarization, so the factory must realize all required data
		 * before generation on both interactive and summarizer runtimes.
		 * Return a fresh tree whose contents will not subsequently be mutated.
		 * Reuse handles only when `fullTree` is false and the captured application state belongs to `context.previousSummary`.
		 * Newly loaded application revisions are not automatically comparable to revisions captured by a previous runtime instance.
		 */
		readonly summarize: (context: ISummaryGenerationContext) => IApplicationProjectionSummary;
	};
}
