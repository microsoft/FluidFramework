/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { FC, useEffect, useRef, useState } from "react";

import { IGroceryItem, IGroceryList } from "../modelInterfaces.js";

export interface IInventoryItemViewProps {
	inventoryItem: IGroceryItem;
	disabled?: boolean;
}

export const InventoryItemView: FC<IInventoryItemViewProps> = ({
	inventoryItem,
	disabled,
}: IInventoryItemViewProps) => {
	return (
		<tr>
			<td>{inventoryItem.name}</td>
			<td>
				<button
					onClick={inventoryItem.deleteItem}
					style={{ border: "none", background: "none" }}
					disabled={disabled}
				>
					❌
				</button>
			</td>
		</tr>
	);
};

interface IAddItemViewProps {
	readonly addItem: (name: string) => void;
	disabled?: boolean;
}

const AddItemView: FC<IAddItemViewProps> = ({ addItem, disabled }: IAddItemViewProps) => {
	const nameRef = useRef<HTMLInputElement>(null);

	const onAddItemButtonClick = () => {
		if (nameRef.current === null) {
			throw new Error("Couldn't get the new item info");
		}

		// Extract the values from the inputs and add the new item
		const name = nameRef.current.value;
		addItem(name);

		// Clear the input form
		nameRef.current.value = "";
	};

	return (
		<>
			<tr style={{ borderTop: "3px solid black" }}>
				<td>
					<input
						ref={nameRef}
						type="text"
						placeholder="New item"
						style={{ width: "200px" }}
						disabled={disabled}
					/>
				</td>
			</tr>
			<tr>
				<td colSpan={2}>
					<button style={{ width: "100%" }} onClick={onAddItemButtonClick} disabled={disabled}>
						Add new item
					</button>
				</td>
			</tr>
		</>
	);
};

export interface IInventoryListViewProps {
	inventoryList: IGroceryList;
	disabled?: boolean;
}

export const InventoryListView: FC<IInventoryListViewProps> = ({
	inventoryList,
	disabled,
}: IInventoryListViewProps) => {
	const [inventoryItems, setInventoryItems] = useState<IGroceryItem[]>(
		inventoryList.getItems(),
	);
	useEffect(() => {
		const updateItems = () => {
			// TODO: This blows away all the inventory items, making the granular add/delete events
			// not so useful.  Is there a good way to make a more granular change?
			setInventoryItems(inventoryList.getItems());
		};
		inventoryList.on("itemAdded", updateItems);
		inventoryList.on("itemDeleted", updateItems);

		return () => {
			inventoryList.off("itemAdded", updateItems);
			inventoryList.off("itemDeleted", updateItems);
		};
	}, [inventoryList]);

	const inventoryItemViews = inventoryItems.map((inventoryItem) => {
		return (
			<InventoryItemView
				key={inventoryItem.id}
				inventoryItem={inventoryItem}
				disabled={disabled}
			/>
		);
	});

	return (
		<table style={{ margin: "0 auto", textAlign: "left", borderCollapse: "collapse" }}>
			<thead>
				<tr>
					<th>Inventory item</th>
				</tr>
			</thead>
			<tbody>
				{inventoryItemViews.length > 0 ? (
					inventoryItemViews
				) : (
					<tr>
						<td colSpan={1}>No items in inventory</td>
					</tr>
				)}
				<AddItemView addItem={inventoryList.addItem} disabled={disabled} />
			</tbody>
		</table>
	);
};
