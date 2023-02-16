/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

import { DebuggerPanel } from "../shared-components";

const panelElement = document.createElement("div");
panelElement.id = "fluid-client-debugger-root";
panelElement.style.height = "100%";
panelElement.style.width = "100%";

ReactDOM.render(React.createElement(DebuggerPanel), panelElement, () => {
	document.body.append(panelElement);
	console.log("DEVTOOLS PANEL: Rendered debug view!");
});
