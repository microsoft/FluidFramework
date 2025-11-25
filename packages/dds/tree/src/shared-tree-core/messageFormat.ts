/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Brand } from "../util/index.js";

/**
 * The format version for the message.
 */
export const MessageFormatVersion = {
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
	 * Reading capability is currently maintained for backwards compatibility, but it could be removed in the future.
	 * Writing capability needs to be maintained.
	 */
	v3: 3,
	/**
	 * Was inadvertently released in 2.43.0 (through usages of configuredSharedTree) and remains available.
	 * Reading capability must be maintained for backwards compatibility.
	 * Writing capability needs to be maintained.
	 * @privateRemarks TODO: stop writing this version.
	 */
	v4: 4,
	/**
	 * Not yet released.
	 * Only used for testing shared branches.
	 */
	v5: 5,
} as const;
export type MessageFormatVersion = Brand<
	(typeof MessageFormatVersion)[keyof typeof MessageFormatVersion],
	"MessageFormatVersion"
>;
export const supportedMessageFormatVersions: ReadonlySet<MessageFormatVersion> = new Set([
	MessageFormatVersion.v3,
	MessageFormatVersion.v4,
	MessageFormatVersion.v5,
] as MessageFormatVersion[]);
export const messageFormatVersions: ReadonlySet<MessageFormatVersion> = new Set(
	Object.values(MessageFormatVersion) as MessageFormatVersion[],
);
