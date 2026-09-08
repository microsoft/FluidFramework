/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	MessageType,
	type ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import {
	encodeHandleForSerialization,
	isFluidHandle,
	toFluidHandleInternal,
} from "@fluidframework/runtime-utils/internal";

import type { LocalContainerRuntimeMessage } from "../messageTypes.js";

import type { EmptyGroupedBatch } from "./opGroupingManager.js";

/**
 * Takes an incoming runtime message (outer type "op"), JSON.parses the message's contents in place,
 * if needed (old Loader does this for us).
 * Only to be used for runtime messages. The contents here would be the virtualized payload for a batch of ops.
 * @remarks Serialization during submit happens via {@link serializeOp}
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
 * If `message` is a modern runtime-envelope op (type "op" with a client id), returns a shallow copy
 * with its contents deserialized ({@link ensureContentsDeserialized}); otherwise `undefined`.
 *
 * @remarks Only runtime ops may be deserialized (system ops carry non-JSON payloads), and copying keeps
 * the caller's op untouched for the unpack pipeline. Shared so callers don't re-derive the invariant.
 */
export function tryGetDeserializedRuntimeOpCopy(
	message: ISequencedDocumentMessage,
): (ISequencedDocumentMessage & { clientId: string }) | undefined {
	if (message.type !== MessageType.Operation || typeof message.clientId !== "string") {
		return undefined;
	}
	const messageCopy = { ...message };
	ensureContentsDeserialized(messageCopy);
	return messageCopy as ISequencedDocumentMessage & { clientId: string };
}

/**
 * Before submitting an op to the Outbox, its contents must be serialized using this function.
 * @remarks The deserialization on process happens via the function {@link ensureContentsDeserialized}.
 *
 * @param toSerialize - op message to serialize. Also supports an array of ops.
 */
export function serializeOp(
	toSerialize:
		| EmptyGroupedBatch
		| LocalContainerRuntimeMessage
		| LocalContainerRuntimeMessage[],
): { content: string } {
	return {
		content: JSON.stringify(
			toSerialize,
			// replacer:
			(key, value: unknown) => {
				// If 'value' is an IFluidHandle return its encoded form.
				if (isFluidHandle(value)) {
					return encodeHandleForSerialization(toFluidHandleInternal(value));
				}
				return value;
			},
		),
	};
}
