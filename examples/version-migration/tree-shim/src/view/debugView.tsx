/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import type { IInventoryListAppModel } from "../modelInterfaces";
import { InventoryList } from "../model/inventoryList";

export interface IDebugViewProps {
	model: IInventoryListAppModel;
}

export const DebugView: React.FC<IDebugViewProps> = ({ model }: IDebugViewProps) => {
	// For demo purposes, we're just reaching in to grab a debug object - this shouldn't exist in a production app.
	const DEBUG = (model.inventoryList as InventoryList).DEBUG;
	return (
		<div>
			<h2 style={{ textDecoration: "underline" }}>Debug info</h2>
			<div>
				<div>Currently using: {DEBUG.isMigrated() ? "New SharedTree" : "Legacy SharedTree"}</div>
				<button onClick={DEBUG.triggerMigration}>Trigger migration</button>
			</div>
		</div>
	);
};
