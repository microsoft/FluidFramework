/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { formatDevtoolsMessageForLogging } from "./devtools";

/**
 * This module is the extension's Devtools Script.
 * It runs in the context of the browser's Devtools panel, and has no direct access to the page or any of its resources.
 * It will be initialized as soon as a user clicks on this extension's tab in the Devtools panel.
 * It will live for as long at the extension's tab is active.
 *
 * From an implementation perspective, this script renders our debugger visuals and initiates message passing
 * between the visuals and the webpage with registered Fluid Debugger(s).
 *
 * In terms of messaging, this script strictly communicates with the Background Script, which is responsible for
 * relaying messages between this script and the webpage.
 *
 * - Note: Messaging is initiated by the root of our visualizer, rather than in this script directly.
 * See `RootView.ts`.
 *
 * TODO link to docs on Devtools script + Devtools extension flow
 */

console.log(formatDevtoolsMessageForLogging("Initializing Devtools Script."));

// When our extension view is launched, open the root visualization view.
chrome.devtools.panels.create(
	"Fluid Client Debugger",
	"images/icon.png",
	"rootView.html",
	(panel) => {
		panel.onShown.addListener((window) => {
			console.log(formatDevtoolsMessageForLogging("Debugger view shown."));
		});
		panel.onHidden.addListener(() => {
			console.log(formatDevtoolsMessageForLogging("Debugger view hidden."));
		});
	},
);
