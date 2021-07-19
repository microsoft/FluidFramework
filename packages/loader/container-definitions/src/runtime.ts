/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
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
    IClientConfiguration,
    IClientDetails,
    IQuorum,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    MessageType,
    ISummaryTree,
    IVersion,
    IDocumentMessage,
} from "@fluidframework/protocol-definitions";
import { IAudience } from "./audience";
import { IDeltaManager } from "./deltas";
import { ICriticalContainerError, ContainerWarning } from "./error";
import { ILoader, ILoaderOptions } from "./loader";

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

/**
 * The IRuntime represents an instantiation of a code package within a Container.
 * Primarily held by the ContainerContext to be able to interact with the running instance of the Container.
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

    /**
     * @deprecated in 0.14 async stop()
     * Use snapshot to get a snapshot for an IRuntimeState as needed, followed by dispose
     *
     * Stops the runtime. Once stopped no more messages will be delivered and the context passed to the runtime
     * on creation will no longer be active
     */
    stop(): Promise<{snapshot?: never, state?: never}>;

    /**
     * Processes the given op (message)
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

    /**
     * Get pending local state in a serializable format to be given back to a newly loaded container
     */
    getPendingLocalState(): unknown;
}

/**
 * The ContainerContext is a proxy standing between the Container and the Container's IRuntime.
 * This allows the Container to terminate the connection to the IRuntime.
 *
 * Specifically, there is an event on Container, onContextChanged, which mean a new code proposal has been loaded,
 * so the old IRuntime is no longer valid, as its ContainerContext has been revoked,
 * and the Container has created a new ContainerContext.
 */
export interface IContainerContext extends IDisposable {
    readonly id: string;
    readonly existing: boolean | undefined;
    readonly options: ILoaderOptions;
    readonly configuration: IFluidConfiguration;
    readonly clientId: string | undefined;
    readonly clientDetails: IClientDetails;
    readonly storage: IDocumentStorageService | undefined;
    readonly connected: boolean;
    readonly baseSnapshot: ISnapshotTree | undefined;
    readonly submitFn: (type: MessageType, contents: any, batch: boolean, appData?: any) => number;
    readonly submitSignalFn: (contents: any) => void;
    readonly closeFn: (error?: ICriticalContainerError) => void;
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    readonly quorum: IQuorum;
    readonly audience: IAudience | undefined;
    readonly loader: ILoader;
    /** @deprecated - Use `taggedLogger` if present. Otherwise, be sure to handle tagged data
     * before sending events to this logger. In time we will assume the presence of `taggedLogger`,
     * but in the meantime, current and older loader versions buttress loggers that do not support tags.
     * IContainerContext will retain both options, but hosts must now support tags as the loader
     * will soon plumb taggedLogger's events (potentially tagged) to the host's logger.
     */
     readonly logger: ITelemetryLogger;
     // The logger implementation, which would support tagged events, should be provided by the loader.
     readonly taggedLogger?: ITelemetryLogger;
    readonly serviceConfiguration: IClientConfiguration | undefined;
    pendingLocalState?: unknown;

    /**
     * Ambient services provided with the context
     */
    readonly scope: IFluidObject;

    raiseContainerWarning(warning: ContainerWarning): void;

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

    updateDirtyContainerState(dirty: boolean): void;
}

export const IRuntimeFactory: keyof IProvideRuntimeFactory = "IRuntimeFactory";

export interface IProvideRuntimeFactory {
    readonly IRuntimeFactory: IRuntimeFactory;
}

/**
 * Exported module definition
 *
 * Provides the entry point for the ContainerContext to load the proper IRuntime
 * to start up the running instance of the Container.
 */
export interface IRuntimeFactory extends IProvideRuntimeFactory {
    /**
     * Instantiates a new IRuntime for the given IContainerContext to proxy to
     * This is the main entry point to the Container's business logic
     *
     * @param context - container context to be supplied to the runtime
     * @param existing - whether to instantiate for the first time or from an existing context
     */
    instantiateRuntime(context: IContainerContext, existing?: boolean): Promise<IRuntime>;
}
