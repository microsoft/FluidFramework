/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * An event emitted by a `SharedTree` to indicate a state change. See {@link ISharedTreeEvents} for event
 * argument information.
 * @alpha
 */
export enum SharedTreeEvent {
	/**
	 * Note: It is _strongly_ recommended that you avoid this API and instead use the `viewChange` event
	 * on a {@link Checkout}. See "Use a Checkout" in the README for an example of how to create a
	 * checkout of a tree. The Checkout API is generally more user friendly and also avoids a class
	 * of bugs involving the interleaving of remote and local edits that can arise when querying the
	 * tree's {@link LogViewer} directly.
	 *
	 * An edit has been committed to the log.
	 * This happens when either:
	 *
	 * 1. A locally generated edit is added to the log.
	 *
	 * 2. A remotely generated edit is added to the log.
	 *
	 * Note that, for locally generated edits, this event will not be emitted again when that edit is sequenced.
	 * Passed the EditId of the committed edit, i.e. supports callbacks of type {@link EditCommittedHandler}.
	 */
	EditCommitted = 'committedEdit',

	/**
	 * Note: It is _strongly_ recommended that you avoid this API and instead use the `viewChange` event
	 * on a {@link Checkout}. See "Use a Checkout" in the README for an example of how to create a
	 * checkout of a tree. The Checkout API is generally more user friendly and also avoids a class
	 * of bugs involving the interleaving of remote and local edits that can arise when querying the
	 * tree's {@link LogViewer} directly.
	 *
	 * A sequenced edit has been applied.
	 * This includes local edits though the callback is only invoked once the sequenced version is received.
	 * For edits that were local (see {@link SequencedEditAppliedEventArguments.wasLocal}, this callback will only
	 * be called once.
	 * For non-local edits, it may be called multiple times: the number of calls and when they occur depends on caching
	 * and is an implementation detail.
	 * Supports callbacks of type {@link SequencedEditAppliedHandler}.
	 */
	SequencedEditApplied = 'sequencedEditApplied',
}

/**
 * An event emitted by a `SharedTree` for diagnostic purposes.
 * See {@link ISharedTreeEvents} for event argument information.
 * @internal
 */
export enum SharedTreeDiagnosticEvent {
	/**
	 * A single catch up blob has been uploaded.
	 */
	CatchUpBlobUploaded = 'uploadedCatchUpBlob',
	/**
	 * An edit chunk blob has been uploaded. This includes catchup blobs.
	 */
	EditChunkUploaded = 'uploadedEditChunk',
	/**
	 * A valid edit (local or remote) has been applied.
	 * Passed the EditId of the applied edit.
	 * Note that this may be called multiple times, due to concurrent edits causing reordering,
	 * and/or due to not caching the output of every edit.
	 */
	AppliedEdit = 'appliedEdit',
	/**
	 * An invalid edit (local or remote) has been dropped.
	 * Passed the EditId of the dropped edit.
	 * Note that this may be called multiple times, due to concurrent edits causing reordering,
	 * and/or due to not caching the output of every edit.
	 */
	DroppedInvalidEdit = 'droppedInvalidEdit',
	/**
	 * A malformed edit (local or remote) has been dropped.
	 * Passed the EditId of the dropped edit.
	 * Note that this may be called multiple times, due to concurrent edits causing reordering,
	 * and/or due to not caching the output of every edit.
	 */
	DroppedMalformedEdit = 'droppedMalformedEdit',
	/**
	 * A history chunk has been received that does not have a corresponding edit chunk on the edit log.
	 */
	UnexpectedHistoryChunk = 'unexpectedHistoryChunk',
	/**
	 * The current write format changed, either because an old summary was loaded or an update op was successfully processed.
	 * This event is emitted with the new version as an argument.
	 */
	WriteVersionChanged = 'writeVersionChanged',
}
