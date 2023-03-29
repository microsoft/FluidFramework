/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This script represents the root view for the Devtools extension.
 * It establishes communication with the Background Service as a relay for communication with the webpage (tab),
 * and passes that communication context (see {@link BackgroundConnection}) as the
 * {@link @fluid-tools/client-debugger-view#MessageRelayContext} used by our internal React components.
 */

import { FluidClientDebuggers, MessageRelayContext } from "@fluid-tools/client-debugger-view";
import React from "react";
import ReactDOM from "react-dom";

import { BackgroundConnection } from "./BackgroundConnection";
import { formatDevtoolsScriptMessageForLogging } from "./Logging";

document.body.style.margin = "0px";

BackgroundConnection.Initialize()
	.then((connection) => {
		ReactDOM.render(<RootView backgroundConnection={connection} />, document.body, () => {
			console.log(
				formatDevtoolsScriptMessageForLogging("Rendered debug view in devtools window!"),
			);
		});
	})
	.catch((error: unknown) => {
		console.error(`Error initializing the devtools root view.`, error);
	});

/**
 * Root component of our React tree.
 *
 * @remarks Sets up message-passing context and renders the debugger.
 */
function RootView(props: { backgroundConnection: BackgroundConnection }): React.ReactElement {
	const messageRelay = React.useMemo<BackgroundConnection>(() => props.backgroundConnection, []);
	return (
		<MessageRelayContext.Provider value={messageRelay}>
			<FluidClientDebuggers />
		</MessageRelayContext.Provider>
	);
}
