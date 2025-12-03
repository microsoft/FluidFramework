/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { type FC, useEffect, useState } from "react";

import type { ISuggestionGroceryList } from "../container/index.js";

import { GroceryListView } from "./groceryListView.js";

export interface IAppViewProps {
	groceryList: ISuggestionGroceryList;
}

export const AppView: FC<IAppViewProps> = ({ groceryList }: IAppViewProps) => {
	const [inStagingMode, setInStagingMode] = useState<boolean>(groceryList.inStagingMode);

	useEffect(() => {
		const handleStagingModeChanged = () => {
			setInStagingMode(groceryList.inStagingMode);
		};
		groceryList.events.on("enterStagingMode", handleStagingModeChanged);
		groceryList.events.on("leaveStagingMode", handleStagingModeChanged);
		return () => {
			groceryList.events.off("enterStagingMode", handleStagingModeChanged);
			groceryList.events.off("leaveStagingMode", handleStagingModeChanged);
		};
	}, [groceryList]);

	let actions;
	if (inStagingMode) {
		const onAcceptChanges = () => {
			groceryList.acceptSuggestions();
		};
		const onRejectChanges = () => {
			groceryList.rejectSuggestions();
		};
		actions = (
			<>
				<button onClick={onAcceptChanges}>Accept these changes</button>
				<button onClick={onRejectChanges}>Reject these changes</button>
			</>
		);
	} else {
		actions = (
			<button onClick={groceryList.getSuggestions}>Get suggestions from HealthBot!</button>
		);
	}

	return (
		<>
			<h1>Groceries!</h1>
			<GroceryListView groceryList={groceryList} />
			{actions}
		</>
	);
};
