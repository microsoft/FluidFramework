/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

import { AppView } from "./appView";
import { BootLoader } from "./bootLoader";
import { DebugView } from "./debugView";
import { externalDataSource } from "./externalData";
import { IApp, MigrationState } from "./interfaces";

const updateTabForId = (id: string) => {
    // Update the URL with the actual ID
    location.hash = id;

    // Put the ID in the tab title
    document.title = id;
};

const renderApp = (app: IApp) => {
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
    const bootLoader = new BootLoader();

    // In interacting with the service, we need to be explicit about whether we're creating a new container vs.
    // loading an existing one.  If loading, we also need to provide the unique ID for the container we are
    // loading from.

    // In this app, we'll choose to create a new container when navigating directly to http://localhost:8080.
    // A newly created container will generate its own ID, which we'll place in the URL hash.
    // If navigating to http://localhost:8080#containerId, we'll load from the ID in the hash.

    // These policy choices are arbitrary for demo purposes, and can be changed however you'd like.
    if (location.hash.length === 0) {
        const fetchedData = await externalDataSource.fetchData();
        // Consider adding an attach() to the IApp?  Or a bootLoader.attach(app)?
        const createResponse = await bootLoader.createNew("one", fetchedData);
        id = createResponse.id;
        app = createResponse.app;
    } else {
        id = location.hash.substring(1);
        // here won't know the exact type of the app yet though
        // Might not matter if the pattern is to say "if (old) then upgrade() else <now I know the type>"
        // Or could include a version on the app object
        app = await bootLoader.loadExisting(id);
    }

    // Note - here I proceed to rendering, but instead we could just propose the new version without rendering

    const watchForAppMigration = (_app: IApp) => {
        _app.on("migrationStateChanged", (migrationState: MigrationState) => {
            if (migrationState === MigrationState.ended) {
                bootLoader.getMigrated(_app).then(async ({ model: migratedApp, id: migratedId }) => {
                    // bootLoader.getView(migratedApp) ???
                    watchForAppMigration(migratedApp);
                    renderApp(migratedApp);
                    updateTabForId(migratedId);
                    _app.close();
                }).catch(console.error);
            } else if (migrationState === MigrationState.migrating) {
                bootLoader.ensureMigrated(_app).catch(console.error);
            }
        });
    };

    watchForAppMigration(app);

    // bootLoader.getView(initialApp) ???
    // viewLoader?
    renderApp(app);
    updateTabForId(id);
}

start().catch((error) => console.error(error));
