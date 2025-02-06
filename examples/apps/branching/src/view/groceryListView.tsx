/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { FC, useEffect, useRef, useState } from "react";

import type { IGroceryItem, IGroceryList, GroceryListChanges } from "../container/index.js";

export interface IGroceryItemViewProps {
	groceryItem: IGroceryItem;
	suggestRemoval: boolean;
}

export const GroceryItemView: FC<IGroceryItemViewProps> = ({
	groceryItem,
	suggestRemoval,
}: IGroceryItemViewProps) => {
	return (
		<tr style={suggestRemoval ? { backgroundColor: "#fcc" } : undefined}>
			<td>{groceryItem.name}</td>
			<td>
				<button
					onClick={groceryItem.removeItem}
					style={{ border: "none", background: "none" }}
				>
					❌
				</button>
			</td>
		</tr>
	);
};

export interface ISuggestedGroceryItemViewProps {
	name: string;
}

export const SuggestedGroceryItemView: FC<ISuggestedGroceryItemViewProps> = ({
	name,
}: ISuggestedGroceryItemViewProps) => {
	return (
		<tr>
			<td style={{ backgroundColor: "#cfc" }}>{name}</td>
		</tr>
	);
};

interface IAddItemViewProps {
	readonly addItem: (name: string) => void;
}

const AddItemView: FC<IAddItemViewProps> = ({ addItem }: IAddItemViewProps) => {
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
					<input ref={nameRef} type="text" placeholder="New item" style={{ width: "200px" }} />
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

export interface IGroceryListViewProps {
	groceryList: IGroceryList;
	suggestions?: GroceryListChanges | undefined;
}

export const GroceryListView: FC<IGroceryListViewProps> = ({
	groceryList,
	suggestions,
}: IGroceryListViewProps) => {
	const [groceryItems, setGroceryItems] = useState<IGroceryItem[]>(groceryList.getItems());
	useEffect(() => {
		const updateItems = () => {
			// TODO: This blows away all the grocery items, making the granular add/delete events
			// not so useful.  Is there a good way to make a more granular change?
			setGroceryItems(groceryList.getItems());
		};
		groceryList.events.on("itemAdded", updateItems);
		groceryList.events.on("itemRemoved", updateItems);

		return () => {
			groceryList.events.off("itemAdded", updateItems);
			groceryList.events.off("itemRemoved", updateItems);
		};
	}, [groceryList]);

	const groceryItemViews = groceryItems.map((groceryItem) => {
		const augmentedGroceryItem: IGroceryItem = {
			id: groceryItem.id,
			name: groceryItem.name,
			removeItem: () => {
				if (suggestions !== undefined) {
					suggestions.removals.push({
						id: groceryItem.id,
						name: groceryItem.name,
					});
				} else {
					groceryItem.removeItem();
				}
			},
		};
		const suggestRemoval =
			suggestions?.removals.find((removal) => removal.id === augmentedGroceryItem.id) !==
			undefined;
		return (
			<GroceryItemView
				key={augmentedGroceryItem.id}
				groceryItem={augmentedGroceryItem}
				suggestRemoval={suggestRemoval}
			/>
		);
	});
	const suggestedGroceryItemViews =
		suggestions?.adds.map((add, index) => (
			<SuggestedGroceryItemView key={index} name={add.name} />
		)) ?? [];

	const onAddItem = (name: string) => {
		if (suggestions !== undefined) {
			suggestions.adds.push({
				id: "newItem",
				name,
			});
		} else {
			groceryList.addItem(name);
		}
	};

	return (
		<table style={{ margin: "0 auto", textAlign: "left", borderCollapse: "collapse" }}>
			<tbody>
				{groceryItemViews}
				{suggestedGroceryItemViews}
				{groceryItemViews.length === 0 && suggestedGroceryItemViews.length === 0 && (
					<tr>
						<td colSpan={1}>No items on grocery list</td>
					</tr>
				)}
				<AddItemView addItem={onAddItem} />
			</tbody>
		</table>
	);
};
