/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDiceRoller } from "./dataObject.js";
import {
	jsRenderDiceRoller,
	reactRenderDiceRoller,
	vueRenderDiceRoller,
} from "./views/index.js";

/**
 * Render an IDiceRoller into a given div as a text character, with a button to roll it.
 * @param diceRoller - The Data Object to be rendered
 * @param div - The div to render into
 */
export function renderSampler(diceRoller: IDiceRoller, div: HTMLDivElement) {
	const jsDiv = document.createElement("div");
	const reactDiv = document.createElement("div");
	const vueDiv = document.createElement("div");

	div.append(
		jsDiv,
		document.createElement("hr"),
		reactDiv,
		document.createElement("hr"),
		vueDiv,
	);

	jsRenderDiceRoller(diceRoller, jsDiv);
	reactRenderDiceRoller(diceRoller, reactDiv);
	vueRenderDiceRoller(diceRoller, vueDiv);
}
