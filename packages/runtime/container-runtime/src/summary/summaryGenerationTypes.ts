/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Controls whether summaries can reuse handles to content in the previous summary.
 * Supply these options from your runtime factory on each load, including summarizer client loads.
 * The options are not persisted and do not add application callbacks to summarization.
 * @legacy @beta
 */
export interface ISummaryGenerationOptions {
	/**
	 * Select when the runtime must write complete summaries.
	 * Defaults to `"default"`.
	 *
	 * - `"default"`: preserve ordinary summary generation and scheduling.
	 * - `"untilFirstAck"`: require full summaries until a full proposal submitted by this runtime is acknowledged and adopted by its summarizer nodes and garbage collector.
	 * - `"always"`: require full summaries for this runtime's lifetime, including retries.
	 *
	 * @remarks
	 * Use `"untilFirstAck"` when loaded state has native summary paths that do not yet exist in storage.
	 * With summary heuristics enabled, the elected summarizer requests an initial summary without waiting for application edits.
	 * An attached interactive client requests a writer connection through the loader to participate in election,
	 * without submitting an application operation or bypassing connection and permission restrictions.
	 * This automatic connection request requires a loader that supplies `IContainerContext.requestWriteConnection`.
	 * Disabled heuristics and on-demand summarization still require an explicit request.
	 * After adoption, ordinary incremental generation and scheduling resume.
	 *
	 * Generating, uploading, or receiving an untracked acknowledgment does not end this policy.
	 * If adoption fails, the runtime closes rather than reuse an incomplete baseline.
	 * Explicit `fullTree` requests are honored under every policy.
	 * This option does not inline attachment blob payloads or force full garbage-collection graph regeneration.
	 * The runtime copies the option at load time and does not mutate your configuration.
	 */
	readonly fullTreePolicy?: "default" | "untilFirstAck" | "always";
}
