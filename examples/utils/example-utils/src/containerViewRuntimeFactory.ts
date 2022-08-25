/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory, mountableViewRequestHandler } from "@fluidframework/aqueduct";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { RuntimeRequestHandler } from "@fluidframework/request-handler";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { requestFluidObject, RequestParser } from "@fluidframework/runtime-utils";
import { MountableView } from "@fluidframework/view-adapters";

const dataStoreId = "modelDataStore";

export type ViewCallback<T> = (fluidModel: T) => any;

const makeViewRequestHandler = <T>(viewCallback: ViewCallback<T>): RuntimeRequestHandler =>
    async (request: RequestParser, runtime: IContainerRuntime) => {
        if (request.pathParts.length === 0) {
            const objectRequest = RequestParser.create({
                url: ``,
                headers: request.headers,
            });
            // TODO type the requestFluidObject
            const fluidObject = await requestFluidObject<T>(
                await runtime.getRootDataStore(dataStoreId),
                objectRequest);
            const viewResponse = viewCallback(fluidObject);
            return { status: 200, mimeType: "fluid/view", value: viewResponse };
        }
    };

/**
 * The ContainerViewRuntimeFactory is an example utility built to support binding a single model to a single view
 * within the container.  For more-robust implementation of binding views within the container, check out the examples
 * \@fluid-example/app-integration-container-views and \@fluid-example/multiview-container
 */
export class ContainerViewRuntimeFactory<T> extends BaseContainerRuntimeFactory {
    constructor(
        private readonly dataStoreFactory: IFluidDataStoreFactory,
        viewCallback: ViewCallback<T>,
    ) {
        // We'll use a MountableView so webpack-fluid-loader can display us,
        // and add our default view request handler.
        super(
            new Map([[dataStoreFactory.type, Promise.resolve(dataStoreFactory)]]),
            undefined,
            [mountableViewRequestHandler(MountableView, [makeViewRequestHandler(viewCallback)])],
        );
    }

    /**
     * Since we're letting the container define the default view it will respond with, it must do whatever setup
     * it requires to produce that default view.  We'll create a single data store of the specified type.
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        const dataStore = await runtime.createDataStore(this.dataStoreFactory.type);
        await dataStore.trySetAlias(dataStoreId);
    }
}
