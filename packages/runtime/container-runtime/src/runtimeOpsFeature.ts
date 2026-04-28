/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerMessageType, type LocalContainerRuntimeMessage } from "./messageTypes.js";
import type { IRuntimeFeature } from "./runtimeFeature.js";

/**
 * Owns routing for runtime-internal op types that aren't tied to a specific
 * subsystem — currently {@link ContainerMessageType.Rejoin} and the
 * already-unwrapped {@link ContainerMessageType.ChunkedOp}. These ops never
 * surface to user code and are ignored or replayed by the runtime itself.
 *
 * @internal
 */
export class RuntimeOpsFeature implements IRuntimeFeature {
	constructor(
		private readonly resubmitRejoin: (message: LocalContainerRuntimeMessage) => void,
	) {}

	public handleOp(message: unknown): boolean {
		const m = message as { type: ContainerMessageType };
		if (m.type === ContainerMessageType.Rejoin) {
			return true;
		}
		if (m.type === ContainerMessageType.ChunkedOp) {
			// ChunkedOps are reassembled in the inbound pipeline before getting here.
			// Reaching this point means a chunk leaked through — fail loudly.
			throw new Error("ChunkedOp should not reach the feature dispatch path");
		}
		return false;
	}

	public applyStashedOp(opContents: unknown): { result: unknown } | undefined {
		const m = opContents as { type: ContainerMessageType };
		if (m.type !== ContainerMessageType.Rejoin) {
			return undefined;
		}
		throw new Error("rejoin not expected here");
	}

	public reSubmitOp(message: unknown): boolean {
		const m = message as LocalContainerRuntimeMessage;
		if (m.type !== ContainerMessageType.Rejoin) {
			return false;
		}
		this.resubmitRejoin(m);
		return true;
	}
}
