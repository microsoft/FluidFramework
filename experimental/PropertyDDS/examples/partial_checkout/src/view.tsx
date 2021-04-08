/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import React from 'react';
import ReactDOM from 'react-dom';

import { IPropertyTree, PropertyTree } from "./dataObject";
// @ts-ignore
import _ from "lodash";
import { IDataCreationOptions, IInspectorRow, fetchRegisteredTemplates } from '@fluid-experimental/property-inspector-table';
import { randomSquaresBoardGenerator, moveSquares } from "./demo/squaresApp";
// @ts-ignore
import { PropertyFactory } from "@fluid-experimental/property-properties";
// @ts-ignore
import { TypeIdHelper } from "@fluid-experimental/property-changeset"

import { SquaresApp } from "./demo/squaresApp";

import {
    InspectorTable, IInspectorTableProps, handlePropertyDataCreation, ModalManager, ModalRoot
} from '@fluid-experimental/property-inspector-table';
import { PropertyProxy } from '@fluid-experimental/property-proxy';
import { FluidBinder } from '@fluid-experimental/property-binder';



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
    squaresInput.type = 'number';
    squaresInput.defaultValue = '20';
    squaresInput.style.fontSize = "15px";
    squaresInput.style.width = "50px";
    buttons.append(squaresInput);


    const randomButton = document.createElement("button");
    randomButton.style.fontSize = "15px";
    randomButton.id = "random";
    randomButton.textContent = "Create Random Board";
    randomButton.addEventListener("click", () => {
        randomSquaresBoardGenerator(propertyTree.pset, squaresInput.value as any)
        squaresInput.value = '20';
    });
    buttons.append(randomButton);

    const commitButton = document.createElement("button");
    commitButton.id  = 'commit';
    commitButton.style.fontSize = "15px";
    commitButton.textContent = "Commit";
    commitButton.addEventListener("click", () => {
        propertyTree.commit();
    });
    buttons.append(commitButton);

}

export const renderMoveButton = function(propertyTree: PropertyTree, content: HTMLElement, guid: string) {
    const moveBtn = document.createElement("button");
    moveBtn.style.fontSize = "15px";
    let isMoving = false;
    let intervalID: number;
    moveBtn.textContent = "Move";
    moveBtn.addEventListener("click", () => {
        if (!isMoving) {
            intervalID = moveSquares(propertyTree.pset, guid);
            moveBtn.textContent = "Stop";
            isMoving = true;
        } else {
            clearInterval(intervalID);
            isMoving = false;
            moveBtn.textContent = "Move";
        }
    });

    content.appendChild(moveBtn);
}

export const handlePropertyDataCreationOptionGeneration = (rowData: IInspectorRow, nameOnly: boolean): IDataCreationOptions => {

    if (nameOnly) {
        return { name: 'property' };
    }
    const templates = fetchRegisteredTemplates();
    return { name: 'property', options: templates };
};

const tableProps: Partial<IInspectorTableProps> = {
    columns: ['name', 'value', 'type'],
    dataCreationHandler: handlePropertyDataCreation,
    dataCreationOptionGenerationHandler: handlePropertyDataCreationOptionGeneration,
    expandColumnKey: 'name',
    width: 1000,
    height: 600
};

export function renderApp(propertyTree: IPropertyTree, content: HTMLDivElement): FluidBinder {
    // Creating a FluidBinder instance.
    const fluidBinder = new FluidBinder();

    const div = content.children[1] as HTMLDivElement; // Board div

    // We create the squares demo app.
    const squaresApp = new SquaresApp(fluidBinder, div, propertyTree);
    squaresApp.init();

    // Attaching FluidBinder to a PropertyTree instance in order to start listening to changes.
    fluidBinder.attachTo(propertyTree);

    // Rendering buttons
    renderButtons(propertyTree, content);

    return fluidBinder;
}

export function renderInspector(fluidBinder: FluidBinder, propertyTree: IPropertyTree) {

    // Listening to any change the root path of the PropertyDDS, and rendering the latest state of the
    // inspector tree-table.
    fluidBinder.registerOnPath('/', ['insert', 'remove', 'modify'], _.debounce(() => {
        // Create an ES6 proxy for the DDS, this enables JS object interface for interacting with the DDS.
        // Note: This is what currently inspector table expect for "data" prop.
        const proxifiedDDS = PropertyProxy.proxify(propertyTree.pset);
        ReactDOM.render(
            <ModalManager>
                <ModalRoot />
                <InspectorTable data={proxifiedDDS} {...tableProps} />
            </ModalManager>,
            document.getElementById('root'));
    }, 20));
}

