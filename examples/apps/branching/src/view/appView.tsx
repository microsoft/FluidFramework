/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { FC, useState } from "react";

import { askHealthBotForSuggestions } from "../healthBot.js";
import { IGroceryList } from "../modelInterfaces.js";

import { GroceryListView } from "./groceryListView.js";

export interface IAppViewProps {
	groceryList: IGroceryList;
}

const getBranchedSuggestionsFromHealthBot = async (groceryList: IGroceryList) => {
	const branchedGroceryList = await groceryList.branch();
	await askHealthBotForSuggestions(branchedGroceryList);
	return branchedGroceryList;
};

export const AppView: FC<IAppViewProps> = ({ groceryList }: IAppViewProps) => {
	const [branchedList, setBranchedList] = useState<IGroceryList | undefined>(undefined);
	let branchedView;
	if (branchedList !== undefined) {
		branchedView = (
			<div style={{ backgroundColor: "#ddd" }}>
				<h2>Suggested changes:</h2>
				<GroceryListView groceryList={branchedList} />
				<button>Accept these changes</button>
			</div>
		);
	} else {
		const onGetSuggestions = () => {
			getBranchedSuggestionsFromHealthBot(groceryList)
				.then(setBranchedList)
				.catch(console.error);
		};
		branchedView = <button onClick={onGetSuggestions}>Get suggestions from HealthBot!</button>;
	}
	return (
		<>
			<h1>Groceries!</h1>
			<GroceryListView groceryList={groceryList} />
			{branchedView}
		</>
	);
};
