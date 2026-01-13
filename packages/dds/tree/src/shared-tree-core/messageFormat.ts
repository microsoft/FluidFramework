/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strictEnum, type Values } from "../util/index.js";

/**
 * The format version for the message.
 */
export const MessageFormatVersion = strictEnum("MessageFormatVersion", {
	/**
	 * NOTE: this is written as `undefined` rather than `0` in the wire format.
	 * Introduced and retired prior to 2.0.
	 * Reading and writing capability removed in 2.73.0.
	 */
	undefined: 0,
	/**
	 * Introduced and retired prior to 2.0.
	 * Reading and writing capability removed in 2.73.0.
	 */
	v1: 1,
	/**
	 * Introduced and retired prior to 2.0.
	 * Reading and writing capability removed in 2.73.0.
	 */
	v2: 2,
	/**
	 * Introduced prior to 2.0 and used beyond.
	 * Reading capability must be maintained for backwards compatibility.
	 * Writing capability needs to be maintained so long as {@link lowestMinVersionForCollab} is less than 2.2.0.
	 */
	v3: 3,
	/**
	 * Introduced in 2.2.0.
	 * Was inadvertently made usable for writing in 2.43.0 (through configuredSharedTree) and remains available.
	 * Reading capability must be maintained for backwards compatibility.
	 * Writing capability could be dropped in favor of {@link MessageFormatVersion.v3},
	 * but doing so would make the pattern of writable versions more complex and gain little
	 * because most of the logic for this format is shared with {@link MessageFormatVersion.v3}.
	 */
	v4: 4,
	/**
	 * This version number was used internally for testing shared branches.
	 * This format was never made stable.
	 * This version number is kept here solely to avoid reusing the number: it is not supported for either reading or writing.
	 * @deprecated Use {@link MessageFormatVersion.vSharedBranches} for testing shared branches.
	 */
	v5: 5,
	/**
	 * Introduced and made available for writing in 2.80.0
	 * Adds support for "no change" constraints.
	 */
	v6: 6,
	/**
	 * Not yet released.
	 * Only used for testing shared branches.
	 */
	vSharedBranches: "shared-branches|v0.1",
});
export type MessageFormatVersion = Values<typeof MessageFormatVersion>;
export const supportedMessageFormatVersions: ReadonlySet<MessageFormatVersion> = new Set([
	MessageFormatVersion.v3,
	MessageFormatVersion.v4,
	MessageFormatVersion.v6,
	MessageFormatVersion.vSharedBranches,
]);
export const messageFormatVersions: ReadonlySet<MessageFormatVersion> = new Set(
	Object.values(MessageFormatVersion),
);
