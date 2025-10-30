/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Brand } from "../util/index.js";

/**
 * The format version for the message.
 */
export const MessageFormatVersion = {
	undefined: 0,
	v1: 1,
	v2: 2,
	v3: 3,
	v4: 4,
	v5: 5,
} as const;
export type MessageFormatVersion = Brand<
	(typeof MessageFormatVersion)[keyof typeof MessageFormatVersion],
	"MessageFormatVersion"
>;
export const messageFormatVersions: ReadonlySet<MessageFormatVersion> = new Set(
	Object.values(MessageFormatVersion) as MessageFormatVersion[],
);
