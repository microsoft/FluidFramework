/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";

import type { IInventoryItem, IInventoryList } from "../modelInterfaces";

export interface IInventoryItemViewProps {
	inventoryItem: IInventoryItem;
	deleteItem: () => void;
	disabled?: boolean;
}

interface IAddItemViewProps {
	readonly addItem: (name: string, quantity: number) => void;
	readonly addTree: () => string;
}

const AddItemView: React.FC<IAddItemViewProps> = (props: IAddItemViewProps) => {
	const { addItem, addTree } = props;
	const tree = addTree();

	const onAddItemButtonClick = () => {
		addItem("name", 0);
	};

	return (
		<>
			<tr style={{ borderTop: "3px solid black" }}>
				<td>{tree}</td>
			</tr>
			<tr>
				<td colSpan={2}>
					<button style={{ width: "100%" }} onClick={onAddItemButtonClick}>
						Add new item
					</button>
				</td>
			</tr>
		</>
	);
};

export interface IInventoryListViewProps {
	inventoryList: IInventoryList;
	disabled?: boolean;
}

export const InventoryListView: React.FC<IInventoryListViewProps> = (
	props: IInventoryListViewProps,
) => {
	const { inventoryList } = props;

	const [inventoryItems, setInventoryItems] = useState<IInventoryItem[]>(
		inventoryList.getItems(),
	);
	useEffect(() => {
		const updateItems = () => {
			setInventoryItems(inventoryList.getItems());
		};
		inventoryList.on("itemAdded", updateItems);
		inventoryList.on("itemDeleted", updateItems);

		return () => {
			inventoryList.off("itemAdded", updateItems);
			inventoryList.off("itemDeleted", updateItems);
		};
	}, [inventoryList]);

	console.log(inventoryItems);

	return (
		<table style={{ margin: "0 auto", textAlign: "left", borderCollapse: "collapse" }}>
			<thead>
				<tr>
					<th>Tree in string form</th>
				</tr>
			</thead>
			<tbody>
				<AddItemView addItem={inventoryList.addItem} addTree={inventoryList.getTreeView} />
			</tbody>
		</table>
	);
};
