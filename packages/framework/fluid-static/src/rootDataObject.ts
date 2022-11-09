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
import { FlushMode } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ContainerSchema,
    DataObjectClass,
    IRootDataObject,
    LoadableObjectClass,
    LoadableObjectClassRecord,
    LoadableObjectRecord,
    SharedObjectClass,
} from "./types";
import { isDataObjectClass, isSharedObjectClass, parseDataObjectsFromSharedObjects } from "./utils";

/**
 * Input props for {@link RootDataObject.initializingFirstTime}.
 */
export interface RootDataObjectProps {
    /**
     * Initial object structure with which the {@link RootDataObject} will be first-time initialized.
     *
     * @see {@link RootDataObject.initializingFirstTime}
     */
    initialObjects: LoadableObjectClassRecord;
}

/**
 * The entry-point/root collaborative object of the {@link IFluidContainer | Fluid Container}.
 * Abstracts the dynamic code required to build a Fluid Container into a static representation for end customers.
 */
export class RootDataObject extends DataObject<{ InitialState: RootDataObjectProps; }> implements IRootDataObject {
    private readonly initialObjectsDirKey = "initial-objects-key";
    private readonly _initialObjects: LoadableObjectRecord = {};

    private get initialObjectsDir() {
        const dir = this.root.getSubDirectory(this.initialObjectsDirKey);
        if (dir === undefined) {
            throw new Error("InitialObjects sub-directory was not initialized");
        }
        return dir;
    }

    /**
     * The first time this object is initialized, creates each object identified in
     * {@link RootDataObjectProps.initialObjects} and stores them as unique values in the root directory.
     *
     * @see {@link @fluidframework/aqueduct#PureDataObject.initializingFirstTime}
     */
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

    /**
     * Every time an instance is initialized, loads all of the initial objects in the root directory so they can be
     * accessed immediately.
     *
     * @see {@link @fluidframework/aqueduct#PureDataObject.hasInitialized}
     */
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

    /**
     * {@inheritDoc IRootDataObject.initialObjects}
     */
    public get initialObjects(): LoadableObjectRecord {
        if (Object.keys(this._initialObjects).length === 0) {
            throw new Error("Initial Objects were not correctly initialized");
        }
        return this._initialObjects;
    }

    /**
     * {@inheritDoc IRootDataObject.create}
     */
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
 * Container code that provides a single {@link RootDataObject}.
 *
 * @remarks
 *
 * This data object is dynamically customized (registry and initial objects) based on the schema provided.
 * to the container runtime factory.
 */
export class DOProviderContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    private readonly rootDataObjectFactory: DataObjectFactory<RootDataObject, {
        InitialState: RootDataObjectProps;
    }>;

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
        super(
            [rootDataObjectFactory.registryEntry],
            undefined,
            [defaultRouteRequestHandler(rootDataStoreId)],
            // temporary workaround to disable message batching until the message batch size issue is resolved
            // resolution progress is tracked by the Feature 465 work item in AzDO
            { flushMode: FlushMode.Immediate },
        );
        this.rootDataObjectFactory = rootDataObjectFactory;
        this.initialObjects = schema.initialObjects;
    }

    /**
     * {@inheritDoc @fluidframework/aqueduct#BaseContainerRuntimeFactory.containerInitializingFirstTime}
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        // The first time we create the container we create the RootDataObject
        await this.rootDataObjectFactory.createRootInstance(
            rootDataStoreId,
            runtime,
            { initialObjects: this.initialObjects });
    }
}
