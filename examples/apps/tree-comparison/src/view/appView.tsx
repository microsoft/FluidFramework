/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import type { IInventoryListAppModel } from "../modelInterfaces";
import { InventoryListView } from "./inventoryView";

export interface IInventoryListAppViewProps {
	model: IInventoryListAppModel;
}

/**
 * The InventoryListAppView is the top-level app view.  It is made to pair with an InventoryListAppModel and
 * render its contents appropriately.
 */
export const InventoryListAppView: React.FC<IInventoryListAppViewProps> = (
	props: IInventoryListAppViewProps,
) => {
	const { model } = props;

	return (
		<>
			<h1>Using legacy SharedTree</h1>
			<InventoryListView inventoryList={model.legacyTreeInventoryList} />
			<h1>Using new SharedTree</h1>
			<InventoryListView inventoryList={model.treeInventoryList} />
		</>
	);
};
