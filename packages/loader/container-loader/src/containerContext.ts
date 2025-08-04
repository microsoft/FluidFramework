/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ILayerCompatDetails,
	IProvideLayerCompatDetails,
} from "@fluid-internal/client-utils";
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
	type IContainerStorageService,
} from "@fluidframework/container-definitions/internal";
import { type FluidObject } from "@fluidframework/core-interfaces";
import { type ISignalEnvelope } from "@fluidframework/core-interfaces/internal";
import { IClientDetails, IQuorumClients } from "@fluidframework/driver-definitions";
import {
	ISnapshot,
	IDocumentMessage,
	ISnapshotTree,
	ISummaryContent,
	IVersion,
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import type { ConnectionState } from "./connectionState.js";
import { loaderCompatDetailsForRuntime } from "./loaderLayerCompatState.js";

/**
 * Configuration object for ContainerContext constructor.
 */
export interface IContainerContextConfig {
	readonly options: ILoaderOptions;
	readonly scope: FluidObject;
	readonly baseSnapshot: ISnapshotTree | undefined;
	readonly version: IVersion | undefined;
	readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
	readonly storage: IContainerStorageService;
	readonly quorum: IQuorumClients;
	readonly audience: IAudience;
	readonly loader: ILoader;
	readonly submitFn: (
		type: MessageType,
		contents: unknown,
		batch: boolean,
		appData: unknown,
	) => number;
	readonly submitSummaryFn: (
		summaryOp: ISummaryContent,
		referenceSequenceNumber?: number,
	) => number;
	readonly submitBatchFn: (batch: IBatchMessage[], referenceSequenceNumber?: number) => number;
	readonly submitSignalFn: (
		content: unknown | ISignalEnvelope,
		targetClientId?: string,
	) => void;
	readonly disposeFn: (error?: ICriticalContainerError) => void;
	readonly closeFn: (error?: ICriticalContainerError) => void;
	readonly updateDirtyContainerState: (dirty: boolean) => void;
	readonly getAbsoluteUrl: (relativeUrl: string) => Promise<string | undefined>;
	readonly getContainerDiagnosticId: () => string | undefined;
	readonly getClientId: () => string | undefined;
	readonly getAttachState: () => AttachState;
	readonly getConnected: () => boolean;
	readonly getConnectionState: () => ConnectionState;
	readonly clientDetails: IClientDetails;
	readonly existing: boolean;
	readonly taggedLogger: ITelemetryLoggerExt;
	readonly pendingLocalState?: unknown;
	readonly snapshotWithContents?: ISnapshot;
}

/**
 * {@inheritDoc @fluidframework/container-definitions#IContainerContext}
 */
export class ContainerContext implements IContainerContext, IProvideLayerCompatDetails {
	/**
	 * @deprecated - This has been replaced by ILayerCompatDetails.
	 */
	public readonly supportedFeatures: ReadonlyMap<string, unknown> = new Map([
		/**
		 * This version of the loader accepts `referenceSequenceNumber`, provided by the container runtime,
		 * as a parameter to the `submitBatchFn` and `submitSummaryFn` functions.
		 * This is then used to set the reference sequence numbers of the submitted ops in the DeltaManager.
		 */
		["referenceSequenceNumbers", true],
	]);

	public readonly options: ILoaderOptions;
	public readonly scope: FluidObject;
	public readonly baseSnapshot: ISnapshotTree | undefined;
	public readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
	public readonly storage: IContainerStorageService;
	public readonly quorum: IQuorumClients;
	public readonly audience: IAudience;
	public readonly loader: ILoader;
	public readonly submitFn: (
		type: MessageType,
		contents: unknown,
		batch: boolean,
		appData: unknown,
	) => number;
	public readonly submitSummaryFn: (
		summaryOp: ISummaryContent,
		referenceSequenceNumber?: number,
	) => number;
	/**
	 * @returns clientSequenceNumber of last message in a batch
	 */
	public readonly submitBatchFn: (
		batch: IBatchMessage[],
		referenceSequenceNumber?: number,
	) => number;
	/**
	 * `unknown` should be removed once `@alpha` tag is removed from IContainerContext
	 * @see {@link https://dev.azure.com/fluidframework/internal/_workitems/edit/7462}
	 * Any changes to submitSignalFn `content` should be checked internally by temporarily changing IContainerContext and removing all `unknown`s
	 */
	public readonly submitSignalFn: (
		content: unknown | ISignalEnvelope,
		targetClientId?: string,
	) => void;
	public readonly disposeFn: (error?: ICriticalContainerError) => void;
	public readonly closeFn: (error?: ICriticalContainerError) => void;
	public readonly updateDirtyContainerState: (dirty: boolean) => void;
	public readonly getAbsoluteUrl: (relativeUrl: string) => Promise<string | undefined>;
	public readonly clientDetails: IClientDetails;
	public readonly existing: boolean;
	public readonly taggedLogger: ITelemetryLoggerExt;
	public readonly pendingLocalState: unknown;
	public readonly snapshotWithContents: ISnapshot | undefined;

	public readonly getConnectionState: () => ConnectionState;

	private readonly getClientIdFn: () => string | undefined;
	private readonly getContainerDiagnosticIdFn: () => string | undefined;
	private readonly getConnectedFn: () => boolean;
	private readonly getAttachStateFn: () => AttachState;
	private readonly version: IVersion | undefined;

	public get clientId(): string | undefined {
		return this.getClientIdFn();
	}

	/**
	 * DISCLAIMER: this id is only for telemetry purposes. Not suitable for any other usages.
	 */
	public get id(): string {
		return this.getContainerDiagnosticIdFn() ?? "";
	}

	/**
	 * When true, ops are free to flow
	 * When false, ops should be kept as pending or rejected
	 */
	public get connected(): boolean {
		return this.getConnectedFn();
	}

	/**
	 * The compatibility details of the Loader layer that is exposed to the Runtime layer
	 * for validating Runtime-Loader compatibility.
	 */
	public get ILayerCompatDetails(): ILayerCompatDetails {
		return loaderCompatDetailsForRuntime;
	}

	constructor(config: IContainerContextConfig) {
		this.options = config.options;
		this.scope = config.scope;
		this.baseSnapshot = config.baseSnapshot;
		this.deltaManager = config.deltaManager;
		this.storage = config.storage;
		this.quorum = config.quorum;
		this.audience = config.audience;
		this.loader = config.loader;
		this.submitFn = config.submitFn;
		this.submitSummaryFn = config.submitSummaryFn;
		this.submitBatchFn = config.submitBatchFn;
		this.submitSignalFn = config.submitSignalFn;
		this.disposeFn = config.disposeFn;
		this.closeFn = config.closeFn;
		this.updateDirtyContainerState = config.updateDirtyContainerState;
		this.getAbsoluteUrl = config.getAbsoluteUrl;
		this.clientDetails = config.clientDetails;
		this.existing = config.existing;
		this.taggedLogger = config.taggedLogger;
		this.pendingLocalState = config.pendingLocalState;
		this.snapshotWithContents = config.snapshotWithContents;

		this.getConnectionState = config.getConnectionState;
		this.getClientIdFn = config.getClientId;
		this.getContainerDiagnosticIdFn = config.getContainerDiagnosticId;
		this.getConnectedFn = config.getConnected;
		this.getAttachStateFn = config.getAttachState;
		this.version = config.version;
	}

	public getLoadedFromVersion(): IVersion | undefined {
		return this.version;
	}

	public get attachState(): AttachState {
		return this.getAttachStateFn();
	}
}
