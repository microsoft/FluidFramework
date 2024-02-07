/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

import { DevtoolsPanel } from "@fluid-internal/devtools-view";

import { BackgroundConnection } from "../BackgroundConnection";
import { browser } from "../Globals";
import { extensionMessageSource } from "../messaging";
import { formatDevtoolsScriptMessageForLogging } from "./Logging";
import { OneDSLogger } from "./TelemetryLogging";

/**
 * Renders the Fluid Devtools view into the provided target element.
 *
 * @param target - The element into which the devtools view will be rendered.
 */
export async function initializeDevtoolsView(target: HTMLElement): Promise<void> {
	const connection = await BackgroundConnection.Initialize({
		// TODO: devtools-panel-specific source
		messageSource: extensionMessageSource,
		// The devtools panel will always be associated with this fixed tabID
		tabId: browser.devtools.inspectedWindow.tabId,
	});

	const logger = new OneDSLogger();
	ReactDOM.render(
		React.createElement(DevtoolsPanel, {
			messageRelay: connection,
			usageTelemetryLogger: logger,
			unloadCallback: () => {
				logger.flush(); // This also flushes outstanding events in the queue, if any
			},
		}),
		target,
		() => {
			console.log(
				formatDevtoolsScriptMessageForLogging("Rendered debug view in devtools window!"),
			);
		},
	);
}
