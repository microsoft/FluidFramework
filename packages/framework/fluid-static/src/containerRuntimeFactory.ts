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
import { ContainerSchema, LoadableObjectClassRecord } from "./types";
import { parseDataObjectsFromSharedObjects } from "./utils";
import { RootDataObject, RootDataObjectProps } from "./rootDataObject";
import { withSchema } from "./schema";

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

        const RootDOWithMigrations = withSchema(schema);

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
