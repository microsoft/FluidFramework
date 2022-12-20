/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionStorageModelLoader, StaticCodeLoader } from "@fluid-example/example-utils";

import React from "react";
import ReactDOM from "react-dom";

import { TaskListContainerRuntimeFactory } from "../src/model";
import type { IAppModel } from "../src/model-interface";
import { TaskListView } from "../src/view";

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
export async function createContainerAndRenderInElement(element: HTMLDivElement) {
    const sessionStorageModelLoader = new SessionStorageModelLoader<IAppModel>(
        new StaticCodeLoader(new TaskListContainerRuntimeFactory()),
    );

    let id: string;
    let model: IAppModel;

    if (location.hash.length === 0) {
        // Normally our code loader is expected to match up with the version passed here.
        // But since we're using a StaticCodeLoader that always loads the same runtime factory regardless,
        // the version doesn't actually matter.
        const createResponse = await sessionStorageModelLoader.createDetached("1.0");
        model = createResponse.model;

        // Add a test task so we can see something.
        model.taskList.addTask("1", "testName", 3);

        id = await createResponse.attach();
    } else {
        id = location.hash.substring(1);
        model = await sessionStorageModelLoader.loadExisting(id);
    }

    // update the browser URL and the window title with the actual container ID
    location.hash = id;
    document.title = id;

    // Render it
    ReactDOM.render(<TaskListView taskList={ model.taskList } />, element);

    // Setting "fluidStarted" is just for our test automation
    // eslint-disable-next-line @typescript-eslint/dot-notation
    window["fluidStarted"] = true;
}

/**
 * For local testing we have two div's that we are rendering into independently.
 */
async function setup() {
    const leftElement = document.getElementById("sbs-left") as HTMLDivElement;
    if (leftElement === null) {
        throw new Error("sbs-left does not exist");
    }
    await createContainerAndRenderInElement(leftElement);
    const rightElement = document.getElementById("sbs-right") as HTMLDivElement;
    if (rightElement === null) {
        throw new Error("sbs-right does not exist");
    }
    await createContainerAndRenderInElement(rightElement);
}

setup().catch((e) => {
    console.error(e);
    console.log(
        "%cThere were issues setting up and starting the in memory Fluid Server",
        "font-size:30px",
    );
});
