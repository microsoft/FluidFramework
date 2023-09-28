/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { ISharedTree } from "@fluid-experimental/tree2";
import { HookView } from "./hookView";
import { LegacySharedTreeView } from "./legacySharedTreeView";
import { SharedTreeView } from "./sharedTreeView";
import { IInventoryList } from "../inventoryList";

interface IMainViewProps {
	legacySharedTree: ISharedTree;
	sharedTreeInventoryList: IInventoryList;
	sharedTreeForHook: ISharedTree;
}

export const MainView: React.FC<IMainViewProps> = ({
	legacySharedTree,
	sharedTreeInventoryList,
	sharedTreeForHook,
}) => {
	return (
		<div>
			<h1>Using legacy SharedTree:</h1>
			<LegacySharedTreeView tree={legacySharedTree} />
			<h1>Using SharedTree:</h1>
			<SharedTreeView inventoryList={sharedTreeInventoryList} />
			<h1>Using SharedTree with useTree hook:</h1>
			<HookView tree={sharedTreeForHook} />
		</div>
	);
};
