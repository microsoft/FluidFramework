/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

import { BackgroundConnection } from "../BackgroundConnection";
import { extensionMessageSource } from "../messaging";
import { PopupView } from "./PopupView";

/**
 * Renders the Fluid Popup view into the provided target element.
 *
 * @param target - The element into which the devtools view will be rendered.
 */
export async function initializePopupView(target: HTMLElement, tabId: number): Promise<void> {
	const backgroundServiceConnection = await BackgroundConnection.Initialize({
		// TODO: devtools-panel-specific source
		messageSource: extensionMessageSource,
		tabId,
	});

	ReactDOM.render(React.createElement(PopupView, { backgroundServiceConnection }), target, () => {
		console.log("Rendered Popup view!");
	});
}
