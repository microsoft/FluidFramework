/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@fluid-experimental/react-inputs";

import React from "react";
import ReactDOM from "react-dom";

import { IInventoryList } from "./dataObject";

/**
 * Render an IDiceRoller into a given div as a text character, with a button to roll it.
 * @param diceRoller - The Data Object to be rendered
 * @param div - The div to render into
 */
export function renderDiceRoller(diceRoller: IInventoryList, div: HTMLDivElement) {
    const wrapperDiv = document.createElement("div");
    wrapperDiv.style.textAlign = "center";
    div.append(wrapperDiv);

    const inputDiv = document.createElement("div");
    const inputComponent = React.createElement(CollaborativeInput, { sharedString: diceRoller.sharedString });
    ReactDOM.render(inputComponent, inputDiv);
    wrapperDiv.append(inputDiv);
}
