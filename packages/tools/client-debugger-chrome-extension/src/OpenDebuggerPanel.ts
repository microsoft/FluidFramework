/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import ReactDOM from "react-dom";

import { debuggerPanelId } from "./Constants";
import { DebuggerView } from "./DebuggerView";
import { isDebuggerPanelOpen } from "./Utilities";

/**
 * Appends the debugger view panel to the document (as a child under `body`).
 * If a debugger view panel is already active, it does not append a new instance.
 *
 * @returns Whether or not a new debugger view was appended to the document.
 *
 * @internal
 */
export async function openDebuggerPanel(): Promise<boolean> {
	if (isDebuggerPanelOpen()) {
		return false;
	}

	const element = document.createElement("div");
	element.id = debuggerPanelId;
	document.body.append(element);

	return new Promise<boolean>((resolve) => {
		try {
			ReactDOM.render(
				React.createElement(DebuggerView),
				element,
				() => {
					resolve(true);
				},
			);
		} catch (error) {
			console.error(`Could not open the debugger view due to an error: ${error}.`);
			return false;
		}
	});
}
