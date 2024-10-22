/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	AttachState,
	IAudience,
	ICriticalContainerError,
} from "@fluidframework/container-definitions";
import {
	IBatchMessage,
	IContainerContext,
	ILoader,
	ILoaderOptions,
	IDeltaManager,
} from "@fluidframework/container-definitions/internal";
import { type FluidObject } from "@fluidframework/core-interfaces";
import { type ISignalEnvelope } from "@fluidframework/core-interfaces/internal";
import { IClientDetails, IQuorumClients } from "@fluidframework/driver-definitions";
import {
	IDocumentStorageService,
	ISnapshot,
	IDocumentMessage,
	ISnapshotTree,
	ISummaryContent,
	IVersion,
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import { pkgVersion } from "./packageVersion.js";

/**
 * {@inheritDoc @fluidframework/container-definitions#IContainerContext}
 */
export class ContainerContext implements IContainerContext {
	public readonly pkgVersion = pkgVersion;

	public get clientId(): string | undefined {
		return this._getClientId();
	}

	/**
	 * DISCLAIMER: this id is only for telemetry purposes. Not suitable for any other usages.
	 */
	public get id(): string {
		return this._getContainerDiagnosticId() ?? "";
	}

	/**
	 * When true, ops are free to flow
	 * When false, ops should be kept as pending or rejected
	 */
	public get connected(): boolean {
		return this._getConnected();
	}

	constructor(
		public readonly options: ILoaderOptions,
		public readonly scope: FluidObject,
		public readonly baseSnapshot: ISnapshotTree | undefined,
		private readonly _version: IVersion | undefined,
		public readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
		public readonly storage: IDocumentStorageService,
		public readonly quorum: IQuorumClients,
		public readonly audience: IAudience,
		public readonly loader: ILoader,
		public readonly submitFn: (
			type: MessageType,
			contents: unknown,
			batch: boolean,
			appData: unknown,
		) => number,
		public readonly submitSummaryFn: (
			summaryOp: ISummaryContent,
			referenceSequenceNumber?: number,
		) => number,
		/**
		 * @returns clientSequenceNumber of last message in a batch
		 */
		public readonly submitBatchFn: (
			batch: IBatchMessage[],
			referenceSequenceNumber?: number,
		) => number,

		/**
		 * `unknown` should be removed once `@alpha` tag is removed from IContainerContext
		 * @see {@link https://dev.azure.com/fluidframework/internal/_workitems/edit/7462}
		 * Any changes to submitSignalFn `content` should be checked internally by temporarily changing IContainerContext and removing all `unknown`s
		 */
		public readonly submitSignalFn: (
			content: unknown | ISignalEnvelope,
			targetClientId?: string,
		) => void,
		public readonly disposeFn: (error?: ICriticalContainerError) => void,
		public readonly closeFn: (error?: ICriticalContainerError) => void,
		public readonly updateDirtyContainerState: (dirty: boolean) => void,
		public readonly getAbsoluteUrl: (relativeUrl: string) => Promise<string | undefined>,
		private readonly _getContainerDiagnosticId: () => string | undefined,
		private readonly _getClientId: () => string | undefined,
		private readonly _getAttachState: () => AttachState,
		private readonly _getConnected: () => boolean,
		public readonly clientDetails: IClientDetails,
		public readonly existing: boolean,
		public readonly supportedFeatures: ReadonlyMap<string, unknown>,
		public readonly taggedLogger: ITelemetryLoggerExt,
		public readonly pendingLocalState?: unknown,
		public readonly snapshotWithContents?: ISnapshot,
	) {}

	public getLoadedFromVersion(): IVersion | undefined {
		return this._version;
	}

	public get attachState(): AttachState {
		return this._getAttachState();
	}
}
