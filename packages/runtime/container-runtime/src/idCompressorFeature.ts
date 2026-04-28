/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IdCreationRange } from "@fluidframework/id-compressor/internal";

import { ContainerMessageType } from "./messageTypes.js";
import type { IRuntimeFeature } from "./runtimeFeature.js";

/**
 * Feature shell that owns the inbound / stashed / resubmit handling for
 * {@link ContainerMessageType.IdAllocation}. The actual finalize bookkeeping
 * (delayed compressor mode, pending range queue) stays on ContainerRuntime
 * for now and is reached via the `processIdAllocation` callback.
 *
 * The point of the feature is to remove the IdAllocation arm from the residual
 * switches in ContainerRuntime — message routing for this op type now lives
 * in one place.
 *
 * @internal
 */
export class IdCompressorFeature implements IRuntimeFeature {
	constructor(
		private readonly processIdAllocation: (
			contents: IdCreationRange[],
			savedOp?: boolean,
		) => void,
		private readonly hasIdCompressor: () => boolean,
	) {}

	public handleOp(
		message: unknown,
		messagesContent: unknown[],
		_local: boolean,
		savedOp?: boolean,
	): boolean {
		if (
			(message as { type: ContainerMessageType }).type !== ContainerMessageType.IdAllocation
		) {
			return false;
		}
		const contents = (messagesContent as { contents: unknown }[]).map((c) => c.contents);
		this.processIdAllocation(contents as IdCreationRange[], savedOp);
		return true;
	}

	public applyStashedOp(opContents: unknown): { result: unknown } | undefined {
		if (
			(opContents as { type: ContainerMessageType }).type !== ContainerMessageType.IdAllocation
		) {
			return undefined;
		}
		// IDs allocation ops in stashed state are ignored because the tip state of the
		// compressor is serialized into the pending state. Compressor must be in use.
		if (!this.hasIdCompressor()) {
			throw new Error("ID compressor should be in use to stash an IdAllocation op");
		}
		return { result: undefined };
	}

	public reSubmitOp(message: unknown): boolean {
		if (
			(message as { type: ContainerMessageType }).type !== ContainerMessageType.IdAllocation
		) {
			return false;
		}
		// Allocation ops are never resubmitted/rebased — the runtime submits a fresh
		// allocation range covering all pending IDs before invoking pending replay.
		return true;
	}
}
