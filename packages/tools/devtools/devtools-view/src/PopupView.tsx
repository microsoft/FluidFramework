/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import {
	DevtoolsFeatures,
	handleIncomingMessage,
	type DevtoolsFeatureFlags,
	type InboundHandlers,
	type ISourcedDevtoolsMessage,
	type IMessageRelay,
	GetDevtoolsFeatures,
} from "@fluid-experimental/devtools-core";

import { MessageRelayContext } from "./MessageRelayContext";

/**
 * Message sent to the webpage to query for the supported set of Devtools features.
 */
const getSupportedFeaturesMessage = GetDevtoolsFeatures.createMessage();
const loggingContext = "INLINE(PopupView)";

/**
 * @public
 */
export interface PopupViewProps {
	messageRelay: IMessageRelay;
}

/**
 * Renders a popup element when the user clicks on the extension w into the provided target element.
 * @public
 */
export function PopupView(props: PopupViewProps): React.ReactElement {
	const { messageRelay } = props;
	const [supportedFeatures, setSupportedFeatures] = React.useState<
		DevtoolsFeatureFlags | undefined
	>();

	React.useEffect(() => {
		const inboundMessageHandlers: InboundHandlers = {
			[DevtoolsFeatures.MessageType]: async (untypedMessage) => {
				const message = untypedMessage as DevtoolsFeatures.Message;
				setSupportedFeatures(message.data.features);
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

		messageRelay.on("message", messageHandler);
		// Query for supported feature set
		messageRelay.postMessage(getSupportedFeaturesMessage);

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [messageRelay, setSupportedFeatures]);
	return (
		<MessageRelayContext.Provider value={messageRelay}>
			<div>
				To use the Fluid Devtools, open the browser Devtools pane (F12) and click
				the `Fluid Developer Tools` tab. {supportedFeatures}
			</div>
		</MessageRelayContext.Provider>
	);
}
