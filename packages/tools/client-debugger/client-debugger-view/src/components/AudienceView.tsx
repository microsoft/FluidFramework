/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { Divider } from "@fluentui/react-components";

import {
	AudienceSummary,
	GetAudienceSummary,
	handleIncomingMessage,
	HasContainerId,
	IDevtoolsMessage,
	InboundHandlers,
} from "@fluid-tools/client-debugger";
import { IClient } from "@fluidframework/protocol-definitions";
import { useMessageRelay } from "../MessageRelayContext";
import { AudienceStateTable } from "./AudienceStateTable";
import { AudienceHistoryTable } from "./AudienceHistoryTable";
import { Waiting } from "./Waiting";

// TODOs:
// - Special annotation for the member elected as the summarizer

const loggingContext = "EXTENSION(AudienceView)";

/**
 * {@link AudienceView} input props.
 */
export type AudienceViewProps = HasContainerId;

/**
 * Displays information about a container's audience.
 */
export function AudienceView(props: AudienceViewProps): React.ReactElement {
	const { containerId } = props;

	const messageRelay = useMessageRelay();

	const [audienceData, setAudienceData] = React.useState<
		AudienceSummary.MessageData | undefined
	>();

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to Audience
		 */
		const inboundMessageHandlers: InboundHandlers = {
			[AudienceSummary.MessageType]: (untypedMessage) => {
				const message = untypedMessage as AudienceSummary.Message;

				setAudienceData(message.data);

				return true;
			},
		};

		/**
		 * Event handler for messages coming from the Message Relay
		 */
		function messageHandler(message: Partial<IDevtoolsMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers, {
				context: loggingContext,
			});
		}

		messageRelay.on("message", messageHandler);

		// Request the current Audience State of the Container
		messageRelay.postMessage(
			GetAudienceSummary.createMessage({
				containerId,
			}),
		);

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containerId, setAudienceData, messageRelay]);

	if (audienceData === undefined) {
		return <Waiting label="Waiting for Audience data." />;
	}

	const myClientMetadata = audienceData.audienceState.find(
		(audience) => audience.clientId === audienceData.clientId,
	)?.client;

	const audienceStateItems: TransformedAudienceStateData[] = audienceData.audienceState.map(
		(entry) => {
			return {
				clientId: entry.clientId,
				userId: entry.client.user.id,
				mode: entry.client.mode,
				scopes: entry.client.scopes,
				myClientConnection: myClientMetadata,
			};
		},
	);

	const nowTimeStamp = new Date();
	const audienceHistoryItems: TransformedAudienceHistoryData[] = audienceData.audienceHistory
		.map((entry) => {
			const changeTimeStamp = new Date(entry.timestamp);
			const wasChangeToday = nowTimeStamp.getDate() === changeTimeStamp.getDate();

			return {
				clientId: entry.clientId,
				time: wasChangeToday
					? changeTimeStamp.toTimeString()
					: changeTimeStamp.toDateString(),
				changeKind: entry.changeKind,
			};
		})
		.reverse();

	return (
		<>
			<Divider appearance="brand"> Audience State </Divider>
			<AudienceStateTable audienceStateItems={audienceStateItems} />
			<Divider appearance="brand"> Audience History </Divider>
			<AudienceHistoryTable audienceHistoryItems={audienceHistoryItems} />
		</>
	);
}

/**
 * Transformed audience state data type to render audience state.
 */
export interface TransformedAudienceStateData {
	clientId: string;
	userId: string;
	mode: string;
	scopes: string[];
	myClientConnection: IClient | undefined;
}

/**
 * Transformed audience history data type to render audience history.
 */
export interface TransformedAudienceHistoryData {
	clientId: string;
	time: string;
	changeKind: string;
}
