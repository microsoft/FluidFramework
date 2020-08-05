/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/// <reference types="node" />
import { EventEmitter } from "events";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { IFluidHandle, IFluidHandleContext, IRequest, IResponse } from "@fluidframework/component-core-interfaces";
import { IAudience, IDeltaManager, IGenericBlob, ContainerWarning, ILoader, AttachState } from "@fluidframework/container-definitions";
import { IClientDetails, IDocumentMessage, IQuorum, ISequencedDocumentMessage, ITreeEntry } from "@fluidframework/protocol-definitions";
import { IFluidDataStoreContext, IFluidDataStoreRegistry, IFluidDataStoreChannel, IInboundSignalMessage, ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { IChannel, IFluidDataStoreRuntime, IChannelFactory } from "@fluidframework/datastore-definitions";
export declare enum ComponentMessageType {
    Attach = "attach",
    ChannelOp = "op"
}
export interface ISharedObjectRegistry {
    get(name: string): IChannelFactory | undefined;
}
/**
 * Base component class
 */
export declare class FluidDataStoreRuntime extends EventEmitter implements IFluidDataStoreChannel, IFluidDataStoreRuntime, IFluidHandleContext {
    private readonly componentContext;
    readonly documentId: string;
    readonly id: string;
    readonly parentBranch: string | null;
    existing: boolean;
    readonly options: any;
    private readonly blobManager;
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    private readonly quorum;
    private readonly audience;
    private readonly snapshotFn;
    private readonly sharedObjectRegistry;
    private readonly componentRegistry;
    readonly logger: ITelemetryLogger;
    /**
     * Loads the component runtime
     * @param context - The component context
     * @param sharedObjectRegistry - The registry of shared objects used by this component
     * @param activeCallback - The callback called when the component runtime in active
     * @param componentRegistry - The registry of components created and used by this component
     */
    static load(context: IFluidDataStoreContext, sharedObjectRegistry: ISharedObjectRegistry, componentRegistry?: IFluidDataStoreRegistry): FluidDataStoreRuntime;
    get IFluidRouter(): this;
    get connected(): boolean;
    get leader(): boolean;
    get clientId(): string | undefined;
    get clientDetails(): IClientDetails;
    get loader(): ILoader;
    get isAttached(): boolean;
    get attachState(): AttachState;
    /**
     * @deprecated - 0.21 back-compat
     */
    get path(): string;
    get absolutePath(): string;
    get routeContext(): IFluidHandleContext;
    get IFluidSerializer(): import("@fluidframework/component-core-interfaces").IFluidSerializer;
    get IFluidHandleContext(): this;
    get IFluidDataStoreRegistry(): IFluidDataStoreRegistry | undefined;
    private _disposed;
    get disposed(): boolean;
    private readonly contexts;
    private readonly contextsDeferred;
    private readonly pendingAttach;
    private requestHandler;
    private bindState;
    private graphAttachState;
    private readonly deferredAttached;
    private readonly localChannelContextQueue;
    private readonly notBoundedChannelContextSet;
    private boundhandles;
    private _attachState;
    private constructor();
    dispose(): void;
    request(request: IRequest): Promise<IResponse>;
    registerRequestHandler(handler: (request: IRequest) => Promise<IResponse>): void;
    getChannel(id: string): Promise<IChannel>;
    createChannel(id: string | undefined, type: string): IChannel;
    /**
     * Binds a channel with the runtime. If the runtime is attached we will attach the channel right away.
     * If the runtime is not attached we will defer the attach until the runtime attaches.
     * @param channel - channel to be registered.
     */
    bindChannel(channel: IChannel): void;
    attachGraph(): void;
    /**
     * Binds this runtime to the container
     * This includes the following:
     * 1. Sending an Attach op that includes all existing state
     * 2. Attaching the graph if the component becomes attached.
     */
    bindToContext(): void;
    bind(handle: IFluidHandle): void;
    setConnectionState(connected: boolean, clientId?: string): void;
    getQuorum(): IQuorum;
    getAudience(): IAudience;
    snapshot(message: string): Promise<void>;
    uploadBlob(file: IGenericBlob): Promise<IGenericBlob>;
    getBlob(blobId: string): Promise<IGenericBlob | undefined>;
    getBlobMetadata(): Promise<IGenericBlob[]>;
    process(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void;
    processSignal(message: IInboundSignalMessage, local: boolean): void;
    private isChannelAttached;
    snapshotInternal(fullTree?: boolean): Promise<ITreeEntry[]>;
    summarize(fullTree?: boolean): Promise<ISummaryTreeWithStats>;
    getAttachSnapshot(): ITreeEntry[];
    submitMessage(type: ComponentMessageType, content: any, localOpMetadata: unknown): void;
    submitSignal(type: string, content: any): void;
    /**
     * Will return when the component is attached.
     */
    waitAttached(): Promise<void>;
    raiseContainerWarning(warning: ContainerWarning): void;
    /**
     * Attach channel should only be called after the componentRuntime has been attached
     */
    private attachChannel;
    private submitChannelOp;
    private submit;
    /**
     * For messages of type MessageType.Operation, finds the right channel and asks it to resubmit the message.
     * For all other messages, just submit it again.
     * This typically happens when we reconnect and there are unacked messages.
     * @param content - The content of the original message.
     * @param localOpMetadata - The local metadata associated with the original message.
     */
    reSubmit(type: ComponentMessageType, content: any, localOpMetadata: unknown): void;
    private setChannelDirty;
    private processChannelOp;
    private attachListener;
    private verifyNotClosed;
}
//# sourceMappingURL=componentRuntime.d.ts.map