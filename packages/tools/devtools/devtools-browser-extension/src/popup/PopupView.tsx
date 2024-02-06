/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import {
	DevtoolsFeatures,
	GetDevtoolsFeatures,
	type ISourcedDevtoolsMessage,
	type InboundHandlers,
	handleIncomingMessage,
} from "@fluidframework/devtools-core";
import { type BackgroundConnection } from "../BackgroundConnection";

const queryTimeoutInMilliseconds = 2000; // 2 seconds

const loggingContext = "FLUID_DEVTOOLS(Popup)";

/**
 * Message sent to the webpage to query for the supported set of Devtools features.
 */
const getSupportedFeaturesMessage = GetDevtoolsFeatures.createMessage();

/**
 * Props containing critical BG service connection used for message passing with webpage
 */
export interface PopupViewProps {
	backgroundServiceConnection: BackgroundConnection;
}

/**
 * Component that renders when the user clicks the extension icon *in the browser toolbar*
 * @returns popup component
 */
export function PopupView(props: PopupViewProps): React.ReactElement {
	const { backgroundServiceConnection } = props;

	// Indicates if Fluid Devtools is running in the current page (i.e. the application is using it and initialized it correctly).
	// Undefined means still looking or that the message which is sent to discover this has not been sent yet.
	const [foundDevtools, setFoundDevtools] = React.useState<boolean | undefined>(undefined);

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			[DevtoolsFeatures.MessageType]: async (untypedMessage) => {
				// We don't actually care what the supported features are here, we're just using the response
				// as verification that Fluid Devtools are running on the page.
				setFoundDevtools(true);
				clearTimeout(responseTimeout);
				return true;
			},
		};

		/**
		 * Event handler for messages coming from the Background Script.
		 */
		function messageHandler(message: Partial<ISourcedDevtoolsMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers, {
				context: loggingContext,
			});
		}
		backgroundServiceConnection.on("message", messageHandler);

		// Query for supported feature set
		backgroundServiceConnection.postMessage(getSupportedFeaturesMessage);
		let responseTimeout: NodeJS.Timeout | undefined;
		if (foundDevtools === undefined) {
			responseTimeout = setTimeout(() => {
				setFoundDevtools(false);
			}, queryTimeoutInMilliseconds);
		}

		return (): void => {
			backgroundServiceConnection.off("message", messageHandler);
		};
	}, [backgroundServiceConnection, foundDevtools, setFoundDevtools]);

	// // Start timer for response timeout
	// React.useEffect(() => {
	// 	let responseTimeout: NodeJS.Timeout | undefined;

	// 	// If we have already received a response, or have already timed out once,
	// 	// don't start a new timeout.
	// 	if (foundDevtools === undefined) {
	// 		responseTimeout = setTimeout(() => {
	// 			setFoundDevtools(false);
	// 		}, queryTimeoutInMilliseconds);
	// 	}
	// 	return () => {
	// 		clearTimeout(responseTimeout);
	// 	};
	// }, [foundDevtools, setFoundDevtools]);

	// TODO: spinner for loading
	// TODO: retry button on not found.
	return (
		<div>
			{foundDevtools === undefined && (
				<div>Searching for Fluid Devtools in the current tab...</div>
			)}
			{foundDevtools === true && (
				<div>
					Devtools found! Open the browser`&apos;`s devtools panel to view the Fluid
					Devtools extension.
				</div>
			)}
			{foundDevtools === false && (
				<div>
					Devtools not found. Visit the documentation{" "}
					<a
						href="https://github.com/microsoft/FluidFramework/blob/main/packages/tools/devtools/devtools/README.md"
						target="_blank"
						rel="noreferrer"
					>
						here
					</a>
				</div>
			)}
		</div>
	);
}
