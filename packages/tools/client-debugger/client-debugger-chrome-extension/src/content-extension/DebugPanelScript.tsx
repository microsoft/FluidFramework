/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

import { FluidClientDebuggers } from "@fluid-tools/client-debugger-view";

// TODOs:
// - Get extensibility hooks from debugger registry? Or does `FluidClientDebuggers` do this?

ReactDOM.render(
	<React.StrictMode>
		<FluidClientDebuggers />
	</React.StrictMode>,
	document.querySelector("#content"),
);
