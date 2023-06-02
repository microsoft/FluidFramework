/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { browser } from "../Globals";

/**
 * This module is the extensions "pop-up" script.
 * It runs when the extension's action button is clicked.
 *
 * Since this extension runs in the Devtools panel, the user doesn't need to activate anything
 * to use the extension, they just need to open Devtools.
 * To inform them of this, we simply display a disclaimer pointing them to the Devtools panel.
 */

// TODOs:
// - Check page (via messages) to see if the Devtools have been initialized.
//   If not, we may want to display an error message with a link to docs explaining how to
//   use them.

browser.tabs.query({ active: true, currentWindow: true }, (tab) => {
	const popupElement = document.createElement("div");
	popupElement.id = "fluid-devtools-popup";
	popupElement.style.height = "100%";
	popupElement.style.width = "100%";
	popupElement.textContent =
		'To use the Fluid Devtools, open the browser Devtools pane (F12) and click the "Fluid Client Debugger" tab.';

	document.body.append(popupElement);
});
