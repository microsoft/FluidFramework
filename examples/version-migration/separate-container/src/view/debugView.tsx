/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IMigrator, MigrationState } from "@fluid-example/migration-tools/alpha";
import React, { useEffect, useState } from "react";

import type { IMigratableModel } from "../migratableModel.js";
import type { IInventoryListAppModel } from "../modelInterfaces.js";

export interface IDebugViewProps {
	model: IInventoryListAppModel & IMigratableModel;
	migrator: IMigrator;
	getUrlForContainerId?: (containerId: string) => string;
}

export const DebugView: React.FC<IDebugViewProps> = (props: IDebugViewProps) => {
	const { model, migrator, getUrlForContainerId } = props;

	const [disableControls, setDisableControls] = useState<boolean>(
		migrator.migrationState !== "collaborating",
	);

	useEffect(() => {
		const migrationStateChangedHandler = (): void => {
			setDisableControls(migrator.migrationState !== "collaborating");
		};
		migrator.events.on("stopping", migrationStateChangedHandler);
		migrator.events.on("migrating", migrationStateChangedHandler);
		migrator.events.on("migrated", migrationStateChangedHandler);
		migrationStateChangedHandler();
		return () => {
			migrator.events.off("stopping", migrationStateChangedHandler);
			migrator.events.off("migrating", migrationStateChangedHandler);
			migrator.events.off("migrated", migrationStateChangedHandler);
		};
	}, [migrator]);

	return (
		<div>
			<h2 style={{ textDecoration: "underline" }}>Debug info</h2>
			<MigrationStatusView
				model={model}
				migrator={migrator}
				getUrlForContainerId={getUrlForContainerId}
			/>
			<ControlsView
				proposeVersion={migrator.proposeVersion}
				addItem={model.inventoryList.addItem}
				disabled={disableControls}
			/>
		</div>
	);
};

interface IMigrationStatusViewProps {
	readonly model: IMigratableModel;
	readonly migrator: IMigrator;
	readonly getUrlForContainerId?: (containerId: string) => string;
}

const MigrationStatusView: React.FC<IMigrationStatusViewProps> = (
	props: IMigrationStatusViewProps,
) => {
	const { model, migrator, getUrlForContainerId } = props;

	const [migrationState, setMigrationState] = useState<MigrationState>(
		migrator.migrationState,
	);

	useEffect(() => {
		const migrationStateChangedHandler = (): void => {
			setMigrationState(migrator.migrationState);
		};
		migrator.events.on("stopping", migrationStateChangedHandler);
		migrator.events.on("migrating", migrationStateChangedHandler);
		migrator.events.on("migrated", migrationStateChangedHandler);
		migrationStateChangedHandler();
		return () => {
			migrator.events.off("stopping", migrationStateChangedHandler);
			migrator.events.off("migrating", migrationStateChangedHandler);
			migrator.events.off("migrated", migrationStateChangedHandler);
		};
	}, [migrator]);

	const proposedVersionStatus =
		migrator.proposedVersion === undefined
			? "No proposed version for migration yet"
			: `Proposed version to migrate to: ${migrator.proposedVersion}`;

	const acceptedVersionStatus =
		migrator.acceptedMigration === undefined
			? "No accepted version for migration yet"
			: `Accepted version to migrate to: ${migrator.acceptedMigration.newVersion} @ sequenceNumber: ${migrator.acceptedMigration.migrationSequenceNumber}`;

	const migratedContainerStatus = ((): JSX.Element => {
		const migrationResult = migrator.migrationResult as string;
		if (migrationResult === undefined) {
			return <>No migrated container yet</>;
		}

		const navToNewContainer = (): void => {
			if (migrationResult !== undefined && getUrlForContainerId !== undefined) {
				location.href = getUrlForContainerId(migrationResult);
				location.reload();
			}
		};

		// If we're able to get a direct link to the migrated container, do so.
		// Otherwise just use the string representation of the container id.
		const migratedReference =
			getUrlForContainerId === undefined ? (
				migrationResult
			) : (
				<a href={getUrlForContainerId(migrationResult)} onClick={navToNewContainer}>
					{migrationResult}
				</a>
			);

		return <>Migrated to new container at {migratedReference}</>;
	})();

	return (
		<div className="migration-status" style={{ margin: "10px 0" }}>
			<div>Using model: {model.version}</div>
			<div>
				Status:
				{migrationState === "collaborating" && " Normal collaboration"}
				{migrationState === "stopping" && " Migration proposed"}
				{migrationState === "migrating" && " Migration in progress"}
				{migrationState === "migrated" && " Migration complete"}
			</div>
			<div>{proposedVersionStatus}</div>
			<div>{acceptedVersionStatus}</div>
			<div>{migratedContainerStatus}</div>
		</div>
	);
};

interface IControlsViewProps {
	readonly proposeVersion: (version: string) => void;
	readonly addItem: (name: string, quantity: number) => void;
	readonly disabled: boolean;
}

const ControlsView: React.FC<IControlsViewProps> = (props: IControlsViewProps) => {
	const { proposeVersion, addItem, disabled } = props;

	const addSampleItems = (): void => {
		addItem("Alpha", 1);
		addItem("Beta", 2);
		addItem("Gamma", 3);
		addItem("Delta", 4);
	};

	return (
		<div>
			<div style={{ margin: "10px 0" }}>
				Propose version:
				<br />
				<button
					onClick={(): void => {
						proposeVersion("one");
					}}
					disabled={disabled}
				>
					&quot;one&quot;
				</button>
				<button
					onClick={(): void => {
						proposeVersion("two");
					}}
					disabled={disabled}
				>
					&quot;two&quot;
				</button>
			</div>
			<div style={{ margin: "10px 0" }}>
				<button onClick={addSampleItems} disabled={disabled}>
					Add sample items
				</button>
			</div>
		</div>
	);
};
