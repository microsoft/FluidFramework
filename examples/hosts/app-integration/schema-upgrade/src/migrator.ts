/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";

import { IMigratable, IMigrator, IMigratorEvents, IModelLoader, MigrationState } from "./interfaces";

export class Migrator extends TypedEventEmitter<IMigratorEvents> implements IMigrator {
    private _currentMigratable: IMigratable;
    /**
     * If migration is in progress, the promise that will resolve when it completes.  Mutually exclusive with
     * _migratedLoadP promise.
     */
    private _migrationP: Promise<void> | undefined;
    /**
     * If loading the migrated container is in progress, the promise that will resolve when it completes.  Mutually
     * exclusive with _migrationP promise.
     */
    private _migratedLoadP: Promise<void> | undefined;

    // TODO: Maybe also have a prop for the id and the current MigrationState?

    public constructor(private readonly modelLoader: IModelLoader, initialMigratable: IMigratable) {
        super();
        this._currentMigratable = initialMigratable;
        this.takeAppropriateActionForCurrentMigratable();
    }

    /**
     * This method makes no assumptions about the state of the current migratable - this is particularly important
     * for the case that we just finished loading a migrated container, but that migrated container is also either
     * in the process of migrating or already migrated (and thus we need to load again).  It is not safe to assume
     * that a freshly-loaded migrated container is in collaborating state.
     */
    private readonly takeAppropriateActionForCurrentMigratable = () => {
        const migrationState = this._currentMigratable.getMigrationState();
        if (migrationState === MigrationState.migrating) {
            this.ensureMigrating().catch(console.error);
        } else if (migrationState === MigrationState.migrated) {
            this.ensureLoading().catch(console.error);
        } else {
            this._currentMigratable.once("migrating", this.takeAppropriateActionForCurrentMigratable);
        }
    };

    private readonly ensureMigrating = async () => {
        if (this._migrationP !== undefined) {
            return this._migrationP;
        }

        if (this._migratedLoadP !== undefined) {
            throw new Error("Cannot perform migration, we are currently trying to load");
        }

        const migratable = this._currentMigratable;
        const acceptedVersion = migratable.acceptedVersion;
        if (acceptedVersion === undefined) {
            throw new Error("Expect an accepted version before migration starts");
        }

        if (!this.modelLoader.isVersionSupported(acceptedVersion)) {
            this.emit("migrationNotSupported", acceptedVersion);
            return;
        }

        this.emit("migrating");

        const doTheMigration = async () => {
            const extractedData = await migratable.exportStringData();

            // Possibly transform the extracted data here

            // It's possible that our modelLoader is older and doesn't understand the new acceptedVersion.  Currently
            // this call will throw, but instead ModelLoader should probably provide an isSupported(string) method
            // and/or the flow should fail gracefully/quietly and/or find a way to get the new ModelLoader.
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
            await migratable.finalizeMigration(containerId);

            // Note that we do not assume the migratedModel is the correct new one, and let it fall out of scope
            // intentionally.  This is because if we don't win the race to set the container, it will be the wrong
            // container/model to use.  There could maybe be some efficiency gain by retaining the model in the
            // case that we win the race?  But it likely just doesn't matter that much because the Loader probably
            // cached the Container anyway.

            this._migrationP = undefined;

            this.takeAppropriateActionForCurrentMigratable();
        };

        this._migrationP = doTheMigration();

        return this._migrationP;
    };

    private readonly ensureLoading = async () => {
        if (this._migratedLoadP !== undefined) {
            return this._migratedLoadP;
        }

        if (this._migrationP !== undefined) {
            throw new Error("Cannot start loading the migrated before migration is complete");
        }

        const migratable = this._currentMigratable;
        const acceptedVersion = migratable.acceptedVersion;
        if (acceptedVersion === undefined) {
            throw new Error("Expect an accepted version before migration starts");
        }

        if (!this.modelLoader.isVersionSupported(acceptedVersion)) {
            this.emit("migrationNotSupported", acceptedVersion);
            return;
        }

        const migratedId = migratable.newContainerId;
        if (migratedId === undefined) {
            throw new Error("Migration ended without a new container being created");
        }

        const doTheLoad = async () => {
            const migrated = await this.modelLoader.loadExisting(migratedId);
            this._currentMigratable = migrated;
            this.emit("migrated", migrated, migratedId);
            // Not sure I really want to do the closing here - should this be left to the caller to decide?
            migratable.close();
            this._migratedLoadP = undefined;

            // Only once we've completely finished with the old migratable, start on the new one.
            this.takeAppropriateActionForCurrentMigratable();
        };

        this._migratedLoadP = doTheLoad();

        return this._migratedLoadP;
    };
}
