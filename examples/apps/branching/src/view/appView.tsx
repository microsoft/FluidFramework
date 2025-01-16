/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import type { IGroceryListAppModel } from "../modelInterfaces.js";

import { InventoryListView } from "./inventoryView.js";

export interface IInventoryListAppViewProps {
	model: IGroceryListAppModel;
}

/**
 * The InventoryListAppView is the top-level app view.  It is made to pair with an InventoryListAppModel and
 * render its contents appropriately.
 */
export const InventoryListAppView: React.FC<IInventoryListAppViewProps> = ({
	model,
}: IInventoryListAppViewProps) => {
	return (
		<>
			<h1>Using new SharedTree</h1>
			<InventoryListView inventoryList={model.groceryList} />
		</>
	);
};
