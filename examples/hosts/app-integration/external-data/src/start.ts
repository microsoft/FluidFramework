/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

import { ModelLoader } from "@fluid-example/example-utils";
import { createTinyliciousCreateNewRequest } from "@fluidframework/tinylicious-driver";

import { DemoCodeLoader } from "./demoCodeLoader";
import type { IAppModel } from "./modelInterfaces";
import { TinyliciousService } from "./tinyliciousService";
import { DebugView, TaskListAppView } from "./view";

const updateTabForId = (id: string) => {
    // Update the URL with the actual ID
    location.hash = id;

    // Put the ID in the tab title
    document.title = id;
};

const render = (model: IAppModel) => {
    const appDiv = document.getElementById("app") as HTMLDivElement;
    ReactDOM.unmountComponentAtNode(appDiv);
    ReactDOM.render(
        React.createElement(TaskListAppView, { model }),
        appDiv,
    );

    // The DebugView is just for demo purposes, to manually control code proposal and inspect the state.
    const debugDiv = document.getElementById("debug") as HTMLDivElement;
    ReactDOM.unmountComponentAtNode(debugDiv);
    ReactDOM.render(
        React.createElement(DebugView, { }),
        debugDiv,
    );
};

async function start(): Promise<void> {
    const tinyliciousService = new TinyliciousService();

    // If we assumed the container code could consistently present a model to us, we could bake that assumption
    // in here as well as in the Migrator -- both places just need a reliable way to get a model regardless of the
    // (unknown) container version.  So the ModelLoader would be replaced by whatever the consistent request call
    // (e.g. container.request({ url: "mode" })) looks like.
    const modelLoader = new ModelLoader<IAppModel>({
        urlResolver: tinyliciousService.urlResolver,
        documentServiceFactory: tinyliciousService.documentServiceFactory,
        codeLoader: new DemoCodeLoader(),
        generateCreateNewRequest: createTinyliciousCreateNewRequest,
    });

    let id: string;
    let model: IAppModel;

    if (location.hash.length === 0) {
        // Choosing to create with the "old" version for demo purposes, so we can demo the upgrade flow.
        // Normally we would create with the most-recent version.
        const createResponse = await modelLoader.createDetached("one");
        model = createResponse.model;

        id = await createResponse.attach();
    } else {
        id = location.hash.substring(1);
        model = await modelLoader.loadExisting(id);
    }

    render(model);
    updateTabForId(id);
}

start().catch((error) => console.error(error));
