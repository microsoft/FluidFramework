/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import ReactDOM from "react-dom";

import _ from "lodash";
import { IDataCreationOptions, IInspectorRow, fetchRegisteredTemplates,
    InspectorTable, IInspectorTableProps, handlePropertyDataCreation, ModalManager, ModalRoot,
} from "@fluid-experimental/property-inspector-table";

import { SharedPropertyTree } from "@fluid-experimental/property-dds";
import { PropertyProxy } from "@fluid-experimental/property-proxy";
import { DataBinder } from "@fluid-experimental/property-binder";
import { SquaresApp, randomSquaresBoardGenerator, moveSquares } from "./demo/squaresApp";

import { IPropertyTree } from "./dataObject";

/**
 * Render an IDiceRoller into a given div as a text character, with a button to roll it.
 * @param diceRoller - The Data Object to be rendered
 * @param div - The div to render into
 */
export function renderButtons(propertyTree: IPropertyTree, div: HTMLDivElement) {
    const wrapperDiv = document.createElement("div");
    const buttons = div.children[0]! as HTMLDivElement;
    const tableDiv = document.createElement("div");
    wrapperDiv.append(tableDiv);

    const squaresInput = document.createElement("input");
    squaresInput.type = "number";
    squaresInput.defaultValue = "20";
    squaresInput.style.fontSize = "15px";
    squaresInput.style.width = "50px";
    buttons.append(squaresInput);

    const randomButton = document.createElement("button");
    randomButton.style.fontSize = "15px";
    randomButton.id = "random";
    randomButton.textContent = "Create Random Board";
    randomButton.addEventListener("click", () => {
        randomSquaresBoardGenerator(propertyTree.pset, squaresInput.value as any);
        squaresInput.value = "20";
    });
    buttons.append(randomButton);

    const commitButton = document.createElement("button");
    commitButton.id = "commit";
    commitButton.style.fontSize = "15px";
    commitButton.textContent = "Commit";
    commitButton.addEventListener("click", () => {
        propertyTree.commit();
    });
    buttons.append(commitButton);
}

export const renderMoveButton = function(propertyTree: SharedPropertyTree, content: HTMLElement, guid: string) {
    const moveBtn = document.createElement("button");
    moveBtn.style.fontSize = "15px";
    let isMoving = false;
    let intervalID: number;
    moveBtn.textContent = "Move";
    moveBtn.addEventListener("click", () => {
        if (!isMoving) {
            intervalID = moveSquares(propertyTree.root, guid);
            moveBtn.textContent = "Stop";
            isMoving = true;
        } else {
            clearInterval(intervalID);
            isMoving = false;
            moveBtn.textContent = "Move";
        }
    });

    content.appendChild(moveBtn);
};

export const handlePropertyDataCreationOptionGeneration =
    (rowData: IInspectorRow, nameOnly: boolean): IDataCreationOptions => {
    if (nameOnly) {
        return { name: "property" };
    }
    const templates = fetchRegisteredTemplates();
    return { name: "property", options: templates };
};

const tableProps: Partial<IInspectorTableProps> = {
    columns: ["name", "value", "type"],
    dataCreationHandler: handlePropertyDataCreation,
    dataCreationOptionGenerationHandler: handlePropertyDataCreationOptionGeneration,
    expandColumnKey: "name",
    width: 1000,
    height: 600,
};

export function renderApp(propertyTree: IPropertyTree, content: HTMLDivElement): DataBinder {
    // Creating a DataBinder instance.
    const dataBinder = new DataBinder();

    const div = content.children[1] as HTMLDivElement; // Board div

    // We create the squares demo app.
    const squaresApp = new SquaresApp(dataBinder, div, propertyTree);
    squaresApp.init();

    // Attaching DataBinder to a PropertyTree instance in order to start listening to changes.
    dataBinder.attachTo(propertyTree.tree);

    // Rendering buttons
    renderButtons(propertyTree, content);

    return dataBinder;
}

export function renderInspector(dataBinder: DataBinder, propertyTree: IPropertyTree) {
    // Listening to any change the root path of the PropertyDDS, and rendering the latest state of the
    // inspector tree-table.
    dataBinder.registerOnPath("/", ["insert", "remove", "modify"], _.debounce(() => {
        // Create an ES6 proxy for the DDS, this enables JS object interface for interacting with the DDS.
        // Note: This is what currently inspector table expect for "data" prop.
        const proxifiedDDS = PropertyProxy.proxify(propertyTree.pset);
        ReactDOM.render(
            <ModalManager>
                <ModalRoot />
                <InspectorTable data={proxifiedDDS} {...tableProps} />
            </ModalManager>,
            document.getElementById("root"));
    }, 20));
}
