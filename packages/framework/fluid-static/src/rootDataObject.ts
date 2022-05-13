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
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidLoadable } from "@fluidframework/core-interfaces";
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

export interface RootDataObjectProps {
    initialObjects: LoadableObjectClassRecord;
}

export class RootDataObject extends DataObject<{ InitialState: RootDataObjectProps; }> {
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
 * The DOProviderContainerRuntimeFactory is container code that provides a single RootDataObject.  This data object is
 * dynamically customized (registry and initial objects) based on the schema provided to the container runtime factory.
 */
export class DOProviderContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    private readonly rootDataObjectFactory; // type is DataObjectFactory
    private readonly initialObjects: LoadableObjectClassRecord;
    constructor(schema: ContainerSchema) {
        const [registryEntries, sharedObjects] = parseDataObjectsFromSharedObjects(schema);
        const rootDataObjectFactory =
            new DataObjectFactory(
                "rootDO",
                RootDataObject,
                sharedObjects,
                {},
                registryEntries,
            );
        super([rootDataObjectFactory.registryEntry], undefined, [defaultRouteRequestHandler(rootDataStoreId)]);
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
