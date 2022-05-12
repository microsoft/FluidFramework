/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory, mountableViewRequestHandler } from "@fluidframework/aqueduct";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject, RequestParser } from "@fluidframework/runtime-utils";
import { MountableView } from "@fluidframework/view-adapters";
import React from "react";

import { DiceRoller, DiceRollerInstantiationFactory } from "./model";
import { DiceRollerView } from "./view";

const dataStoreId = "modelDataStore";

// The defaultViewRequestHandler responds to empty requests with the default view (a DiceRollerView).  Since we wrap
// it with a mountableViewRequestHandler below, the view will be wrapped in a MountableView if the requester includes
// the mountableView request header.
const defaultViewRequestHandler = async (request: RequestParser, runtime: IContainerRuntime) => {
    if (request.pathParts.length === 0) {
        const objectRequest = RequestParser.create({
            url: ``,
            headers: request.headers,
        });
        const model = await requestFluidObject<DiceRoller>(
            await runtime.getRootDataStore(dataStoreId),
            objectRequest);
        const viewResponse = React.createElement(DiceRollerView, { model });
        return { status: 200, mimeType: "fluid/object", value: viewResponse };
    }
};

/**
 * The DiceRollerContainerRuntimeFactory creates the single DiceRoller model and also provides a request handler that
 * can bind the DiceRoller to a DiceRollerView.
 */
export class DiceRollerContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    constructor() {
        // We'll use a MountableView so the app can display us, and add our default view request handler.
        super(
            new Map([[DiceRollerInstantiationFactory.type, Promise.resolve(DiceRollerInstantiationFactory)]]),
            undefined,
            [mountableViewRequestHandler(MountableView, [defaultViewRequestHandler])],
        );
    }

    /**
     * Create the single DiceRoller model for the container on first initialization.
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        const dataStore = await runtime.createDataStore(DiceRollerInstantiationFactory.type);
        await dataStore.trySetAlias(dataStoreId);
    }
}
