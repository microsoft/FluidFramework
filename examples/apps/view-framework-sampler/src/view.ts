/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDiceRoller } from "./dataObject";
import { jsRenderDiceRoller, reactRenderDiceRoller } from "./views";

/**
 * Render an IDiceRoller into a given div as a text character, with a button to roll it.
 * @param diceRoller - The Data Object to be rendered
 * @param div - The div to render into
 */
export function renderSampler(diceRoller: IDiceRoller, div: HTMLDivElement) {
    const jsDiv = document.createElement("div");
    const reactDiv = document.createElement("div");
    const vueDiv = document.createElement("div");

    jsRenderDiceRoller(diceRoller, jsDiv);
    reactRenderDiceRoller(diceRoller, reactDiv);
    // vueRenderDiceRoller(diceRoller, vueDiv);
    div.append(jsDiv, reactDiv, vueDiv);
}
