/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@fluid-experimental/react-inputs";

import React, { useEffect, useRef, useState } from "react";

import type { IInventoryItem, IInventoryList } from "./interfaces";

export interface IInventoryItemViewProps {
    inventoryItem: IInventoryItem;
    disabled?: boolean;
}

export const InventoryItemView: React.FC<IInventoryItemViewProps> = (props: IInventoryItemViewProps) => {
    const { inventoryItem, disabled } = props;
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
        <div>
            <CollaborativeInput
                sharedString={ inventoryItem.name }
                style={{ width: "200px" }}
                // disabled={ disabled }
            ></CollaborativeInput>
            <input
                ref={ quantityRef }
                onInput={ inputHandler }
                type="number"
                style={{ width: "50px" }}
                disabled={ disabled }
            ></input>
        </div>
    );
};

export interface IInventoryListViewProps {
    inventoryList: IInventoryList;
    disabled?: boolean;
}

export const InventoryListView: React.FC<IInventoryListViewProps> = (props: IInventoryListViewProps) => {
    const { inventoryList, disabled } = props;

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
        <InventoryItemView key={ inventoryItem.id } inventoryItem={ inventoryItem } disabled={ disabled } />
    ));

    return (
        <div style={{ textAlign: "center", whiteSpace: "nowrap" }}>
            { inventoryItemViews }
        </div>
    );
};
