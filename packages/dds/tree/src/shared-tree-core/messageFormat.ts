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
	 * Reading capability is currently maintained for backwards compatibility, but it could be removed in the future.
	 * Writing capability need not be maintained.
	 */
	undefined: 0,
	/**
	 * Introduced and retired prior to 2.0.
	 * Reading capability is currently maintained for backwards compatibility, but it could be removed in the future.
	 * Writing capability need not be maintained.
	 */
	v1: 1,
	/**
	 * Introduced and retired prior to 2.0.
	 * Reading capability is currently maintained for backwards compatibility, but it could be removed in the future.
	 * Writing capability need not be maintained.
	 */
	v2: 2,
	/**
	 * Introduced prior to 2.0 and used beyond.
	 * Reading capability is currently maintained for backwards compatibility, but it could be removed in the future.
	 * Writing capability needs to be maintained.
	 */
	v3: 3,
	/**
	 * Was inadvertently released in 2.43.0 (through usages of configuredSharedTree) and remained available as a write format until 2.71.
	 * Reading capability must be maintained for backwards compatibility.
	 * Writing capability need not be maintained.
	 */
	v4: 4,
	/**
	 * Not yet released.
	 * Only used for testing shared branches.
	 */
	v5: 5,
};
export type MessageFormatVersion = Brand<
	(typeof MessageFormatVersion)[keyof typeof MessageFormatVersion],
	"MessageFormatVersion"
>;
export const messageFormatVersions: ReadonlySet<MessageFormatVersion> = new Set(
	Object.values(MessageFormatVersion) as MessageFormatVersion[],
);
