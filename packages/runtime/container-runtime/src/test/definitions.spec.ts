/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerMessageType } from "../messageTypes.js";
import type { LocalBatchMessage, OutboundBatchMessage } from "../opLifecycle/index.js";

// TEST CASE: Try converting from LocalBatchMessage to OutboundBatchMessage.  Make sure runtimeOp is erased.
declare const localBatchMessage: LocalBatchMessage;
export const goodOutboundBatchMessage: OutboundBatchMessage = {
	...localBatchMessage,
	runtimeOp: undefined,
	contents: "test",
};
// @ts-expect-error "runtimeOp must be explicitly erased by setting to undefined"
export const badOutboundBatchMessage: OutboundBatchMessage = {
	...localBatchMessage,
	contents: "test",
};

// TEST CASE: Try converting from OutboundBatchMessage to LocalBatchMessage.  Make sure contents is erased.
declare const outboundBatchMessage: OutboundBatchMessage;
export const goodLocalBatchMessage: LocalBatchMessage = {
	...outboundBatchMessage,
	contents: undefined,
	runtimeOp: { type: ContainerMessageType.Rejoin, contents: undefined },
};
// @ts-expect-error "contents must be explicitly erased by setting to undefined"
export const badLocalBatchMessage: LocalBatchMessage = {
	...outboundBatchMessage,
	runtimeOp: { type: ContainerMessageType.Rejoin, contents: undefined },
};
