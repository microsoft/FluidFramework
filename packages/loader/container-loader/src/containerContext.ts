/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils";
import {
	IAudience,
	IContainerContext,
	IDeltaManager,
	ILoader,
	ICriticalContainerError,
	AttachState,
	ILoaderOptions,
	IFluidCodeDetails,
	IBatchMessage,
} from "@fluidframework/container-definitions";
import { FluidObject } from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import {
	IClientDetails,
	IDocumentMessage,
	IQuorum,
	IQuorumClients,
	ISequencedDocumentMessage,
	ISnapshotTree,
	IVersion,
	MessageType,
	ISummaryContent,
} from "@fluidframework/protocol-definitions";

/**
 * {@inheritDoc @fluidframework/container-definitions#IContainerContext}
 */
export class ContainerContext implements IContainerContext {
	public readonly supportedFeatures: ReadonlyMap<string, unknown> = new Map([
		/**
		 * This version of the loader accepts `referenceSequenceNumber`, provided by the container runtime,
		 * as a parameter to the `submitBatchFn` and `submitSummaryFn` functions.
		 * This is then used to set the reference sequence numbers of the submitted ops in the DeltaManager.
		 */
		["referenceSequenceNumbers", true],
	]);

	public get clientId(): string | undefined {
		return this._getClientId();
	}

	/**
	 * When true, ops are free to flow
	 * When false, ops should be kept as pending or rejected
	 */
	public get connected(): boolean {
		return this._getConnected();
	}

	public get quorum(): IQuorumClients {
		return this._quorum;
	}

	constructor(
		public readonly options: ILoaderOptions,
		public readonly scope: FluidObject,
		public readonly baseSnapshot: ISnapshotTree | undefined,
		private readonly _version: IVersion | undefined,
		public readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
		public readonly storage: IDocumentStorageService,
		private readonly _quorum: IQuorum,
		public readonly audience: IAudience,
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
		public readonly getAbsoluteUrl: (relativeUrl: string) => Promise<string | undefined>,
		private readonly _getClientId: () => string | undefined,
		private readonly _getAttachState: () => AttachState,
		private readonly _getConnected: () => boolean,
		public readonly clientDetails: IClientDetails,
		public readonly existing: boolean,
		public readonly taggedLogger: ITelemetryLoggerExt,
		public readonly pendingLocalState?: unknown,
	) {}

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

	public getLoadedFromVersion(): IVersion | undefined {
		return this._version;
	}

	public get attachState(): AttachState {
		return this._getAttachState();
	}
}
