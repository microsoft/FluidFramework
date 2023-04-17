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

import ReactDOM from "react-dom";
import { RootView } from "@fluid-tools/client-debugger-view";

import { BackgroundConnection } from "./BackgroundConnection";
import { formatDevtoolsScriptMessageForLogging } from "./Logging";

document.body.style.margin = "0px";

const container = document.createElement("debugger");
container.style.position = "absolute";
container.style.height = "100%";
document.body.append(container);

BackgroundConnection.Initialize()
	.then((connection) => {
		try {
			ReactDOM.render(<RootView messageRelay={connection} />, container, () => {
				console.log(
					formatDevtoolsScriptMessageForLogging(
						"Rendered debug view in devtools window!",
					),
				);
			});
		} catch (error) {
			console.error(`Error initializing the devtools root view.`, error);
		}
	})
	.catch((error: unknown) => {
		console.error(`Error initializing the BackgroundConnection.`, error);
	});
