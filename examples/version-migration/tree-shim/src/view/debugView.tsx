/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";

import type { IInventoryListAppModel } from "../modelInterfaces.js";
// eslint-disable-next-line import/no-internal-modules
import { InventoryList } from "../model/inventoryList.js";

export interface IDebugViewProps {
	model: IInventoryListAppModel;
}

export const DebugView: React.FC<IDebugViewProps> = ({ model }: IDebugViewProps) => {
	// For demo purposes, we're just reaching in to grab a debug object - this shouldn't exist in a production app.
	const DEBUG = (model.migratingInventoryList as InventoryList).DEBUG;

	const [treeType, setTreeType] = useState(DEBUG.isMigrated() ? "New" : "Legacy");
	useEffect(() => {
		const onBackingDataChanged = () => {
			setTreeType(DEBUG.isMigrated() ? "New" : "Legacy");
		};
		model.migratingInventoryList.on("backingDataChanged", onBackingDataChanged);
		return () => {
			model.migratingInventoryList.off("backingDataChanged", onBackingDataChanged);
		};
	}, [model, DEBUG]);

	return (
		<div>
			<h2 style={{ textDecoration: "underline" }}>Debug info</h2>
			<div>
				<div>Currently using: {treeType} SharedTree</div>
				<button onClick={DEBUG.triggerMigration} disabled={DEBUG.isMigrated()}>
					Trigger migration
				</button>
			</div>
		</div>
	);
};
