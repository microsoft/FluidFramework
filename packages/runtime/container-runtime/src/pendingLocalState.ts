/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Determines whether a pending local state can safely be used to load multiple containers.
 *
 * @param pendingLocalState - A serialized pending local state returned by
 * {@link @fluidframework/container-definitions#IContainer.getPendingLocalState}.
 * @returns `true` only when the state is a valid attached-container state with no pending runtime
 * state. Returns `false` for malformed state and whenever safety cannot be established.
 *
 * @legacy @beta
 */
export function isPendingLocalStateReusable(pendingLocalState: string): boolean {
	let state: unknown;
	try {
		state = JSON.parse(pendingLocalState);
	} catch (error) {
		if (error instanceof SyntaxError) {
			return false;
		}
		throw error;
	}

	return (
		isRecord(state) &&
		state.attached === true &&
		typeof state.url === "string" &&
		isRecord(state.baseSnapshot) &&
		isRecord(state.snapshotBlobs) &&
		Array.isArray(state.savedOps) &&
		!Object.prototype.hasOwnProperty.call(state, "pendingRuntimeState")
	);
}
