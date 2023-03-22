/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import ReactDOM from "react-dom";

import { FluidClientDebuggers } from "./Debugger";
import { WindowMessageRelay } from "./WindowMessageRelay";
import { MessageRelayContext } from "./MessageRelayContext";

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
	return new Promise<void>((resolve, reject) => {
		try {
			ReactDOM.render(<RootView />, targetElement, () => {
				console.log("Rendered debug view in page!");
				resolve();
			});
		} catch (error) {
			reject(error);
		}
	});
}

function RootView(): React.ReactElement {
	const messageRelay = React.useMemo<WindowMessageRelay>(
		() => new WindowMessageRelay("fluid-client-debugger-inline"),
		[],
	);
	return (
		<MessageRelayContext.Provider value={messageRelay}>
			<FluidClientDebuggers />
		</MessageRelayContext.Provider>
	);
}
