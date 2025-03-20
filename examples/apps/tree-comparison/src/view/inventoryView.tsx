/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { FC, useEffect, useRef, useState } from "react";

import { IInventoryItem, IInventoryList } from "../modelInterfaces.js";

export interface IInventoryItemViewProps {
	inventoryItem: IInventoryItem;
	disabled?: boolean;
}

export const InventoryItemView: FC<IInventoryItemViewProps> = ({
	inventoryItem,
	disabled,
}: IInventoryItemViewProps) => {
	const quantityRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		const updateFromRemoteQuantity = () => {
			if (quantityRef.current !== null) {
				quantityRef.current.value = inventoryItem.quantity.toString();
			}
		};
		inventoryItem.on("quantityChanged", updateFromRemoteQuantity);
		updateFromRemoteQuantity();
		return () => {
			inventoryItem.off("quantityChanged", updateFromRemoteQuantity);
		};
	}, [inventoryItem]);

	const inputHandler = (e) => {
		const newValue = parseInt(e.target.value, 10);
		inventoryItem.quantity = newValue;
	};

	return (
		<tr>
			<td>{inventoryItem.name}</td>
			<td>
				<input
					ref={quantityRef}
					onInput={inputHandler}
					type="number"
					style={{ width: "60px" }}
					disabled={disabled}
				></input>
			</td>
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
	readonly addItem: (name: string, quantity: number) => void;
	disabled?: boolean;
}

const AddItemView: FC<IAddItemViewProps> = ({ addItem, disabled }: IAddItemViewProps) => {
	const nameRef = useRef<HTMLInputElement>(null);
	const quantityRef = useRef<HTMLInputElement>(null);

	const onAddItemButtonClick = () => {
		if (nameRef.current === null || quantityRef.current === null) {
			throw new Error("Couldn't get the new item info");
		}

		// Extract the values from the inputs and add the new item
		const name = nameRef.current.value;
		const quantityString = quantityRef.current.value;
		const quantity = quantityString !== "" ? parseInt(quantityString, 10) : 0;
		addItem(name, quantity);

		// Clear the input form
		nameRef.current.value = "";
		quantityRef.current.value = "";
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
				<td>
					<input
						ref={quantityRef}
						type="number"
						placeholder="0"
						style={{ width: "60px" }}
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
	inventoryList: IInventoryList;
	disabled?: boolean;
}

export const InventoryListView: FC<IInventoryListViewProps> = ({
	inventoryList,
	disabled,
}: IInventoryListViewProps) => {
	const [inventoryItems, setInventoryItems] = useState<IInventoryItem[]>(
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
		<div>
			<h1>Using {inventoryList.isNewTree ? "new" : "legacy"} SharedTree</h1>
			<table style={{ margin: "0 auto", textAlign: "left", borderCollapse: "collapse" }}>
				<thead>
					<tr>
						<th>Inventory item</th>
						<th>Quantity</th>
					</tr>
				</thead>
				<tbody>
					{inventoryItemViews.length > 0 ? (
						inventoryItemViews
					) : (
						<tr>
							<td colSpan={2}>No items in inventory</td>
						</tr>
					)}
					<AddItemView addItem={inventoryList.addItem} disabled={disabled} />
				</tbody>
			</table>
		</div>
	);
};
