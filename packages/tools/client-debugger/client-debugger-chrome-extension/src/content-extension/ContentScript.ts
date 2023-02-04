/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { renderClientDebuggerView } from "@fluid-tools/client-debugger-view";
import { debuggerPanelId } from "./Constants";
import { isDebuggerPanelOpen } from "./Utilities";

function show(): void {
	if (isDebuggerPanelOpen()) {
		console.error("Debugger panel is already visible.");
		return;
	}

	const iframe = document.createElement("iframe");
	iframe.id = debuggerPanelId;
	// iframe.style.background = "green";
	iframe.style.height = "100%";
	iframe.style.width = "0px"; // Default to hidden state.
	iframe.style.position = "fixed";
	iframe.style.top = "0px";
	iframe.style.right = "0px";
	iframe.style.zIndex = "9000000000000000000"; // Ensure the panel appears on top of all other content
	iframe.style.width = "400px";

	renderClientDebuggerView(iframe).then(() => {
		document.body.append(iframe);
		console.log("CONTENT: Rendered debug view!");
	}, console.error);

	// TODO: Resume message subscription for the debugger itself
}

function hide(): void {
	// TODO: suspend message subscription for the debugger itself

	document.querySelector(`#${debuggerPanelId}`)?.remove();
}

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
