/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { RevisionTag } from "../../../core/index.js";
import type { JsonCompatibleReadOnly } from "../../../util/index.js";

/** A serialized SharedTree change that one participant sends to the other participant. */
export interface DataChangeMessage {
	/** Identifies this message as a data-change message. */
	readonly type: "dataChange";
	/** The serialized SharedTree change to apply. */
	readonly change: JsonCompatibleReadOnly;
}

/** Confirms that the receiver applied one data-change message. */
export interface AcknowledgmentMessage {
	/** Identifies this message as an acknowledgment message. */
	readonly type: "acknowledgment";
}

/** A message that the Host and the Guest can send through their shared protocol. */
export type HostGuestMessage = DataChangeMessage | AcknowledgmentMessage;

/** Validates data from a Host and Guest message channel. */
export function parseHostGuestMessage(data: unknown): HostGuestMessage {
	if (typeof data !== "object" || data === null || !("type" in data)) {
		throw new Error("Invalid Host and Guest protocol message.");
	}

	if (data.type === "acknowledgment") {
		return data as AcknowledgmentMessage;
	}

	if (data.type === "dataChange" && "change" in data) {
		return data as DataChangeMessage;
	}

	throw new Error("Invalid Host and Guest protocol message.");
}

/** A promise and the function that resolves it. */
export interface PromiseWithResolver {
	readonly promise: Promise<void>;
	readonly resolver: () => void;
}

/** Creates a promise and the function that resolves it. */
export function makePromiseWithResolver(): PromiseWithResolver {
	let resolver: undefined | (() => void);
	const promise = new Promise<void>((resolve) => {
		resolver = resolve;
	});
	assert(resolver !== undefined, "Resolve function should have been assigned");
	return { promise, resolver };
}

/** Implements the default protocol-error behavior. */
export function throwProtocolError(error: Error): never {
	throw error;
}

/** Converts a thrown value to an error that the protocol-error handler can process. */
export function normalizeProtocolError(error: unknown): Error {
	return error instanceof Error
		? error
		: new Error("Host and Guest protocol processing failed.", { cause: error });
}

/** Gets the revision of a serialized change for diagnostic logging. */
export function getRevision(change: JsonCompatibleReadOnly): RevisionTag {
	return (change as unknown as { revision: RevisionTag }).revision;
}
