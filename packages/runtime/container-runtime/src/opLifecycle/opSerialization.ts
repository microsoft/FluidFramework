/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import {
	encodeHandleForSerialization,
	isFluidHandle,
	toFluidHandleInternal,
} from "@fluidframework/runtime-utils/internal";

import type { LocalContainerRuntimeMessage } from "../messageTypes.js";

/**
 * Takes an incoming runtime message (outer type "op"), JSON.parses the message's contents in place,
 * if needed (old Loader does this for us).
 * Only to be used for runtime messages. The contents here would be the virtualized payload for a batch of ops.
 * @remarks - Serialization during submit happens via {@link serializeOp}
 * @param mutableMessage - op message received
 */
export function ensureContentsDeserialized(mutableMessage: ISequencedDocumentMessage): void {
	// This should become unconditional once Loader LTS reaches 2.4 or later.
	// There will be a long time of needing both cases, until LTS advances to that point.
	if (typeof mutableMessage.contents === "string" && mutableMessage.contents !== "") {
		mutableMessage.contents = JSON.parse(mutableMessage.contents);
	}
}

/**
 * Before submitting an op to the Outbox, its contents must be serialized using this function.
 * @remarks - The deserialization on process happens via the function {@link ensureContentsDeserialized}.
 *
 * @param toSerialize - op message to serialize. Also supports an array of ops.
 */
export function serializeOp(
	toSerialize: LocalContainerRuntimeMessage | LocalContainerRuntimeMessage[],
): string {
	return JSON.stringify(
		toSerialize,
		// replacer:
		(key, value: unknown) => {
			// If 'value' is an IFluidHandle return its encoded form.
			if (isFluidHandle(value)) {
				return encodeHandleForSerialization(toFluidHandleInternal(value));
			}
			return value;
		},
	);
}
