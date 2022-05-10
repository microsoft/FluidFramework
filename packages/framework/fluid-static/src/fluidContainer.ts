/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IFluidLoadable } from "@fluidframework/core-interfaces";
import { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { AttachState, IContainer, ConnectionState } from "@fluidframework/container-definitions";
import { LoadableObjectClass, LoadableObjectRecord } from "./types";
import { RootDataObject } from "./rootDataObject";

/**
 * Events emitted from IFluidContainer.
 *
 * ### "connected"
 *
 * The connected event is emitted when the `IFluidContainer` completes connecting to the Fluid service.
 *
 * #### Listener signature
 *
 * ```typescript
 * () => void;
 * ```
 *
 * ### "dispose"
 *
 * The dispose event is emitted when the `IFluidContainer` is disposed, which permanently disables it.
 *
 * #### Listener signature
 *
 * ```typescript
 * () => void;
 * ```
 *
 * ### "disconnected"
 *
 * The disconnected event is emitted when the `IFluidContainer` becomes disconnected from the Fluid service.
 *
 * #### Listener signature
 *
 * ```typescript
 * () => void;
 * ```
 *
 * ### "saved"
 *
 * The saved event is emitted when the `IFluidContainer` has local changes acknowledged by the service.
 *
 * #### Listener signature
 *
 * ```typescript
 * () => void
 * ```
 *
 * ### "dirty"
 *
 * The dirty event is emitted when the `IFluidContainer` has local changes that have not yet
 * been acknowledged by the service.
 *
 * #### Listener signature
 *
 * ```typescript
 * () => void
 * ```
 */
export interface IFluidContainerEvents extends IEvent {
    (event: "connected" | "dispose" | "disconnected" | "saved" | "dirty", listener: () => void): void;
}

/**
 * The IFluidContainer provides an entrypoint into the client side of collaborative Fluid data.  It provides access
 * to the data as well as status on the collaboration session.
 */
export interface IFluidContainer extends IEventProvider<IFluidContainerEvents> {
    /**
     * Whether the container is connected to the collaboration session.
     * @deprecated - 0.58, This API will be removed in 1.0
     * Check `connectionState === ConnectionState.Connected` instead
     * See https://github.com/microsoft/FluidFramework/issues/9167 for context
     */
    readonly connected: boolean;

    /**
     * Provides the current connected state of the container
     */
    readonly connectionState: ConnectionState;

     /**
     * A container is considered **dirty** if it has local changes that have not yet been acknowledged by the service.
     * You should always check the `isDirty` flag before closing the container or navigating away from the page.
     * Closing the container while `isDirty === true` may result in the loss of operations that have not yet been
     * acknowledged by the service.
     *
     * A container is considered dirty in the following cases:
     *
     * 1. The container has been created in the detached state, and either it has not been attached yet or it is
     * in the process of being attached (container is in `attaching` state). If container is closed prior to being
     * attached, host may never know if the file was created or not.
     *
     * 2. The container was attached, but it has local changes that have not yet been saved to service endpoint.
     * This occurs as part of normal op flow where pending operation (changes) are awaiting acknowledgement from the
     * service. In some cases this can be due to lack of network connection. If the network connection is down,
     * it needs to be restored for the pending changes to be acknowledged.
     */
     readonly isDirty: boolean;

    /**
     * Whether the container is disposed, which permanently disables it.
     */
    readonly disposed: boolean;

    /**
     * The collection of data objects and DDSes that were specified by the schema. These data objects and DDSes exist
     * for the lifetime of the container.
     */
    readonly initialObjects: LoadableObjectRecord;

    /**
     * The current attachment state of the container.  Once a container has been attached, it remains attached.
     * When loading an existing container, it will already be attached.
     */
    readonly attachState: AttachState;

    /**
     * A newly created container starts detached from the collaborative service.  Calling attach() uploads the
     * new container to the service and connects to the collaborative service.
     * @returns A promise which resolves when the attach is complete, with the string identifier of the container.
     */
    attach(): Promise<string>;

    /**
     * Attempts to connect the container to the delta stream and process ops
     */
    connect?(): void;

    /**
     * Disconnects the container from the delta stream and stops processing ops
     */
    disconnect?(): void;

    /**
     * Create a new data object or DDS of the specified type.  In order to share the data object or DDS with other
     * collaborators and retrieve it later, store its handle in a collection like a SharedDirectory from your
     * initialObjects.
     * @param objectClass - The class of data object or DDS to create
     */
    create<T extends IFluidLoadable>(objectClass: LoadableObjectClass<T>): Promise<T>;

    /**
     * Dispose of the container instance, permanently disabling it.
     */
    dispose(): void;
}

/**
 * Implementation of the IFluidContainer.
 */
export class FluidContainer extends TypedEventEmitter<IFluidContainerEvents> implements IFluidContainer {
    private readonly connectedHandler = () => this.emit("connected");
    private readonly disconnectedHandler = () => this.emit("disconnected");
    private readonly disposedHandler = () => this.emit("disposed");
    private readonly savedHandler = () => this.emit("saved");
    private readonly dirtyHandler = () => this.emit("dirty");

    public constructor(
        private readonly container: IContainer,
        private readonly rootDataObject: RootDataObject,
    ) {
        super();
        container.on("connected", this.connectedHandler);
        container.on("closed", this.disposedHandler);
        container.on("disconnected", this.disconnectedHandler);
        container.on("saved", this.savedHandler);
        container.on("dirty", this.dirtyHandler);
    }

    /**
     * {@inheritDoc IFluidContainer.isDirty}
     */
     public get isDirty(): boolean {
        return this.container.isDirty;
    }

    /**
     * {@inheritDoc IFluidContainer.attachState}
     */
    public get attachState(): AttachState {
        return this.container.attachState;
    }

    /**
     * {@inheritDoc IFluidContainer.disposed}
     */
    public get disposed() {
        return this.container.closed;
    }

    /**
     * {@inheritDoc IFluidContainer.connected}
     */
    public get connected() {
        return this.container.connected;
    }

    /**
     * {@inheritDoc IFluidContainer.connectionState}
     */
     public get connectionState(): ConnectionState {
        return this.container.connectionState;
    }

    /**
     * {@inheritDoc IFluidContainer.initialObjects}
     */
    public get initialObjects() {
        return this.rootDataObject.initialObjects;
    }

    /**
     * {@inheritDoc IFluidContainer.attach}
     */
    public async attach(): Promise<string> {
        throw new Error("Cannot attach container. Container is not in detached state");
    }

    /**
     * {@inheritDoc IFluidContainer.connect}
     */
    public async connect(): Promise<void> {
        this.container.connect?.();
    }

    /**
     * {@inheritDoc IFluidContainer.connect}
     */
    public async disconnect(): Promise<void> {
        this.container.disconnect?.();
    }

    /**
     * {@inheritDoc IFluidContainer.create}
     */
    public async create<T extends IFluidLoadable>(objectClass: LoadableObjectClass<T>): Promise<T> {
        return this.rootDataObject.create(objectClass);
    }

    /**
     * {@inheritDoc IFluidContainer.dispose}
     */
    public dispose() {
        this.container.close();
        this.container.off("connected", this.connectedHandler);
        this.container.off("closed", this.disposedHandler);
        this.container.off("disconnected", this.disconnectedHandler);
        this.container.off("saved", this.savedHandler);
        this.container.off("dirty", this.dirtyHandler);
    }
}
