/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@fluid-example/example-utils";
import React, { useEffect, useRef, useState } from "react";

import type { IInventoryItem, IInventoryList } from "../modelInterfaces.js";

export interface IInventoryItemViewProps {
	inventoryItem: IInventoryItem;
	deleteItem: () => void;
	disabled?: boolean;
}

export const InventoryItemView: React.FC<IInventoryItemViewProps> = (
	props: IInventoryItemViewProps,
) => {
	const { inventoryItem, deleteItem, disabled } = props;
	const quantityRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		const updateFromRemoteQuantity = (): void => {
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

	const inputHandler = (e: React.ChangeEvent<HTMLInputElement>): void => {
		const newValue = Number.parseInt(e.target.value, 10);
		inventoryItem.quantity = newValue;
	};

	return (
		<tr>
			<td>
				<CollaborativeInput
					sharedString={inventoryItem.name}
					style={{ width: "200px" }}
					disabled={disabled}
				></CollaborativeInput>
			</td>
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
				<button onClick={deleteItem} style={{ border: "none", background: "none" }}>
					❌
				</button>
			</td>
		</tr>
	);
};

interface IAddItemViewProps {
	readonly addItem: (name: string, quantity: number) => void;
}

const AddItemView: React.FC<IAddItemViewProps> = (props: IAddItemViewProps) => {
	const { addItem } = props;
	const nameRef = useRef<HTMLInputElement>(null);
	const quantityRef = useRef<HTMLInputElement>(null);

	const onAddItemButtonClick = (): void => {
		if (nameRef.current === null || quantityRef.current === null) {
			throw new Error("Couldn't get the new item info");
		}

		// Extract the values from the inputs and add the new item
		const name = nameRef.current.value;
		const quantityString = quantityRef.current.value;
		const quantity = quantityString === "" ? 0 : Number.parseInt(quantityString, 10);
		addItem(name, quantity);

		// Clear the input form
		nameRef.current.value = "";
		quantityRef.current.value = "";
	};

	return (
		<>
			<tr style={{ borderTop: "3px solid black" }}>
				<td>
					<input ref={nameRef} type="text" placeholder="New item" style={{ width: "200px" }} />
				</td>
				<td>
					<input ref={quantityRef} type="number" placeholder="0" style={{ width: "60px" }} />
				</td>
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
	const { inventoryList, disabled } = props;

	const [inventoryItems, setInventoryItems] = useState<IInventoryItem[]>(
		inventoryList.getItems(),
	);
	useEffect(() => {
		const updateItems = (): void => {
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
		const deleteItem = (): void => inventoryList.deleteItem(inventoryItem.id);
		return (
			<InventoryItemView
				key={inventoryItem.id}
				inventoryItem={inventoryItem}
				deleteItem={deleteItem}
				disabled={disabled}
			/>
		);
	});

	return (
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
				<AddItemView addItem={inventoryList.addItem} />
			</tbody>
		</table>
	);
};
