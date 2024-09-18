/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";

import { createIdCompressor, type IdCompressor } from "./idCompressor.js";
import type { IIdCompressor, IIdCompressorCore, SessionId } from "./types/index.js";
import { createSessionId } from "./utilities.js";

/**
 * Creates a compressor that only produces final IDs.
 * @remarks
 * This should only be used for testing and synchronous (non-collaborative) purposes.
 * @internal
 */
export function createAlwaysFinalizedIdCompressor(
	logger?: ITelemetryBaseLogger,
): IIdCompressor & IIdCompressorCore;

/**
 * Creates a compressor that only produces final IDs.
 * @remarks
 * This should only be used for testing and synchronous (non-collaborative) purposes.
 * @internal
 */
export function createAlwaysFinalizedIdCompressor(
	sessionId: SessionId,
	logger?: ITelemetryBaseLogger,
): IIdCompressor & IIdCompressorCore;

export function createAlwaysFinalizedIdCompressor(
	sessionIdOrLogger?: SessionId | ITelemetryBaseLogger,
	loggerOrUndefined?: ITelemetryBaseLogger,
): IIdCompressor & IIdCompressorCore {
	const compressor =
		sessionIdOrLogger === undefined
			? createIdCompressor()
			: typeof sessionIdOrLogger === "string"
				? createIdCompressor(sessionIdOrLogger, loggerOrUndefined)
				: createIdCompressor(sessionIdOrLogger);
	// Permanently put the compressor in a ghost session
	(compressor as IdCompressor).startGhostSession(createSessionId());
	return compressor;
}
