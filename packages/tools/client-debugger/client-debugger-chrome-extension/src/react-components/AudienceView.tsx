/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack, StackItem } from "@fluentui/react";
import React from "react";
import { IClient } from "@fluidframework/protocol-definitions";
import {
	AudienceChangeLogEntry,
	handleIncomingMessage,
	IDebuggerMessage,
	InboundHandlers,
	AudienceEventMessage,
	HasContainerId,
} from "@fluid-tools/client-debugger";
// import { _AudienceView, _AudienceViewProps } from "@fluid-tools/client-debugger-view";
import { extensionMessageSource } from "../messaging";
import { MessageRelayContext } from "./MessageRelayContext";

const loggingContext = "EXTENSION(AudienceView)";

// TODOs:
// - Special annotation for the member elected as the summarizer
// - History of audience changes

/**
 * {@link AudienceView} input props.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface AudienceViewProps extends HasContainerId {
	// TODO
}

/**
 * Displays information about the provided {@link @fluidframework/fluid-static#IServiceAudience | audience}.
 */
export function AudienceView(props: AudienceViewProps): React.ReactElement {
	const { containerId } = props;

	// POST Request for Audience Data
	const getAudienceMessage: IDebuggerMessage = {
		type: "GET_AUDIENCE_EVENT",
		source: extensionMessageSource,
		data: {
			containerId,
		},
	};

	const messageRelay = React.useContext(MessageRelayContext);
	if (messageRelay === undefined) {
		throw new Error(
			"MessageRelayContext was not defined. Parent component is responsible for ensuring this has been constructed.",
		);
	}

	const [audienceState, setAudienceState] = React.useState<IClient[] | undefined>();
	const [audienceHistory, setAudienceHistory] =
		React.useState<readonly AudienceChangeLogEntry[]>();

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to Audience
		 */
		const inboundMessageHandlers: InboundHandlers = {
			["AUDIENCE_EVENT"]: (untypedMessage) => {
				const message: AudienceEventMessage = untypedMessage as AudienceEventMessage;

				setAudienceState(message.data.audienceState);
				setAudienceHistory(message.data.audienceHistory);

				return true;
			},
		};

		/**
		 * Event handler for messages coming from the Message Relay
		 */

		function messageHandler(message: Partial<IDebuggerMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers, {
				context: loggingContext,
			});
		}

		// Request state info for the newly specified containerId
		messageRelay.on("message", messageHandler);
		messageRelay.postMessage(getAudienceMessage);

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containerId, setAudienceState, setAudienceHistory]);

	console.log("audienceState:", audienceState);
	console.log("--------------------------");
	console.log("audienceHistory:", audienceHistory);

	return (
		<Stack>
			<StackItem>
				<h3>Audience Data</h3>
			</StackItem>
			<StackItem>
				<div>
					{" "}
					{audienceState === undefined ? <h1> Hello </h1> : JSON.stringify(audienceState)}
				</div>
				<h1> ------------------------------------------------ </h1>
				<div>
					{" "}
					{audienceHistory === undefined ? (
						<h1> Hello </h1>
					) : (
						JSON.stringify(audienceHistory)
					)}{" "}
				</div>
				<div> {audienceState === undefined ? <h1> Hello </h1> : audienceState.length} </div>
			</StackItem>
		</Stack>
	);
}
