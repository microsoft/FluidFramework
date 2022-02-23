/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IInventoryList } from "./inventoryList";

export const fetchData = async () => {
    const inventoryData =
`Alpha:1
Beta:2
Gamma:3
Delta:4`;
    return inventoryData;
};

export const writeData = async (data: string) => {
    // Write to persisted storage
    console.log("Wrote data:");
    console.log(data);
};

function parseStringData(stringData: string) {
    const itemStrings = stringData.split("\n");
    return itemStrings.map((itemString) => {
        const [itemNameString, itemQuantityString] = itemString.split(":");
        return { name: itemNameString, quantity: parseInt(itemQuantityString, 10) };
    });
}

export const applyStringData = async (inventoryList: IInventoryList, stringData: string) => {
    const parsedInventoryItemData = parseStringData(stringData);
    for (const { name, quantity } of parsedInventoryItemData) {
        inventoryList.addItem(name, quantity);
    }
};

export const extractStringData = async (inventoryList: IInventoryList) => {
    const inventoryItems = inventoryList.getItems();
    const inventoryItemStrings = inventoryItems.map((inventoryItem) => {
        return `${ inventoryItem.name.getText() }:${ inventoryItem.quantity.toString() }`;
    });
    return inventoryItemStrings.join("\n");
};
