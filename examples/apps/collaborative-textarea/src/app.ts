/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TinyliciousModelLoader } from "@fluid-example/example-utils";
import React from "react";
import ReactDOM from "react-dom";

import { AppCodeLoader } from "./codeLoader";
import { ICollaborativeTextAppModel } from "./container";
import { CollaborativeTextView } from "./view";

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
async function start() {
    const tinyliciousModelLoader = new TinyliciousModelLoader<ICollaborativeTextAppModel>(new AppCodeLoader());

    let id: string;
    let model: ICollaborativeTextAppModel;

    if (location.hash.length === 0) {
        const createResponse = await tinyliciousModelLoader.createDetached("1.0");
        model = createResponse.model;
        id = await createResponse.attach();
    } else {
        id = location.hash.substring(1);
        model = await tinyliciousModelLoader.loadExisting(id);
    }

    // update the browser URL and the window title with the actual container ID
    location.hash = id;
    document.title = id;

    // Render it
    const contentDiv = document.getElementById("content");
    if (contentDiv !== null) {
        ReactDOM.render(
            React.createElement(CollaborativeTextView, { text: model.collaborativeText.text }),
            contentDiv,
        );
    }
}

start().catch((e) => {
    console.error(e);
    console.log("%cEnsure you are running the Tinylicious Fluid Server\nUse:`npm run start:server`", "font-size:30px");
});
