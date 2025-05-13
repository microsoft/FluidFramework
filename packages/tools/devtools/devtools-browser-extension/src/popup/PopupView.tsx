/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DevtoolsFeatures,
	GetDevtoolsFeatures,
	type ISourcedDevtoolsMessage,
	type InboundHandlers,
	handleIncomingMessage,
} from "@fluidframework/devtools-core/internal";
import React from "react";

import type { BackgroundConnection } from "../BackgroundConnection.js";

// The recipient of the sent message is running on the same machine, just in a different process.
// We aren't waiting on network requests or anything, so 2s wait time is sufficient.
const queryTimeoutInMilliseconds = 2000;

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
	}, [backgroundServiceConnection, setFoundDevtools]);

	// TODO: spinner for loading
	// TODO: retry button on not found.
	return (
		<div style={{ width: "200px" }}>
			{foundDevtools === undefined && (
				<div>Searching for Fluid Devtools in the current tab...</div>
			)}
			{foundDevtools === true && (
				<div>
					Fluid Devtools found! Open the browser`s devtools panel to view the Fluid Devtools
					extension.
				</div>
			)}
			{foundDevtools === false && (
				<div>
					Fluid Devtools library not found running in the current tab. For details on how to
					enable it, please refer to our documentation{" "}
					<a
						href="https://github.com/microsoft/FluidFramework/blob/main/packages/tools/devtools/devtools/README.md"
						target="_blank"
						rel="noreferrer"
					>
						here
					</a>
					.
				</div>
			)}
		</div>
	);
}
