/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack, StackItem } from "@fluentui/react";
import React from "react";
import { IClient } from "@fluidframework/protocol-definitions";

import {
	handleIncomingMessage,
	IDebuggerMessage,
	InboundHandlers,
	AudienceEventMessage,
	HasContainerId,
} from "@fluid-tools/client-debugger";
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

	const messageRelay = React.useContext(MessageRelayContext);

	if (messageRelay === undefined) {
		throw new Error(
			"MessageRelayContext was not defined. Parent component is responsible for ensuring this has been constructed.",
		);
	}

	const [allAudienceMembers, setAllAudienceMembers] = React.useState<
		Map<string, IClient> | undefined
	>();
	const [audienceHistory, setAudienceHistory] = React.useState<readonly unknown[]>();

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to Audience
		 */

		const inboundMessageHandlers: InboundHandlers = {
			["AUDIENCE_EVENT"]: (untypedMessage) => {
				const message: AudienceEventMessage = untypedMessage as AudienceEventMessage;
				console.log("Passed 3");
				console.log(message);

				// setAllAudienceMembers([message.data.audienceState]);
				setAudienceHistory([message.data.audienceHistory]);
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

		messageRelay.on("message", messageHandler);

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [
		containerId,
		allAudienceMembers,
		setAllAudienceMembers,
		audienceHistory,
		setAudienceHistory,
	]);

	return (
		<Stack>
			<StackItem>
				<h3>Audience Data</h3>
			</StackItem>
			<StackItem>
				<div>TODO</div>
			</StackItem>
		</Stack>
	);
}
