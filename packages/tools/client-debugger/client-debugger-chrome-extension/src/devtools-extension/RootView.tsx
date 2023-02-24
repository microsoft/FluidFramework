/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

import { DebuggerPanel, MessageRelayContext } from "../shared-components";
import { BackgroundConnection, formatDevtoolsScriptMessageForLogging } from "./devtools";

const panelElement = document.createElement("div");
panelElement.id = "fluid-client-debugger-root";
panelElement.style.height = "100%";
panelElement.style.width = "100%";

function RootView(): React.ReactElement {
	const messageRelay = React.useMemo<BackgroundConnection>(() => new BackgroundConnection(), []);
	return (
		<MessageRelayContext.Provider value={messageRelay}>
			<DebuggerPanel />
		</MessageRelayContext.Provider>
	);
}

ReactDOM.render(<RootView />, panelElement, () => {
	document.body.append(panelElement);
	console.log(formatDevtoolsScriptMessageForLogging("Rendered debug view in devtools window!"));
});
