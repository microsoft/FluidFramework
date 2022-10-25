/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

import { StaticCodeLoader, TinyliciousModelLoader } from "@fluid-example/example-utils";

import type { IAppModel } from "./modelInterfaces";
import { DebugView, TaskListAppView } from "./view";
import { TaskListContainerRuntimeFactory } from "./model";

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
    const tinyliciousModelLoader = new TinyliciousModelLoader<IAppModel>(
        new StaticCodeLoader(new TaskListContainerRuntimeFactory()),
    );

    let id: string;
    let model: IAppModel;

    if (location.hash.length === 0) {
        // Choosing to create with the "old" version for demo purposes, so we can demo the upgrade flow.
        // Normally we would create with the most-recent version.
        const createResponse = await tinyliciousModelLoader.createDetached("one");
        model = createResponse.model;

        id = await createResponse.attach();
    } else {
        id = location.hash.substring(1);
        model = await tinyliciousModelLoader.loadExisting(id);
    }

    render(model);
    updateTabForId(id);
}

start().catch((error) => console.error(error));
