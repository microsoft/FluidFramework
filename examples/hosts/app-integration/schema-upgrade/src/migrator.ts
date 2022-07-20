/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";

import { IApp, IMigratable, IMigrator, IMigratorEvents, IModelLoader, MigrationState } from "./interfaces";

const ensureMigrated = async (modelLoader: IModelLoader, migratable: IMigratable) => {
    const acceptedVersion = migratable.acceptedVersion;
    if (acceptedVersion === undefined) {
        throw new Error("Cannot ensure migrated before code details are accepted");
    }
    const extractedData = await migratable.exportStringData();

    // Possibly transform the extracted data here

    // It's possible that our modelLoader is older and doesn't understand the new acceptedVersion.  Currently
    // this call will throw, but instead ModelLoader should probably provide an isSupported(string) method and/or
    // the flow should fail gracefully/quietly and/or find a way to get the new ModelLoader.
    const { app: migratedApp, attach } = await modelLoader.createDetached(acceptedVersion);
    await migratedApp.importStringData(extractedData);
    // Maybe here apply the extracted data instead of passing it into createDetached

    // Before attaching, let's check to make sure no one else has already done the migration
    // To avoid creating unnecessary extra containers.
    if (migratable.getMigrationState() === MigrationState.ended) {
        return;
    }

    // TODO: Maybe need retry here.
    // TODO: Use TaskManager here to reduce container noise.
    const containerId = await attach();

    // Again, it could be the case that someone else finished the migration during our attach.
    if (migratable.getMigrationState() === MigrationState.ended) {
        return;
    }

    // TODO: Maybe need retry here.
    migratable.finalizeMigration(containerId);
    // Here we let the newly created container/app fall out of scope intentionally.
    // If we don't win the race to set the container, it is the wrong container/app to use anyway
    // And the loader is probably caching the container anyway too.
};

export class Migrator extends TypedEventEmitter<IMigratorEvents> implements IMigrator {
    private _currentApp: IApp;
    public get currentApp() {
        return this._currentApp;
    }

    // Maybe also have a prop for the id and the current MigrationState?

    public constructor(private readonly modelLoader: IModelLoader, initialApp: IApp) {
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
                this.modelLoader.loadExisting(migratedId).then((migratedApp: IApp) => {
                    this._currentApp = migratedApp;
                    this.watchAppForMigration();
                    this.emit("appMigrated", this._currentApp, migratedId);
                    app.close();
                }).catch(console.error);
            } else if (migrationState === MigrationState.migrating) {
                this.emit("appMigrating");
                ensureMigrated(this.modelLoader, app).catch(console.error);
            }
        });
    }
}
