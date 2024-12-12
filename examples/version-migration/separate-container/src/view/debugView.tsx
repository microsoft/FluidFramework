/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IMigratableModel,
	IMigrationTool,
	MigrationState,
} from "@fluid-example/migration-tools/internal";
import React, { useEffect, useState } from "react";

import type { IInventoryListAppModel } from "../modelInterfaces.js";

export interface IDebugViewProps {
	model: IInventoryListAppModel & IMigratableModel;
	migrationTool: IMigrationTool;
	getUrlForContainerId?: (containerId: string) => string;
}

export const DebugView: React.FC<IDebugViewProps> = (props: IDebugViewProps) => {
	const { model, migrationTool, getUrlForContainerId } = props;

	const [disableControls, setDisableControls] = useState<boolean>(
		migrationTool.migrationState !== "collaborating",
	);

	useEffect(() => {
		const migrationStateChangedHandler = (): void => {
			setDisableControls(migrationTool.migrationState !== "collaborating");
		};
		migrationTool.events.on("stopping", migrationStateChangedHandler);
		migrationTool.events.on("migrating", migrationStateChangedHandler);
		migrationTool.events.on("migrated", migrationStateChangedHandler);
		migrationStateChangedHandler();
		return () => {
			migrationTool.events.off("stopping", migrationStateChangedHandler);
			migrationTool.events.off("migrating", migrationStateChangedHandler);
			migrationTool.events.off("migrated", migrationStateChangedHandler);
		};
	}, [migrationTool]);

	return (
		<div>
			<h2 style={{ textDecoration: "underline" }}>Debug info</h2>
			<MigrationStatusView
				model={model}
				migrationTool={migrationTool}
				getUrlForContainerId={getUrlForContainerId}
			/>
			<ControlsView
				proposeVersion={migrationTool.proposeVersion}
				addItem={model.inventoryList.addItem}
				disabled={disableControls}
			/>
		</div>
	);
};

interface IMigrationStatusViewProps {
	readonly model: IMigratableModel;
	readonly migrationTool: IMigrationTool;
	readonly getUrlForContainerId?: (containerId: string) => string;
}

const MigrationStatusView: React.FC<IMigrationStatusViewProps> = (
	props: IMigrationStatusViewProps,
) => {
	const { model, migrationTool, getUrlForContainerId } = props;

	const [migrationState, setMigrationState] = useState<MigrationState>(
		migrationTool.migrationState,
	);

	useEffect(() => {
		const migrationStateChangedHandler = (): void => {
			setMigrationState(migrationTool.migrationState);
		};
		migrationTool.events.on("stopping", migrationStateChangedHandler);
		migrationTool.events.on("migrating", migrationStateChangedHandler);
		migrationTool.events.on("migrated", migrationStateChangedHandler);
		migrationStateChangedHandler();
		return () => {
			migrationTool.events.off("stopping", migrationStateChangedHandler);
			migrationTool.events.off("migrating", migrationStateChangedHandler);
			migrationTool.events.off("migrated", migrationStateChangedHandler);
		};
	}, [migrationTool]);

	const proposedVersionStatus =
		migrationTool.proposedVersion === undefined
			? "No proposed version for migration yet"
			: `Proposed version to migrate to: ${migrationTool.proposedVersion}`;

	const acceptedVersionStatus =
		migrationTool.acceptedMigration === undefined
			? "No accepted version for migration yet"
			: `Accepted version to migrate to: ${migrationTool.acceptedMigration.newVersion} @ sequenceNumber: ${migrationTool.acceptedMigration.migrationSequenceNumber}`;

	const migratedContainerStatus = ((): JSX.Element => {
		if (migrationTool.newContainerId === undefined) {
			return <>No migrated container yet</>;
		}

		const navToNewContainer = (): void => {
			if (migrationTool.newContainerId !== undefined && getUrlForContainerId !== undefined) {
				location.href = getUrlForContainerId(migrationTool.newContainerId);
				location.reload();
			}
		};

		// If we're able to get a direct link to the migrated container, do so.
		// Otherwise just use the string representation of the container id.
		const migratedReference =
			getUrlForContainerId === undefined ? (
				migrationTool.newContainerId
			) : (
				<a
					href={getUrlForContainerId(migrationTool.newContainerId)}
					onClick={navToNewContainer}
				>
					{migrationTool.newContainerId}
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
