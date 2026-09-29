/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor, SessionId } from "@fluidframework/id-compressor";
import { isStableId } from "@fluidframework/id-compressor/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	type ChangeFamily,
	type CustomMetadataTree,
	type RevisionTag,
	tagChange,
	type ChangeEncodingContext,
	type TaggedChange,
} from "../core/index.js";
import {
	decodeCustomMetadataTree,
	type EncodedCustomMetadataTree,
	encodeCustomMetadataTree,
} from "../shared-tree-core/index.js";
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
	/** Identifies the serialized change format. */
	readonly version: 2;
	/** Identifies the commit containing the change. */
	readonly revision: RevisionTag;
	/** The encoded SharedTree change. */
	readonly change: JsonCompatibleReadOnly;
	/** Identifies the ID-compressor session required to decode the change. */
	readonly originatorId: SessionId;
	/** Application-defined metadata attached to the commit. */
	readonly customMetadata?: EncodedCustomMetadataTree;
}

interface DecodedSerializedChange {
	/** The decoded SharedTree change and its revision. */
	readonly change: TaggedChange<SharedTreeChange>;
	/** Application-defined metadata attached to the commit. */
	readonly customMetadata: CustomMetadataTree | undefined;
}

function isSerializedChangeV2(value: unknown): value is SerializedChange {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const change = value as Partial<SerializedChange>;
	return (
		change.version === 2 &&
		(change.revision === "root" || typeof change.revision === "number") &&
		typeof change.originatorId === "string" &&
		isStableId(change.originatorId) &&
		change.change !== undefined
	);
}

function encodeSerializedChangeV2(
	idCompressor: IIdCompressor,
	changeFamily: ChangeFamily<SharedTreeEditBuilder, SharedTreeChange, unknown>,
	change: SharedTreeChange,
	changeRevision: RevisionTag,
	contextRevision?: RevisionTag,
	customMetadata?: CustomMetadataTree,
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

	const serializedChange = {
		version: 2,
		revision: changeRevision,
		originatorId: idCompressor.localSessionId,
		change: encodedChange,
		...(customMetadata === undefined
			? {}
			: { customMetadata: encodeCustomMetadataTree(customMetadata) }),
	} satisfies SerializedChange;
	return serializedChange;
}

function decodeSerializedChangeV2(
	idCompressor: IIdCompressor,
	changeFamily: ChangeFamily<SharedTreeEditBuilder, SharedTreeChange, unknown>,
	serializedChange: JsonCompatibleReadOnly,
): DecodedSerializedChange {
	if (!isSerializedChangeV2(serializedChange)) {
		throw new UsageError(`Cannot apply change. Invalid serialized change format.`);
	}
	const { revision, originatorId, change, customMetadata } = serializedChange;
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
	return {
		change: tagChange(treeChange, revision),
		customMetadata: decodeCustomMetadataTree(customMetadata),
	};
}

/**
 * Provides utilities for serializing and deserializing SharedTree changes.
 *
 * @remarks
 * This format is **not** used in persisted Fluid containers or Ops.
 *
 * These changes are not expected to be durable beyond the scope of a single session.
 * Due to this limitation, there is no need to support older formats,
 * and thus no need for using the {@link VersionDispatchingCodecBuilder}.
 */
export const SerializedChange = {
	/** Utilities for version 2 of the serialized change format. */
	V2: {
		/**
		 * Encodes a SharedTree change into the version 2 serialized change format.
		 * @param idCompressor - The ID compressor to use for encoding.
		 * @param changeFamily - The change family to use for encoding.
		 * @param change - The change to encode.
		 * @param changeRevision - The revision tag for the change.
		 * @param contextRevision - The optional context revision tag.
		 * @param customMetadata - The metadata attached to the commit.
		 * @returns The encoded change in the version 2 serialized change format.
		 */
		encode: encodeSerializedChangeV2,
		/**
		 * Decodes a version 2 serialized change into a SharedTree change.
		 * @param idCompressor - The ID compressor to use for decoding.
		 * @param changeFamily - The change family to use for decoding.
		 * @param serializedChange - The serialized change to decode.
		 * @returns The decoded SharedTree change.
		 */
		decode: decodeSerializedChangeV2,
	},
} as const;
