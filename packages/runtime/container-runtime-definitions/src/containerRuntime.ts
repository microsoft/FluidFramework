/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEventProvider } from "@fluidframework/common-definitions";
import {
    AttachState,
    IDeltaManager,
    ILoaderOptions,
} from "@fluidframework/container-definitions";
import {
    IRequest,
    IResponse,
    IFluidRouter,
    FluidObject,
} from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import {
    IClientDetails,
    IDocumentMessage,
    IHelpMessage,
    ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import {
    FlushMode,
    IContainerRuntimeBase,
    IContainerRuntimeBaseEvents,
    IFluidDataStoreContextDetached,
    IProvideFluidDataStoreRegistry,
} from "@fluidframework/runtime-definitions";

/**
 * @deprecated - This will be removed in a later release.
 */
export const IContainerRuntime: keyof IProvideContainerRuntime = "IContainerRuntime";

/**
 * @deprecated - This will be removed in a later release.
 */
export interface IProvideContainerRuntime {
    /**
     * @deprecated - This will be removed in a later release.
     */
    IContainerRuntime: IContainerRuntime;
}

export interface IContainerRuntimeEvents extends IContainerRuntimeBaseEvents {
    (
        event: "dirty" | "disconnected" | "dispose" | "saved" | "attached",
        listener: () => void);
    (event: "connected", listener: (clientId: string) => void);
    (event: "localHelp", listener: (message: IHelpMessage) => void);
}

export type IContainerRuntimeBaseWithCombinedEvents =
    IContainerRuntimeBase & IEventProvider<IContainerRuntimeEvents>;

/*
 * Represents the runtime of the container. Contains helper functions/state of the container.
 */
export interface IContainerRuntime extends
    IProvideContainerRuntime,
    IProvideFluidDataStoreRegistry,
    IContainerRuntimeBaseWithCombinedEvents {

    readonly options: ILoaderOptions;
    readonly clientId: string | undefined;
    readonly clientDetails: IClientDetails;
    readonly connected: boolean;
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    readonly storage: IDocumentStorageService;
    readonly flushMode: FlushMode;
    readonly scope: FluidObject;
    /**
     * Indicates the attachment state of the container to a host service.
     */
    readonly attachState: AttachState;

    /**
     * Returns the runtime of the data store.
     * @param id - Id supplied during creating the data store.
     * @param wait - True if you want to wait for it.
     */
    getRootDataStore(id: string, wait?: boolean): Promise<IFluidRouter>;

    /**
     * Creates detached data store context. Data store initialization is considered complete
     * only after context.attachRuntime() is called.
     * @param pkg - package path
     * @param rootDataStoreId - data store ID (unique name). Must not contain slashes.
     */
    createDetachedRootDataStore(pkg: Readonly<string[]>, rootDataStoreId: string): IFluidDataStoreContextDetached;

    /**
     * Returns true if document is dirty, i.e. there are some pending local changes that
     * either were not sent out to delta stream or were not yet acknowledged.
     */
    readonly isDirty: boolean;

    /**
     * Flushes any ops currently being batched to the loader
     * @deprecated - This will be removed in a later release. If a more manual flushing process is needed,
     * move all usage to `IContainerRuntimeBase.orderSequentially` if possible.
     */
    flush(): void;

    /**
     * Get an absolute url for a provided container-relative request.
     * Returns undefined if the container isn't attached to storage.
     * @param relativeUrl - A relative request within the container
     */
    getAbsoluteUrl(relativeUrl: string): Promise<string | undefined>;

    /**
     * Resolves handle URI
     * @param request - request to resolve
     */
    resolveHandle(request: IRequest): Promise<IResponse>;
}
