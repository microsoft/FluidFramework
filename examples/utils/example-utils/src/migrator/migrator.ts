/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IEventProvider } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";

import type {
	DataTransformationCallback,
	IMigratableModel,
	IMigrator,
	IMigratorEvents,
	MigrationState,
} from "../migrationInterfaces/index.js";
import type { IDetachedModel, IModelLoader } from "../modelLoader/index.js";

/**
 * @internal
 */
export class Migrator implements IMigrator {
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

	public get connected(): boolean {
		return this._currentModel.migrationTool.connected;
	}

	private readonly _events = new TypedEventEmitter<IMigratorEvents>();
	public get events(): IEventProvider<IMigratorEvents> {
		return this._events;
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
	 * Detached model that is ready to attach. This is stored for retry scenarios.
	 */
	private _preparedDetachedModel: IDetachedModel<IMigratableModel> | undefined;

	/**
	 * After attaching the prepared model, but before we have written its ID into the current model, we'll store the ID
	 * here to support retry scenarios.
	 */
	private _preparedModelId: string | undefined;

	public constructor(
		private readonly modelLoader: IModelLoader<IMigratableModel>,
		initialMigratable: IMigratableModel,
		initialId: string,
		private readonly dataTransformationCallback?: DataTransformationCallback,
	) {
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
			this._currentModel.migrationTool.events.once(
				"migrating",
				this.takeAppropriateActionForCurrentMigratable,
			);
		}
	};

	private readonly ensureMigrating = () => {
		// ensureMigrating() is called when we reach the "migrating" state. This should likely only happen once, but
		// can happen multiple times if we disconnect during the migration process.

		if (!this.connected) {
			// If we are not connected we should wait until we reconnect and try again. Note: we re-enter the state
			// machine, since it's possible another client has already completed the migration by the time we reconnect.
			this.currentModel.migrationTool.events.once(
				"connected",
				this.takeAppropriateActionForCurrentMigratable,
			);
			return;
		}

		if (this._migrationP !== undefined) {
			return;
		}

		if (this._migratedLoadP !== undefined) {
			throw new Error("Cannot perform migration, we are currently trying to load");
		}

		const migratable = this._currentModel;
		const acceptedMigration = migratable.migrationTool.acceptedMigration;
		if (acceptedMigration === undefined) {
			throw new Error("Expect an accepted migration before migration starts");
		}

		const doTheMigration = async () => {
			// doTheMigration() is called at the start of migration and should only resolve in two cases. First, is if
			// either the local or another client successfully completes the migration. Second, is if we disconnect
			// during the migration process. In both cases we should re-enter the state machine and take the
			// appropriate action (see then() block below).

			const prepareTheMigration = async () => {
				// It's possible that our modelLoader is older and doesn't understand the new acceptedMigration.
				// Currently this fails the migration gracefully and emits an event so the app developer can know
				// they're stuck. Ideally the app developer would find a way to acquire a new ModelLoader and move
				// forward, or at least advise the end user to refresh the page or something.
				// TODO: Does the app developer have everything they need to dispose gracefully when recovering with
				// a new ModelLoader?
				const migrationSupported = await this.modelLoader.supportsVersion(
					acceptedMigration.newVersion,
				);
				if (!migrationSupported) {
					this._events.emit("migrationNotSupported", acceptedMigration.newVersion);
					this._migrationP = undefined;
					return;
				}

				const detachedModel = await this.modelLoader.createDetached(
					acceptedMigration.newVersion,
				);
				const migratedModel = detachedModel.model;

				// Here we load the model at the specified sequence number for export.  This way we can ensure we don't include
				// any local un-ack'd changes or even remote changes that came in too-late.
				// TODO:  There is risk that a summary comes in after accepting the migration, which will prevent us from loading
				// the desired sequence number (as the summary will be too-new).  To avoid this, we'd probably need one of the following:
				// 1. Collaborators would disable summarization upon seeing acceptance
				// 2. Have the paused loading logic know how to load a different older snapshot version (though old versions may get deleted).
				// 3. Have a acceptance rollback or acceptance update path, to either retry or update the acceptance sequence number to be reachable
				// 4. Use a non-paused load, and accept that some late-arriving data might get included.
				const exportModel = await this.modelLoader.loadExistingPaused(
					this._currentModelId,
					acceptedMigration.migrationSequenceNumber,
				);
				const exportedData = await exportModel.exportData();
				exportModel.close();

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
						transformedData = await this.dataTransformationCallback(
							exportedData,
							migratedModel.version,
						);
					} catch {
						// TODO: This implies that the contract is to throw if the data can't be transformed, which
						// isn't great.  How should the dataTransformationCallback indicate failure?
						this._events.emit("migrationNotSupported", acceptedMigration.newVersion);
						this._migrationP = undefined;
						return;
					}
				} else {
					// We can't get the data into a format that we can import, give up.
					this._events.emit("migrationNotSupported", acceptedMigration.newVersion);
					this._migrationP = undefined;
					return;
				}
				await migratedModel.importData(transformedData);

				// Store the detached model for later use and retry scenarios
				this._preparedDetachedModel = detachedModel;
			};

			const completeTheMigration = async () => {
				assert(
					this._preparedDetachedModel !== undefined,
					"this._preparedDetachedModel should be defined",
				);

				// Volunteer to complete the migration.
				let isAssigned: boolean;
				try {
					isAssigned = await this.currentModel.migrationTool.volunteerForMigration();
				} catch (error) {
					// volunteerForMigration() will throw an error on disconnection. In this case, we should exit and
					// re-enter the state machine which will wait until we reconnect.
					// Note: while we wait to reconnect it is possible that another client will have already completed
					// the migration.
					assert(!this.connected, "We should be disconnected");
					return;
				}

				if (this.currentModel.migrationTool.newContainerId !== undefined) {
					// If newContainerId is already set, then another client already completed the migration.
					return;
				}

				assert(isAssigned, "We should be assigned the migration task");

				if (this._preparedModelId === undefined) {
					this._preparedModelId = await this._preparedDetachedModel.attach();
				}

				// Check to make sure we still have the task assignment.
				if (!this.currentModel.migrationTool.haveMigrationTask()) {
					// Exit early if we lost the task assignment, we are most likely disconnected.
					return;
				}

				await migratable.migrationTool.finalizeMigration(this._preparedModelId);

				this.currentModel.migrationTool.completeMigrationTask();
			};

			// Prepare the detached model if we haven't already.
			if (this._preparedDetachedModel === undefined) {
				await prepareTheMigration();
			}

			// Ensure another client has not already completed the migration.
			if (this.migrationState !== "migrating") {
				return;
			}

			await completeTheMigration();
		};

		this._events.emit("migrating");

		this._migrationP = doTheMigration()
			.then(() => {
				// We assume that if we resolved that either the migration was completed or we disconnected.
				// In either case, we should re-enter the state machine to take the appropriate action.
				if (this.connected) {
					// We assume if we are still connected after exiting the loop, then we should be in the "migrated"
					// state. The following assert validates this assumption.
					assert(
						this.currentModel.migrationTool.newContainerId !== undefined,
						"newContainerId should be defined",
					);
				}
				this._migrationP = undefined;
				this.takeAppropriateActionForCurrentMigratable();
			})
			.catch(console.error);
	};

	private readonly ensureLoading = () => {
		// We assume ensureLoading() is called a single time after we reach the "migrated" state.

		if (this._migratedLoadP !== undefined) {
			return;
		}

		if (this._migrationP !== undefined) {
			throw new Error("Cannot start loading the migrated before migration is complete");
		}

		const migratable = this._currentModel;
		const acceptedMigration = migratable.migrationTool.acceptedMigration;
		if (acceptedMigration === undefined) {
			throw new Error("Expect an accepted version before migration starts");
		}

		const migratedId = migratable.migrationTool.newContainerId;
		if (migratedId === undefined) {
			throw new Error("Migration ended without a new container being created");
		}

		const doTheLoad = async () => {
			// doTheLoad() should only be called once. It will resolve once we complete loading.

			const migrationSupported = await this.modelLoader.supportsVersion(
				acceptedMigration.newVersion,
			);
			if (!migrationSupported) {
				this._events.emit("migrationNotSupported", acceptedMigration.newVersion);
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
			this._events.emit("migrated", migrated, migratedId);
			this._migratedLoadP = undefined;

			// Reset retry values
			this._preparedDetachedModel = undefined;
			this._preparedModelId = undefined;

			// Only once we've completely finished with the old migratable, start on the new one.
			this.takeAppropriateActionForCurrentMigratable();
		};

		this._migratedLoadP = doTheLoad().catch(console.error);
	};
}
