/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODOs:
// * Don't render anything until after the "show" message has been received

const iframe = document.createElement("iframe");
// iframe.style.background = "green";
iframe.style.height = "100%";
iframe.style.width = "0px"; // Default to hidden state.
iframe.style.position = "fixed";
iframe.style.top = "0px";
iframe.style.right = "0px";
iframe.style.zIndex = "9000000000000000000"; // Ensure the panel appears on top of all other content
// iframe.src = chrome.extension.getURL("DebugPanelScript.jsx");

function show(): void {
	iframe.style.width = "400px";
	// TODO: Resume message subscription for the debugger itself
}

function hide(): void {
	iframe.style.width = "0px";
	// TODO: suspend message subscription for the debugger itself
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

document.body.append(iframe);
