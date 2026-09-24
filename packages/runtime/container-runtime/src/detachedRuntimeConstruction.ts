/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";
import { isStableId } from "@fluidframework/id-compressor/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

/**
 * Configures a temporary detached runtime used to construct a native snapshot.
 *
 * @remarks
 * This mode requires a new, disconnected, detached container with no snapshot or pending local state.
 * The runtime ID compressor must be enabled with mode `"on"`, and short data store IDs must not be disabled.
 * Data store IDs are deterministic for a given creation order while the container is detached.
 * Applications must also create their DDSs and initialize their content deterministically.
 *
 * The construction runtime cannot attach, connect, or export pending local state.
 * Serialize its native summary, then close the temporary container.
 * Load that summary without these options so each live runtime receives a fresh compressor session.
 *
 * Construction preserves ordinary native telemetry metadata, including the creation timestamp and telemetry document ID.
 * These values can differ between constructions.
 * Deterministic collaborative identities do not imply byte-identical summaries.
 *
 * @legacy @beta
 */
export interface IDetachedRuntimeConstructionOptions {
	/**
	 * The compressor session used only while constructing the detached snapshot.
	 *
	 * @remarks
	 * Use the same lowercase version 4 UUID when reconstructing the same initial graph.
	 * The runtime validates this string before constructing the compressor.
	 * Native summary serialization finalizes constructed IDs and excludes resumable local-session state.
	 * Never use this session as the local session of a live client.
	 */
	readonly idCompressorSessionId: string;
}

/**
 * Validate and copy construction settings before asynchronous runtime loading.
 */
export function captureDetachedRuntimeConstructionOptions(
	options: IDetachedRuntimeConstructionOptions | undefined,
): { readonly idCompressorSessionId: SessionId } | undefined {
	if (options === undefined) {
		return undefined;
	}
	const sessionId = options.idCompressorSessionId;
	if (!isConstructionSessionId(sessionId)) {
		throw new UsageError("Detached construction requires a valid compressor session ID");
	}
	return { idCompressorSessionId: sessionId };
}

function isConstructionSessionId(value: unknown): value is SessionId {
	return typeof value === "string" && isStableId(value);
}
