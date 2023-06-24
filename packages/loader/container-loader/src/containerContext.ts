/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLoggerExt, PerformanceEvent } from "@fluidframework/telemetry-utils";
import { assert, TypedEventEmitter } from "@fluidframework/common-utils";
import {
	IAudience,
	IContainerContext,
	IDeltaManager,
	ILoader,
	IRuntime,
	ICriticalContainerError,
	AttachState,
	ILoaderOptions,
	IRuntimeFactory,
	IFluidCodeDetails,
	IBatchMessage,
} from "@fluidframework/container-definitions";
import { IRequest, IResponse, FluidObject } from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import {
	IClientConfiguration,
	IClientDetails,
	IDocumentMessage,
	IQuorum,
	IQuorumClients,
	ISequencedDocumentMessage,
	ISignalMessage,
	ISnapshotTree,
	ISummaryTree,
	IVersion,
	MessageType,
	ISummaryContent,
} from "@fluidframework/protocol-definitions";
import { UsageError } from "@fluidframework/container-utils";
import { Container } from "./container";

/**
 * Events that {@link ContainerContext} can emit through its lifecycle.
 *
 * "runtimeInstantiated" - When an {@link @fluidframework/container-definitions#IRuntime} has been instantiated (by
 * calling instantiateRuntime() on the runtime factory), and this._runtime is set.
 *
 * "disposed" - When its dispose() method is called. The {@link ContainerContext} is no longer usable at that point.
 */
type ContextLifecycleEvents = "runtimeInstantiated" | "disposed";

export class ContainerContext implements IContainerContext {
	public static async createOrLoad(
		container: Container,
		scope: FluidObject,
		runtimeFactory: IRuntimeFactory,
		baseSnapshot: ISnapshotTree | undefined,
		version: IVersion | undefined,
		deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
		quorum: IQuorum,
		loader: ILoader,
		submitFn: (type: MessageType, contents: any, batch: boolean, appData: any) => number,
		submitSummaryFn: (summaryOp: ISummaryContent, referenceSequenceNumber?: number) => number,
		submitBatchFn: (batch: IBatchMessage[], referenceSequenceNumber?: number) => number,
		submitSignalFn: (contents: any) => void,
		disposeFn: (error?: ICriticalContainerError) => void,
		closeFn: (error?: ICriticalContainerError) => void,
		updateDirtyContainerState: (dirty: boolean) => void,
		existing: boolean,
		taggedLogger: ITelemetryLoggerExt,
		pendingLocalState?: unknown,
	): Promise<ContainerContext> {
		const context = new ContainerContext(
			container,
			scope,
			runtimeFactory,
			baseSnapshot,
			version,
			deltaManager,
			quorum,
			loader,
			submitFn,
			submitSummaryFn,
			submitBatchFn,
			submitSignalFn,
			disposeFn,
			closeFn,
			updateDirtyContainerState,
			existing,
			taggedLogger,
			pendingLocalState,
		);
		await context.instantiateRuntime(existing);
		return context;
	}

	public readonly supportedFeatures: ReadonlyMap<string, unknown>;

	public get clientId(): string | undefined {
		return this.container.clientId;
	}

	/**
	 * DISCLAIMER: this id is only for telemetry purposes. Not suitable for any other usages.
	 */
	public get id(): string {
		return this.container.resolvedUrl?.id ?? "";
	}

	public get clientDetails(): IClientDetails {
		return this.container.clientDetails;
	}

	private _connected: boolean;
	/**
	 * When true, ops are free to flow
	 * When false, ops should be kept as pending or rejected
	 */
	public get connected(): boolean {
		return this._connected;
	}

	public get canSummarize(): boolean {
		return "summarize" in this.runtime;
	}

	public get serviceConfiguration(): IClientConfiguration | undefined {
		return this.container.serviceConfiguration;
	}

	public get audience(): IAudience {
		return this.container.audience;
	}

	public get options(): ILoaderOptions {
		return this.container.options;
	}

	public get baseSnapshot() {
		return this._baseSnapshot;
	}

	public get storage(): IDocumentStorageService {
		return this.container.storage;
	}

	private _runtime: IRuntime | undefined;
	private get runtime() {
		if (this._runtime === undefined) {
			throw new Error("Attempted to access runtime before it was defined");
		}
		return this._runtime;
	}

	private _disposed = false;

	public get disposed() {
		return this._disposed;
	}

	private readonly _quorum: IQuorum;
	public get quorum(): IQuorumClients {
		return this._quorum;
	}

	/**
	 * Proxy for {@link IRuntime.getEntryPoint}, the entryPoint defined in the container's runtime.
	 *
	 * @see {@link IContainer.getEntryPoint}
	 */
	public async getEntryPoint(): Promise<FluidObject | undefined> {
		if (this._disposed) {
			throw new UsageError("The context is already disposed");
		}
		if (this._runtime !== undefined) {
			return this._runtime.getEntryPoint?.();
		}
		return new Promise<FluidObject | undefined>((resolve, reject) => {
			const runtimeInstantiatedHandler = () => {
				assert(
					this._runtime !== undefined,
					0x5a3 /* runtimeInstantiated fired but runtime is still undefined */,
				);
				resolve(this._runtime.getEntryPoint?.());
				this.lifecycleEvents.off("disposed", disposedHandler);
			};
			const disposedHandler = () => {
				reject(new Error("ContainerContext was disposed"));
				this.lifecycleEvents.off("runtimeInstantiated", runtimeInstantiatedHandler);
			};
			this.lifecycleEvents.once("runtimeInstantiated", runtimeInstantiatedHandler);
			this.lifecycleEvents.once("disposed", disposedHandler);
		});
	}

	/**
	 * Emits events about the container context's lifecycle.
	 * Use it to coordinate things inside the ContainerContext class.
	 */
	private readonly lifecycleEvents = new TypedEventEmitter<ContextLifecycleEvents>();

	constructor(
		private readonly container: Container,
		public readonly scope: FluidObject,
		private readonly _runtimeFactory: IRuntimeFactory,
		private readonly _baseSnapshot: ISnapshotTree | undefined,
		private readonly _version: IVersion | undefined,
		public readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
		quorum: IQuorum,
		public readonly loader: ILoader,
		public readonly submitFn: (
			type: MessageType,
			contents: any,
			batch: boolean,
			appData: any,
		) => number,
		public readonly submitSummaryFn: (
			summaryOp: ISummaryContent,
			referenceSequenceNumber?: number,
		) => number,
		/** @returns clientSequenceNumber of last message in a batch */
		public readonly submitBatchFn: (
			batch: IBatchMessage[],
			referenceSequenceNumber?: number,
		) => number,
		public readonly submitSignalFn: (contents: any) => void,
		public readonly disposeFn: (error?: ICriticalContainerError) => void,
		public readonly closeFn: (error?: ICriticalContainerError) => void,
		public readonly updateDirtyContainerState: (dirty: boolean) => void,
		public readonly existing: boolean,
		public readonly taggedLogger: ITelemetryLoggerExt,
		public readonly pendingLocalState?: unknown,
	) {
		this._connected = this.container.connected;
		this._quorum = quorum;

		this.supportedFeatures = new Map([
			/**
			 * This version of the loader accepts `referenceSequenceNumber`, provided by the container runtime,
			 * as a parameter to the `submitBatchFn` and `submitSummaryFn` functions.
			 * This is then used to set the reference sequence numbers of the submitted ops in the DeltaManager.
			 */
			["referenceSequenceNumbers", true],
		]);
		this.attachListener();
	}

	/**
	 * @deprecated Temporary migratory API, to be removed when customers no longer need it.
	 * When removed, `ContainerContext` should only take an {@link @fluidframework/container-definitions#IQuorumClients}
	 * rather than an {@link @fluidframework/protocol-definitions#IQuorum}.
	 * See {@link @fluidframework/container-definitions#IContainerContext} for more details.
	 */
	public getSpecifiedCodeDetails(): IFluidCodeDetails | undefined {
		return (this._quorum.get("code") ?? this._quorum.get("code2")) as
			| IFluidCodeDetails
			| undefined;
	}

	public dispose(error?: Error): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;

		this.lifecycleEvents.emit("disposed");
		this.runtime.dispose(error);
		this._quorum.dispose();
		this.deltaManager.dispose();
	}

	public getLoadedFromVersion(): IVersion | undefined {
		return this._version;
	}

	public get attachState(): AttachState {
		return this.container.attachState;
	}

	/**
	 * Create a summary. Used when attaching or serializing a detached container.
	 *
	 * @param blobRedirectTable - A table passed during the attach process. While detached, blob upload is supported
	 * using IDs generated locally. After attach, these IDs cannot be used, so this table maps the old local IDs to the
	 * new storage IDs so requests can be redirected.
	 */
	public createSummary(blobRedirectTable?: Map<string, string>): ISummaryTree {
		return this.runtime.createSummary(blobRedirectTable);
	}

	public setConnectionState(connected: boolean, clientId?: string) {
		const runtime = this.runtime;
		this._connected = connected;
		runtime.setConnectionState(connected, clientId);
	}

	public process(message: ISequencedDocumentMessage, local: boolean) {
		this.runtime.process(message, local);
	}

	public processSignal(message: ISignalMessage, local: boolean) {
		this.runtime.processSignal(message, local);
	}

	public async request(path: IRequest): Promise<IResponse> {
		return this.runtime.request(path);
	}

	public async getAbsoluteUrl(relativeUrl: string): Promise<string | undefined> {
		return this.container.getAbsoluteUrl(relativeUrl);
	}

	public getPendingLocalState(): unknown {
		return this.runtime.getPendingLocalState();
	}

	public async notifyOpReplay(message: ISequencedDocumentMessage): Promise<void> {
		return this.runtime.notifyOpReplay?.(message);
	}

	// #region private

	private async instantiateRuntime(existing: boolean) {
		this._runtime = await PerformanceEvent.timedExecAsync(
			this.taggedLogger,
			{ eventName: "InstantiateRuntime" },
			async () => this._runtimeFactory.instantiateRuntime(this, existing),
		);
		this.lifecycleEvents.emit("runtimeInstantiated");
	}

	private attachListener() {
		this.container.once("attaching", () => {
			this.runtime.setAttachState(AttachState.Attaching);
		});
		this.container.once("attached", () => {
			this.runtime.setAttachState(AttachState.Attached);
		});
	}
	// #endregion
}
