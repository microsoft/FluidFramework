/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "@fluidframework/id-compressor";
import { isStableId } from "@fluidframework/id-compressor/internal";
import { fail } from "@fluidframework/core-utils/internal";
import * as Type from "typebox";
import type { Static, TSchema } from "typebox";

import {
	type DecodeErrorHandler,
	type FormatVersion,
	type FormatValidator,
	type IJsonCodec,
	throwDecodeError,
	withSchemaValidation,
} from "../codec/index.js";
import {
	type ChangeFamily,
	type CustomMetadataTree,
	type RevisionTag,
	RevisionTagSchema,
	SessionIdSchema,
	type ChangeEncodingContext,
	type TaggedChange,
} from "../core/index.js";
import {
	decodeCustomMetadataTree,
	EncodedCustomMetadataTree,
	type EncodedCustomMetadataTree as EncodedCustomMetadataTreeType,
	encodeCustomMetadataTree,
} from "../shared-tree-core/index.js";
import type { JsonCompatibleReadOnly, JsonCompatibleReadOnlySchema } from "../util/index.js";

import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import type { SharedTreeEditBuilder } from "./sharedTreeEditBuilder.js";

/**
 * Format version for the envelope containing an encoded {@link SerializableChange}.
 * @remarks
 * This is independent from the nested SharedTree change format, whose newest supported version is selected dynamically.
 */
const serializedChangeFormatVersion = 2;

/**
 * TypeBox schema for the encoded representation of a {@link SerializableChange}.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createSerializedChangeSchema<TChangeSchema extends TSchema>(
	changeSchema: TChangeSchema,
) {
	return Type.Object(
		{
			/** Identifies the serialized change format. */
			version: Type.Literal(serializedChangeFormatVersion),
			/** Identifies the commit containing the change. */
			revision: Type.Unsafe<RevisionTag>(RevisionTagSchema),
			/** The encoded SharedTree change. */
			change: changeSchema,
			/** Identifies the ID-compressor session required to decode the change. */
			originatorId: SessionIdSchema,
			/** Application-defined metadata attached to the commit. */
			customMetadata: Type.Optional(
				Type.Unsafe<EncodedCustomMetadataTreeType>(EncodedCustomMetadataTree),
			),
		},
		{ additionalProperties: false },
	);
}

/**
 * Wire representation of a {@link SerializableChange}, derived from its TypeBox schema.
 */
type EncodedSerializedChange = Static<
	ReturnType<typeof createSerializedChangeSchema<typeof JsonCompatibleReadOnlySchema>>
>;

/**
 * The portion of a SharedTree commit that can be transferred between checkouts.
 *
 * @remarks
 * A serializable change pairs a {@link SharedTreeChange} with its
 * {@link TaggedChange.revision | revision} and any associated
 * {@link CustomMetadataTree | custom metadata}.
 * It represents the transferable content of a commit, but does not include commit-graph information
 * such as the parent commit or sequencing state.
 * Applying it creates a commit on the receiving checkout's branch.
 *
 * Applying a serializable change does not rebase it.
 * The receiving checkout must therefore be in a state equivalent to the state against which the
 * original change was authored, typically by having an equivalent branch at the original commit's
 * parent.
 * Equivalent visible tree content alone is not sufficient: schema, revision, and identifier context
 * referenced by the change must also be compatible.
 * The serialized form does not identify or validate the required base state.
 * Callers that transfer changes between checkouts must establish this precondition or rebase the
 * change before applying it.
 *
 * The encoded representation is transient and valid only within the ID-compressor session that
 * produced it.
 * It is not an op or summary format and is not intended for durable persistence.
 * The encoded envelope records the originating ID-compressor session, and the enclosed
 * {@link SharedTreeChange} is encoded using the newest change format supported by the supplied
 * {@link ChangeFamily}.
 */
interface SerializableChange {
	/** The SharedTree change and its revision. */
	readonly change: TaggedChange<SharedTreeChange, RevisionTag>;
	/** Application-defined metadata attached to the commit. */
	readonly customMetadata?: CustomMetadataTree;
}

/**
 * Context needed to encode a {@link SerializableChange}.
 */
interface SerializedChangeEncodingContext {
	readonly idCompressor: IIdCompressor;
	/** Revision context used by the encoded change, if different from its own revision. */
	readonly revision?: RevisionTag;
}

/**
 * Context needed to decode a {@link SerializableChange}.
 */
interface SerializedChangeDecodingContext {
	readonly idCompressor: IIdCompressor;
}

/**
 * Codec between a {@link SerializableChange} and its wire representation.
 */
export type SerializedChangeCodec = IJsonCodec<
	SerializableChange,
	EncodedSerializedChange & JsonCompatibleReadOnly,
	unknown,
	SerializedChangeEncodingContext,
	SerializedChangeDecodingContext
>;

/**
 * Gets the newest SharedTree change format supported by a codec family.
 */
function getLatestSharedTreeChangeFormatVersion(
	supportedFormats: Iterable<FormatVersion>,
): number {
	let latest: number | undefined;
	for (const format of supportedFormats) {
		if (typeof format !== "number") {
			fail(0xd68 /* SharedTree change format versions must be numbers */);
		}
		latest = latest === undefined ? format : Math.max(latest, format);
	}
	return latest ?? fail(0xd69 /* SharedTree change codec family has no supported formats */);
}

/**
 * Performs the minimum checks needed to safely decode a {@link SerializableChange} when schema validation is disabled.
 */
function isSerializedChangeV2(value: unknown): value is EncodedSerializedChange {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const change = value as Partial<EncodedSerializedChange>;
	return (
		change.version === serializedChangeFormatVersion &&
		(change.revision === "root" || typeof change.revision === "number") &&
		typeof change.originatorId === "string" &&
		isStableId(change.originatorId) &&
		change.change !== undefined
	);
}

/**
 * Creates a {@link SerializedChangeCodec}.
 *
 * @see {@link SerializableChange} for the format's lifetime and application requirements.
 */
export function makeSerializedChangeCodec(
	changeFamily: ChangeFamily<SharedTreeEditBuilder, SharedTreeChange, unknown>,
	validator: FormatValidator,
): SerializedChangeCodec {
	const changeCodec = changeFamily.codecs.resolve(
		getLatestSharedTreeChangeFormatVersion(changeFamily.codecs.getSupportedFormats()),
	);
	const schema = createSerializedChangeSchema(
		changeCodec.encodedSchema ??
			fail(0xd6a /* Serialized change codec requires an encoded schema */),
	);

	const codec: SerializedChangeCodec = {
		encode: (
			data: SerializableChange,
			context: SerializedChangeEncodingContext,
		): EncodedSerializedChange & JsonCompatibleReadOnly => {
			const { idCompressor, revision: contextRevision } = context;
			const { revision, change } = data.change;
			const changeContext: ChangeEncodingContext = {
				idCompressor,
				originatorId: idCompressor.localSessionId,
				revision: contextRevision,
				isSummary: false,
			};
			const encoded = {
				version: serializedChangeFormatVersion,
				revision,
				originatorId: idCompressor.localSessionId,
				change: changeCodec.encode(change, changeContext),
				...(data.customMetadata === undefined
					? {}
					: { customMetadata: encodeCustomMetadataTree(data.customMetadata) }),
			} satisfies EncodedSerializedChange;

			return encoded;
		},
		decode: (
			encoded: unknown,
			context: SerializedChangeDecodingContext,
			onError?: DecodeErrorHandler,
		): SerializableChange => {
			if (!isSerializedChangeV2(encoded)) {
				throwDecodeError(onError, "Cannot apply change. Invalid serialized change format.");
			}
			const { revision, originatorId, change, customMetadata } = encoded;
			if (originatorId !== context.idCompressor.localSessionId) {
				throwDecodeError(
					onError,
					"Cannot apply change. A serialized change must be applied to the same SharedTree as it was created from.",
				);
			}
			const changeContext: ChangeEncodingContext = {
				idCompressor: context.idCompressor,
				originatorId,
				revision,
				isSummary: false,
			};
			return {
				change: { change: changeCodec.decode(change, changeContext, onError), revision },
				customMetadata: decodeCustomMetadataTree(customMetadata),
			};
		},
	};

	return withSchemaValidation(schema, codec, validator);
}
