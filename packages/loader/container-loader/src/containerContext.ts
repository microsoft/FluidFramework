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
	/**
	 * @returns clientSequenceNumber of last message in a batch
	 */
	readonly submitBatchFn: (batch: IBatchMessage[], referenceSequenceNumber?: number) => number;
	/**
	 * `unknown` should be removed once `@alpha` tag is removed from IContainerContext
	 * @see {@link https://dev.azure.com/fluidframework/internal/_workitems/edit/7462}
	 * Any changes to submitSignalFn `content` should be checked internally by temporarily changing IContainerContext and removing all `unknown`s
	 */
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

	public readonly getConnectionState: () => ConnectionState;
	public readonly getClientId: () => string | undefined;
	public readonly getContainerDiagnosticId: () => string | undefined;
	public readonly getConnected: () => boolean;
	public readonly getAttachState: () => AttachState;

	constructor(private readonly config: IContainerContextConfig) {
		this.getConnectionState = config.getConnectionState;
		this.getClientId = config.getClientId;
		this.getContainerDiagnosticId = config.getContainerDiagnosticId;
		this.getConnected = config.getConnected;
		this.getAttachState = config.getAttachState;
	}

	public get options(): ILoaderOptions {
		return this.config.options;
	}

	public get scope(): FluidObject {
		return this.config.scope;
	}

	public get baseSnapshot(): ISnapshotTree | undefined {
		return this.config.baseSnapshot;
	}

	public get deltaManager(): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
		return this.config.deltaManager;
	}

	public get storage(): IContainerStorageService {
		return this.config.storage;
	}

	public get quorum(): IQuorumClients {
		return this.config.quorum;
	}

	public get audience(): IAudience {
		return this.config.audience;
	}

	public get loader(): ILoader {
		return this.config.loader;
	}

	public get submitFn(): (
		type: MessageType,
		contents: unknown,
		batch: boolean,
		appData: unknown,
	) => number {
		return this.config.submitFn;
	}

	public get submitSummaryFn(): (
		summaryOp: ISummaryContent,
		referenceSequenceNumber?: number,
	) => number {
		return this.config.submitSummaryFn;
	}

	public get submitBatchFn(): (
		batch: IBatchMessage[],
		referenceSequenceNumber?: number,
	) => number {
		return this.config.submitBatchFn;
	}

	public get submitSignalFn(): (
		content: unknown | ISignalEnvelope,
		targetClientId?: string,
	) => void {
		return this.config.submitSignalFn;
	}

	public get disposeFn(): (error?: ICriticalContainerError) => void {
		return this.config.disposeFn;
	}

	public get closeFn(): (error?: ICriticalContainerError) => void {
		return this.config.closeFn;
	}

	public get updateDirtyContainerState(): (dirty: boolean) => void {
		return this.config.updateDirtyContainerState;
	}

	public get getAbsoluteUrl(): (relativeUrl: string) => Promise<string | undefined> {
		return this.config.getAbsoluteUrl;
	}

	public get clientDetails(): IClientDetails {
		return this.config.clientDetails;
	}

	public get existing(): boolean {
		return this.config.existing;
	}

	public get taggedLogger(): ITelemetryLoggerExt {
		return this.config.taggedLogger;
	}

	public get pendingLocalState(): unknown {
		return this.config.pendingLocalState;
	}

	public get snapshotWithContents(): ISnapshot | undefined {
		return this.config.snapshotWithContents;
	}

	/**
	 * DISCLAIMER: this id is only for telemetry purposes. Not suitable for any other usages.
	 */
	public get id(): string {
		return this.getContainerDiagnosticId() ?? "";
	}

	/**
	 * When true, ops are free to flow
	 * When false, ops should be kept as pending or rejected
	 */
	public get connected(): boolean {
		return this.getConnected();
	}

	public get clientId(): string | undefined {
		return this.getClientId();
	}

	/**
	 * The compatibility details of the Loader layer that is exposed to the Runtime layer
	 * for validating Runtime-Loader compatibility.
	 */
	public get ILayerCompatDetails(): ILayerCompatDetails {
		return loaderCompatDetailsForRuntime;
	}

	public getLoadedFromVersion(): IVersion | undefined {
		return this.config.version;
	}

	public get attachState(): AttachState {
		return this.getAttachState();
	}
}
