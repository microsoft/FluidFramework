/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import React from "react";
import ReactDOM from "react-dom";

import { AppView } from "./appView";
import { BootLoader } from "./bootLoader";
import { DebugView } from "./debugView";
import { externalDataSource } from "./externalData";
import { IApp, IMigratable, MigrationState } from "./interfaces";

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

const ensureMigrated = async (bootLoader: BootLoader, app: IMigratable) => {
    const acceptedVersion = app.acceptedVersion;
    if (acceptedVersion === undefined) {
        throw new Error("Cannot ensure migrated before code details are accepted");
    }
    if (acceptedVersion !== "one" && acceptedVersion !== "two") {
        throw new Error("Unknown accepted version");
    }
    const extractedData = await app.exportStringData();
    // Possibly transform the extracted data here
    // It's possible that our bootLoader is older and doesn't understand the new acceptedVersion.  Probably
    // should gracefully fail quietly in this case, or find a way to get the new BootLoader.
    const { app: migratedApp, attach } = await bootLoader.createDetached(acceptedVersion);
    await migratedApp.importStringData(extractedData);
    // Maybe here apply the extracted data instead of passing it into createDetached

    // Before attaching, let's check to make sure no one else has already done the migration
    // To avoid creating unnecessary extra containers.
    if (app.getMigrationState() === MigrationState.ended) {
        return;
    }

    // TODO: Maybe need retry here.
    // TODO: Use TaskManager here to reduce container noise.
    const containerId = await attach();

    // Again, it could be the case that someone else finished the migration during our attach.
    if (app.getMigrationState() === MigrationState.ended) {
        return;
    }

    // TODO: Maybe need retry here.
    app.finalizeMigration(containerId);
    // Here we let the newly created container/app fall out of scope intentionally.
    // If we don't win the race to set the container, it is the wrong container/app to use anyway
    // And the loader is probably caching the container anyway too.
};

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IMigratorEvents extends IEvent {
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IMigrator extends IEventProvider<IMigratorEvents> {
}

class Migrator extends TypedEventEmitter<IMigratorEvents> implements IMigrator {
    private _currentApp: IApp;
    public get currentApp() {
        return this._currentApp;
    }

    public constructor(private readonly bootLoader: BootLoader, initialApp: IApp) {
        super();
        this._currentApp = initialApp;
        this.watchAppForMigration();
    }

    private watchAppForMigration() {
        const app = this._currentApp;
        app.on("migrationStateChanged", (migrationState: MigrationState) => {
            if (migrationState === MigrationState.ended) {
                const migratedId = app.newContainerId;
                if (migratedId === undefined) {
                    throw new Error("Migration ended without a new container being created");
                }
                this.bootLoader.loadExisting(migratedId).then((migratedApp: IApp) => {
                    this._currentApp = migratedApp;
                    this.watchAppForMigration();
                    this.emit("appMigrated", this._currentApp, migratedId);
                    app.close();
                }).catch(console.error);
            } else if (migrationState === MigrationState.migrating) {
                this.emit("appMigrating");
                ensureMigrated(this.bootLoader, app).catch(console.error);
            }
        });
    }
}

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
        const createResponse = await bootLoader.createDetached("one");
        app = createResponse.app;
        await app.importStringData(fetchedData);
        id = await createResponse.attach();
    } else {
        id = location.hash.substring(1);
        // here won't know the exact type of the app yet though
        // Might not matter if the pattern is to say "if (old) then upgrade() else <now I know the type>"
        // Or could include a version on the app object
        app = await bootLoader.loadExisting(id);
    }

    // Note - here I proceed to rendering, but instead we could just propose the new version without rendering

    const migrator = new Migrator(bootLoader, app);
    migrator.on("appMigrated", (newApp: IApp, newAppId: string) => {
        renderApp(newApp);
        updateTabForId(newAppId);
    });

    // bootLoader.getView(initialApp) ???
    // viewLoader?
    renderApp(app);
    updateTabForId(id);
}

start().catch((error) => console.error(error));
