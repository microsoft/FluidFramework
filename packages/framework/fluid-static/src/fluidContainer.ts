/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IFluidLoadable } from "@fluidframework/core-interfaces";
import { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import {
    AttachState,
    IContainer,
    ICriticalContainerError,
    ConnectionState,
} from "@fluidframework/container-definitions";
import type { IRootDataObject, LoadableObjectClass, LoadableObjectRecord } from "./types";

/**
 * Events emitted from {@link IFluidContainer}.
 *
 * @remarks
 *
 * The following is the list of events emitted.
 *
 * ### "connected"
 *
 * The "connected" event is emitted when the `IFluidContainer` completes connecting to the Fluid service.
 *
 * #### Listener signature
 *
 * ```typescript
 * () => void;
 * ```
 *
 * ### "disposed"
 *
 * The "disposed" event is emitted when the `IFluidContainer` is disposed, which permanently disables it.
 *
 * #### Listener signature
 *
 * ```typescript
 * () => void;
 * ```
 *
 * ### "disconnected"
 *
 * The "disconnected" event is emitted when the `IFluidContainer` becomes disconnected from the Fluid service.
 *
 * #### Listener signature
 *
 * ```typescript
 * () => void;
 * ```
 *
 * ### "saved"
 *
 * The "saved" event is emitted when the `IFluidContainer` has local changes acknowledged by the service.
 *
 * #### Listener signature
 *
 * ```typescript
 * () => void
 * ```
 *
 * ### "dirty"
 *
 * The "dirty" event is emitted when the `IFluidContainer` has local changes that have not yet
 * been acknowledged by the service.
 *
 * #### Listener signature
 *
 * ```typescript
 * () => void
 * ```
 */
export interface IFluidContainerEvents extends IEvent {
    /**
     * **connected** & **disconnected** events reflect connection state changes against the (delta)
     * service acknowledging ops/edits.
     */
    (event: "connected" | "disconnected", listener: () => void): void;
    /**
     * **saved** event is raised when all local changes/edits have been acknowledged by the service.
     * **dirty** event is raised when first local change has been made, following a "saved" state.
     */
    // eslint-disable-next-line @typescript-eslint/unified-signatures
    (event: "saved" | "dirty", listener: () => void): void;
    /**
     * Disposed event is raised when container is closed. If container was closed due to error
     * (vs explicit **dispose** action), optional argument contains further details about the error.
     */
    (event: "disposed", listener: (error?: ICriticalContainerError) => void);
}

/**
 * Provides an entrypoint into the client side of collaborative Fluid data.
 * Provides access to the data as well as status on the collaboration session.
 */
export interface IFluidContainer extends IEventProvider<IFluidContainerEvents> {
    /**
     * Provides the current connected state of the container
     */
    readonly connectionState: ConnectionState;

    /**
     * A container is considered **dirty** if it has local changes that have not yet been acknowledged by the service.
     *
     * @remarks
     *
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
     * Whether or not the container is disposed, which permanently disables it.
     */
    readonly disposed: boolean;

    /**
     * The collection of data objects and Distributed Data Stores (DDSes) that were specified by the schema.
     *
     * @remarks These data objects and DDSes exist for the lifetime of the container.
     */
    readonly initialObjects: LoadableObjectRecord;

    /**
     * The current attachment state of the container.
     *
     * @remarks
     *
     * Once a container has been attached, it remains attached.
     * When loading an existing container, it will already be attached.
     */
    readonly attachState: AttachState;

    /**
     * A newly created container starts detached from the collaborative service.
     * Calling `attach()` uploads the new container to the service and connects to the collaborative service.
     *
     * @remarks
     *
     * This should only be called when the container is in the
     * {@link @fluidframework/container-definitions#AttachState.Detatched} state.
     *
     * This can be determined by observing {@link IFluidContainer.attachState}.
     *
     * @returns A promise which resolves when the attach is complete, with the string identifier of the container.
     */
    attach(): Promise<string>;

    /**
     * Attempts to connect the container to the delta stream and process operations.
     * Will throw an error if unsuccessful.
     *
     * @remarks
     *
     * This should only be called when the container is in the
     * {@link @fluidframework/container-definitions#ConnectionState.Disconnected} state.
     *
     * This can be determined by observing {@link IFluidContainer.connectionState}.
     */
    connect(): void;

    /**
     * Disconnects the container from the delta stream and stops processing operations.
     *
     * @remarks
     *
     * This should only be called when the container is in the
     * {@link @fluidframework/container-definitions#ConnectionState.Connected} state.
     *
     * This can be determined by observing {@link IFluidContainer.connectionState}.
     */
    disconnect(): void;

    /**
     * Create a new data object or Distributed Data Store (DDS) of the specified type.
     *
     * @remarks
     *
     * In order to share the data object or DDS with other
     * collaborators and retrieve it later, store its handle in a collection like a SharedDirectory from your
     * initialObjects.
     *
     * @param objectClass - The class of the `DataObject` or `SharedObject` to create.
     *
     * @typeParam T - The class of the `DataObject` or `SharedObject`.
     */
    create<T extends IFluidLoadable>(objectClass: LoadableObjectClass<T>): Promise<T>;

    /**
     * Dispose of the container instance, permanently disabling it.
     */
    dispose(): void;
}

/**
 * Base {@link IFluidContainer} implementation.
 *
 * @remarks
 *
 * Note: this implementation is not complete. Consumers who rely on {@link IFluidContainer.attach}
 * will need to utilize or provide a service-specific implementation of this type that implements that method.
 */
export class FluidContainer extends TypedEventEmitter<IFluidContainerEvents> implements IFluidContainer {
    private readonly connectedHandler = () => this.emit("connected");
    private readonly disconnectedHandler = () => this.emit("disconnected");
    private readonly disposedHandler = (error?: ICriticalContainerError) => this.emit("disposed", error);
    private readonly savedHandler = () => this.emit("saved");
    private readonly dirtyHandler = () => this.emit("dirty");

    public constructor(
        private readonly container: IContainer,
        private readonly rootDataObject: IRootDataObject,
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
     * Incomplete base implementation of {@link IFluidContainer.attach}.
     *
     * @remarks
     *
     * Note: this implementation will unconditionally throw.
     * Consumers who rely on this will need to utilize or provide a service specific implementation of this base type
     * that provides an implementation of this method.
     *
     * The reason is because externally we are presenting a separation between the service and the `FluidContainer`,
     * but internally this separation is not there.
     */
    public async attach(): Promise<string> {
        if (this.container.attachState !== AttachState.Detached) {
            throw new Error("Cannot attach container. Container is not in detached state.");
        }
        throw new Error("Cannot attach container. Attach method not provided.");
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
