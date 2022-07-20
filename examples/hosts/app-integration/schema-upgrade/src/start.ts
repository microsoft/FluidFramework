/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

import { AppView } from "./appView";
import { ModelLoader } from "./modelLoader";
import { DebugView } from "./debugView";
import { externalDataSource } from "./externalData";
import { IApp } from "./interfaces";
import { Migrator } from "./migrator";

const updateTabForId = (id: string) => {
    // Update the URL with the actual ID
    location.hash = id;

    // Put the ID in the tab title
    document.title = id;
};

const renderApp = (app: IApp) => {
    // Here, could switch on the app.version to determine different views to load (AppView1 vs. AppView2).
    // For this demo, the view can currently render either app type.

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
    let id: string;
    let app: IApp;
    const modelLoader = new ModelLoader();

    // In interacting with the service, we need to be explicit about whether we're creating a new container vs.
    // loading an existing one.  If loading, we also need to provide the unique ID for the container we are
    // loading from.

    // In this app, we'll choose to create a new container when navigating directly to http://localhost:8080.
    // A newly created container will generate its own ID, which we'll place in the URL hash.
    // If navigating to http://localhost:8080#containerId, we'll load from the ID in the hash.

    // These policy choices are arbitrary for demo purposes, and can be changed however you'd like.
    if (location.hash.length === 0) {
        const fetchedData = await externalDataSource.fetchData();
        // Choosing for demo purposes to create with the old version, so we can demo the upgrade.
        // Normally would create with the most-recent version.
        const createResponse = await modelLoader.createDetached("one");
        app = createResponse.app;
        await app.importStringData(fetchedData);
        id = await createResponse.attach();
    } else {
        id = location.hash.substring(1);
        app = await modelLoader.loadExisting(id);
    }

    // Note - here I proceed to rendering without waiting to see if an upgrade is needed, but instead we could
    // check first and defer rendering until the upgrade is complete.

    // Could be reasonable to merge Migrator into the ModelLoader, for a MigratingModelLoader.
    const migrator = new Migrator(modelLoader, app);
    migrator.on("migrated", (newApp: IApp, newAppId: string) => {
        renderApp(newApp);
        updateTabForId(newAppId);
    });

    // It's not a given that a single view can render every version (esp. if functionality is added/removed).
    // Here we could check the app.version and select the appropriate view if that's the case.
    renderApp(app);
    updateTabForId(id);
}

start().catch((error) => console.error(error));
