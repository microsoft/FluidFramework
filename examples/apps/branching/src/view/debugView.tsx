/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import type { IGroceryList } from "../groceryList/index.js";

export interface IDebugViewProps {
	groceryList: IGroceryList;
}

export const DebugView: React.FC<IDebugViewProps> = ({ groceryList }: IDebugViewProps) => {
	return (
		<div>
			<h2 style={{ textDecoration: "underline" }}>Debug info</h2>
		</div>
	);
};
