/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import ReactDOM from "react-dom";

import { FluidClientDebuggers } from "./Debugger";

/**
 * Renders Fluid client debug view by appending it to the provided DOM element.
 * Will fast return false if the input is `null`.
 *
 * @param targetElement - The HTML element takes the client debugger view.
 *
 * @returns `true` if the debug view was succesfully rendered, otherwise `false`.
 */
export async function renderClientDebuggerView(
	// eslint-disable-next-line @rushstack/no-new-null
	targetElement: HTMLElement | null,
): Promise<boolean> {
	if (targetElement === null) {
		console.log("Provided null targetElement.");
		return false;
	}

	const debuggerElement = document.createElement("debugger");
	targetElement.append(debuggerElement);

	return new Promise<boolean>((resolve) => {
		try {
			ReactDOM.render(React.createElement(FluidClientDebuggers), debuggerElement, () => {
				resolve(true);
			});
		} catch (error) {
			console.error(`Could not open the client debugger view due to an error: ${error}.`);
			resolve(false);
		}
	});
}

// #2: Render "debugger frame" - user passes in element, we wrap that element in a frame containing the debug view
//    + UI for showing / hiding the "debugger panel".
//   renderWithClientDebugger(appElement);
//   const parent = appElement.parent;
//   render app and frame
