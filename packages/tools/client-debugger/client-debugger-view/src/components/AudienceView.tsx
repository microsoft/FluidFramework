/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import {
	Divider,
} from "@fluentui/react-components";

import {
	AudienceChangeLogEntry,
	AudienceClientMetadata,
	AudienceSummaryMessage,
	AudienceSummaryMessageData,
	AudienceSummaryMessageType,
	handleIncomingMessage,
	HasContainerId,
	IDebuggerMessage,
	InboundHandlers,
} from "@fluid-tools/client-debugger";

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
		AudienceSummaryMessageData | undefined
	>();

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to Audience
		 */
		const inboundMessageHandlers: InboundHandlers = {
			[AudienceSummaryMessageType]: (untypedMessage) => {
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

		// Request the current Audience State of the Container
		messageRelay.postMessage({
			type: "GET_AUDIENCE",
			data: {
				containerId,
			},
		});

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containerId, setAudienceData, messageRelay]);

	if (audienceData === undefined) {
		return <Waiting label="Waiting for Audience data." />;
	}

	const audienceStateItems = AudienceStateDataFilter(audienceData.audienceState);
	const audienceHistoryItems = AudienceHistoryDataFilter(audienceData.audienceHistory).reverse();

	// TODO: Determine if myClientMetaData is necessary
	// const myClientMetadata = audienceData.audienceState.find(
	// 	(audience) => audience.clientId === audienceData.clientId,
	// )?.client;

	return (
		<>
			<Divider appearance="brand"> Audience State </Divider>
			<AudienceStateTable audienceStateItems={audienceStateItems}/>
			<Divider appearance="brand"> Audience History </Divider>
			<AudienceHistoryTable audienceHistoryItems={audienceHistoryItems}/>
		</>
	);
}

/**
 * Filtered audience state data for {@link AudienceStateDataFilter}
 */
export interface FilteredAudienceStateData {
	clientId: string;
	userId: string;
	mode: string;
	scopes: string[];
}

/**
 * Removes unncessary data in audienceData.audienceState
 */
function AudienceStateDataFilter(
	audienceStateData: AudienceClientMetadata[],
): FilteredAudienceStateData[] {
	return audienceStateData.map((entry) => {
		const clientId = entry.clientId;
		const userId = entry.client.user.id;
		const mode = entry.client.mode;
		const scopes = entry.client.scopes;

		return {
			clientId,
			userId,
			mode,
			scopes,
		};
	});
}

/**
 * Filtered audience state data for {@link AudienceHistoryDataFilter}
 */
export interface FilteredAudienceHistoryData {
	clientId: string;
	time: string;
}

/**
 * Removes unncessary data in audienceData.audienceHistory
 */
function AudienceHistoryDataFilter(
	audienceHistoryData: readonly AudienceChangeLogEntry[],
): FilteredAudienceHistoryData[] {
	const nowTimeStamp = new Date();

	return audienceHistoryData.map((entry) => {
		const changeTimeStamp = new Date(entry.timestamp);
		const wasChangeToday = nowTimeStamp.getDate() === changeTimeStamp.getDate();

		const clientId = entry.clientId;
		const time = wasChangeToday
			? changeTimeStamp.toTimeString()
			: changeTimeStamp.toDateString();

		return {
			clientId,
			time,
		};
	});
}
