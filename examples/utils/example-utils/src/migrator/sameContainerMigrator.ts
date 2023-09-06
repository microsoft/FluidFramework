/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils";
import type {
	DataTransformationCallback,
	ISameContainerMigratableModel,
	ISameContainerMigrator,
	ISameContainerMigratorEvents,
	SameContainerMigrationState,
} from "../migrationInterfaces";
import type { IModelLoader, IDetachedModel } from "../modelLoader";

// TODO: Note that this class is far from the expected state - it effectively does nothing since takeAppropriateActionForCurrentMigratable is commented out.
// Eventually it will be in charge of extracting the v1 data and calling migrationTool.finalizeMigration() with the transformed summary, but for now it's probably best to ignore it.
export class SameContainerMigrator
	extends TypedEventEmitter<ISameContainerMigratorEvents>
	implements ISameContainerMigrator
{
	private _currentModel: ISameContainerMigratableModel;
	public get currentModel(): ISameContainerMigratableModel {
		return this._currentModel;
	}

	private _pausedModel: ISameContainerMigratableModel | undefined;
	public get pausedModel(): ISameContainerMigratableModel {
		if (this._pausedModel === undefined) {
			throw new Error("_pausedModel has not been initialized");
		}
		return this._pausedModel;
	}

	private _currentModelId: string;
	public get currentModelId(): string {
		return this._currentModelId;
	}

	public get migrationState(): SameContainerMigrationState {
		return this._currentModel.migrationTool.migrationState;
	}

	public get connected(): boolean {
		return this._currentModel.connected();
	}

	/**
	 * If migration is in progress, the promise that will resolve when it completes.  Mutually exclusive with
	 * _migratedLoadP promise.
	 */
	private _migrationPrepareP: Promise<void> | undefined;

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
	private _preparedDetachedModel: IDetachedModel<ISameContainerMigratableModel> | undefined;

	public constructor(
		private readonly modelLoader: IModelLoader<ISameContainerMigratableModel>,
		initialMigratable: ISameContainerMigratableModel,
		initialId: string,
		private readonly dataTransformationCallback?: DataTransformationCallback,
	) {
		super();
		this._currentModel = initialMigratable;
		this._currentModelId = initialId;
		this._currentModel.migrationTool.setContainerRef(this._currentModel.container);
		this.ensureMigration();
	}

	private readonly prepareMigration = async () => {
		if (this._migrationPrepareP !== undefined) {
			return;
		}

		if (this._migrationPrepareP !== undefined) {
			throw new Error("Cannot prepare migration, we are currently migrating");
		}

		if (this._migratedLoadP !== undefined) {
			throw new Error("Cannot prepare migration, we are currently trying to load");
		}

		const prepare = async () => {
			this.emit("migrating");
			const migratable = this._currentModel;
			const acceptedVersion = migratable.migrationTool.acceptedVersion;
			if (acceptedVersion === undefined) {
				throw new Error("Expect an accepted version before migration starts");
			}
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

			const acceptedSeqNum = this.currentModel.migrationTool.acceptedSeqNum;
			assert(acceptedSeqNum !== undefined, "acceptedSeqNum should be defined");
			this._pausedModel = await this.modelLoader.loadExistingPaused(
				this._currentModelId,
				acceptedSeqNum,
			);
			assert(
				this.pausedModel.container.deltaManager.lastSequenceNumber === acceptedSeqNum,
				"paused model should be at accepted sequence number",
			);
			const exportedData = await this.pausedModel.exportData();

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
			this._preparedDetachedModel = detachedModel;
			this._migrationPrepareP = undefined;
		};

		this._migrationPrepareP = prepare();
		await this._migrationPrepareP;
	};

	private readonly completeMigration = async () => {
		if (this._migrationP !== undefined) {
			return;
		}

		if (this._migrationPrepareP !== undefined) {
			throw new Error("Cannot perform migration before migration is prepared");
		}

		if (this._migratedLoadP !== undefined) {
			throw new Error("Cannot perform migration, we are currently trying to load");
		}

		const complete = async () => {
			assert(
				this._preparedDetachedModel !== undefined,
				"this._preparedDetachedModel should be defined",
			);

			// TODO: Complete migration flow, should include generating v2 summary

			// TODO: this may not be necessary once we automatically generate the v2 summary
			if (this.currentModel.migrationTool.migrationState !== "migrated") {
				await new Promise<void>((resolve) => {
					this._currentModel.migrationTool.once("migrated", resolve);
				});
			}
			this._migrationP = undefined;
		};

		this._migrationP = complete();
		await this._migrationP;
	};

	private readonly loadMigration = async () => {
		if (this._migratedLoadP !== undefined) {
			return;
		}

		if (this._migrationPrepareP !== undefined) {
			throw new Error("Cannot start loading the migrated before migration is prepared");
		}

		if (this._migrationP !== undefined) {
			throw new Error("Cannot start loading the migrated before migration is complete");
		}

		const migratable = this._currentModel;
		const acceptedVersion = migratable.migrationTool.acceptedVersion;
		if (acceptedVersion === undefined) {
			throw new Error("Expect an accepted version before migration starts");
		}

		const load = async () => {
			const migrationSupported = await this.modelLoader.supportsVersion(acceptedVersion);
			if (!migrationSupported) {
				this.emit("migrationNotSupported", acceptedVersion);
				this._migratedLoadP = undefined;
				return;
			}
			// TODO: this should be a reload of the same container basically
			const migratedId = "foobar";
			const migrated = await this.modelLoader.loadExisting(migratedId);
			// Note: I'm choosing not to close the old migratable here, and instead allow the lifecycle management
			// of the migratable to be the responsibility of whoever created the Migrator (and handed it its first
			// migratable).  It could also be fine to close here, just need to have an explicit contract to clarify
			// who is responsible for managing that.
			this._currentModel = migrated;
			this._currentModelId = migratedId;
			this.emit("migrated", migrated, migratedId);
			this._migratedLoadP = undefined;

			// Reset retry values
			this._preparedDetachedModel = undefined;
		};

		this._migratedLoadP = load();
		await this._migratedLoadP;
	};

	private readonly ensureMigration = () => {
		const overseeStages = async () => {
			if (this._preparedDetachedModel === undefined) {
				console.log("Preparing...");
				await this.prepareMigration();
			}

			console.log("Completing...");
			await this.completeMigration();

			console.log("Loading...");
			await this.loadMigration();
		};

		if (!this.currentModel.connected()) {
			this.currentModel.once("connected", () => {
				this.ensureMigration();
			});
			return;
		}
		if (this.currentModel.migrationTool.migrationState !== "readyForMigration") {
			this.currentModel.migrationTool.once("readyForMigration", () => {
				this.ensureMigration();
			});
			return;
		}

		overseeStages()
			.then(() => {
				console.log("done!");
			})
			.catch((e) => {
				// TODO: error handling/retry
				console.error(e);
			});
	};
}
