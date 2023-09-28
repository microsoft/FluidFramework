/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { IInventoryList } from "../interfaces";
import { Counter } from "./counter";

export const InventoryListView: React.FC<{ inventoryList: IInventoryList }> = ({
	inventoryList,
}) => {
	const [parts, setParts] = React.useState(inventoryList.getParts());
	React.useEffect(() => {
		const updateParts = () => setParts(inventoryList.getParts());
		inventoryList.on("inventoryChanged", updateParts);
		return () => {
			inventoryList.off("inventoryChanged", updateParts);
		};
	}, [inventoryList]);

	const counters: JSX.Element[] = [];

	for (const part of parts) {
		counters.push(
			<Counter
				key={part.name}
				title={part.name}
				count={part.quantity}
				onDecrement={part.decrement}
				onIncrement={part.increment}
			></Counter>,
		);
	}

	return (
		<div>
			<h1>Inventory:</h1>
			{counters}
		</div>
	);
};
