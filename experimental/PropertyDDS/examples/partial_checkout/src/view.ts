/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPropertyTree, PropertyTree } from "./dataObject";
// @ts-ignore
import _ from "lodash";
import { IDataCreationOptions, IInspectorRow, fetchRegisteredTemplates } from '@fluid-experimental/property-inspector-table';
import { randomSquaresBoardGenerator, moveSquares } from "./demo/squaresApp";
// @ts-ignore
import { PropertyFactory } from "@fluid-experimental/property-properties";
// @ts-ignore
import { TypeIdHelper } from "@fluid-experimental/property-changeset"

/**
 * Render an IDiceRoller into a given div as a text character, with a button to roll it.
 * @param diceRoller - The Data Object to be rendered
 * @param div - The div to render into
 */
export function renderButtons(propertyTree: IPropertyTree, div: HTMLDivElement) {
    const wrapperDiv = document.createElement("div");
    const buttons = document.getElementById('buttons')!;
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
    randomButton.textContent = "Create Random Board";
    randomButton.addEventListener("click", () => {
        randomSquaresBoardGenerator(propertyTree.pset, squaresInput.value as any)
        squaresInput.value = '20';
    });
    buttons.append(randomButton);

    const commitButton = document.createElement("button");
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
