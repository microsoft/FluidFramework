/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import type { OutboundContainerRuntimeMessage } from "../messageTypes.js";

import type { OpContentsSerializer } from "./opContentsSerializer.js";

/**
 * Before submitting an op to the Outbox, its contents must be serialized using this function.
 * @remarks - The deserialization on process happens via the function {@link ensureContentsDeserialized}.
 */
export function serializeOpContents(
	contents: OutboundContainerRuntimeMessage,
	serializer?: OpContentsSerializer,
): string {
	return serializer ? serializer.stringify(contents) : JSON.stringify(contents);
}

//* TODO: Better encapsulation of this logic with OpContentsSerializer?

/**
 * Takes an incoming runtime message JSON.parse's its contents in place, if needed (old Loader does this for us).
 * Only to be used for runtine messages.
 * @remarks - Serialization during submit happens via {@link serializeOpContents}
 * @param mutableMessage - op message received
 */
export function ensureContentsDeserialized(mutableMessage: ISequencedDocumentMessage): void {
	// This should become unconditional once Loader LTS reaches 2.4 or later.
	// There will be a long time of needing both cases, until LTS advances to that point.
	if (typeof mutableMessage.contents === "string" && mutableMessage.contents !== "") {
		mutableMessage.contents = JSON.parse(mutableMessage.contents);
	}
}
