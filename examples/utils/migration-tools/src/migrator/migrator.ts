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

import type {
	ExportDataCallback,
	IMigrator,
	IMigratorEvents,
	LoadSourceContainerCallback,
	MigrationCallback,
} from "./interfaces.js";

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
 * The Migrator monitors and interacts with its IMigrationTool to handle and trigger migration.  It is designed
 * to be a one-time-use tool that is provided as part of the (old) container code bundle, through the container
 * entryPoint.  It makes minimal assumptions about what the eventual new container might look like as a
 * future-proofing strategy.
 */
export class Migrator implements IMigrator {
	public get migrationResult(): unknown | undefined {
		return this.migrationTool.migrationResult;
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

	private readonly echoStopping = (): void => {
		this._events.emit("stopping");
	};
	private readonly echoMigrating = (): void => {
		this._events.emit("migrating");
	};
	private readonly echoMigrated = (): void => {
		this._events.emit("migrated");
	};

	// On disposal, unregister all listeners
	private readonly onMigrationToolDisposed = (): void => {
		this.migrationTool.events.off("stopping", this.echoStopping);
		this.migrationTool.events.off("migrating", this.echoMigrating);
		this.migrationTool.events.off("migrated", this.echoMigrated);

		this.migrationTool.events.off("migrating", this.performMigration);

		this.migrationTool.events.off("disposed", this.onMigrationToolDisposed);
	};

	public constructor(
		private readonly migrationTool: IMigrationTool,
		private readonly loadSourceContainerCallback: LoadSourceContainerCallback,
		private readonly exportDataCallback: ExportDataCallback,
		private readonly migrationCallback: MigrationCallback,
	) {
		// Echo the events from the MigrationTool, these are the source of truth and can proceed regardless of
		// whatever the local Migrator is doing.
		this.migrationTool.events.on("stopping", this.echoStopping);
		this.migrationTool.events.on("migrating", this.echoMigrating);
		this.migrationTool.events.on("migrated", this.echoMigrated);

		// Detect the current migration state and set up listeners to observe changes.
		const migrationState = this.migrationTool.migrationState;
		if (migrationState === "migrating") {
			this.performMigration();
		} else if (migrationState === "collaborating" || migrationState === "stopping") {
			this.migrationTool.events.once("migrating", this.performMigration);
		}
		// Do nothing if already migrated

		this.migrationTool.events.on("disposed", this.onMigrationToolDisposed);
	}

	public readonly proposeVersion = (newVersion: string): void => {
		if (this.proposedVersion !== undefined) {
			throw new Error("A proposal was already made");
		}
		this.migrationTool.proposeVersion(newVersion);
	};

	private readonly performMigration = (): void => {
		(async (): Promise<void> => {
			const acceptedMigration = this.migrationTool.acceptedMigration;
			assert(
				acceptedMigration !== undefined,
				"Expect an accepted migration before migration starts",
			);
			// Delay performing the migration until we are connected.  It's possible that we'll find the migration has already
			// completed before we finish connecting, and in that case we want to avoid doing anything.
			if (!this.connected) {
				await new Promise<void>((resolve) => {
					this.migrationTool.events.once("connected", () => {
						resolve();
					});
				});
			}

			// Do nothing if the migration has already completed.
			if (this.migrationTool.migrationResult !== undefined) {
				return;
			}

			// Load the container to at least the acceptance sequence number and export.  We do this with a
			// separate container to ensure we don't include any local un-ack'd changes.  Late-arriving messages
			// may or may not make it into the migrated data, there is no guarantee either way.
			// TODO: Consider making this a read-only client
			// TODO: Consider more aggressive checks on whether the migration finished and early disconnect, or an abort signal.
			const sourceContainer = await this.loadSourceContainerCallback();
			await waitForAtLeastSequenceNumber(
				sourceContainer,
				acceptedMigration.migrationSequenceNumber,
			);
			const exportedData = await this.exportDataCallback(sourceContainer);
			sourceContainer.dispose();

			// Exit early if someone else finished the migration while we were exporting.
			if (this.migrationTool.migrationResult !== undefined) {
				return;
			}

			const migrationResult = await this.migrationCallback(
				acceptedMigration.newVersion,
				exportedData,
			);

			// Confirm that no one else finished the migration already before trying to finalize.
			if (this.migrationTool.migrationResult === undefined) {
				await this.migrationTool.finalizeMigration(migrationResult);
			}
		})().catch(console.error);
	};
}
