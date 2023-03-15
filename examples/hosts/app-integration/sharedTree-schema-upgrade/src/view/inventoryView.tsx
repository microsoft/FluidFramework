/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import type { IInventoryItem, IInventoryList } from "../modelInterfaces";

export interface IInventoryItemViewProps {
	inventoryItem: IInventoryItem;
	deleteItem: () => void;
	disabled?: boolean;
}

interface IAddItemViewProps {
	readonly addItem: (name: string, quantity: number) => void;
}

const AddItemView: React.FC<IAddItemViewProps> = (props: IAddItemViewProps) => {
	const { addItem } = props;

	const onAddItemButtonClick = () => {
		addItem("name", 0);
	};

	return (
		<>
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
	const treeView = inventoryList.getTreeView();
	const treeViewList = treeViewToHtmlList(treeView);
	console.log(treeViewList);
	return (
		<table style={{ margin: "0 auto", textAlign: "left", borderCollapse: "collapse" }}>
			<thead>
				<tr>
					<th>{JSON.stringify(treeView)}</th>
				</tr>
			</thead>
			<tbody>
				<AddItemView addItem={inventoryList.addItem} />
			</tbody>
		</table>
	);
};

function treeViewToHtmlList(json) {
	return treeViewObjectToHtmlList(JSON.parse(json));
}

function treeViewObjectToHtmlList(obj) {
	if (obj instanceof Array) {
		const ol = document.createElement("ol");
		// eslint-disable-next-line @typescript-eslint/no-for-in-array, guard-for-in, no-restricted-syntax, no-var
		for (var child in obj) {
			// eslint-disable-next-line no-var
			var li = document.createElement("li");
			li.appendChild(treeViewObjectToHtmlList(obj[child]));
			ol.appendChild(li);
		}
		return ol;
	} else if (obj instanceof Object && !(obj instanceof String)) {
		const ul = document.createElement("ul");
		// eslint-disable-next-line guard-for-in, no-restricted-syntax, no-var
		for (var child in obj) {
			// eslint-disable-next-line no-var
			var li = document.createElement("li");
			li.appendChild(document.createTextNode(`${child}: `));
			li.appendChild(treeViewObjectToHtmlList(obj[child]));
			ul.appendChild(li);
		}
		return ul;
	} else {
		return document.createTextNode(obj);
	}
}
