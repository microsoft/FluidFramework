/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString, TypedEventEmitter } from "@fluid-internal/client-utils";
import { AttachState, IDeltaManager } from "@fluidframework/container-definitions/internal";
import {
	FluidObject,
	IFluidHandle,
	IRequest,
	IResponse,
} from "@fluidframework/core-interfaces";
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
	type AttributionInfo,
	type AttributionKey,
} from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import {
	ITelemetryLoggerExt,
	MonitoringContext,
	raiseConnectedEvent,
	createChildMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";

import { OpStreamAttributor, type IAttributor } from "./attributor.js";
import { opBlobName, type IRuntimeAttributor } from "./attributorContracts.js";
import { AttributorSerializer, chain, deltaEncoder, type Encoder } from "./encoders.js";
import { makeLZ4Encoder } from "./lz4Encoder.js";

/**
 * Data store channel for the runtime attributor. This channel is responsible for storing and managing the
 */
export class RuntimeAttributorDataStoreChannel
	extends TypedEventEmitter<IFluidDataStoreRuntimeEvents>
	implements IFluidDataStoreChannel, IRuntimeAttributor
{
	public constructor(
		public readonly dataStoreContext: IFluidDataStoreContext,
		existing: boolean,
	) {
		super();
		this.mc = createChildMonitoringContext({
			logger: dataStoreContext.baseLogger,
			namespace: "Attributor",
		});
		this._attachState = dataStoreContext.attachState;
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
			this,
			"",
			dataStoreContext.IFluidHandleContext,
		);
	}

	public get IFluidDataStoreChannel(): IFluidDataStoreChannel {
		return this;
	}

	public get IRuntimeAttributor(): IRuntimeAttributor {
		return this;
	}

	public get(key: AttributionKey): AttributionInfo {
		assert(
			this.opAttributor !== undefined,
			0x509 /* RuntimeAttributor must be initialized before getAttributionInfo can be called */,
		);

		if (key.type === "detached") {
			throw new Error("Attribution of detached keys is not yet supported.");
		}

		if (key.type === "local") {
			// Note: we can *almost* orchestrate this correctly with internal-only changes by looking up the current
			// client id in the audience. However, for read->write client transition, the container might have not yet
			// received a client id. This is left as a TODO as it might be more easily solved once the detached case
			// is settled (e.g. if it's reasonable for the host to know the current user information at container
			// creation time, we could just use that here as well).
			throw new Error("Attribution of local keys is not yet supported.");
		}

		return this.opAttributor.getAttributionInfo(key.seq);
	}

	public has(key: AttributionKey): boolean {
		if (key.type === "detached") {
			return false;
		}

		if (key.type === "local") {
			return false;
		}

		return this.opAttributor?.tryGetAttributionInfo(key.seq) !== undefined;
	}

	private encoder: Encoder<IAttributor, string> = {
		encode: unreachableCase,
		decode: unreachableCase,
	};

	private _disposed = false;
	public get disposed(): boolean {
		return this._disposed;
	}

	public dispose(): void {
		this._disposed = true;
	}

	private opAttributor: IAttributor | undefined;
	public isEnabled = true;
	public _attachState: AttachState;
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
		this.encoder = chain(
			new AttributorSerializer(
				(entries) => new OpStreamAttributor(deltaManager, quorum, entries),
				deltaEncoder,
			),
			makeLZ4Encoder(),
		);

		if (baseSnapshotForAttributorTree === undefined) {
			this.opAttributor = new OpStreamAttributor(deltaManager, quorum);
		} else {
			const id = baseSnapshotForAttributorTree.blobs[opBlobName];
			assert(
				id !== undefined,
				0x50a /* Attributor tree should have op attributor summary blob. */,
			);
			const blobContents = await readBlob(id);
			const attributorSnapshot = bufferToString(blobContents, "utf8");
			this.opAttributor = this.encoder.decode(attributorSnapshot);
		}
	}

	public attachGraph(): void {
		throw new Error("attachGraph should not be called on the attributor");
	}

	public bind(handle: IFluidHandle): void {
		throw new Error("bind should not be called on the attributor");
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
		assert(
			this.opAttributor !== undefined,
			0x50b /* RuntimeAttributor should be initialized before summarization */,
		);
		const builder = new SummaryTreeBuilder();
		builder.addBlob(opBlobName, this.encoder.encode(this.opAttributor));
		return builder.getSummaryTree();
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
		throw new Error("Attributor should not receive messages");
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
		assert(
			this.opAttributor !== undefined,
			"RuntimeAttributor should be initialized before summarization",
		);
		const builder = new SummaryTreeBuilder();
		builder.addBlob(opBlobName, this.encoder.encode(this.opAttributor));
		return builder.getSummaryTree();
	}

	/**
	 * {@inheritdoc IFluidDataStoreChannel.getGCData}
	 */
	public async getGCData(fullGC?: boolean): Promise<IGarbageCollectionData> {
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
		throw new Error("Should not resubmit anything from the attributor");
	}

	/**
	 * {@inheritdoc IFluidDataStoreChannel.applyStashedOp}
	 */
	public async applyStashedOp(content: unknown): Promise<unknown> {
		throw new Error("Should not apply stashed ops to the attributor");
	}

	/**
	 * {@inheritdoc IFluidDataStoreChannel.rollback}
	 */
	public rollback?(type: string, content: unknown, localOpMetadata: unknown): void {
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
		throw new Error("Should not request anything from the attributor");
	}

	public async waitAttached(): Promise<void> {
		return this.deferredAttached.promise;
	}

	/**
	 * {@inheritdoc IFluidDataStoreChannel.setAttachState}
	 */
	public setAttachState(attachState: AttachState.Attaching | AttachState.Attached): void {
		switch (attachState) {
			case AttachState.Attaching: {
				// this.attachGraph();

				this._attachState = AttachState.Attaching;

				assert(
					this.visibilityState === VisibilityState.LocallyVisible,
					"Data store should be locally visible before it can become globally visible.",
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
					0x2d2 /* "Data store should be globally visible when its attached." */,
				);
				this._attachState = AttachState.Attached;
				this.emit("attached");
				break;
			}
			default: {
				unreachableCase(attachState, "unreached");
			}
		}
	}
}
