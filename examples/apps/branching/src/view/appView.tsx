/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { type FC, useState } from "react";

import { NETWORK_askHealthBotForSuggestions } from "../healthBot.js";
import { applyDiffToGroceryList, diffGroceryListJSON } from "../model/index.js";
import type {
	GroceryListJSON,
	GroceryListModifications,
	IGroceryList,
} from "../modelInterfaces.js";

import { GroceryListView } from "./groceryListView.js";

export interface IAppViewProps {
	groceryList: IGroceryList;
}

const getSuggestionsFromHealthBot = async (
	groceryList: IGroceryList,
): Promise<GroceryListModifications> => {
	const stringifiedOriginal = groceryList.exportJSONString();
	const jsonOriginal: GroceryListJSON = JSON.parse(stringifiedOriginal);
	const stringifiedSuggestions = await NETWORK_askHealthBotForSuggestions(stringifiedOriginal);
	const jsonSuggestions: GroceryListJSON = JSON.parse(stringifiedSuggestions);
	const { adds, removals } = diffGroceryListJSON(jsonOriginal, jsonSuggestions);
	console.log("Suggestions:", jsonSuggestions, "\nAdds:", adds, "\nRemovals:", removals);
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
