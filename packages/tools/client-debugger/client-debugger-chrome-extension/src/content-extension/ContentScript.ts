/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

import { debuggerPanelId } from "./Constants";
import { isDebuggerPanelOpen } from "./Utilities";
import { DebuggerPanel } from "./components";

function show(): void {
	if (isDebuggerPanelOpen()) {
		console.error("Debugger panel is already visible.");
		return;
	}

	const panelElement = document.createElement("div");
	panelElement.id = debuggerPanelId;
	// iframe.style.background = "green";
	panelElement.style.height = "100%";
	panelElement.style.position = "fixed";
	panelElement.style.top = "0px";
	panelElement.style.right = "0px";
	panelElement.style.zIndex = "9000000000000000000"; // Ensure the panel appears on top of all other content
	panelElement.style.width = "400px";

	ReactDOM.render(React.createElement(DebuggerPanel), panelElement, () => {
		document.body.append(panelElement);
		console.log("CONTENT: Rendered debug view!");
	});
}

function hide(): void {
	// TODO: suspend message subscription for the debugger itself

	document.querySelector(`#${debuggerPanelId}`)?.remove();
}

// #region Background <- -> Content script messaging

// TODO: differentiate senders (registry / debugger or background script)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	// TODO: validate sender

	switch (message) {
		case "hide":
			hide();
			break;
		case "show":
			show();
			break;
		default:
			console.warn(`Received unrecognized message kind: "${message}".`);
			break;
	}

	sendResponse({
		received: true,
	});
});

// #endregion
