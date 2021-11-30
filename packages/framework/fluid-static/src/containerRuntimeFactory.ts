/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    BaseContainerRuntimeFactory,
    DataObjectFactory,
    defaultRouteRequestHandler,
} from "@fluidframework/aqueduct";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { ContainerSchema, LoadableObjectClass, LoadableObjectClassRecord, LoadableObjectRecord } from "./types";
import { parseDataObjectsFromSharedObjects } from "./utils";
import { RootDataObject, RootDataObjectProps } from "./rootDataObject";

export const rootDataStoreId = "rootDOId";

/**
 * The DOProviderContainerRuntimeFactory is container code that provides a single RootDataObject.  This data object is
 * dynamically customized (registry and initial objects) based on the schema provided to the container runtime factory.
 */
export class DOProviderContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    private readonly rootDataObjectFactory:
        // eslint-disable-next-line @typescript-eslint/ban-types
        DataObjectFactory<RootDataObject, {}, RootDataObjectProps>;
    private readonly initialObjects: LoadableObjectClassRecord;
    constructor(schema: ContainerSchema) {
        const [registryEntries, sharedObjects] = parseDataObjectsFromSharedObjects(schema);

        const RootDOWithMigrations = class extends RootDataObject {
            protected async initializingFromExisting() {
                if (typeof schema.migrations === "undefined") {
                    // no-op when no migration routines provided with the schema
                    return;
                }

                await this.loadInitialObjects();

                const migrations = typeof schema.migrations === "function" ? [schema.migrations] : schema.migrations;

                for (const migration of migrations) {
                    const revision = await migration(
                        this.initialObjects,
                        async (objectClass) => { return this.create(objectClass); },
                    );
                    if (revision) {
                        this.commitRevision(revision);
                    }
                }
            }

            private commitRevision(revision: LoadableObjectRecord) {

            }

            async addObject(key: string, objectClass: LoadableObjectClass<any>, props: any) {
                const obj = await this.create(objectClass);
                this.initialObjectsDir.set(key, obj.handle);
                Object.assign(this.initialObjects, { [key]: obj });
            }

            dropObject(key: string): void {
                if (key in this.initialObjects) {
                    this.initialObjectsDir.delete(key);
                    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                    delete this.initialObjects[key];
                    // delete or GC the object itself
                }
            }
        };

        const rootDataObjectFactory =
            // eslint-disable-next-line @typescript-eslint/ban-types
            new DataObjectFactory<RootDataObject, {}, RootDataObjectProps>(
                "rootDO",
                RootDOWithMigrations,
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
