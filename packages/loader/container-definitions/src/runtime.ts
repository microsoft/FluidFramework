/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger, IDisposable } from "@fluidframework/common-definitions";
import {
    IFluidObject,
    IFluidConfiguration,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import {
    ConnectionState,
    IClientDetails,
    IQuorum,
    ISequencedDocumentMessage,
    IServiceConfiguration,
    ISnapshotTree,
    ITree,
    MessageType,
    ISummaryTree,
    IVersion,
} from "@fluidframework/protocol-definitions";
import { IAudience } from "./audience";
import { IBlobManager } from "./blobs";
import { ICriticalContainerError, ContainerWarning } from "./error";
import { ICodeLoader, ILoader } from "./loader";
import { IMessageScheduler } from "./messageScheduler";

// Represents the attachment state of the entity.
export enum AttachState {
    Detached = "Detached",
    Attaching = "Attaching",
    Attached = "Attached",
}

// Represents the bind state of the entity.
export enum BindState {
    NotBound = "NotBound",
    Binding = "Binding",
    Bound = "Bound",
}

export interface IRuntimeState {
    snapshot?: ITree,
    state?: unknown,
}

/**
 * The IRuntime represents an instantiation of a code package within a container.
 */
export interface IRuntime extends IDisposable {

    /**
     * Executes a request against the runtime
     */
    request(request: IRequest): Promise<IResponse>;

    /**
     * Snapshots the runtime
     */
    snapshot(tagMessage: string, fullTree?: boolean): Promise<ITree | null>;

    /**
     * Notifies the runtime of a change in the connection state
     */
    setConnectionState(connected: boolean, clientId?: string);

    // Back-compat: supporting <= 0.16 data stores
    changeConnectionState?: (value: ConnectionState, clientId?: string) => void;

    /**
     * @deprecated in 0.14 async stop()
     * Use snapshot to get a snapshot for an IRuntimeState as needed, followed by dispose
     *
     * Stops the runtime. Once stopped no more messages will be delivered and the context passed to the runtime
     * on creation will no longer be active
     */
    stop(): Promise<IRuntimeState>;

    /**
     * Processes the given message
     */
    process(message: ISequencedDocumentMessage, local: boolean, context: any);

    /**
     * Processes the given signal
     */
    processSignal(message: any, local: boolean);

    createSummary(): ISummaryTree;

    /**
     * Propagate the container state when container is attaching or attached.
     * @param attachState - State of the container.
     */
    setAttachState(attachState: AttachState.Attaching | AttachState.Attached): void;

    // 0.24 back-compat attachingBeforeSummary
    readonly runtimeVersion25AndAbove: boolean;
}

export interface IContainerContext extends IMessageScheduler, IDisposable {
    readonly id: string;
    readonly existing: boolean | undefined;
    readonly options: any;
    readonly configuration: IFluidConfiguration;
    readonly clientId: string | undefined;
    readonly clientDetails: IClientDetails;
    readonly parentBranch: string | null;
    readonly blobManager: IBlobManager | undefined;
    readonly storage: IDocumentStorageService | undefined | null;
    readonly connected: boolean;
    readonly branch: string;
    readonly baseSnapshot: ISnapshotTree | null;
    readonly submitFn: (type: MessageType, contents: any, batch: boolean, appData?: any) => number;
    readonly submitSignalFn: (contents: any) => void;
    readonly snapshotFn: (message: string) => Promise<void>;
    readonly closeFn: (error?: ICriticalContainerError) => void;
    readonly quorum: IQuorum;
    readonly audience: IAudience | undefined;
    readonly loader: ILoader;
    readonly codeLoader: ICodeLoader;
    readonly logger: ITelemetryLogger;
    readonly serviceConfiguration: IServiceConfiguration | undefined;
    readonly version: string;
    readonly previousRuntimeState: IRuntimeState;

    /**
     * Ambient services provided with the context
     */
    readonly scope: IFluidObject;

    raiseContainerWarning(warning: ContainerWarning): void;
    requestSnapshot(tagMessage: string): Promise<void>;
    reloadContext(): Promise<void>;

    /**
     * Get an absolute url for a provided container-relative request.
     * @param relativeUrl - A relative request within the container
     *
     * TODO: Optional for backwards compatibility. Make non-optional in version 0.19
     */
    getAbsoluteUrl?(relativeUrl: string): Promise<string | undefined>;

    /**
     * Indicates the attachment state of the container to a host service.
     */
    readonly attachState: AttachState;

    getLoadedFromVersion(): IVersion | undefined;

    createSummary(): ISummaryTree;
}

export const IRuntimeFactory: keyof IProvideRuntimeFactory = "IRuntimeFactory";

export interface IProvideRuntimeFactory {
    readonly IRuntimeFactory: IRuntimeFactory;
}
/**
 * Exported module definition
 */
export interface IRuntimeFactory extends IProvideRuntimeFactory {
    /**
     * Instantiates a new chaincode container
     */
    instantiateRuntime(context: IContainerContext): Promise<IRuntime>;
}
