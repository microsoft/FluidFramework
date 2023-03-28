/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import {
	handleIncomingMessage,
	IDebuggerMessage,
	InboundHandlers,
	AudienceSummaryMessage,
	HasContainerId,
	AudienceSummaryMessageData,
	ISourcedDebuggerMessage,
} from "@fluid-tools/client-debugger";
import { defaultRenderOptions, _AudienceView } from "@fluid-tools/client-debugger-view";
import { extensionMessageSource } from "../messaging";
import { useMessageRelay } from "./MessageRelayContext";
import { Waiting } from "./Waiting";

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
	const getAudienceMessage: ISourcedDebuggerMessage = {
		type: "GET_AUDIENCE",
		source: extensionMessageSource,
		data: {
			containerId,
		},
	};

	const messageRelay = useMessageRelay();

	const [audienceData, setAudienceData] = React.useState<
		AudienceSummaryMessageData | undefined
	>();

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to Audience
		 */
		const inboundMessageHandlers: InboundHandlers = {
			["AUDIENCE_EVENT"]: (untypedMessage) => {
				const message: AudienceSummaryMessage = untypedMessage as AudienceSummaryMessage;

				setAudienceData(message.data);

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
	}, [containerId, setAudienceData]);

	if (audienceData === undefined) {
		return <Waiting label="Waiting for Audience data." />;
	}

	return (
		<_AudienceView
			clientId={audienceData.clientId}
			audienceClientMetaData={audienceData.audienceState}
			onRenderAudienceMember={defaultRenderOptions.onRenderAudienceMember}
			audienceHistory={audienceData.audienceHistory}
		/>
	);
}
