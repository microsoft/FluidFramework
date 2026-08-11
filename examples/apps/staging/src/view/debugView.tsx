/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FC } from "react";

import type { ISuggestionGroceryList } from "../container/index.js";

export interface IDebugViewProps {
	groceryList: ISuggestionGroceryList;
}

export const DebugView: FC<IDebugViewProps> = ({ groceryList }: IDebugViewProps) => {
	return (
		<div>
			<h2 style={{ textDecoration: "underline" }}>Debug info</h2>
		</div>
	);
};
