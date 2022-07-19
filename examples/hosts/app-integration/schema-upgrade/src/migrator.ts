/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";

import { BootLoader } from "./bootLoader";
import { IApp, IMigratable, MigrationState } from "./interfaces";

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
export interface IMigratorEvents extends IEvent {
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IMigrator extends IEventProvider<IMigratorEvents> {
}

export class Migrator extends TypedEventEmitter<IMigratorEvents> implements IMigrator {
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
