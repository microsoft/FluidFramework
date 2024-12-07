/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { IEventProvider } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import type {
	IAcceptedMigrationDetails,
	IMigrationTool,
	MigrationState,
} from "../migrationTool/index.js";

import type { IMigrator, IMigratorEvents } from "./interfaces.js";

/**
 * Callback that should take the given container and export its data in some format.
 * @alpha
 */
export type ExportDataCallback = (container: IContainer) => Promise<unknown>;
/**
 * Callback provided to load the source container that data will be exported from.  Should be a separately
 * loaded container to avoid including local changes.
 * @alpha
 */
export type LoadSourceContainerCallback = () => Promise<IContainer>;
/**
 * Callback provided to take desired migration steps after migration has been agreed upon and data has been
 * exported.  Typically creating a new container and importing the data into it.
 * @alpha
 */
export type MigrationCallback = (version: string, exportedData: unknown) => Promise<unknown>;

/**
 * Get a promise that will resolve once the container has advanced to at least the given sequence number
 * @param container - the container to observe
 * @param sequenceNumber - the sequence number we want to load to at minimum
 */
const waitForAtLeastSequenceNumber = async (
	container: IContainer,
	sequenceNumber: number,
): Promise<void> =>
	new Promise<void>((resolve) => {
		if (sequenceNumber <= container.deltaManager.lastSequenceNumber) {
			resolve();
		}
		const callbackOps = (message: ISequencedDocumentMessage): void => {
			if (sequenceNumber <= message.sequenceNumber) {
				resolve();
				container.deltaManager.off("op", callbackOps);
			}
		};
		container.deltaManager.on("op", callbackOps);
	});

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
		// TODO: Make private
		public readonly migrationTool: IMigrationTool,
		private readonly loadSourceContainerCallback: LoadSourceContainerCallback,
		private readonly exportDataCallback: ExportDataCallback,
		// This callback will take sort-of the role of a code loader, creating the new detached container appropriately.
		private readonly migrationCallback: MigrationCallback,
	) {
		// TODO: Think about matching events between tool and migrator
		this.migrationTool.events.on("stopping", () => {
			this._events.emit("stopping");
		});
		this.takeAppropriateActionForCurrentMigratable();
	}

	public readonly proposeVersion = (newVersion: string): void => {
		// TODO: Consider also taking a callback to verify the accepted version can be migrated to here?
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
		if (this._migrationP !== undefined) {
			return;
		}

		if (!this.connected) {
			// If we are not connected we should wait until we reconnect and try again. Note: we re-enter the state
			// machine, since it's possible another client has already completed the migration by the time we reconnect.
			this.migrationTool.events.once(
				"connected",
				this.takeAppropriateActionForCurrentMigratable,
			);
			return;
		}

		const acceptedMigration = this.migrationTool.acceptedMigration;
		assert(
			acceptedMigration !== undefined,
			"Expect an accepted migration before migration starts",
		);

		// TODO: Consider also taking a callback to verify the accepted version can be migrated to here?

		const doTheMigration = async (): Promise<void> => {
			// Here we load the model to at least the acceptance sequence number and export.  We do this with a
			// separately loaded model to ensure we don't include any local un-ack'd changes.  Late-arriving messages
			// may or may not make it into the migrated data, there is no guarantee either way.
			// TODO: Consider making this a read-only client
			const exportContainer = await this.loadSourceContainerCallback();
			await waitForAtLeastSequenceNumber(
				exportContainer,
				acceptedMigration.migrationSequenceNumber,
			);
			const exportedData = await this.exportDataCallback(exportContainer);
			exportContainer.dispose();

			const migrationResult = await this.migrationCallback(
				acceptedMigration.newVersion,
				exportedData,
			);
			// TODO: Don't cast here
			await this.migrationTool.finalizeMigration(migrationResult as string);
		};

		this._events.emit("migrating");

		this._migrationP = doTheMigration()
			.then(() => {
				this._migrationP = undefined;
				this._events.emit("migrated");
			})
			.catch(console.error);
	};
}
