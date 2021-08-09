/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@fluid-experimental/react-inputs";

import React, { useEffect, useRef, useState } from "react";

import { IInventoryItem, IInventoryList } from "./dataObject";

export interface IInventoryItemViewProps {
    inventoryItem: IInventoryItem;
}

export const InventoryItemView: React.FC<IInventoryItemViewProps> = (props: IInventoryItemViewProps) => {
    const { inventoryItem } = props;

    // eslint-disable-next-line no-null/no-null
    const quantityRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        const updateFromRemoteQuantity = () => {
            // eslint-disable-next-line no-null/no-null
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
        <div>
            <CollaborativeInput
                sharedString={ inventoryItem.name }
                style={{ width: "200px" }}
            ></CollaborativeInput>
            <input
                ref={ quantityRef }
                onInput={ inputHandler }
                type="number"
                style={{ width: "50px" }}
            ></input>
        </div>
    );
};

export interface IInventoryListViewProps {
    inventoryList: IInventoryList;
}

export const InventoryListView: React.FC<IInventoryListViewProps> = (props: IInventoryListViewProps) => {
    const { inventoryList } = props;

    const [inventoryItems, setInventoryItems] = useState<IInventoryItem[]>(inventoryList.getItems());
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

    const inventoryItemViews = inventoryItems.map((inventoryItem) => (
        <InventoryItemView key={ inventoryItem.id } inventoryItem={ inventoryItem } />
    ));

    return (
        <div style={{ textAlign: "center", whiteSpace: "nowrap" }}>
            { inventoryItemViews }
        </div>
    );
};
