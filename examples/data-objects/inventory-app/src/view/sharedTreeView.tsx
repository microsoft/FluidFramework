/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { Counter } from "./counter";
import { IInventoryList } from "../inventoryList";

export const SharedTreeView: React.FC<{ inventoryList: IInventoryList }> = ({ inventoryList }) => {
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
