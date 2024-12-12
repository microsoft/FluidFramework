/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IMigrationTool } from "@fluid-example/migration-tools/internal";
import React, { useEffect, useState } from "react";

import type { IInventoryListAppModel } from "../modelInterfaces.js";

import { InventoryListView } from "./inventoryView.js";

export interface IInventoryListAppViewProps {
	model: IInventoryListAppModel;
	// TODO: All we really want here is a "readonly" indicator - maybe don't need the full IMigrationTool interface.
	// Would maybe be better to grab that info from the Migrator rather than the MigrationTool anyway?
	migrationTool: IMigrationTool;
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
	const { model, migrationTool } = props;

	const [disableInput, setDisableInput] = useState<boolean>(
		migrationTool.migrationState !== "collaborating",
	);

	useEffect(() => {
		const migrationStateChangedHandler = (): void => {
			setDisableInput(migrationTool.migrationState !== "collaborating");
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

	return <InventoryListView inventoryList={model.inventoryList} disabled={disableInput} />;
};
