/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";

import { IMigratable, IMigrator, IMigratorEvents, IModelLoader, MigrationState } from "./interfaces";

export class Migrator extends TypedEventEmitter<IMigratorEvents> implements IMigrator {
    private _currentMigratable: IMigratable;

    // TODO: Maybe also have a prop for the id and the current MigrationState?

    public constructor(private readonly modelLoader: IModelLoader, initialMigratable: IMigratable) {
        super();
        this._currentMigratable = initialMigratable;
        this.watchForMigration();
    }

    private watchForMigration() {
        const migratable = this._currentMigratable;
        const onMigrating = () => {
            const acceptedVersion = migratable.acceptedVersion;
            if (acceptedVersion === undefined) {
                throw new Error("Expect an accepted version before migration starts");
            }
            if (!this.modelLoader.isVersionSupported(acceptedVersion)) {
                this.emit("migrationNotSupported", acceptedVersion);
                // Unregister handlers to clean up - mostly to prevent firing migrationNotSupported again.
                migratable.off("migrating", onMigrating);
                migratable.off("migrated", onMigrated);
                return;
            }
            this.emit("migrating");
            this.ensureMigrated(migratable).catch(console.error);
        };
        const onMigrated = () => {
            const acceptedVersion = migratable.acceptedVersion;
            if (acceptedVersion === undefined) {
                throw new Error("Expect an accepted version before migration starts");
            }
            if (!this.modelLoader.isVersionSupported(acceptedVersion)) {
                this.emit("migrationNotSupported", acceptedVersion);
                // Unregister handlers to clean up.
                migratable.off("migrating", onMigrating);
                migratable.off("migrated", onMigrated);
                return;
            }
            const migratedId = migratable.newContainerId;
            if (migratedId === undefined) {
                throw new Error("Migration ended without a new container being created");
            }
            this.modelLoader.loadExisting(migratedId).then((migrated: IMigratable) => {
                this._currentMigratable = migrated;
                this.watchForMigration();
                this.emit("migrated", migrated, migratedId);
                // Not sure I really want to do the closing here - should this be left to the caller to decide?
                migratable.close();
            }).catch(console.error);
        };
        migratable.on("migrating", onMigrating);
        migratable.on("migrated", onMigrated);
    }

    private async ensureMigrated(migratable: IMigratable) {
        const acceptedVersion = migratable.acceptedVersion;
        if (acceptedVersion === undefined) {
            throw new Error("Cannot ensure migrated before code details are accepted");
        }
        // TODO: clean up this double-check
        if (!this.modelLoader.isVersionSupported(acceptedVersion)) {
            this.emit("migrationNotSupported", acceptedVersion);
            return;
        }
        const extractedData = await migratable.exportStringData();

        // Possibly transform the extracted data here

        // It's possible that our modelLoader is older and doesn't understand the new acceptedVersion.  Currently
        // this call will throw, but instead ModelLoader should probably provide an isSupported(string) method and/or
        // the flow should fail gracefully/quietly and/or find a way to get the new ModelLoader.
        const createResponse = await this.modelLoader.createDetached(acceptedVersion);
        const migratedModel: IMigratable = createResponse.model;
        // TODO: Validate that the migratedModel is capable of importing the extractedData (format check)
        await migratedModel.importStringData(extractedData);

        // Before attaching, let's check to make sure no one else has already done the migration
        // To avoid creating unnecessary extra containers.
        if (migratable.getMigrationState() === MigrationState.migrated) {
            return;
        }

        // TODO: Maybe need retry here.
        // TODO: Use TaskManager here to reduce container noise.
        const containerId = await createResponse.attach();

        // Again, it could be the case that someone else finished the migration during our attach.
        if (migratable.getMigrationState() === MigrationState.migrated) {
            return;
        }

        // TODO: Maybe need retry here.
        migratable.finalizeMigration(containerId);
        // Here we let the newly created container/model fall out of scope intentionally.
        // If we don't win the race to set the container, it is the wrong container/model to use anyway
        // And the loader is probably caching the container anyway too.
    }
}
