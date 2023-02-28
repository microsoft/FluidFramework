/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import ReactDOM from "react-dom";

import { renderClientDebuggerView } from "../../RenderClientDebugger";
import { App } from "./App";

console.log("Rendering app!");

ReactDOM.render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
	document.querySelector("#content"),
);

renderClientDebuggerView(document.body).catch((error) => console.error(error));
