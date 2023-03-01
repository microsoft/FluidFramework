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
 * @remarks
 * 
 * Note: this should only be called once for the lifetime of the `targetElement`.
 * Subsequent calls will result in undesired behavior.
 *
 * @returns A promise that resolves once the debugger view has been rendered for the first time.
 * If rendering fails for any reason, the promise will be rejected.
 */
export async function renderClientDebuggerView(targetElement: HTMLElement): Promise<void> {
	const debuggerElement = document.createElement("debugger");
	targetElement.append(debuggerElement);

	return new Promise<void>((resolve, reject) => {
		try {
			ReactDOM.render(React.createElement(FluidClientDebuggers), debuggerElement, resolve);
		} catch (error) {
			reject(error);
		}
	});
}
