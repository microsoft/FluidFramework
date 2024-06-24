/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Divider } from "@fluentui/react-components";
import {
	AudienceSummary,
	GetAudienceSummary,
	type HasContainerKey,
	type IDevtoolsMessage,
	type InboundHandlers,
	handleIncomingMessage,
} from "@fluidframework/devtools-core/internal";
import type { IClient } from "@fluidframework/driver-definitions";
import React from "react";

import { useMessageRelay } from "../MessageRelayContext.js";

import { AudienceHistoryTable } from "./AudienceHistoryTable.js";
import { AudienceStateTable } from "./AudienceStateTable.js";
import { Waiting } from "./Waiting.js";

// TODOs:
// - Special annotation for the member elected as the summarizer

const loggingContext = "EXTENSION(AudienceView)";

/**
 * {@link AudienceView} input props.
 */
export type AudienceViewProps = HasContainerKey;

/**
 * Displays information about a container's audience.
 */
export function AudienceView(props: AudienceViewProps): React.ReactElement {
	const { containerKey } = props;

	const messageRelay = useMessageRelay();

	const [audienceData, setAudienceData] = React.useState<
		AudienceSummary.MessageData | undefined
	>();

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to Audience
		 */
		const inboundMessageHandlers: InboundHandlers = {
			[AudienceSummary.MessageType]: async (untypedMessage) => {
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
		messageRelay.postMessage(GetAudienceSummary.createMessage({ containerKey }));

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containerKey, setAudienceData, messageRelay]);

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
				time: wasChangeToday ? changeTimeStamp.toTimeString() : changeTimeStamp.toDateString(),
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
	changeKind: "joined" | "left";
}
