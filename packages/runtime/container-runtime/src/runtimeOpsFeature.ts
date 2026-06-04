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
 * reassembled in the inbound pipeline before reaching feature dispatch and
 * are excluded from `LocalContainerRuntimeMessage`, so every hook here is a
 * "should not happen" guard. Each one throws explicitly rather than letting
 * the collection's missing-handler path collapse to the unknown-type close.
 *
 * @internal
 */
export const chunkedOpsGuardFeature = (): IRuntimeFeature<ContainerMessageType.ChunkedOp> => {
	const fail = (): never => {
		throw new Error("ChunkedOp should not reach the feature dispatch path");
	};
	return {
		supportedOps: CHUNKED_OPS,
		handleOp: fail,
		applyStashedOp: fail,
		reSubmitOp: fail,
		rollbackStagedOp: fail,
	};
};
