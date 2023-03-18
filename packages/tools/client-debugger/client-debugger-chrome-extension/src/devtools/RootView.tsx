/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This script represents the root view for the Devtools extension.
 * It establishes communication with the Background Service as a relay for communication with the webpage (tab),
 * and passes that communication context (see {@link BackgroundConnection}) as the {@link MessageRelayContext} used
 * by our internal React components.
 */

import { FluidClientDebuggers, MessageRelayContext } from "@fluid-tools/client-debugger-view";
import React from "react";
import ReactDOM from "react-dom";
import { extensionMessageSource } from "../messaging";

import { BackgroundConnection } from "./BackgroundConnection";
import { formatDevtoolsScriptMessageForLogging } from "./Logging";

// TODOs:
// - Wait for Background Script connection before rendering, to ensure messages are able to flow before we first
//  request data from the registry / debuggers.

const panelElement = document.createElement("div");
panelElement.id = "fluid-devtools-root";
panelElement.style.height = "100%";
panelElement.style.width = "100%";

/**
 * Root component of our React tree.
 *
 * @remarks Sets up message-passing context and renders the debugger.
 */
function RootView(): React.ReactElement {
	const messageRelay = React.useMemo<BackgroundConnection>(
		() => new BackgroundConnection(extensionMessageSource),
		[],
	);
	return (
		<MessageRelayContext.Provider value={messageRelay}>
			<FluidClientDebuggers />
		</MessageRelayContext.Provider>
	);
}

ReactDOM.render(<RootView />, panelElement, () => {
	document.body.append(panelElement);
	console.log(formatDevtoolsScriptMessageForLogging("Rendered debug view in devtools window!"));
});
