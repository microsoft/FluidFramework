/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

chrome.tabs.query({ active: true, currentWindow: true }, (tab) => {
	const popupElement = document.createElement("div");
	popupElement.id = "fluid-client-debugger-popup";
	popupElement.style.height = "100%";
	popupElement.style.width = "100%";
	popupElement.textContent =
		'To use the Fluid Devtools, open the browser Devtools pane (F12) and click the "Fluid Client Debugger" tab.';

	document.body.append(popupElement);
});
