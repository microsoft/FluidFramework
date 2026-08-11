/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerMessageType } from "../messageTypes.js";
import type { LocalBatchMessage, OutboundBatchMessage } from "../opLifecycle/index.js";

// //////////////////////////////////////////////////
// NOTE: THESE TESTS ARE NOT TO BE RUN, ONLY COMPILED
// //////////////////////////////////////////////////

// TYPE TEST CASE: Try converting from LocalBatchMessage to OutboundBatchMessage.  Make sure runtimeOp must be erased.
export function testLocalToOutbound(localBatchMessage: LocalBatchMessage): unknown {
	const goodOutboundBatchMessage: OutboundBatchMessage = {
		...localBatchMessage,
		runtimeOp: undefined,
		contents: "test",
	};

	// @ts-expect-error "runtimeOp must be explicitly erased by setting to undefined"
	const badOutboundBatchMessage: OutboundBatchMessage = {
		...localBatchMessage,
		contents: "test",
	};

	return { goodOutboundBatchMessage, badOutboundBatchMessage };
}

// TYPE TEST CASE: Try converting from OutboundBatchMessage to LocalBatchMessage.  Make sure contents must be erased.
export function testOutboundToLocal(outboundBatchMessage: OutboundBatchMessage): unknown {
	const goodLocalBatchMessage: LocalBatchMessage = {
		...outboundBatchMessage,
		contents: undefined,
		runtimeOp: { type: ContainerMessageType.Rejoin, contents: undefined },
	};
	// @ts-expect-error "contents must be explicitly erased by setting to undefined"
	const badLocalBatchMessage: LocalBatchMessage = {
		...outboundBatchMessage,
		runtimeOp: { type: ContainerMessageType.Rejoin, contents: undefined },
	};
	return { goodLocalBatchMessage, badLocalBatchMessage };
}
