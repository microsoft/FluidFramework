/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import ReactDOM from "react-dom";

import { FluidClientDebuggers } from "./Debugger";

/**
 * Renders Fluid client debug view by appending it to the provided DOM element.
 *
 * @param targetElement - The HTML element takes the client debugger view.
 *
 * @returns `true` if the debug view was successfully rendered, otherwise `false`.
 */
export async function renderClientDebuggerView(targetElement: HTMLElement): Promise<void> {
	const debuggerElement = document.createElement("debugger");
	targetElement.append(debuggerElement);

	return new Promise<void>((resolve, reject) => {
		try {
			ReactDOM.render(React.createElement(FluidClientDebuggers), debuggerElement, () => {
				resolve();
			});
		} catch (error) {
			console.error("Could not open the client debugger view due to an error", error);
			reject(error);
		}
	});
}
