/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IContainer,
    IFluidCodeDetails,
    IFluidModuleWithDetails,
} from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { createTinyliciousCreateNewRequest } from "@fluidframework/tinylicious-driver";

import React from "react";
import ReactDOM from "react-dom";

import { App } from "./app";
import { AppView, DebugView } from "./appView";
import { externalDataSource } from "./externalData";
import { SessionState } from "./interfaces";
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
            ? new InventoryListContainerRuntimeFactory1()
            : new InventoryListContainerRuntimeFactory2();

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

const getContainerId = (container: IContainer) => {
    const resolved = container.resolvedUrl;
    ensureFluidResolvedUrl(resolved);
    return resolved.id;
};

const updateTabForContainer = (container: IContainer) => {
    const containerId = getContainerId(container);

    // Update the URL with the actual container ID
    location.hash = containerId;

    // Put the container ID in the tab title
    document.title = containerId;
};

const renderApp = (app: App) => {
    // The AppView is what a normal user would see in a normal scenario...
    const appDiv = document.getElementById("app") as HTMLDivElement;
    ReactDOM.unmountComponentAtNode(appDiv);
    ReactDOM.render(
        React.createElement(AppView, { app }),
        appDiv,
    );

    // Whereas the DebugView is just for the purposes of this demo.  Separated out here to clarify the division.
    const debugDiv = document.getElementById("debug") as HTMLDivElement;
    ReactDOM.unmountComponentAtNode(debugDiv);
    ReactDOM.render(
        React.createElement(DebugView, {
            app,
            externalDataSource,
        }),
        debugDiv,
    );
};

async function start(): Promise<void> {
    const loader = createLoader();
    let createNew: boolean = false;
    let fetchedData: string | undefined;
    let initialContainer: IContainer;

    // In interacting with the service, we need to be explicit about whether we're creating a new container vs.
    // loading an existing one.  If loading, we also need to provide the unique ID for the container we are
    // loading from.

    // In this app, we'll choose to create a new container when navigating directly to http://localhost:8080.
    // A newly created container will generate its own ID, which we'll place in the URL hash.
    // If navigating to http://localhost:8080#containerId, we'll load from the ID in the hash.

    // These policy choices are arbitrary for demo purposes, and can be changed however you'd like.
    if (location.hash.length === 0) {
        createNew = true;
        fetchedData = await externalDataSource.fetchData();
        // initialApp = bootLoader.createNew(fetchedData) ???
        // Might not need attach() if createNew takes fetchedData.
        initialContainer = await loader.createDetachedContainer({ package: "one" });
    } else {
        const containerId = location.hash.substring(1);
        // initialApp = bootLoader.loadExisting(containerId) ???
        // here won't know the exact type of the app yet though
        // Might not matter if the pattern is to say "if (old) then upgrade() else <now I know the type>"
        // Or could include a version on the app object
        initialContainer = await loader.resolve({ url: containerId });
    }

    const getMigratedContainer = async (oldApp: App) => {
        if (oldApp.getSessionState() !== SessionState.ended) {
            throw new Error("Tried to get migrated container but migration hasn't happened yet");
        }
        const newContainerId = oldApp.newContainerId;
        if (newContainerId === undefined) {
            throw new Error("Session ended without a new container being created");
        }
        return loader.resolve({ url: newContainerId });
    };

    async function ensureMigrated(_app: App) {
        const acceptedCodeDetails = _app.acceptedCodeDetails;
        if (acceptedCodeDetails === undefined) {
            throw new Error("Cannot ensure migrated before code details are accepted");
        }
        const extractedData = await _app.exportStringData();
        const newContainer = await loader.createDetachedContainer(acceptedCodeDetails);
        const newApp = new App(newContainer);
        await newApp.initialize(extractedData);

        // Before attaching, let's check to make sure no one else has already done the migration
        // To avoid creating unnecessary extra containers.
        if (_app.getSessionState() === SessionState.ended) {
            return;
        }

        // TODO: Maybe need retry here.
        // TODO: Use TaskManager here to reduce container noise.
        await newContainer.attach(createTinyliciousCreateNewRequest());
        // Discover the container ID after attaching
        const containerId = getContainerId(newContainer);

        // Again, it could be the case that someone else ended the session during our attach.
        if (_app.getSessionState() === SessionState.ended) {
            return;
        }

        // TODO: Maybe need retry here.
        _app.finalizeMigration(containerId);
        // Here we let the newly created container/app fall out of scope intentionally.
        // If we don't win the race to set the container, it is the wrong container/app to use anyway
        // And the loader is probably caching the container anyway too.
    }

    const setUpAppForContainer = async (_container: IContainer, initialData?: string) => {
        const _app = new App(_container);
        await _app.initialize(initialData);

        _app.on("sessionStateChanged", (sessionState: SessionState) => {
            if (sessionState === SessionState.ended) {
                getMigratedContainer(_app).then(async (migratedContainer: IContainer) => {
                    const migratedApp = await setUpAppForContainer(migratedContainer);
                    // bootLoader.getView(migratedApp) ???
                    renderApp(migratedApp);
                    updateTabForContainer(migratedContainer);
                    _container.close();
                }).catch(console.error);
            } else if (sessionState === SessionState.migrating) {
                ensureMigrated(_app).catch(console.error);
            }
        });

        return _app;
    };

    const initialApp = await setUpAppForContainer(initialContainer, fetchedData);

    if (createNew) {
        await initialContainer.attach(createTinyliciousCreateNewRequest());
    }

    // bootLoader.getView(initialApp) ???
    // viewLoader?
    renderApp(initialApp);
    updateTabForContainer(initialContainer);
}

start().catch((error) => console.error(error));
