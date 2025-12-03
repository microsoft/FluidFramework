/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IMigrator } from "@fluid-example/migration-tools/alpha";
import React, { useEffect, useState } from "react";

import type { IInventoryListAppModel } from "../modelInterfaces.js";

import { InventoryListView } from "./inventoryView.js";

export interface IInventoryListAppViewProps {
	model: IInventoryListAppModel;
	// TODO: All we really want here is a "readonly" indicator - maybe don't need the full IMigrator interface.
	migrator: IMigrator;
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
	const { model, migrator } = props;

	const [disableInput, setDisableInput] = useState<boolean>(
		migrator.migrationState !== "collaborating",
	);

	useEffect(() => {
		const migrationStateChangedHandler = (): void => {
			setDisableInput(migrator.migrationState !== "collaborating");
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

	return <InventoryListView inventoryList={model.inventoryList} disabled={disableInput} />;
};
