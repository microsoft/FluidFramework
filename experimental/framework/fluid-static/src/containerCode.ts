/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    BaseContainerRuntimeFactory,
    DataObject,
    DataObjectFactory,
    defaultRouteRequestHandler,
} from "@fluidframework/aqueduct";
import { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { IAudience } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidHandle, IFluidLoadable } from "@fluidframework/core-interfaces";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import {
    ContainerSchema,
    DataObjectClass,
    LoadableObjectClass,
    LoadableObjectClassRecord,
    LoadableObjectRecord,
    SharedObjectClass,
} from "./types";
import { isDataObjectClass, isSharedObjectClass, parseDataObjectsFromSharedObjects } from "./utils";

export interface IFluidContainerEvents extends IEvent {
    (event: "connected", listener: (clientId: string) => void): void;
    (event: "dispose" | "disconnected", listener: () => void): void;
}

/**
 * FluidContainer defines the interface that the developer will use to interact with Fluid.
 */
export interface FluidContainer
    extends Pick<Container, "audience" | "clientId">, IEventProvider<IFluidContainerEvents> {
    /**
     * The initialObjects defined in the container config
     */
    readonly initialObjects: LoadableObjectRecord;

    /**
     * Creates a new instance of the provided LoadableObjectClass.
     *
     * The returned object needs to be stored via handle by the caller.
     */
    create<T extends IFluidLoadable>(objectClass: LoadableObjectClass<T>): Promise<T>;
}

interface RootDataObjectProps {
    initialObjects: LoadableObjectClassRecord;
}

/**
 * The RootDataObject is the implementation of the FluidContainer.
 */
export class RootDataObject
    // eslint-disable-next-line @typescript-eslint/ban-types
    extends DataObject<{}, RootDataObjectProps, IFluidContainerEvents>
    implements FluidContainer {
    private readonly connectedHandler = (id: string) => this.emit("connected", id);
    private readonly disconnectedHandler = () => this.emit("disconnected");
    private readonly initialObjectsDirKey = "initial-objects-key";
    private readonly _initialObjects: LoadableObjectRecord = {};

    private get initialObjectsDir() {
        const dir = this.root.getSubDirectory(this.initialObjectsDirKey);
        if (dir === undefined) {
            throw new Error("InitialObjects sub-directory was not initialized");
        }
        return dir;
    }

    protected async initializingFirstTime(props: RootDataObjectProps) {
        this.root.createSubDirectory(this.initialObjectsDirKey);

        // Create initial objects provided by the developer
        const initialObjectsP: Promise<void>[] = [];
        Object.entries(props.initialObjects).forEach(([id, objectClass]) => {
            const createObject = async () => {
                const obj = await this.create(objectClass);
                this.initialObjectsDir.set(id, obj.handle);
            };
            initialObjectsP.push(createObject());
        });

        await Promise.all(initialObjectsP);
    }

    protected async hasInitialized() {
        this.runtime.on("connected", this.connectedHandler);
        this.runtime.on("disconnected", this.disconnectedHandler);

        // We will always load the initial objects so they are available to the developer
        const loadInitialObjectsP: Promise<void>[] = [];
        for (const [key, value] of Array.from(this.initialObjectsDir.entries())) {
            const loadDir = async () => {
                const obj = await value.get();
                Object.assign(this._initialObjects, { [key]: obj });
            };
            loadInitialObjectsP.push(loadDir());
        }

        await Promise.all(loadInitialObjectsP);
    }

    public dispose() {
        // remove our listeners and continue disposing
        this.runtime.off("connected", this.connectedHandler);
        this.runtime.off("disconnected", this.disconnectedHandler);
        // After super.dispose(), all event listeners are removed so we need to emit first.
        this.emit("dispose");
        super.dispose();
    }

    public get audience(): IAudience {
        return this.context.getAudience();
    }

    public get clientId() {
        return this.context.clientId;
    }

    public get initialObjects(): LoadableObjectRecord {
        if (Object.keys(this._initialObjects).length === 0) {
            throw new Error("Initial Objects were not correctly initialized");
        }
        return this._initialObjects;
    }

    public async create<T extends IFluidLoadable>(
        objectClass: LoadableObjectClass<T>,
    ): Promise<T> {
        if (isDataObjectClass(objectClass)) {
            return this.createDataObject<T>(objectClass);
        } else if (isSharedObjectClass(objectClass)) {
            return this.createSharedObject<T>(objectClass);
        }

        throw new Error("Could not create new Fluid object because an unknown object was passed");
    }

    private async createDataObject<T extends IFluidLoadable>(dataObjectClass: DataObjectClass<T>): Promise<T> {
        const factory = dataObjectClass.factory;
        const packagePath = [...this.context.packagePath, factory.type];
        const router = await this.context.containerRuntime.createDataStore(packagePath);
        return requestFluidObject<T>(router, "/");
    }

    private createSharedObject<T extends IFluidLoadable>(
        sharedObjectClass: SharedObjectClass<T>,
    ): T {
        const factory = sharedObjectClass.getFactory();
        const obj = this.runtime.createChannel(undefined, factory.type);
        return obj as unknown as T;
    }
}

const rootDataStoreId = "rootDOId";
/**
 * The DOProviderContainerRuntimeFactory is the container code for our scenario.
 *
 * By including the createRequestHandler, we can create any droplet types we include in the registry on-demand.
 * These can then be retrieved via container.request("/dataObjectId").
 */
export class DOProviderContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    private readonly rootDataObjectFactory; // type is DataObjectFactory
    private readonly initialObjects: LoadableObjectClassRecord;
    constructor(schema: ContainerSchema) {
        const [registryEntries, sharedObjects] = parseDataObjectsFromSharedObjects(schema);
        const rootDataObjectFactory =
            // eslint-disable-next-line @typescript-eslint/ban-types
            new DataObjectFactory<RootDataObject, {}, RootDataObjectProps>(
                "rootDO",
                RootDataObject,
                sharedObjects,
                {},
                registryEntries,
            );
        super([rootDataObjectFactory.registryEntry], [], [defaultRouteRequestHandler(rootDataStoreId)]);
        this.rootDataObjectFactory = rootDataObjectFactory;
        this.initialObjects = schema.initialObjects;
    }

    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        // The first time we create the container we create the RootDataObject
        await this.rootDataObjectFactory.createRootInstance(
            rootDataStoreId,
            runtime,
            { initialObjects: this.initialObjects });
    }
}
