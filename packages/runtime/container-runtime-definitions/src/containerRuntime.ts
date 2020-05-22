/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
} from "@fluidframework/component-core-interfaces";
import {
    IAudience,
    IBlobManager,
    IDeltaManager,
    ContainerWarning,
    ILoader,
} from "@fluidframework/container-definitions";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import {
    IClientDetails,
    IDocumentMessage,
    IHelpMessage,
    IQuorum,
    ISequencedDocumentMessage,
    MessageType,
} from "@fluidframework/protocol-definitions";
import {
    FlushMode,
    IContainerRuntimeBase,
    IComponentRuntimeChannel,
    IComponentContext,
    IInboundSignalMessage,
} from "@fluidframework/runtime-definitions";

declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideContainerRuntime>> { }
}

export const IContainerRuntime: keyof IProvideContainerRuntime = "IContainerRuntime";

export interface IProvideContainerRuntime {
    IContainerRuntime: IContainerRuntime;
}

/**
 * Represents the runtime of the container. Contains helper functions/state of the container.
 */
export interface IContainerRuntime extends
    IProvideContainerRuntime,
    IContainerRuntimeBase {
    readonly id: string;
    readonly existing: boolean;
    readonly options: any;
    readonly clientId: string | undefined;
    readonly clientDetails: IClientDetails;
    readonly parentBranch: string | null;
    readonly connected: boolean;
    readonly leader: boolean;
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    readonly blobManager: IBlobManager;
    readonly storage: IDocumentStorageService;
    readonly branch: string;
    readonly loader: ILoader;
    readonly flushMode: FlushMode;
    readonly submitFn: (type: MessageType, contents: any) => number;
    readonly submitSignalFn: (contents: any) => void;
    readonly snapshotFn: (message: string) => Promise<void>;
    readonly scope: IComponent;

    on(event: "batchBegin", listener: (op: ISequencedDocumentMessage) => void): this;
    on(event: "batchEnd", listener: (error: any, op: ISequencedDocumentMessage) => void): this;
    on(event: "op", listener: (message: ISequencedDocumentMessage) => void): this;
    on(event: "signal", listener: (message: IInboundSignalMessage, local: boolean) => void): this;
    on(
        event: "dirtyDocument" | "disconnected" | "dispose" | "joining" | "savedDocument" | "leader" | "notleader",
        listener: () => void): this;
    on(event: "connected", listener: (clientId: string) => void): this;
    on(event: "localHelp", listener: (message: IHelpMessage) => void): this;
    on(
        event: "componentInstantiated",
        listener: (componentPkgName: string, registryPath: string, createNew: boolean) => void,
    ): this;
    /**
     * Returns the runtime of the component.
     * @param id - Id supplied during creating the component.
     * @param wait - True if you want to wait for it.
     */
    getComponentRuntime(id: string, wait?: boolean): Promise<IComponentRuntimeChannel>;

    /**
     * Creates a new component using an optional realization function.  This API does not allow specifying
     * the component's id and instead generates a uuid.  Consumers must save another reference to the
     * component, such as the handle.
     * @param pkg - Package name of the component
     * @param realizationFn - Optional function to call to realize the component over the context default
     */
    createComponentWithRealizationFn(
        pkg: string[],
        realizationFn?: (context: IComponentContext) => void,
    ): Promise<IComponentRuntimeChannel>;

    /**
     * Returns the current quorum.
     */
    getQuorum(): IQuorum;

    /**
     * Returns the current audience.
     */
    getAudience(): IAudience;

    /**
     * Used to raise an unrecoverable error on the runtime.
     */
    raiseContainerWarning(warning: ContainerWarning): void;

    /**
     * Returns true of document is dirty, i.e. there are some pending local changes that
     * either were not sent out to delta stream or were not yet acknowledged.
     */
    isDocumentDirty(): boolean;

    /**
     * Flushes any ops currently being batched to the loader
     */
    flush(): void;

    /**
     * Used to notify the HostingRuntime that the ComponentRuntime has be instantiated.
     */
    notifyComponentInstantiated(componentContext: IComponentContext): void;

    /**
     * Flag indicating if the given container has been attached to a host service.
     * False if the container is attached to storage.
     */
    isLocal(): boolean;

    /**
     * Get an absolute url for a provided container-relative request.
     * @param relativeUrl - A relative request within the container
     */
    getAbsoluteUrl(relativeUrl: string): Promise<string>;
}
