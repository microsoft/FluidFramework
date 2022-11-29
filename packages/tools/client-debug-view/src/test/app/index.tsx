/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import ReactDOM from "react-dom";

import { App } from "./App";

console.log("Rendering app!");

ReactDOM.render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
	document.querySelector("#content"),

);

// renderClientDebugger(document.querySelector("#content"));

// V1: renderClientDebugger(document.querySelector("#content"))
// V2: renderClientDebugger("#content");
