/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import {
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";

import { IFluidSerializer } from "./serializer.js";
import { SharedObject } from "./sharedObject.js";
import { ISharedObjectEvents } from "./types.js";

/**
 * Functionality specific a particular kind of shared object.
 * @remarks
 * SharedObject's expose APIs for two consumers:
 *
 * 1. The runtime, which uses the SharedObject summarize, load and apply ops.
 * 2. The user, who uses the SharedObject to read and write data.
 *
 * There is some common functionality all shared objects use, provided by {@link SharedObject}.
 * SharedKernel describes the portion of the behavior required by the runtime which
 * differs between different kinds of shared objects.
 *
 * {@link SharedObjectFromKernel} is then used to wrap up the kernel into a full {@link SharedObject}.
 * The runtime specific APIs are then type erased into a {@link SharedObjectKind}.
 * @internal
 */
export interface SharedKernel {
	/**
	 * {@inheritDoc SharedObject.summarizeCore}
	 */
	summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats;

	// TODO: maybe this should be part of the factory, not a method here?
	// That would enable lazy loading the kernel code during this call.
	/**
	 * {@inheritDoc SharedObject.loadCore}
	 */
	loadCore(storage: IChannelStorageService): Promise<void>;

	/**
	 * {@inheritDoc SharedObject.onDisconnect}
	 */
	onDisconnect(): void;

	/**
	 * {@inheritDoc SharedObject.reSubmitCore}
	 */
	reSubmitCore(content: unknown, localOpMetadata: unknown): void;

	/**
	 * {@inheritDoc SharedObjectCore.applyStashedOp}
	 */
	applyStashedOp(content: unknown): void;

	/**
	 * {@inheritDoc SharedObject.processCore}
	 */
	processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void;

	/**
	 * {@inheritDoc SharedObject.rollback}
	 */
	rollback(content: unknown, localOpMetadata: unknown): void;
}

/**
 * SharedObject implementation that delegates to a SharedKernel.
 * @internal
 */
export abstract class SharedObjectFromKernel<
	TEvent extends ISharedObjectEvents,
> extends SharedObject<TEvent> {
	protected abstract get kernel(): SharedKernel;

	protected override summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats {
		return this.kernel.summarizeCore(serializer, telemetryContext);
	}

	protected override async loadCore(storage: IChannelStorageService): Promise<void> {
		return this.kernel.loadCore(storage);
	}

	protected override onDisconnect(): void {
		this.kernel.onDisconnect();
	}

	protected override reSubmitCore(content: unknown, localOpMetadata: unknown): void {
		this.kernel.reSubmitCore(content, localOpMetadata);
	}

	protected override applyStashedOp(content: unknown): void {
		this.kernel.applyStashedOp(content);
	}

	protected override processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		this.kernel.processCore(message, local, localOpMetadata);
	}

	protected override rollback(content: unknown, localOpMetadata: unknown): void {
		this.kernel.rollback(content, localOpMetadata);
	}
}
