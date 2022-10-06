/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, TypedEventEmitter } from "@fluidframework/common-utils";
import type {
    DataTransformationCallback,
    IMigratableModel,
    IMigrator,
    IMigratorEvents,
    MigrationState,
} from "../migrationInterfaces";
import type { IDetachedModel, IModelLoader } from "../modelLoader";

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
        return this._currentModel.migrationTool.migrationState;
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

    /**
     * Detached model object that we are trying to migrate to. We store for retry scenarios.
     */
    private _detachedModel: IDetachedModel<IMigratableModel> | undefined;

    /**
     * containerId of the new container we are trying to migrate to. We store for retry scenarios.
     */
    private _containerId: string | undefined;

    public constructor(
        private readonly modelLoader: IModelLoader<IMigratableModel>,
        initialMigratable: IMigratableModel,
        initialId: string,
        private readonly dataTransformationCallback?: DataTransformationCallback,
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
        const migrationState = this._currentModel.migrationTool.migrationState;
        if (migrationState === "migrating") {
            this.ensureMigrating();
        } else if (migrationState === "migrated") {
            this.ensureLoading();
        } else {
            this._currentModel.migrationTool.once("migrating", this.takeAppropriateActionForCurrentMigratable);
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
        const acceptedVersion = migratable.migrationTool.acceptedVersion;
        if (acceptedVersion === undefined) {
            throw new Error("Expect an accepted version before migration starts");
        }

        const doTheMigration = async () => {
            const prepareTheMigration = async () => {
                // It's possible that our modelLoader is older and doesn't understand the new acceptedVersion.
                // Currently this fails the migration gracefully and emits an event so the app developer can know
                // they're stuck. Ideally the app developer would find a way to acquire a new ModelLoader and move
                // forward, or at least advise the end user to refresh the page or something.
                // TODO: Does the app developer have everything they need to dispose gracefully when recovering with
                // a new ModelLoader?
                const migrationSupported = await this.modelLoader.supportsVersion(acceptedVersion);
                if (!migrationSupported) {
                    this.emit("migrationNotSupported", acceptedVersion);
                    this._migrationP = undefined;
                    return;
                }

                const detachedModel = await this.modelLoader.createDetached(acceptedVersion);
                const migratedModel = detachedModel.model;

                const exportedData = await migratable.exportData();

                // TODO: Is there a reasonable way to validate at proposal time whether we'll be able to get the
                // exported data into a format that the new model can import?  If we can determine it early, then
                // clients with old ModelLoaders can use that opportunity to dispose early and try to get new
                // ModelLoaders.
                let transformedData: unknown;
                if (migratedModel.supportsDataFormat(exportedData)) {
                    // If the migrated model already supports the data format, go ahead with the migration.
                    transformedData = exportedData;
                } else if (this.dataTransformationCallback !== undefined) {
                    // Otherwise, try using the dataTransformationCallback if provided to get the exported data into
                    // a format that we can import.
                    try {
                        transformedData = await this.dataTransformationCallback(exportedData, migratedModel.version);
                    } catch {
                        // TODO: This implies that the contract is to throw if the data can't be transformed, which
                        // isn't great.  How should the dataTransformationCallback indicate failure?
                        this.emit("migrationNotSupported", acceptedVersion);
                        this._migrationP = undefined;
                        return;
                    }
                } else {
                    // We can't get the data into a format that we can import, give up.
                    this.emit("migrationNotSupported", acceptedVersion);
                    this._migrationP = undefined;
                    return;
                }
                await migratedModel.importData(transformedData);

                // Store the detached model for later use and retry scenarios
                this._detachedModel = detachedModel;
            };

            const completeTheMigration = async () => {
                assert(this._detachedModel !== undefined, "this._detachedModel should be defined");

                if (this._containerId === undefined) {
                    this._containerId = await this._detachedModel.attach();
                }

                if (!this.currentModel.migrationTool.haveMigrationTask()) {
                    // Exit early if we lost the task assignment, we are most likely disconnected.
                    onDisconnect();
                    return;
                }

                await migratable.migrationTool.finalizeMigration(this._containerId);

                this.currentModel.migrationTool.completeMigrationTask();

                this._migrationP = undefined;
                this.takeAppropriateActionForCurrentMigratable();
            };

            const onDisconnect = () => {
                // If we disconnect from the container then either the container was closed by another client or our
                // web socket lost connection. In either case we should stop trying to migrate and wait until we
                // reconnect or the migration is finalized by another client.

                const onReconnect = () => {
                    // Re-enter the migration process on reconnect
                    this.currentModel.migrationTool.off("migrated", onMigrationFinalized);
                    this._migrationP = undefined;
                    this.ensureMigrating();
                };

                const onMigrationFinalized = () => {
                    // We can stop trying to migrate and re-enter the state machine tp handle the migrated state.
                    this.currentModel.migrationTool.off("connected", onReconnect);
                    this._migrationP = undefined;
                    this.takeAppropriateActionForCurrentMigratable();
                };

                this.currentModel.migrationTool.once("connected", onReconnect);
                this.currentModel.migrationTool.once("migrated", onMigrationFinalized);
            };

            // Prepare the detached model if not already done
            if (this._detachedModel === undefined) {
                await prepareTheMigration();
            }

            // Ensure another client has not already completed the migration.
            if (this.migrationState !== "migrating") {
                this._migrationP = undefined;
                this.takeAppropriateActionForCurrentMigratable();
                return;
            }

            // Volunteer to complete the migration.
            let isAssigned: boolean;
            try {
                isAssigned = await this.currentModel.migrationTool.volunteerForMigration();
            } catch (error) {
                // If we error here either the container was closed by another client (during the migration process),
                // or our web socket lost connection. If the this.migrationState is still migrating then we should wait
                // for the container to reconnect or the migration to be finalized by another client. Otherwise we can
                // exit the migration process and re-enter the state machine.
                if (this.migrationState === "migrating") {
                    onDisconnect();
                } else {
                    this._migrationP = undefined;
                    this.takeAppropriateActionForCurrentMigratable();
                }
                return;
            }

            // If we are assigned we can go ahead and complete the migration. If false, then it was completed by
            // another client and we can re-enter the state machine to handle the migrated state.
            if (isAssigned) {
                await completeTheMigration();
            } else {
                this._migrationP = undefined;
                this.takeAppropriateActionForCurrentMigratable();
            }
        };

        this._migrationP = doTheMigration().catch((error) => {
            console.error(error);

            // Retry if we get an unexpected error.
            this._migrationP = undefined;
            this.ensureMigrating();
        });

        this.emit("migrating");
    };

    private readonly ensureLoading = () => {
        if (this._migratedLoadP !== undefined) {
            return;
        }

        if (this._migrationP !== undefined) {
            throw new Error("Cannot start loading the migrated before migration is complete");
        }

        const migratable = this._currentModel;
        const acceptedVersion = migratable.migrationTool.acceptedVersion;
        if (acceptedVersion === undefined) {
            throw new Error("Expect an accepted version before migration starts");
        }

        const migratedId = migratable.migrationTool.newContainerId;
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

            // Clear retry values
            this._detachedModel = undefined;
            this._containerId = undefined;

            // Only once we've completely finished with the old migratable, start on the new one.
            this.takeAppropriateActionForCurrentMigratable();
        };

        this._migratedLoadP = doTheLoad().catch(console.error);
    };
}
