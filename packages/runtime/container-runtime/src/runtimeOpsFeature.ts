/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerMessageType, type LocalContainerRuntimeMessage } from "./messageTypes.js";
import type { IRuntimeFeature } from "./runtimeFeature.js";

const REJOIN_OPS = [ContainerMessageType.Rejoin] as const;
const CHUNKED_OPS = [ContainerMessageType.ChunkedOp] as const;

/**
 * Routes the {@link ContainerMessageType.Rejoin} op type. Inbound rejoin ops
 * are no-ops; stashed rejoin ops are unexpected; resubmitted rejoin ops are
 * forwarded to {@link rejoinFeature}'s `resubmit` callback.
 *
 * @internal
 */
export const rejoinFeature = (
	resubmit: (message: LocalContainerRuntimeMessage) => void,
): IRuntimeFeature<ContainerMessageType.Rejoin> => ({
	supportedOps: REJOIN_OPS,
	handleOp: () => {
		// Rejoin is observational only.
	},
	applyStashedOp: () => {
		throw new Error("rejoin not expected here");
	},
	reSubmitOp: (message) => {
		resubmit(message);
	},
});

/**
 * Routes the {@link ContainerMessageType.ChunkedOp} op type. ChunkedOps are
 * reassembled in the inbound pipeline before reaching feature dispatch — if
 * one arrives here, fail loudly.
 *
 * @internal
 */
export const chunkedOpsGuardFeature = (): IRuntimeFeature<ContainerMessageType.ChunkedOp> => ({
	supportedOps: CHUNKED_OPS,
	handleOp: () => {
		throw new Error("ChunkedOp should not reach the feature dispatch path");
	},
});
