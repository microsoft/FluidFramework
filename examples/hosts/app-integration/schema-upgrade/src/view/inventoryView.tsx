/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@fluid-experimental/react-inputs";

import React, { useEffect, useRef, useState } from "react";

import type { IInventoryItem, IInventoryList } from "../modelInterfaces";

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
        <tr>
            <td>
                <CollaborativeInput
                    sharedString={ inventoryItem.name }
                    style={{ width: "200px" }}
                    disabled={ disabled }
                ></CollaborativeInput>
            </td>
            <td>
                <input
                    ref={ quantityRef }
                    onInput={ inputHandler }
                    type="number"
                    style={{ width: "60px" }}
                    disabled={ disabled }
                ></input>
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

    const onAddItemButtonClick = () => {
        const name = nameRef.current?.value;
        const quantity = quantityRef.current?.value;
        if (name === undefined || quantity === undefined) {
            throw new Error("Couldn't get the new item info");
        }
        addItem(name, parseInt(quantity, 10));
    };

    return (
        <>
            <tr style={{ borderTop: "3px solid black" }}>
                <td>
                    <input
                        ref={ nameRef }
                        type="text"
                        placeholder="New item"
                        style={{ width: "200px" }}
                    />
                </td>
                <td>
                    <input
                        ref={ quantityRef }
                        type="number"
                        placeholder="0"
                        style={{ width: "60px" }}
                    />
                </td>
            </tr>
            <tr>
                <td colSpan={ 2 }>
                    <button style={{ width: "100%" }} onClick={ onAddItemButtonClick }>Add new item</button>
                </td>
            </tr>
        </>
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
        <table style={{ margin: "0 auto", textAlign: "left", borderCollapse: "collapse" }}>
            <thead>
                <tr>
                    <th>Inventory item</th>
                    <th>Quantity</th>
                </tr>
            </thead>
            <tbody>
                {
                    inventoryItemViews.length > 0
                    ? inventoryItemViews
                    : <tr><td colSpan={ 2 }>No items in inventory</td></tr>
                }
                <AddItemView addItem={ inventoryList.addItem } />
            </tbody>
        </table>
    );
};
