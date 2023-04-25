/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

import { RootView } from "@fluid-tools/client-debugger-view";

import { BackgroundConnection } from "./BackgroundConnection";
import { formatDevtoolsScriptMessageForLogging } from "./Logging";

/**
 * Renders the Fluid Devtools view into the provided target element.
 *
 * @param target - The element into which the devtools view will be rendered.
 */
export async function initializeDevtoolsView(target: HTMLElement): Promise<void> {
	const connection = await BackgroundConnection.Initialize();

	ReactDOM.render(React.createElement(RootView, { messageRelay: connection }), target, () => {
		console.log(
			formatDevtoolsScriptMessageForLogging("Rendered debug view in devtools window!"),
		);
	});
}
