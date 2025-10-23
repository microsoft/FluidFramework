/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Manages the collaboration window for incremental summarization.
 */
export interface CollabWindow {
	/**
	 * Function which returns the most recent sequenceNumber on a message processed by `SharedTree`.
	 * Updated before processing an op, such that reading `currentSeq` while processing an op
	 * gives the sequenceNumber of the op currently being processed.
	 * `undefined` if no message has been processed, e.g. for a detached document or document loaded
	 * from summary without any subsequent ops.
	 * @remarks Most rebasing is built atop a revision system decoupled from message sequence number.
	 * However, this is sometimes necessary to interop with Fluid runtime APIs, e.g. for incremental summarization.
	 */
	getCurrentSeq: () => number | undefined;
}
