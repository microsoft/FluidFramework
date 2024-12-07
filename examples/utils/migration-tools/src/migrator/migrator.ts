/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { IEventProvider } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";

import type {
	IAcceptedMigrationDetails,
	IMigrationTool,
	MigrationState,
} from "../migrationTool/index.js";
import { type ISimpleLoader } from "../simpleLoader/index.js";

import type { IMigrator, IMigratorEvents } from "./interfaces.js";

/**
 * Helper function for casting the container's entrypoint to the expected type.  Does a little extra
 * type checking for added safety.
 */
export const getModelFromContainer = async <ModelType>(
	container: IContainer,
): Promise<ModelType> => {
	const entryPoint = (await container.getEntryPoint()) as {
		model: ModelType;
	};

	// If the user tries to use this with an incompatible container runtime, we want to give them
	// a comprehensible error message.  So distrust the type by default and do some basic type checking.
	if (typeof entryPoint.model !== "object") {
		throw new TypeError("Incompatible container runtime: doesn't provide model");
	}

	return entryPoint.model;
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

	private get connected(): boolean {
		return this.migrationTool.connected;
	}

	public get proposedVersion(): string | undefined {
		return this.migrationTool.proposedVersion;
	}

	public get acceptedMigration(): IAcceptedMigrationDetails | undefined {
		return this.migrationTool.acceptedMigration;
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

	public constructor(
		private readonly simpleLoader: ISimpleLoader,
		// TODO: Make private
		public readonly migrationTool: IMigrationTool,
		private readonly exportDataCallback: (migrationSequenceNumber: number) => Promise<unknown>,
		// This callback will take sort-of the role of a code loader, creating the new detached container appropriately.
		private readonly migrationCallback: (
			version: string,
			exportedData: unknown,
		) => Promise<unknown>,
	) {
		// TODO: Think about matching events between tool and migrator
		this.migrationTool.events.on("stopping", () => {
			this._events.emit("stopping");
		});
		this.takeAppropriateActionForCurrentMigratable();
	}

	public readonly proposeVersion = (newVersion: string): void => {
		this.migrationTool.proposeVersion(newVersion);
	};

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
		// Do nothing if already migrated
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

			const exportedData = await this.exportDataCallback(
				acceptedMigration.migrationSequenceNumber,
			);

			const migrationResult = await this.migrationCallback(
				acceptedMigration.newVersion,
				exportedData,
			);
			// TODO: Don't cast here
			await migrationTool.finalizeMigration(migrationResult as string);
		};

		this._events.emit("migrating");

		this._migrationP = doTheMigration()
			.then(() => {
				// We assume that if we resolved that either the migration was completed or we disconnected.
				// In either case, we should re-enter the state machine to take the appropriate action.
				this._migrationP = undefined;
				if (this.connected) {
					// We assume if we are still connected after exiting the loop, then we should be in the "migrated"
					// state. The following assert validates this assumption.
					assert(
						this.migrationTool.newContainerId !== undefined,
						"newContainerId should be defined",
					);
					this._events.emit("migrated");
				}
				this.takeAppropriateActionForCurrentMigratable();
			})
			.catch(console.error);
	};
}
