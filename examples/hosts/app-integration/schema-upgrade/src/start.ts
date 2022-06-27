/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidCodeDetails,
    IFluidModuleWithDetails,
    IHostLoader,
} from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { createTinyliciousCreateNewRequest } from "@fluidframework/tinylicious-driver";

import React from "react";
import ReactDOM from "react-dom";

import { App, SessionState } from "./app";
import { AppView } from "./appView";
import { externalDataSource } from "./externalData";
import { TinyliciousService } from "./tinyliciousService";
import {
    InventoryListContainerRuntimeFactory as InventoryListContainerRuntimeFactory1,
} from "./version1";
import {
    InventoryListContainerRuntimeFactory as InventoryListContainerRuntimeFactory2,
} from "./version2";

function createLoader() {
    const tinyliciousService = new TinyliciousService();

    const load = async (source: IFluidCodeDetails): Promise<IFluidModuleWithDetails> => {
        const containerRuntimeFactory = source.package === "one"
            ? new InventoryListContainerRuntimeFactory2()
            : new InventoryListContainerRuntimeFactory1();

        return {
            module: { fluidExport: containerRuntimeFactory },
            details: { package: source.package },
        };
    };
    const codeLoader = { load };

    return new Loader({
        urlResolver: tinyliciousService.urlResolver,
        documentServiceFactory: tinyliciousService.documentServiceFactory,
        codeLoader,
    });
}

async function start(): Promise<void> {
    const loader = createLoader();
    let fetchedData: string | undefined;
    let app: App;

    // In interacting with the service, we need to be explicit about whether we're creating a new container vs.
    // loading an existing one.  If loading, we also need to provide the unique ID for the container we are
    // loading from.

    // In this app, we'll choose to create a new container when navigating directly to http://localhost:8080.
    // A newly created container will generate its own ID, which we'll place in the URL hash.
    // If navigating to http://localhost:8080#containerId, we'll load from the ID in the hash.

    // These policy choices are arbitrary for demo purposes, and can be changed however you'd like.
    if (location.hash.length === 0) {
        fetchedData = await externalDataSource.fetchData();
        app = await createNewFlow(loader, fetchedData);
    } else {
        app = await loadFlow(loader);
    }

    const migrateContainer = async () => {
        await app.saveAndEndSession();
        const exportedData = await app.exportStringData();
        await createNewFlow(loader, exportedData);
    };

    // Given an IInventoryList, we can render the list and provide controls for users to modify it.
    const div = document.getElementById("content") as HTMLDivElement;
    ReactDOM.render(
        React.createElement(AppView, {
            app,
            importedStringData: fetchedData,
            migrateContainer: () => { migrateContainer().catch(console.error); },
            externalDataSource,
        }),
        div,
    );
}

async function createNewFlow(loader: IHostLoader, initialData: string): Promise<App> {
    // TODO probably take an argument for which container code to use.
    const container = await loader.createDetachedContainer({ package: "two" });
    const app = new App(container);
    await app.initialize(initialData);

    app.on("sessionStateChanged", (sessionState: SessionState) => {
        if (sessionState === SessionState.ended) {
            container.close();
        }
    });

    await container.attach(createTinyliciousCreateNewRequest());

    // Discover the container ID after attaching
    const resolved = container.resolvedUrl;
    ensureFluidResolvedUrl(resolved);
    const containerId = resolved.id;

    // Update the URL with the actual container ID
    location.hash = containerId;

    // Put the container ID in the tab title
    document.title = containerId;

    return app;
}

async function loadFlow(loader: IHostLoader): Promise<App> {
    const containerId = location.hash.substring(1);
    const container = await loader.resolve({ url: containerId });
    const app = new App(container);
    await app.initialize();

    app.on("sessionStateChanged", (sessionState: SessionState) => {
        if (sessionState === SessionState.ended) {
            container.close();
        }
    });

    // Put the container ID in the tab title
    document.title = containerId;

    return app;
}

start().catch((error) => console.error(error));
