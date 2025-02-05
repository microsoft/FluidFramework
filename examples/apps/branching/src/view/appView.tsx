/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { type FC, useState } from "react";

import {
	applyDiffToGroceryList,
	diffGroceryListPOJO,
	extractGroceryListPOJO,
	type GroceryListPOJO,
	type GroceryListModifications,
	type IGroceryList,
} from "../groceryList/index.js";
import { NETWORK_askHealthBotForSuggestions } from "../healthBot.js";

import { GroceryListView } from "./groceryListView.js";

export interface IAppViewProps {
	groceryList: IGroceryList;
}

const getSuggestionsFromHealthBot = async (
	groceryList: IGroceryList,
): Promise<GroceryListModifications> => {
	const stringifiedOriginal = extractGroceryListPOJO(groceryList);
	const pojoOriginal: GroceryListPOJO = JSON.parse(stringifiedOriginal);
	const stringifiedSuggestions = await NETWORK_askHealthBotForSuggestions(stringifiedOriginal);
	const pojoSuggestions: GroceryListPOJO = JSON.parse(stringifiedSuggestions);
	const { adds, removals } = diffGroceryListPOJO(pojoOriginal, pojoSuggestions);
	console.log("Suggestions:", pojoSuggestions, "\nAdds:", adds, "\nRemovals:", removals);
	return { adds, removals };
};

export const AppView: FC<IAppViewProps> = ({ groceryList }: IAppViewProps) => {
	const [suggestions, setSuggestions] = useState<GroceryListModifications | undefined>(
		undefined,
	);

	let actions;
	if (suggestions !== undefined) {
		const onAcceptChanges = () => {
			applyDiffToGroceryList(groceryList, suggestions);
			setSuggestions(undefined);
		};
		const onRejectChanges = () => {
			setSuggestions(undefined);
		};
		actions = (
			<>
				<button onClick={onAcceptChanges}>Accept these changes</button>
				<button onClick={onRejectChanges}>Reject these changes</button>
			</>
		);
	} else {
		const onGetSuggestions = () => {
			getSuggestionsFromHealthBot(groceryList).then(setSuggestions).catch(console.error);
		};
		actions = <button onClick={onGetSuggestions}>Get suggestions from HealthBot!</button>;
	}

	return (
		<>
			<h1>Groceries!</h1>
			<GroceryListView groceryList={groceryList} suggestions={suggestions} />
			{actions}
		</>
	);
};
