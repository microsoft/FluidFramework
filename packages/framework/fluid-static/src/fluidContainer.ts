/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { Container } from "@fluidframework/container-loader";
import { IFluidLoadable } from "@fluidframework/core-interfaces";
import { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { AttachState } from "@fluidframework/container-definitions";
import { LoadableObjectClass, LoadableObjectRecord } from "./types";
import { RootDataObject } from "./rootDataObject";

/**
 * Events emitted from IFluidContainer.
 */
export interface IFluidContainerEvents extends IEvent {
    (event: "connected" | "dispose" | "disconnected", listener: () => void): void;
}

/**
 * The IFluidContainer provides an entrypoint into the client side of collaborative Fluid data.  It provides access
 * to the data as well as status on the collaboration session.
 */
export interface IFluidContainer extends IEventProvider<IFluidContainerEvents> {
    /**
     * Whether the container is connected to the collaboration session.
     */
    readonly connected: boolean;

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

    public constructor(
        private readonly container: Container,
        private readonly rootDataObject: RootDataObject,
    ) {
        super();
        container.on("connected", this.connectedHandler);
        container.on("closed", this.disposedHandler);
        container.on("disconnected", this.disconnectedHandler);
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
    }
}
