/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

import { StaticCodeLoader, TinyliciousModelLoader } from "@fluid-example/example-utils";

import type { IAppModel } from "./model-interface";
import { DebugView, AppView } from "./view";
import { TaskListContainerRuntimeFactory } from "./model";

const updateTabForId = (id: string): void => {
    // Update the URL with the actual ID
    location.hash = id;

    // Put the ID in the tab title
    document.title = id;
};

const render = (ffModel: IAppModel, externalModel: IAppModel): void => {
    const appDiv = document.querySelector("#app") as HTMLDivElement;
    ReactDOM.unmountComponentAtNode(appDiv);
    ReactDOM.render(
        React.createElement(AppView, { model: ffModel }),
        appDiv,
    );

    // The DebugView is just for demo purposes, to offer manual controls and inspectability for things that normally
    // would be some external system or arbitrarily occurring.
    const debugDiv = document.querySelector("#debug") as HTMLDivElement;
    ReactDOM.unmountComponentAtNode(debugDiv);
    ReactDOM.render(
        React.createElement(DebugView, {  model: externalModel }),
        debugDiv,
    );
};

async function start(): Promise<void> {
    const tinyliciousModelLoader = new TinyliciousModelLoader<IAppModel>(
        new StaticCodeLoader(new TaskListContainerRuntimeFactory()),
    );

    let id: string;
    let ffModel: IAppModel;

    if (location.hash.length === 0) {
        // Normally our code loader is expected to match up with the version passed here.
        // But since we're using a StaticCodeLoader that always loads the same runtime factory regardless,
        // the version doesn't actually matter.
        const createResponse = await tinyliciousModelLoader.createDetached("one");
        ffModel = createResponse.model;

        id = await createResponse.attach();
    } else {
        id = location.hash.slice(1);
        ffModel = await tinyliciousModelLoader.loadExisting(id);
    }

    // Create a different model to represent the external data view
    const tinyliciousExternalModelLoader = new TinyliciousModelLoader<IAppModel>(
        new StaticCodeLoader(new TaskListContainerRuntimeFactory()),
    );
    const externalCreateResponse = await tinyliciousExternalModelLoader.createDetached("one");
    const externalModel: IAppModel = externalCreateResponse.model;
    await externalCreateResponse.attach();

    render(ffModel, externalModel);
    updateTabForId(id);
}

start().catch((error) => console.error(error));
