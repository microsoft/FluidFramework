/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";
import { PopupView } from "@fluid-experimental/devtools-view";
import { BackgroundConnection } from "./BackgroundConnection";
import { formatDevtoolsScriptMessageForLogging } from "./Logging";
/**
 * Renders the Fluid Popup view into the provided target element.
 *
 * @param target - The element into which the devtools view will be rendered.
 */
export async function initializePopupView(target: HTMLElement): Promise<void> {
	const connection = await BackgroundConnection.Initialize();

	ReactDOM.render(
		React.createElement(PopupView, {
			messageRelay: connection,
		}),
		target,
		() => {
			console.log(
				formatDevtoolsScriptMessageForLogging("Rendered Popup view in devtools window!"),
			);
		},
	);
}
