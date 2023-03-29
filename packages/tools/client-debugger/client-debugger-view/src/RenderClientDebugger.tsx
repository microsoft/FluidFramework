/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import ReactDOM from "react-dom";

import { IMessageRelay } from "@fluid-tools/client-debugger";

import { FluidClientDebuggers } from "./Debugger";
import { MessageRelayContext } from "./MessageRelayContext";

/**
 * Renders Fluid client debug view by appending it to the provided DOM element.
 *
 * @param targetElement - The HTML element takes the client debugger view.
 * @param messageRelayFactory - An function that returns an instance of a message relay that can handle message passing
 * between the application and the debugger, in whatever context the latter is being rendered (e.g. in the same page as
 * the application, or in the browser's DevTools panel).
 *
 * @remarks
 *
 * Note: this should only be called once for the lifetime of the `targetElement`.
 * Subsequent calls will result in undesired behavior.
 *
 * @returns A promise that resolves once the debugger view has been rendered for the first time.
 * If rendering fails for any reason, the promise will be rejected.
 */
export async function renderClientDebuggerView(
	targetElement: Element,
	messageRelayFactory: () => IMessageRelay,
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		try {
			ReactDOM.render(
				<RootView messageRelayFactory={messageRelayFactory} />,
				targetElement,
				() => {
					console.log("Rendered debug view in page!");
					resolve();
				},
			);
		} catch (error) {
			reject(error);
		}
	});
}

function RootView(props: { messageRelayFactory: () => IMessageRelay }): React.ReactElement {
	const messageRelay: IMessageRelay = props.messageRelayFactory();
	return (
		<MessageRelayContext.Provider value={messageRelay}>
			<FluidClientDebuggers />
		</MessageRelayContext.Provider>
	);
}
