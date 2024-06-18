/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DevtoolsPanel, WindowMessageRelay } from "@fluid-internal/devtools-view";
import { Resizable } from "re-resizable";
import React from "react";
import ReactDOM from "react-dom";

import { App } from "./App.js";

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

const devtoolsElement = document.createElement("devtools");
document.body.append(devtoolsElement);

ReactDOM.render(<DevtoolsView />, devtoolsElement, () => {
	console.log("Devtools UI rendered!");
	// Setting "fluidStarted" is just for our test automation
	globalThis.fluidStarted = true;
});

function DevtoolsView(): React.ReactElement {
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
			<DevtoolsPanel messageRelay={new WindowMessageRelay("fluid-framwork-devtools-inline")} />
		</Resizable>
	);
}
