/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { browser } from "../Globals";
import { initializePopupView } from "./InitializePopupView";

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

// TODO: double check that tab selection can't change while popup is being displayed.
browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
	if (tabs.length === 0) {
		console.debug("No active tab.");
		return;
	}

	// TODO: verify this
	if (tabs.length > 1) {
		console.error("More than one active tab found. This is not expected.");
		return;
	}

	if (tabs[0].id === undefined) {
		console.error("Tab does not define an ID.");
		return;
	}

	const tabId = tabs[0].id;

	const popupElement = document.createElement("div");
	popupElement.id = "fluid-devtools-popup";
	popupElement.style.height = "100%";
	popupElement.style.width = "100%";
	popupElement.textContent =
		'To use the Fluid Devtools, open the browser Devtools pane (F12) and click the "Fluid Developer Tools" tab.';

	document.body.append(popupElement);
	initializePopupView(popupElement, tabId).then(() => {
		console.debug(`Rendered popup for tab ${tabId}!`);
	}, console.error);
});
