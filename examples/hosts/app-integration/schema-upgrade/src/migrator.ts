/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";

import { IMigratableModel, IMigrator, IMigratorEvents, MigrationState } from "./migrationInterfaces";
import { IModelLoader } from "./modelLoading";

export class Migrator extends TypedEventEmitter<IMigratorEvents> implements IMigrator {
    private _currentModel: IMigratableModel;
    public get currentModel(): IMigratableModel {
        return this._currentModel;
    }

    private _currentModelId: string;
    public get currentModelId(): string {
        return this._currentModelId;
    }

    public get migrationState(): MigrationState {
        return this._currentModel.getMigrationState();
    }

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

    public constructor(
        private readonly modelLoader: IModelLoader<IMigratableModel>,
        initialMigratable: IMigratableModel,
        initialId: string,
    ) {
        super();
        this._currentModel = initialMigratable;
        this._currentModelId = initialId;
        this.takeAppropriateActionForCurrentMigratable();
    }

    /**
     * This method makes no assumptions about the state of the current migratable - this is particularly important
     * for the case that we just finished loading a migrated container, but that migrated container is also either
     * in the process of migrating or already migrated (and thus we need to load again).  It is not safe to assume
     * that a freshly-loaded migrated container is in collaborating state.
     */
    private readonly takeAppropriateActionForCurrentMigratable = () => {
        const migrationState = this._currentModel.getMigrationState();
        if (migrationState === MigrationState.migrating) {
            this.ensureMigrating();
        } else if (migrationState === MigrationState.migrated) {
            this.ensureLoading();
        } else {
            this._currentModel.once("migrating", this.takeAppropriateActionForCurrentMigratable);
        }
    };

    private readonly ensureMigrating = () => {
        if (this._migrationP !== undefined) {
            return;
        }

        if (this._migratedLoadP !== undefined) {
            throw new Error("Cannot perform migration, we are currently trying to load");
        }

        const migratable = this._currentModel;
        const acceptedVersion = migratable.acceptedVersion;
        if (acceptedVersion === undefined) {
            throw new Error("Expect an accepted version before migration starts");
        }

        const doTheMigration = async () => {
            // It's possible that our modelLoader is older and doesn't understand the new acceptedVersion.  Currently
            // this fails the migration gracefully and emits an event so the app developer can know they're stuck.
            // Ideally the app developer would find a way to acquire a new ModelLoader and move forward, or at least
            // advise the end user to refresh the page or something.
            // TODO: Does the app developer have everything they need to dispose gracefully when recovering with a new
            // ModelLoader?
            const migrationSupported = await this.modelLoader.supportsVersion(acceptedVersion);
            if (!migrationSupported) {
                this.emit("migrationNotSupported", acceptedVersion);
                this._migrationP = undefined;
                return;
            }

            const extractedData = await migratable.exportData();

            // If we needed to transform the extracted data, we would do it here.  In this demo, the export/import
            // format is unchanged between the two versions, so there's no transformation needed.
            // TODO: think about how we might enable a transform while allowing Migrator to remain generic?
            // E.g. have some callback with from/to version that does the transform?

            const createResponse = await this.modelLoader.createDetached(acceptedVersion);
            const migratedModel: IMigratableModel = createResponse.model;
            if (!migratedModel.supportsDataFormat(extractedData)) {
                throw new Error("New model doesn't support extracted data format");
            }
            // TODO: Probably should also validate at proposal time that the model we're proposing will be
            // able to import the exported format of the current container (taking into consideration our format
            // transform options).  Not all clients might agree about support if some have old ModelLoaders -- these
            // clients could use this opportunity to dispose early and try to get new ModelLoaders.
            await migratedModel.importData(extractedData);

            // Before attaching, let's check to make sure no one else has already done the migration
            // To avoid creating unnecessary extra containers.
            if (migratable.getMigrationState() === MigrationState.migrated) {
                this._migrationP = undefined;
                migratedModel.close();
                this.takeAppropriateActionForCurrentMigratable();
                return;
            }

            // TODO: Support retry
            // TODO: Use TaskManager here to reduce container noise.  Specifically -- all clients should race up to
            // this point (so they're all prepared to do the migration) but should wait for the task lock before
            // attempting the attach() to minimize the chance that multiple containers are created on the service.
            const containerId = await createResponse.attach();

            // Again, it could be the case that someone else finished the migration during our attach.
            if (migratable.getMigrationState() === MigrationState.migrated) {
                this._migrationP = undefined;
                migratedModel.close();
                this.takeAppropriateActionForCurrentMigratable();
                return;
            }

            // TODO: Support retry
            await migratable.finalizeMigration(containerId);

            // If someone else finalized the migration before us, we should close the one we created.
            if (migratable.newContainerId !== containerId) {
                migratedModel.close();
            }

            // Note that we do not assume the migratedModel is the correct new one, and let it fall out of scope
            // intentionally.  This is because if we don't win the race to set the container, it will be the wrong
            // container/model to use.  There could maybe be some efficiency gain by retaining the model in the
            // case that we win the race?  But it likely just doesn't matter that much because the Loader probably
            // cached the Container anyway.

            this._migrationP = undefined;

            this.takeAppropriateActionForCurrentMigratable();
        };

        this.emit("migrating");
        this._migrationP = doTheMigration().catch(console.error);
    };

    private readonly ensureLoading = () => {
        if (this._migratedLoadP !== undefined) {
            return;
        }

        if (this._migrationP !== undefined) {
            throw new Error("Cannot start loading the migrated before migration is complete");
        }

        const migratable = this._currentModel;
        const acceptedVersion = migratable.acceptedVersion;
        if (acceptedVersion === undefined) {
            throw new Error("Expect an accepted version before migration starts");
        }

        const migratedId = migratable.newContainerId;
        if (migratedId === undefined) {
            throw new Error("Migration ended without a new container being created");
        }

        const doTheLoad = async () => {
            const migrationSupported = await this.modelLoader.supportsVersion(acceptedVersion);
            if (!migrationSupported) {
                this.emit("migrationNotSupported", acceptedVersion);
                this._migratedLoadP = undefined;
                return;
            }
            const migrated = await this.modelLoader.loadExisting(migratedId);
            // Note: I'm choosing not to close the old migratable here, and instead allow the lifecycle management
            // of the migratable to be the responsibility of whoever created the Migrator (and handed it its first
            // migratable).  It could also be fine to close here, just need to have an explicit contract to clarify
            // who is responsible for managing that.
            this._currentModel = migrated;
            this._currentModelId = migratedId;
            this.emit("migrated", migrated, migratedId);
            this._migratedLoadP = undefined;

            // Only once we've completely finished with the old migratable, start on the new one.
            this.takeAppropriateActionForCurrentMigratable();
        };

        this._migratedLoadP = doTheLoad().catch(console.error);
    };
}
