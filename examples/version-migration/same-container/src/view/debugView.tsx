/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";

import type {
	ISameContainerMigratableModel,
	SameContainerMigrationState,
} from "@fluid-example/example-utils";
import type { IInventoryListAppModel } from "../modelInterfaces";

export interface IDebugViewProps {
	readonly model: IInventoryListAppModel;
	readonly summarizeOnDemand: () => void;
	readonly getUrlForContainerId?: (containerId: string) => string;
}

export const DebugView: React.FC<IDebugViewProps> = (props: IDebugViewProps) => {
	const { model, summarizeOnDemand, getUrlForContainerId } = props;

	return (
		<div>
			<h2 style={{ textDecoration: "underline" }}>Debug info</h2>
			<MigrationStatusView model={model} getUrlForContainerId={getUrlForContainerId} />
			<ControlsView
				proposeVersion={model.migrationTool.proposeVersion}
				summarizeOnDemand={summarizeOnDemand}
				addItem={model.inventoryList.addItem}
			/>
		</div>
	);
};

interface IMigrationStatusViewProps {
	readonly model: ISameContainerMigratableModel;
	readonly getUrlForContainerId?: (containerId: string) => string;
}

const MigrationStatusView: React.FC<IMigrationStatusViewProps> = (
	props: IMigrationStatusViewProps,
) => {
	const { model } = props;

	const [migrationState, setMigrationState] = useState<SameContainerMigrationState>(
		model.migrationTool.migrationState,
	);

	useEffect(() => {
		const migrationStateChangedHandler = () => {
			setMigrationState(model.migrationTool.migrationState);
		};
		model.migrationTool.on("proposingMigration", migrationStateChangedHandler);
		model.migrationTool.on("stoppingCollaboration", migrationStateChangedHandler);
		model.migrationTool.on("generatingV1Summary", migrationStateChangedHandler);
		model.migrationTool.on("uploadingV1Summary", migrationStateChangedHandler);
		model.migrationTool.on("submittingV1Summary", migrationStateChangedHandler);
		model.migrationTool.on("proposingV2Code", migrationStateChangedHandler);
		model.migrationTool.on("waitingForV2ProposalCompletion", migrationStateChangedHandler);
		model.migrationTool.on("readyForMigration", migrationStateChangedHandler);
		model.migrationTool.on("uploadingV2Summary", migrationStateChangedHandler);
		model.migrationTool.on("submittingV2Summary", migrationStateChangedHandler);
		model.migrationTool.on("migrated", migrationStateChangedHandler);
		migrationStateChangedHandler();
		return () => {
			model.migrationTool.off("proposingMigration", migrationStateChangedHandler);
			model.migrationTool.off("stoppingCollaboration", migrationStateChangedHandler);
			model.migrationTool.off("generatingV1Summary", migrationStateChangedHandler);
			model.migrationTool.off("uploadingV1Summary", migrationStateChangedHandler);
			model.migrationTool.off("submittingV1Summary", migrationStateChangedHandler);
			model.migrationTool.off("proposingV2Code", migrationStateChangedHandler);
			model.migrationTool.off("waitingForV2ProposalCompletion", migrationStateChangedHandler);
			model.migrationTool.off("readyForMigration", migrationStateChangedHandler);
			model.migrationTool.off("uploadingV2Summary", migrationStateChangedHandler);
			model.migrationTool.off("submittingV2Summary", migrationStateChangedHandler);
			model.migrationTool.off("migrated", migrationStateChangedHandler);
		};
	}, [model]);

	const proposedVersionStatus =
		model.migrationTool.proposedVersion === undefined
			? "No proposed version for migration yet"
			: `Proposed version to migrate to: ${model.migrationTool.proposedVersion}`;

	const acceptedVersionStatus =
		model.migrationTool.acceptedVersion === undefined
			? "No accepted version for migration yet"
			: `Accepted version to migrate to: ${model.migrationTool.acceptedVersion}`;

	return (
		<div className="migration-status" style={{ margin: "10px 0" }}>
			<div>Using model: {model.version}</div>
			<div>
				Status:
				{migrationState === "collaborating" && " Normal collaboration"}
				{migrationState === "proposingMigration" && " Proposing to migrate"}
				{migrationState === "stoppingCollaboration" && " Stopping collaboration"}
				{migrationState === "generatingV1Summary" && " Generating v1 summary"}
				{migrationState === "uploadingV1Summary" && " Uploading v1 summary"}
				{migrationState === "submittingV1Summary" && " Submitting v1 summary"}
				{migrationState === "proposingV2Code" && " Proposing v2 code"}
				{migrationState === "waitingForV2ProposalCompletion" &&
					" Waiting for v2 code proposal completion"}
				{migrationState === "readyForMigration" && " Ready for migration"}
				{migrationState === "uploadingV2Summary" && " Uploading v2 summary"}
				{migrationState === "submittingV2Summary" && " Submitting v2 summary"}
				{migrationState === "migrated" && " Migration complete"}
			</div>
			<div>{proposedVersionStatus}</div>
			<div>{acceptedVersionStatus}</div>
		</div>
	);
};

interface IControlsViewProps {
	readonly proposeVersion: (version: string) => void;
	readonly summarizeOnDemand: () => void;
	readonly addItem: (name: string, quantity: number) => void;
}

const ControlsView: React.FC<IControlsViewProps> = (props: IControlsViewProps) => {
	const { proposeVersion, summarizeOnDemand, addItem } = props;

	const addSampleItems = () => {
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
					onClick={() => {
						proposeVersion("one");
					}}
				>
					&quot;one&quot;
				</button>
				<button
					onClick={() => {
						proposeVersion("two");
					}}
				>
					&quot;two&quot;
				</button>
			</div>
			<div style={{ margin: "10px 0" }}>
				The demo in its current state disables summary heuristics, so it won&apos;t
				automatically summarize. Use this button to force a summary immediately.
				<br />
				<button
					onClick={() => {
						summarizeOnDemand();
					}}
				>
					summarizeOnDemand
				</button>
			</div>
			<div style={{ margin: "10px 0" }}>
				<button onClick={addSampleItems}>Add sample items</button>
			</div>
		</div>
	);
};
