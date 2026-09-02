/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";
import * as Type from "@sinclair/typebox";
import type { TSchema } from "@sinclair/typebox";

import { type EncodedRevisionTag, RevisionTagSchema, SessionIdSchema } from "../core/index.js";
import type { JsonCompatibleReadOnly } from "../util/index.js";

import { EncodedCustomMetadataTree } from "./customMetadataFormat.js";
import { MessageFormatVersion } from "./messageFormat.js";

/**
 * The format of messages that SharedTree sends and receives.
 */
export interface Message {
	/**
	 * The revision tag for the change in this message
	 */
	readonly revision: EncodedRevisionTag;
	/**
	 * The stable ID that identifies the originator of the message.
	 */
	readonly originatorId: SessionId;
	/**
	 * The changeset to be applied.
	 */
	readonly changeset: JsonCompatibleReadOnly;

	/**
	 * Arbitrary, application-defined metadata to persist alongside the commit in this message.
	 * @remarks Only written at {@link MessageFormatVersion.v7} and later.
	 */
	readonly customMetadata?: EncodedCustomMetadataTree;

	/**
	 * The version of the message. This controls how the message is encoded.
	 *
	 * This was not set historically and was added before making any breaking changes to the format.
	 * For that reason, absence of a 'version' field is synonymous with version 1.
	 */
	readonly version?:
		| typeof MessageFormatVersion.v1
		| typeof MessageFormatVersion.v2
		| typeof MessageFormatVersion.v3
		| typeof MessageFormatVersion.v4
		| typeof MessageFormatVersion.v6
		| typeof MessageFormatVersion.v7;
}

/* eslint-disable @typescript-eslint/explicit-function-return-type */
// Return type is intentionally derived.
// Unlike the summary formats, this schema does not set `additionalProperties: false`: the op envelope
// has always tolerated unknown properties, and tightening it could reject ops from other versions.
export const Message = <ChangeSchema extends TSchema>(
	tChange: ChangeSchema,
	includeCustomMetadata: boolean,
) =>
	Type.Object({
		revision: RevisionTagSchema,
		originatorId: SessionIdSchema,
		changeset: tChange,
		...(includeCustomMetadata
			? { customMetadata: Type.Optional(EncodedCustomMetadataTree) }
			: {}),
		version: Type.Optional(
			Type.Union([
				Type.Literal(MessageFormatVersion.v1),
				Type.Literal(MessageFormatVersion.v2),
				Type.Literal(MessageFormatVersion.v3),
				Type.Literal(MessageFormatVersion.v4),
				Type.Literal(MessageFormatVersion.v6),
				Type.Literal(MessageFormatVersion.v7),
			]),
		),
	});
/* eslint-enable @typescript-eslint/explicit-function-return-type */
