/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { FC, useEffect, useRef, useState } from "react";

import type { ISuggestionGroceryList, ISuggestionGroceryItem } from "../container/index.js";

interface IGroceryItemViewProps {
	groceryItem: ISuggestionGroceryItem;
}

const GroceryItemView: FC<IGroceryItemViewProps> = ({
	groceryItem,
}: IGroceryItemViewProps) => {
	const backgroundColor =
		groceryItem.suggestion === "add"
			? "#cfc"
			: groceryItem.suggestion === "remove"
				? "#fcc"
				: undefined;

	const action =
		groceryItem.suggestion === "remove" ? (
			<button
				onClick={groceryItem.rejectRemovalSuggestion}
				style={{ border: "none", background: "none" }}
			>
				↩️
			</button>
		) : (
			<button onClick={groceryItem.removeItem} style={{ border: "none", background: "none" }}>
				❌
			</button>
		);
	return (
		<tr style={backgroundColor !== undefined ? { backgroundColor } : undefined}>
			<td>{groceryItem.name}</td>
			<td>{action}</td>
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
	groceryList: ISuggestionGroceryList;
}

export const GroceryListView: FC<IGroceryListViewProps> = ({
	groceryList,
}: IGroceryListViewProps) => {
	const [groceryItems, setGroceryItems] = useState<ISuggestionGroceryItem[]>(
		groceryList.getItems(),
	);
	useEffect(() => {
		const updateItems = () => {
			// TODO: This blows away all the grocery items, making the granular add/delete events
			// not so useful.  Is there a good way to make a more granular change?
			setGroceryItems(groceryList.getItems());
		};
		groceryList.events.on("itemAdded", updateItems);
		groceryList.events.on("itemRemoved", updateItems);
		groceryList.events.on("itemSuggestionChanged", updateItems);

		return () => {
			groceryList.events.off("itemAdded", updateItems);
			groceryList.events.off("itemRemoved", updateItems);
			groceryList.events.off("itemSuggestionChanged", updateItems);
		};
	}, [groceryList]);

	// This should already be sorted, but adding it here too in case I want to do something fancy later
	// regarding more granular updates as noted in the above TODO.
	const groceryItemViews = groceryItems
		.sort((a, b) => a.id.localeCompare(b.id, "en", { sensitivity: "base" }))
		.map((groceryItem) => <GroceryItemView key={groceryItem.id} groceryItem={groceryItem} />);

	return (
		<table style={{ margin: "0 auto", textAlign: "left", borderCollapse: "collapse" }}>
			<tbody>
				{groceryItemViews}
				{groceryItemViews.length === 0 && (
					<tr>
						<td colSpan={1}>No items on grocery list</td>
					</tr>
				)}
				<AddItemView addItem={groceryList.addItem} />
			</tbody>
		</table>
	);
};
