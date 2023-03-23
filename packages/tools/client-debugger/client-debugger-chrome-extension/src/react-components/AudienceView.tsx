/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import {
	AudienceClientMetaData,
	AudienceChangeLogEntry,
	handleIncomingMessage,
	IDebuggerMessage,
	InboundHandlers,
	AudienceSummaryMessage,
	HasContainerId,
} from "@fluid-tools/client-debugger";
import { defaultRenderOptions, _AudienceView } from "@fluid-tools/client-debugger-view";
import { extensionMessageSource } from "../messaging";
import { useMessageRelay } from "./MessageRelayContext";

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
		type: "GET_AUDIENCE",
		source: extensionMessageSource,
		data: {
			containerId,
		},
	};

	const messageRelay = useMessageRelay();

	const [clientId, setClientId] = React.useState<string | undefined>("");
	const [audienceState, setAudienceState] = React.useState<AudienceClientMetaData[]>([]);
	const [audienceHistory, setAudienceHistory] = React.useState<readonly AudienceChangeLogEntry[]>(
		[],
	);

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to Audience
		 */
		const inboundMessageHandlers: InboundHandlers = {
			["AUDIENCE_EVENT"]: (untypedMessage) => {
				const message: AudienceSummaryMessage = untypedMessage as AudienceSummaryMessage;

				setClientId(message.data.clientId);
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

		messageRelay.on("message", messageHandler);

		// Request the current Audience State of the Container using "AUDIENCE_EVENT" Message
		messageRelay.postMessage(getAudienceMessage);

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containerId, setClientId, setAudienceState, setAudienceHistory]);

	return (
		<_AudienceView
			clientId={clientId}
			audienceClientMetaData={audienceState}
			onRenderAudienceMember={defaultRenderOptions.onRenderAudienceMember}
			audienceHistory={audienceHistory}
		/>
	);
}
