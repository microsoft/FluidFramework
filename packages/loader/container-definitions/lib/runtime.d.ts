/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ITelemetryLogger, IDisposable } from "@fluidframework/common-definitions";
import { IFluidObject, IFluidConfiguration, IRequest, IResponse, IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { IClientConfiguration, IClientDetails, IQuorum, ISequencedDocumentMessage, ISnapshotTree, ITree, MessageType, ISummaryTree, IVersion, IDocumentMessage } from "@fluidframework/protocol-definitions";
import { IAudience } from "./audience";
import { IDeltaManager } from "./deltas";
import { ICriticalContainerError, ContainerWarning } from "./error";
import { ILoader, ILoaderOptions } from "./loader";
export declare enum AttachState {
    Detached = "Detached",
    Attaching = "Attaching",
    Attached = "Attached"
}
export declare enum BindState {
    NotBound = "NotBound",
    Binding = "Binding",
    Bound = "Bound"
}
/**
 * Represents the data that will be preserved from the previous IRuntime during a context reload.
 */
export interface IRuntimeState {
    snapshot?: ITree;
    state?: unknown;
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
    setConnectionState(connected: boolean, clientId?: string): any;
    /**
     * @deprecated in 0.14 async stop()
     * Use snapshot to get a snapshot for an IRuntimeState as needed, followed by dispose
     *
     * Stops the runtime. Once stopped no more messages will be delivered and the context passed to the runtime
     * on creation will no longer be active
     */
    stop(): Promise<IRuntimeState>;
    /**
     * Processes the given op (message)
     */
    process(message: ISequencedDocumentMessage, local: boolean, context: any): any;
    /**
     * Processes the given signal
     */
    processSignal(message: any, local: boolean): any;
    createSummary(): ISummaryTree;
    /**
     * Propagate the container state when container is attaching or attached.
     * @param attachState - State of the container.
     */
    setAttachState(attachState: AttachState.Attaching | AttachState.Attached): void;
    readonly runtimeVersion?: string;
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
    readonly codeDetails: IFluidCodeDetails;
    readonly storage: IDocumentStorageService | undefined | null;
    readonly connected: boolean;
    readonly branch: string;
    readonly baseSnapshot: ISnapshotTree | undefined;
    readonly submitFn: (type: MessageType, contents: any, batch: boolean, appData?: any) => number;
    readonly submitSignalFn: (contents: any) => void;
    readonly snapshotFn: (message: string) => Promise<void>;
    readonly closeFn: (error?: ICriticalContainerError) => void;
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    readonly quorum: IQuorum;
    readonly audience: IAudience | undefined;
    readonly loader: ILoader;
    readonly logger: ITelemetryLogger;
    readonly serviceConfiguration: IClientConfiguration | undefined;
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
export declare const IRuntimeFactory: keyof IProvideRuntimeFactory;
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
     */
    instantiateRuntime(context: IContainerContext): Promise<IRuntime>;
}
//# sourceMappingURL=runtime.d.ts.map