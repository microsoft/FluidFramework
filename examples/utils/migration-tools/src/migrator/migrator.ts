/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { IEventProvider } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";

import type { IMigrationTool, MigrationState } from "../migrationTool/index.js";
import { type ISimpleLoader } from "../simpleLoader/index.js";

import type {
	DataTransformationCallback,
	IMigratableModel,
	IMigrator,
	IMigratorEvents,
} from "./interfaces.js";

// TODO: This probably shouldn't be exported, consider having the migrator get its own model/tool out.
/**
 * The purpose of the model pattern and the model loader is to wrap the IContainer in a more useful object and
 * interface.  This demo uses a convention of the entrypoint providing a getModelAndMigrationTool method to do so.
 * It does this with the expectation that the model has been bundled with the container code.
 *
 * Other strategies to obtain the wrapping model could also work fine here - for example a standalone model code
 * loader that separately fetches model code and wraps the container from the outside.
 * @internal
 */
export const getModelAndMigrationToolFromContainer = async <ModelType>(
	container: IContainer,
): Promise<{ model: ModelType }> => {
	// TODO: Fix typing here
	const entryPoint = (await container.getEntryPoint()) as {
		model: ModelType;
	};
	// If the user tries to use this model loader with an incompatible container runtime, we want to give them
	// a comprehensible error message.  So distrust the type by default and do some basic type checking.
	if (typeof entryPoint.model !== "object") {
		throw new TypeError("Incompatible container runtime: doesn't provide model");
	}
	return { model: entryPoint.model };
};

/**
 * The Migrator maintains a reference to the current model, and interacts with it (and its MigrationTool)
 * to detect, observe, trigger, and execute migration as appropriate.
 * @alpha
 */
export class Migrator implements IMigrator {
	public get migrationResult(): unknown | undefined {
		// TODO: Abstract
		return this.migrationTool.newContainerId;
	}

	public get migrationState(): MigrationState {
		return this.migrationTool.migrationState;
	}

	public get connected(): boolean {
		return this.migrationTool.connected;
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

	// TODO: Better typing, decide if we can just retain attach()
	/**
	 * Detached model that is ready to attach. This is stored for retry scenarios.
	 */
	private _preparedDetachedModel:
		| { container: IContainer; attach: () => Promise<string> }
		| undefined;

	/**
	 * After attaching the prepared model, but before we have written its ID into the current model, we'll store the ID
	 * here to support retry scenarios.
	 */
	private _preparedModelId: string | undefined;

	public constructor(
		private readonly simpleLoader: ISimpleLoader,
		initialMigratable: IMigratableModel,
		// TODO: Make private
		public readonly migrationTool: IMigrationTool,
		initialId: string,
		private readonly exportData: (migrationSequenceNumber: number) => Promise<unknown>,
		private readonly dataTransformationCallback?: DataTransformationCallback,
	) {
		this.takeAppropriateActionForCurrentMigratable();
	}

	/**
	 * This method makes no assumptions about the state of the current migratable - this is particularly important
	 * for the case that we just finished loading a migrated container, but that migrated container is also either
	 * in the process of migrating or already migrated (and thus we need to load again).  It is not safe to assume
	 * that a freshly-loaded migrated container is in collaborating state.
	 */
	private readonly takeAppropriateActionForCurrentMigratable = (): void => {
		const migrationState = this.migrationTool.migrationState;
		if (migrationState === "migrating") {
			this.ensureMigrating();
		} else if (migrationState === "collaborating" || migrationState === "stopping") {
			this.migrationTool.events.once(
				"migrating",
				this.takeAppropriateActionForCurrentMigratable,
			);
		}
	};

	private readonly ensureMigrating = (): void => {
		// ensureMigrating() is called when we reach the "migrating" state. This should likely only happen once, but
		// can happen multiple times if we disconnect during the migration process.

		if (!this.connected) {
			// If we are not connected we should wait until we reconnect and try again. Note: we re-enter the state
			// machine, since it's possible another client has already completed the migration by the time we reconnect.
			this.migrationTool.events.once(
				"connected",
				this.takeAppropriateActionForCurrentMigratable,
			);
			return;
		}

		if (this._migrationP !== undefined) {
			return;
		}

		const migrationTool = this.migrationTool;
		const acceptedMigration = migrationTool.acceptedMigration;
		if (acceptedMigration === undefined) {
			throw new Error("Expect an accepted migration before migration starts");
		}

		const doTheMigration = async (): Promise<void> => {
			// doTheMigration() is called at the start of migration and should only resolve in two cases. First, is if
			// either the local or another client successfully completes the migration. Second, is if we disconnect
			// during the migration process. In both cases we should re-enter the state machine and take the
			// appropriate action (see then() block below).

			const prepareTheMigration = async (): Promise<void> => {
				// It's possible that our modelLoader is older and doesn't understand the new acceptedMigration.
				// Currently this fails the migration gracefully and emits an event so the app developer can know
				// they're stuck. Ideally the app developer would find a way to acquire a new ModelLoader and move
				// forward, or at least advise the end user to refresh the page or something.
				// TODO: Does the app developer have everything they need to dispose gracefully when recovering with
				// a new MigratableModelLoader?
				// TODO: Does the above TODO still matter now that this uses SimpleLoader?
				const migrationSupported = await this.simpleLoader.supportsVersion(
					acceptedMigration.newVersion,
				);
				if (!migrationSupported) {
					this._events.emit("migrationNotSupported", acceptedMigration.newVersion);
					this._migrationP = undefined;
					return;
				}

				const detachedContainer = await this.simpleLoader.createDetached(
					acceptedMigration.newVersion,
				);
				const { model: detachedModel } =
					await getModelAndMigrationToolFromContainer<IMigratableModel>(
						detachedContainer.container,
					);
				const migratedModel = detachedModel;

				const exportedData = await this.exportData(acceptedMigration.migrationSequenceNumber);

				// TODO: Is there a reasonable way to validate at proposal time whether we'll be able to get the
				// exported data into a format that the new model can import?  If we can determine it early, then
				// clients with old MigratableModelLoaders can use that opportunity to dispose early and try to get new
				// MigratableModelLoaders.
				let transformedData: unknown;
				if (migratedModel.supportsDataFormat(exportedData)) {
					// If the migrated model already supports the data format, go ahead with the migration.
					transformedData = exportedData;
					// eslint-disable-next-line unicorn/no-negated-condition
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
				this._preparedDetachedModel = detachedContainer;
			};

			const completeTheMigration = async (): Promise<void> => {
				assert(
					this._preparedDetachedModel !== undefined,
					"this._preparedDetachedModel should be defined",
				);

				// Volunteer to complete the migration.
				let isAssigned: boolean;
				try {
					isAssigned = await this.migrationTool.volunteerForMigration();
				} catch {
					// volunteerForMigration() will throw an error on disconnection. In this case, we should exit and
					// re-enter the state machine which will wait until we reconnect.
					// Note: while we wait to reconnect it is possible that another client will have already completed
					// the migration.
					assert(!this.connected, "We should be disconnected");
					return;
				}

				if (this.migrationTool.newContainerId !== undefined) {
					// If newContainerId is already set, then another client already completed the migration.
					return;
				}

				assert(isAssigned, "We should be assigned the migration task");

				if (this._preparedModelId === undefined) {
					this._preparedModelId = await this._preparedDetachedModel.attach();
				}

				// Check to make sure we still have the task assignment.
				if (!this.migrationTool.haveMigrationTask()) {
					// Exit early if we lost the task assignment, we are most likely disconnected.
					return;
				}

				await migrationTool.finalizeMigration(this._preparedModelId);

				this.migrationTool.completeMigrationTask();
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
						this.migrationTool.newContainerId !== undefined,
						"newContainerId should be defined",
					);
				}
				this._migrationP = undefined;
				this.takeAppropriateActionForCurrentMigratable();
			})
			.catch(console.error);
	};
}
