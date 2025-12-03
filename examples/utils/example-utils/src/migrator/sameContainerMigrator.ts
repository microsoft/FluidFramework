/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils/legacy";

import type {
	DataTransformationCallback,
	ISameContainerMigratableModel,
	ISameContainerMigrator,
	ISameContainerMigratorEvents,
	SameContainerMigrationState,
} from "../migrationInterfaces/index.js";
import type { IDetachedModel, IModelLoader } from "../modelLoader/index.js";

// TODO: Note that this class is far from the expected state - it effectively does nothing since takeAppropriateActionForCurrentMigratable is commented out.
// Eventually it will be in charge of extracting the v1 data and calling migrationTool.finalizeMigration() with the transformed summary, but for now it's probably best to ignore it.
/**
 * @internal
 */
export class SameContainerMigrator
	extends TypedEventEmitter<ISameContainerMigratorEvents>
	implements ISameContainerMigrator
{
	private _currentModel: ISameContainerMigratableModel;
	public get currentModel(): ISameContainerMigratableModel {
		return this._currentModel;
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
	 * Accepted version from the migration tool. This is stored for retry scenarios.
	 */
	private _acceptedVersion: string | undefined;
	/**
	 * Paused model at the accepted sequence number. This is stored for retry scenarios.
	 */
	private _pausedModel: ISameContainerMigratableModel | undefined;
	/**
	 * Exported data from the paused v1 container. This is stored for retry scenarios.
	 */
	private _exportedData: unknown | undefined;
	/**
	 * Detached model used to import data. This is stored for retry scenarios.
	 */
	private _detachedModel: IDetachedModel<ISameContainerMigratableModel> | undefined;
	/**
	 * Transformed v1 data ready to be imported into the migrated model. This is stored for retry scenarios.
	 */
	private _transformedData: unknown | undefined;
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
		this.monitorMigration()
			.then(() => {
				console.log("done!");
			})
			.catch((e) => {
				// TODO: error handling/retry
				console.error(e);
			});
	}

	private readonly startMigration = async () => {
		this.emit("migrating");

		const migratable = this._currentModel;
		this._acceptedVersion = migratable.migrationTool.acceptedVersion;
		if (this._acceptedVersion === undefined) {
			throw new Error("Expect an accepted version before migration starts");
		}

		const migrationSupported = await this.modelLoader.supportsVersion(this._acceptedVersion);
		if (!migrationSupported) {
			this.emit("migrationNotSupported", this._acceptedVersion);
			return;
		}
	};

	private readonly loadPausedModel = async () => {
		const acceptedSeqNum = this.currentModel.migrationTool.acceptedSeqNum;
		assert(acceptedSeqNum !== undefined, "acceptedSeqNum should be defined");
		this._pausedModel = await this.modelLoader.loadExistingPaused(
			this._currentModelId,
			acceptedSeqNum,
		);
		assert(
			this._pausedModel.container.deltaManager.lastSequenceNumber === acceptedSeqNum,
			"paused model should be at accepted sequence number",
		);
	};

	private readonly getExportedData = async () => {
		assert(this._pausedModel !== undefined, "this._pausedModel should be defined");
		this._exportedData = await this._pausedModel.exportData();
	};

	private readonly loadDetachedModel = async () => {
		// It's possible that our modelLoader is older and doesn't understand the new acceptedVersion.
		// Currently this fails the migration gracefully and emits an event so the app developer can know
		// they're stuck. Ideally the app developer would find a way to acquire a new ModelLoader and move
		// forward, or at least advise the end user to refresh the page or something.
		// TODO: Does the app developer have everything they need to dispose gracefully when recovering with
		// a new ModelLoader?

		assert(this._acceptedVersion !== undefined, "this._acceptedVersion should be defined");
		this._detachedModel = await this.modelLoader.createDetached(this._acceptedVersion);
	};

	private readonly generateTransformedData = async () => {
		// TODO: Is there a reasonable way to validate at proposal time whether we'll be able to get the
		// exported data into a format that the new model can import?  If we can determine it early, then
		// clients with old ModelLoaders can use that opportunity to dispose early and try to get new
		// ModelLoaders.

		assert(this._detachedModel !== undefined, "this._detachedModel should be defined");
		if (this._detachedModel.model.supportsDataFormat(this._exportedData) === true) {
			// If the migrated model already supports the data format, go ahead with the migration.
			this._transformedData = this._exportedData;
			return;
		}

		if (this.dataTransformationCallback !== undefined) {
			// Otherwise, try using the dataTransformationCallback if provided to get the exported data into
			// a format that we can import.
			assert(this._acceptedVersion !== undefined, "this._acceptedVersion should be defined");
			try {
				this._transformedData = await this.dataTransformationCallback(
					this._exportedData,
					this._acceptedVersion,
				);
			} catch {
				// TODO: This implies that the contract is to throw if the data can't be transformed, which
				// isn't great.  How should the dataTransformationCallback indicate failure?
				this.emit("migrationNotSupported", this._acceptedVersion);
				return;
			}
		} else {
			// We can't get the data into a format that we can import, give up.
			this.emit("migrationNotSupported", this._acceptedVersion);
			return;
		}
	};

	private readonly importDataIntoDetachedModel = async () => {
		assert(this._detachedModel !== undefined, "this._detachedModel should be defined");
		assert(this._transformedData !== undefined, "this._transformedData should be defined");
		await this._detachedModel.model.importData(this._transformedData);
		// Store the detached model for later use and retry scenarios
		this._preparedDetachedModel = this._detachedModel;
	};

	private readonly getV2Summary = async () => {
		// TODO: Actually generate the v2 summary, currently we wait for a manual button press
		if (this.currentModel.migrationTool.migrationState !== "migrated") {
			await new Promise<void>((resolve) => {
				this._currentModel.migrationTool.once("migrated", resolve);
			});
		}
	};

	private readonly finalizeMigration = async () => {
		// TODO: Real stuff
	};

	private readonly loadMigration = async () => {
		// TODO: Add check here to ensure finalizeMigration() executed as intended

		const migratable = this._currentModel;
		const acceptedVersion = migratable.migrationTool.acceptedVersion;
		if (acceptedVersion === undefined) {
			throw new Error("Expect an accepted version before migration starts");
		}

		const migrationSupported = await this.modelLoader.supportsVersion(acceptedVersion);
		if (!migrationSupported) {
			this.emit("migrationNotSupported", acceptedVersion);
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

		// Reset retry values
		this._acceptedVersion = undefined;
		this._pausedModel = undefined;
		this._exportedData = undefined;
		this._detachedModel = undefined;
		this._transformedData = undefined;
		this._preparedDetachedModel = undefined;
	};

	private readonly monitorMigration = async () => {
		// Ensure we are connected
		if (!this.currentModel.connected()) {
			await new Promise<void>((resolve) => this.currentModel.once("connected", resolve));
		}
		// Ensure the migration tool has reached the "readyForMigration" stage
		if (this.currentModel.migrationTool.migrationState !== "readyForMigration") {
			await new Promise<void>((resolve) =>
				this.currentModel.migrationTool.once("readyForMigration", resolve),
			);
		}

		console.log("Migration stage: startMigration");
		if (this._acceptedVersion === undefined) {
			await this.startMigration();
		}

		console.log("Migration stage: loadPausedModel");
		if (this._pausedModel === undefined) {
			await this.loadPausedModel();
		}

		console.log("Migration stage: getExportedData");
		if (this._exportedData === undefined) {
			await this.getExportedData();
		}

		// These stages are grouped together because we should not try to retry with a detached model that could have
		// partially imported data.
		if (this._preparedDetachedModel === undefined) {
			console.log("Migration stage: loadDetachedModel");
			await this.loadDetachedModel();

			console.log("Migration stage: generateTransformedData");
			await this.generateTransformedData();

			console.log("Migration stage: importDataIntoDetachedModel");
			await this.importDataIntoDetachedModel();
		}

		console.log("Migration stage: getV2Summary");
		// TODO: this condition will probably change when we actually implement v2 summary
		if (this.currentModel.migrationTool.migrationState !== "migrated") {
			await this.getV2Summary();
		}

		console.log("Migration stage: finalizeMigration");
		await this.finalizeMigration();

		console.log("Migration stage: loadMigration");
		await this.loadMigration();

		console.log("Migration stage: Done!");
	};
}
