/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor, SessionId } from "@fluidframework/id-compressor";
import { isStableId } from "@fluidframework/id-compressor/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	type ChangeFamily,
	type RevisionTag,
	tagChange,
	type ChangeEncodingContext,
	type TaggedChange,
} from "../core/index.js";
import type { JsonCompatibleReadOnly } from "../util/index.js";

import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import type { SharedTreeEditBuilder } from "./sharedTreeEditBuilder.js";
import { SharedTreeChangeFormatVersion } from "./sharedTreeChangeCodecs.js";

/**
 * Represents a serialized change for SharedTree.
 *
 * Data in this format is not expected to be durable beyond the scope of a single session.
 */
interface SerializedChange {
	readonly version: 1;
	readonly revision: RevisionTag;
	readonly change: JsonCompatibleReadOnly;
	readonly originatorId: SessionId;
}

function isSerializedChangeV1(value: unknown): value is SerializedChange {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const change = value as Partial<SerializedChange>;
	return (
		change.version === 1 &&
		(change.revision === "root" || typeof change.revision === "number") &&
		typeof change.originatorId === "string" &&
		isStableId(change.originatorId) &&
		change.change !== undefined
	);
}

function encodeSerializedChangeV1(
	idCompressor: IIdCompressor,
	changeFamily: ChangeFamily<SharedTreeEditBuilder, SharedTreeChange>,
	change: SharedTreeChange,
	changeRevision: RevisionTag,
	contextRevision?: RevisionTag,
): JsonCompatibleReadOnly {
	const context: ChangeEncodingContext = {
		idCompressor,
		originatorId: idCompressor.localSessionId,
		revision: contextRevision,
		isSummary: false,
	};
	const encodedChange = changeFamily.codecs
		.resolve(SharedTreeChangeFormatVersion.v4)
		.encode(change, context);

	return {
		version: 1,
		revision: changeRevision,
		originatorId: idCompressor.localSessionId,
		change: encodedChange,
	} satisfies SerializedChange;
}

function decodeSerializedChangeV1(
	idCompressor: IIdCompressor,
	changeFamily: ChangeFamily<SharedTreeEditBuilder, SharedTreeChange>,
	serializedChange: JsonCompatibleReadOnly,
): TaggedChange<SharedTreeChange> {
	if (!isSerializedChangeV1(serializedChange)) {
		throw new UsageError(`Cannot apply change. Invalid serialized change format.`);
	}
	const { revision, originatorId, change } = serializedChange;
	if (originatorId !== idCompressor.localSessionId) {
		throw new UsageError(
			`Cannot apply change. A serialized changed must be applied to the same SharedTree as it was created from.`,
		);
	}
	const context: ChangeEncodingContext = {
		idCompressor,
		originatorId: idCompressor.localSessionId,
		revision,
		isSummary: false,
	};
	const treeChange = changeFamily.codecs
		.resolve(SharedTreeChangeFormatVersion.v4)
		.decode(change, context);
	return tagChange(treeChange, revision);
}

/**
 * Provides utilities for serializing and deserializing SharedTree changes.
 *
 * @remarks Such changes are not expected to be durable beyond the scope of a single session.
 */
export const SerializedChange = {
	/** Utilities for version 1 of the serialized change format. */
	V1: {
		/**
		 * Encodes a SharedTree change into the version 1 serialized change format.
		 * @param idCompressor - The ID compressor to use for encoding.
		 * @param changeFamily - The change family to use for encoding.
		 * @param change - The change to encode.
		 * @param changeRevision - The revision tag for the change.
		 * @param contextRevision - The optional context revision tag.
		 * @returns The encoded change in the version 1 serialized change format.
		 */
		encode: encodeSerializedChangeV1,
		/**
		 * Decodes a version 1 serialized change into a SharedTree change.
		 * @param idCompressor - The ID compressor to use for decoding.
		 * @param changeFamily - The change family to use for decoding.
		 * @param serializedChange - The serialized change to decode.
		 * @returns The decoded SharedTree change.
		 */
		decode: decodeSerializedChangeV1,
	},
} as const;
