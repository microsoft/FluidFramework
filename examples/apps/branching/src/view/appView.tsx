/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { type FC, useState } from "react";

import type { IGroceryList, PrivateChanges } from "../container/index.js";

import { GroceryListView } from "./groceryListView.js";

export interface IAppViewProps {
	groceryList: IGroceryList;
	getSuggestions: () => Promise<PrivateChanges>;
}

export const AppView: FC<IAppViewProps> = ({ groceryList, getSuggestions }: IAppViewProps) => {
	const [privateChanges, setPrivateChanges] = useState<PrivateChanges | undefined>(undefined);

	let actions;
	if (privateChanges !== undefined) {
		const onAcceptChanges = () => {
			privateChanges.acceptChanges();
			setPrivateChanges(undefined);
		};
		const onRejectChanges = () => {
			privateChanges.rejectChanges();
			setPrivateChanges(undefined);
		};
		actions = (
			<>
				<button onClick={onAcceptChanges}>Accept these changes</button>
				<button onClick={onRejectChanges}>Reject these changes</button>
			</>
		);
	} else {
		const onGetSuggestions = () => {
			getSuggestions().then(setPrivateChanges).catch(console.error);
		};
		actions = <button onClick={onGetSuggestions}>Get suggestions from HealthBot!</button>;
	}

	return (
		<>
			<h1>Groceries!</h1>
			<GroceryListView groceryList={groceryList} suggestions={privateChanges?.changes} />
			{actions}
		</>
	);
};
