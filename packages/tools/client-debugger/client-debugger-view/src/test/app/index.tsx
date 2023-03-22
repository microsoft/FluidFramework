/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import ReactDOM from "react-dom";

import { renderClientDebuggerView } from "../../RenderClientDebugger";
import { App } from "./App";

console.log("Rendering app...");

ReactDOM.render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
	document.querySelector("#content"),
	() => {
		console.log("App rendered!");
	},
);

const debuggerElement = document.createElement("debugger");
document.body.append(debuggerElement);
renderClientDebuggerView(debuggerElement).then(
	() => {
		console.log("Debug panel rendered!");
	},
	(error) => {
		console.error("Could not open the client debugger view due to an error:", error);
	},
);
