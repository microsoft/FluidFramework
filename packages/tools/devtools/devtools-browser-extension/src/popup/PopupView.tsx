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
 * Component that renders when you click extension
 * @returns popup component
 */
export function PopupView(props: PopupViewProps): React.ReactElement {
	const { backgroundServiceConnection } = props;

	// Set of features supported by the Devtools. True is devtools found, false not found and undefined means still looking
	const [foundDevtools, setFoundDevtools] = React.useState<boolean | undefined>(undefined);

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to the registry.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			[DevtoolsFeatures.MessageType]: async (untypedMessage) => {
				// We don't actually care what the supported features are here, we're just using the response
				// as verification that Fluid Devtools are running on the page.
				setFoundDevtools(true);
				return true;
			},
		};

		/**
		 * Event handler for messages coming from the Message Relay
		 */
		function messageHandler(message: Partial<ISourcedDevtoolsMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers, {
				context: loggingContext,
			});
		}
		backgroundServiceConnection.on("message", messageHandler);

		// Query for supported feature set
		backgroundServiceConnection.postMessage(getSupportedFeaturesMessage);

		return (): void => {
			backgroundServiceConnection.off("message", messageHandler);
		};
	}, [backgroundServiceConnection, setFoundDevtools]);

	// Start timer for response timeout
	React.useEffect(() => {
		let responseTimeout: NodeJS.Timeout | undefined;

		// If we have already received a response, or have already timed out once,
		// don't start a new timeout.
		if (foundDevtools === undefined) {
			responseTimeout = setTimeout(() => {
				setFoundDevtools(false);
			}, queryTimeoutInMilliseconds);
		}
		return () => {
			clearTimeout(responseTimeout);
		};
	}, [foundDevtools, setFoundDevtools]);

	// TODO: spinner for loading
	// TODO: retry button on not found.
	// TODO: display "how to use devtools" when devtools aren't found
	return (
		<div>
			{foundDevtools === undefined && <div>Loading...</div>}
			{foundDevtools === true && (
				<div>
					Devtools found! Open the browser`&apos;`s devtools panel to view the Fluid
					Devtools extension.
				</div>
			)}
			{foundDevtools === false && <div>Devtools not found.</div>}
		</div>
	);
}
