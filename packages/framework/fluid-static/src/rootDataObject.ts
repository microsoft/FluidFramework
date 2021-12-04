/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    DataObject,
} from "@fluidframework/aqueduct";
import { IFluidLoadable } from "@fluidframework/core-interfaces";
import { IDirectory } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    DataObjectClass,
    LoadableObjectClass,
    LoadableObjectClassRecord,
    LoadableObjectRecord,
    SharedObjectClass,
} from "./types";
import { isDataObjectClass, isSharedObjectClass } from "./utils";

export interface RootDataObjectProps {
    initialObjects: LoadableObjectClassRecord;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export class RootDataObject extends DataObject<{}, RootDataObjectProps> {
    private readonly initialObjectsDirKey = "initial-objects-key";
    private readonly _initialObjects: LoadableObjectRecord = {};

    protected get initialObjectsDir(): IDirectory {
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
        await this.loadInitialObjects();
    }

    protected async loadInitialObjects() {
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
        props?: any,
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
