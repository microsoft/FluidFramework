/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Resizable } from "re-resizable";
import React from "react";
import ReactDOM from "react-dom";

import { DevtoolsPanel, WindowMessageRelay } from "@fluid-experimental/devtools-view";

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

ReactDOM.render(<DevToolsView />, debuggerElement, () => {
	console.log("Debugger UI rendered!");
});

function DevToolsView(): React.ReactElement {
	return (
		<Resizable
			style={{
				position: "absolute",
				top: "0px",
				right: "0px",
				bottom: "0px",
				zIndex: "2",
				backgroundColor: "lightgray", // TODO: remove
			}}
			enable={{ left: true }} // Only allow re-sizing from the left.
			defaultSize={{ width: 500, height: "100%" }}
		>
			<DevtoolsPanel
				messageRelay={new WindowMessageRelay("fluid-framwork-devtools-inline")}
			/>
		</Resizable>
	);
}
