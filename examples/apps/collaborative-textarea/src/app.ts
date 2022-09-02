/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidModuleWithDetails,
} from "@fluidframework/container-definitions";
import type { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import {
    createTinyliciousCreateNewRequest,
    InsecureTinyliciousTokenProvider,
    InsecureTinyliciousUrlResolver,
} from "@fluidframework/tinylicious-driver";
import React from "react";
import ReactDOM from "react-dom";

import { CollaborativeTextContainerRuntimeFactory, ICollaborativeTextAppModel } from "./container";
import { CollaborativeTextView } from "./view";
import { ModelLoader } from "./modelLoader";

class TinyliciousService {
    public readonly documentServiceFactory: IDocumentServiceFactory;
    public readonly urlResolver: IUrlResolver;

    constructor(tinyliciousPort?: number) {
        const tokenProvider = new InsecureTinyliciousTokenProvider();
        this.urlResolver = new InsecureTinyliciousUrlResolver(tinyliciousPort);
        this.documentServiceFactory = new RouterliciousDocumentServiceFactory(tokenProvider);
    }
}

const load = async (): Promise<IFluidModuleWithDetails> => {
    return {
        module: { fluidExport: new CollaborativeTextContainerRuntimeFactory() },
        details: { package: "no-dynamic-package", config: {} },
    };
};

const demoCodeLoader = { load };

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
async function start() {
    const tinyliciousService = new TinyliciousService();
    const modelLoader = new ModelLoader<ICollaborativeTextAppModel>({
        urlResolver: tinyliciousService.urlResolver,
        documentServiceFactory: tinyliciousService.documentServiceFactory,
        codeLoader: demoCodeLoader,
        generateCreateNewRequest: createTinyliciousCreateNewRequest,
    });

    let id: string;
    let model: ICollaborativeTextAppModel;

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

    // Setting "fluidStarted" is just for our test automation
    // eslint-disable-next-line @typescript-eslint/dot-notation
    window["fluidStarted"] = true;
}

start().catch((e) => {
    console.error(e);
    console.log("%cEnsure you are running the Tinylicious Fluid Server\nUse:`npm run start:server`", "font-size:30px");
});
