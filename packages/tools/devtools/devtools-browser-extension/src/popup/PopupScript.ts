/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

import { BackgroundConnection } from "../BackgroundConnection.js";
import { browser } from "../Globals.js";
import { extensionPopupMessageSource } from "../messaging/index.js";

import { PopupView } from "./PopupView.js";

/**
 * This module is the extensions "pop-up" script.
 * It runs when the extension's action button is clicked.
 *
 * Since this extension runs in the Devtools panel, the user doesn't need to activate anything
 * to use the extension, they just need to open Devtools.
 * To inform them of this, we simply display a disclaimer pointing them to the Devtools panel.
 */

browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
	// Note: The tab selection (active tab) cannot change while the popup is being displayed.
	if (tabs.length === 0) {
		console.debug("No active tab.");
		return;
	}
	// Very unlikely edge case but still worth keeping to prevent unexpected errors.
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

/**
 * Renders the Fluid Popup view into the provided target element.
 *
 * @param target - The element into which the popup view will be rendered.
 */
export async function initializePopupView(target: HTMLElement, tabId: number): Promise<void> {
	const backgroundServiceConnection = await BackgroundConnection.Initialize({
		messageSource: extensionPopupMessageSource,
		tabId,
	});
	// Setting the theme here instead of using Fluent UI's ThemeProvider was intentional given the popup's simplicity.
	// Note: keep these in sync with the themes in the devtools view.
	const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)").matches;
	document.body.style.backgroundColor = prefersDarkScheme ? "#242424" : "#ffffff";
	document.body.style.color = prefersDarkScheme ? "#ffffff" : "#242424";

	ReactDOM.render(React.createElement(PopupView, { backgroundServiceConnection }), target);
}
