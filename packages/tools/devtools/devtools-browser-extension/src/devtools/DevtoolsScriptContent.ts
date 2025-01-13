/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { formatDevtoolsScriptMessageForLogging } from "./Logging.js";

/**
 * Code run when "DevtoolsScript" executes.
 * Factored out for testability.
 */
export function runDevtoolsScript(browser: typeof chrome): void {
	console.log(formatDevtoolsScriptMessageForLogging("Initializing Devtools Script."));

	// When our extension view is launched, open the root visualization view.
	browser.devtools.panels.create(
		"Fluid Framework Devtools",
		"icons/icon_32.png",
		"devtools/rootView.html",
		(panel) => {
			panel.onShown.addListener((window) => {
				console.log(formatDevtoolsScriptMessageForLogging("Devtools view shown."));
			});
			panel.onHidden.addListener(() => {
				console.log(formatDevtoolsScriptMessageForLogging("Devtools view hidden."));
			});
		},
	);
}
