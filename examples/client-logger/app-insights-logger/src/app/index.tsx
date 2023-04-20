/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import ReactDOM from "react-dom";
import { App } from "../components";

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
