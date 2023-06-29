/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import ReactDOM from "react-dom";

import { DevtoolsPanel, LoggerContext } from "@fluid-experimental/devtools-view";
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/common-definitions";

import { BackgroundConnection } from "./BackgroundConnection";
import { formatDevtoolsScriptMessageForLogging } from "./Logging";

const myLogger: ITelemetryBaseLogger = {
	send: (event: ITelemetryBaseEvent) => {
		alert(JSON.stringify(event));
	},
};

/**
 * Renders the Fluid Devtools view into the provided target element.
 *
 * @param target - The element into which the devtools view will be rendered.
 */
export async function initializeDevtoolsView(target: HTMLElement): Promise<void> {
	const connection = await BackgroundConnection.Initialize();
	ReactDOM.render(
		<LoggerContext.Provider value={myLogger}>
			<DevtoolsPanel messageRelay={connection} />
		</LoggerContext.Provider>,
		target,
		() => {
			console.log(
				formatDevtoolsScriptMessageForLogging("Rendered debug view in devtools window!"),
			);
		},
	);
}
