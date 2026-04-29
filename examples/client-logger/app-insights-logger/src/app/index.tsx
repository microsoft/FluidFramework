/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StrictMode } from "react";
import ReactDOM from "react-dom";

import { App } from "../components/index.js";

console.log("Rendering app...");

ReactDOM.render(
	<StrictMode>
		<App />
	</StrictMode>,
	document.querySelector("#content"),
	() => {
		console.log("App rendered!");
	},
);
