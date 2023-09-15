/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";
import { getFuzzTestTreeStates } from "@fluid-experimental/tree2";
import { MainView } from "./view/inventoryList";

const test = await getFuzzTestTreeStates(0, 1);
console.log(test);
// eslint-disable-next-line import/no-named-as-default-member
ReactDOM.render(
	<React.StrictMode>
		<MainView />
	</React.StrictMode>,
	document.querySelector("#content"),
);
