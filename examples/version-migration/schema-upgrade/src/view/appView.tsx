/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IMigratableModel } from "@fluid-example/example-utils";
import React, { useEffect, useState } from "react";

import type { IInventoryListAppModel } from "../modelInterfaces.js";

import { InventoryListView } from "./inventoryView.js";

export interface IInventoryListAppViewProps {
	// TODO: All we really want here is a "readonly" indicator - maybe don't need the full IMigratableModel interface.
	// Would maybe be better to grab that info from the Migrator rather than the MigrationTool anyway.
	model: IInventoryListAppModel & IMigratableModel;
}

/**
 * The InventoryListAppView is the top-level app view.  It is made to pair with an InventoryListAppModel and
 * render its contents appropriately.  Since container migration is a top-level concept, it takes the responsibility
 * of appropriately disabling the view during migration.  It would also be what triggers any other migration UI we
 * might want, progress wheels, etc.
 */
export const InventoryListAppView: React.FC<IInventoryListAppViewProps> = (
	props: IInventoryListAppViewProps,
) => {
	const { model } = props;

	const [disableInput, setDisableInput] = useState<boolean>(
		model.migrationTool.migrationState !== "collaborating",
	);

	useEffect(() => {
		const migrationStateChangedHandler = () => {
			setDisableInput(model.migrationTool.migrationState !== "collaborating");
		};
		model.migrationTool.events.on("stopping", migrationStateChangedHandler);
		model.migrationTool.events.on("migrating", migrationStateChangedHandler);
		model.migrationTool.events.on("migrated", migrationStateChangedHandler);
		migrationStateChangedHandler();
		return () => {
			model.migrationTool.events.off("stopping", migrationStateChangedHandler);
			model.migrationTool.events.off("migrating", migrationStateChangedHandler);
			model.migrationTool.events.off("migrated", migrationStateChangedHandler);
		};
	}, [model]);

	return <InventoryListView inventoryList={model.inventoryList} disabled={disableInput} />;
};
