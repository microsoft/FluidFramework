/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { AttachState, IDeltaManager } from "@fluidframework/container-definitions/internal";
import { FluidObject, IRequest, IResponse } from "@fluidframework/core-interfaces";
import type { IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import { assert, Deferred, unreachableCase } from "@fluidframework/core-utils/internal";
import { FluidObjectHandle } from "@fluidframework/datastore/internal";
import { IFluidDataStoreRuntimeEvents } from "@fluidframework/datastore-definitions/internal";
import {
	IDocumentMessage,
	type ISnapshotTree,
	ISequencedDocumentMessage,
	IQuorumClients,
} from "@fluidframework/driver-definitions/internal";
import {
	IGarbageCollectionData,
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	IInboundSignalMessage,
	VisibilityState,
	type ISummaryTreeWithStats,
	type ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";
import {
	ITelemetryLoggerExt,
	MonitoringContext,
	raiseConnectedEvent,
	createChildMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";

import { RuntimeAttributor } from "./runtimeAttributor.js";

/**
 * Data store channel for the runtime attributor. This channel is responsible for storing and managing the
 */
export class RuntimeAttributorDataStoreChannel
	extends TypedEventEmitter<IFluidDataStoreRuntimeEvents>
	implements IFluidDataStoreChannel
{
	public constructor(
		public readonly dataStoreContext: IFluidDataStoreContext,
		existing: boolean,
	) {
		super();
		this.runtimeAttributor = new RuntimeAttributor();
		this.mc = createChildMonitoringContext({
			logger: dataStoreContext.baseLogger,
			namespace: "Attributor",
		});
		this.attachState = dataStoreContext.attachState;
		if (existing) {
			this.visibilityState =
				dataStoreContext.attachState === AttachState.Detached
					? VisibilityState.LocallyVisible
					: VisibilityState.GloballyVisible;
		} else {
			this.visibilityState = VisibilityState.NotVisible;
		}
		// If it's existing we know it has been attached.
		if (existing) {
			this.deferredAttached.resolve();
		}
		this.entryPoint = new FluidObjectHandle<FluidObject>(
			this.runtimeAttributor,
			"",
			dataStoreContext.IFluidHandleContext,
		);
	}

	public get IFluidDataStoreChannel(): IFluidDataStoreChannel {
		return this;
	}

	private _disposed = false;
	public get disposed(): boolean {
		return this._disposed;
	}

	public dispose(): void {
		this._disposed = true;
	}

	private readonly runtimeAttributor: RuntimeAttributor;
	public isEnabled = true;
	public attachState: AttachState;
	public visibilityState: VisibilityState;
	private readonly deferredAttached = new Deferred<void>();
	private readonly mc: MonitoringContext;
	public get logger(): ITelemetryLoggerExt {
		return this.mc.logger;
	}

	public async initialize(
		deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
		quorum: IQuorumClients,
		baseSnapshotForAttributorTree: ISnapshotTree | undefined,
		readBlob: (id: string) => Promise<ArrayBufferLike>,
	): Promise<void> {
		await this.runtimeAttributor.initialize(
			deltaManager,
			quorum,
			baseSnapshotForAttributorTree,
			readBlob,
		);
	}

	/**
	 * {@inheritdoc IFluidDataStoreChannel.makeVisibleAndAttachGraph}
	 */
	public makeVisibleAndAttachGraph(): void {
		if (this.visibilityState !== VisibilityState.NotVisible) {
			return;
		}
		this.visibilityState = VisibilityState.LocallyVisible;

		this.dataStoreContext.makeLocallyVisible();
	}

	/**
	 * {@inheritdoc IFluidDataStoreChannel.getAttachSummary}
	 */
	public getAttachSummary(telemetryContext?: ITelemetryContext): ISummaryTreeWithStats {
		return this.runtimeAttributor.summarizeOpAttributor();
	}

	/**
	 * {@inheritdoc IFluidDataStoreChannel.getAttachGCData}
	 */
	public getAttachGCData(telemetryContext?: ITelemetryContext): IGarbageCollectionData {
		return { gcNodes: {} };
	}

	/**
	 * {@inheritdoc IFluidDataStoreChannel.process}
	 */
	public process(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		throw new Error("Attributor should not receive messages yet");
	}

	/**
	 * {@inheritdoc IFluidDataStoreChannel.processSignal}
	 */
	public processSignal(message: IInboundSignalMessage, local: boolean): void {
		throw new Error("Attributor should not receive signals");
	}

	/**
	 * {@inheritdoc IFluidDataStoreChannel.summarize}
	 */
	public async summarize(
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats> {
		return this.runtimeAttributor.summarizeOpAttributor();
	}

	/**
	 * {@inheritdoc IFluidDataStoreChannel.getGCData}
	 */
	public async getGCData(fullGC?: boolean): Promise<IGarbageCollectionData> {
		// Nothing to be GCed from the attributor.
		const garbageCollectionData: IGarbageCollectionData = { gcNodes: {} };
		return garbageCollectionData;
	}

	/**
	 * {@inheritdoc IFluidDataStoreChannel.updateUsedRoutes}
	 */
	public updateUsedRoutes(usedRoutes: string[]): void {
		return;
	}

	/**
	 * {@inheritdoc IFluidDataStoreChannel.setConnectionState}
	 */
	public setConnectionState(connected: boolean, clientId?: string): void {
		raiseConnectedEvent(this.logger, this, connected, clientId);
	}

	/**
	 * {@inheritdoc IFluidDataStoreChannel.reSubmit}
	 */
	public reSubmit(type: string, content: unknown, localOpMetadata: unknown): void {
		// Should not resubmit anything from the attributor as the attributor does not send ops yet.
		throw new Error("Should not resubmit anything from the attributor");
	}

	/**
	 * {@inheritdoc IFluidDataStoreChannel.applyStashedOp}
	 */
	public async applyStashedOp(content: unknown): Promise<unknown> {
		// Should not apply stashed ops to the attributor as the attributor does not send ops yet.
		throw new Error("Should not apply stashed ops to the attributor");
	}

	/**
	 * {@inheritdoc IFluidDataStoreChannel.rollback}
	 */
	public rollback?(type: string, content: unknown, localOpMetadata: unknown): void {
		// Should not rollback anything from the attributor as it does not send ops yet.
		throw new Error("Should not rollback anything from the attributor");
	}

	/**
	 * {@inheritdoc IFluidDataStoreChannel.entryPoint}
	 */
	public readonly entryPoint: IFluidHandleInternal<FluidObject>;

	/**
	 * {@inheritdoc IFluidDataStoreChannel.request}
	 */
	public async request(request: IRequest): Promise<IResponse> {
		// Should not request anything from the attributor as the attributor does not have any channels further.
		throw new Error("Should not request anything from the attributor");
	}

	/**
	 * {@inheritdoc IFluidDataStoreChannel.setAttachState}
	 */
	public setAttachState(attachState: AttachState.Attaching | AttachState.Attached): void {
		switch (attachState) {
			case AttachState.Attaching: {
				this.attachState = AttachState.Attaching;

				assert(
					this.visibilityState === VisibilityState.LocallyVisible,
					0xa1e /* Data store should be locally visible before it can become globally visible. */,
				);

				// Mark the data store globally visible and make its child channels visible as well.
				this.visibilityState = VisibilityState.GloballyVisible;

				// This promise resolution will be moved to attached event once we fix the scheduler.
				this.deferredAttached.resolve();
				this.emit("attaching");
				break;
			}
			case AttachState.Attached: {
				assert(
					this.visibilityState === VisibilityState.GloballyVisible,
					0xa1f /* Data store should be globally visible when its attached. */,
				);
				this.attachState = AttachState.Attached;
				this.emit("attached");
				break;
			}
			default: {
				unreachableCase(attachState, "unreached");
			}
		}
	}
}
