/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Unicode symbols used to represent different build result statuses in console output.
 * These symbols are displayed next to task names during builds to indicate their status.
 */
export const STATUS_SYMBOLS = {
	/** ✓ Success (task executed successfully) */
	SUCCESS: "\u2713",
	/** ○ Up-to-date (task skipped, no execution needed) */
	UP_TO_DATE: "\u25CB",
	/** x Failed (task execution failed) */
	FAILED: "x",
	/** ⇩ Remote cache hit (task outputs restored from remote cache) */
	CACHED_SUCCESS: "\u21E9",
	/** ⇧ Success with cache write (task executed and outputs uploaded to cache) */
	SUCCESS_WITH_CACHE_WRITE: "\u21E7",
	/** ■ Local cache hit (task up-to-date based on local donefile) */
	LOCAL_CACHE_HIT: "\u25A0",
} as const;
