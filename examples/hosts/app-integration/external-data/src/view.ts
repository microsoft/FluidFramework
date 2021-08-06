/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@fluid-experimental/react-inputs";

import React from "react";
import ReactDOM from "react-dom";

import { IInventoryList } from "./dataObject";

/**
 * Render an IInventoryList into a given div, with controls to modify it.
 * @param inventoryList - The Data Object to be rendered
 * @param div - The div to render into
 */
export function renderInventoryList(inventoryList: IInventoryList, div: HTMLDivElement) {
    const wrapperDiv = document.createElement("div");
    wrapperDiv.style.textAlign = "center";
    div.append(wrapperDiv);

    const inventoryListDiv = document.createElement("div");

    const reRenderInventoryList = () => {
        inventoryListDiv.innerHTML = "";
        const inventoryItems = inventoryList.getItems();
        for (const item of inventoryItems) {
            const itemDiv = document.createElement("div");
            const nameInputComponent = React.createElement(CollaborativeInput, { sharedString: item.name });
            ReactDOM.render(nameInputComponent, itemDiv);
            inventoryListDiv.append(itemDiv);
        }
    };

    reRenderInventoryList();
    inventoryList.on("itemAdded", reRenderInventoryList);
    inventoryList.on("itemDeleted", reRenderInventoryList);

    wrapperDiv.append(inventoryListDiv);
}
