/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Resizable } from "re-resizable";
import React from "react";
import ReactDOM from "react-dom";

import { renderClientDebuggerView } from "../../RenderClientDebugger";
import { WindowMessageRelay } from "../../WindowMessageRelay";
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

ReactDOM.render(
	<Resizable
		style={{
			position: "absolute",
			top: "0px",
			right: "0px",
			bottom: "0px",
			zIndex: "2",
			backgroundColor: "lightgray", // TODO: remove
		}}
		defaultSize={{ width: 400, height: "100%" }}
		className={"debugger-panel"}
	></Resizable>,
	debuggerElement,
);

// We just rendered this above, we know it exists.
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const resizableElement = debuggerElement.firstElementChild!;

// TODO: This currently overwrites the contents of the Resizable JSX element we rendered above using React, and
// React complains about it. We should find a better approach.
renderClientDebuggerView(
	resizableElement,
	() => new WindowMessageRelay("fluid-client-debugger-inline"),
).then(
	() => {
		console.log("Debug panel rendered!");
	},
	(error) => {
		console.error("Could not open the client debugger view due to an error:", error);
	},
);
