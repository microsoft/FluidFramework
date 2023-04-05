/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import {
	TableBody,
	TableCell,
	TableRow,
	Table,
	TableHeader,
	TableHeaderCell,
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

	// Columns for rendering audience state 
	const audienceStateColumns = [
		{ columnKey: "clientId", label: "ClientId" },
		{ columnKey: "userId", label: "UserId" },
		{ columnKey: "mode", label: "Mode" },
		{ columnKey: "scopes", label: "Scopes" },
	];
	
	// Columns for rendering audience history  
	const audienceHistoryColumns = [
		{ columnKey: "clientId", label: "ClientId" },
		{ columnKey: "time", label: "Time" },
	];
	
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

	console.log("audienceData.audienceHistory:", audienceHistoryItems);

	// TODO: Determine if myClientMetaData is necessary 
	// const myClientMetadata = audienceData.audienceState.find(
	// 	(audience) => audience.clientId === audienceData.clientId,
	// )?.client;

	return (
		<div>
			<Table size="small" aria-label="Audience state table">
				<TableHeader>
					<TableRow>
						{audienceStateColumns.map((column, columnIndex) => (
							<TableHeaderCell key={columnIndex}>{column.label}</TableHeaderCell>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{audienceStateItems.map((item, itemIndex) => (
						<TableRow key={itemIndex}>
							<TableCell>{item.clientId}</TableCell>
							<TableCell>{item.userId} </TableCell>
							<TableCell>{item.mode}</TableCell>
							<TableCell>
								{item.scopes.map((scope, scopeIndex) => (
									<div key={scopeIndex}>{scope}</div>
								))}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			<Table size="small" aria-label="Audience history table">
				<TableHeader>
					<TableRow>
						{audienceHistoryColumns.map((column, columnIndex) => (
							<TableHeaderCell key={columnIndex}>{column.label}</TableHeaderCell>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{audienceHistoryItems.map((item, itemIndex) => (
						<TableRow key={itemIndex}>
							<TableCell>{item.clientId}</TableCell>
							<TableCell>{item.time} </TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

/**
 * Filtered audience state data for {@link AudienceStateDataFilter}
 */
interface FilteredAudienceStateData {
	clientId: string;
	userId: string;
	mode: string;
	scopes: string[];
}

/**
 * Removes unncessary data in audienceData.audienceState
 */
function AudienceStateDataFilter(
	audienceStateData: AudienceClientMetaData[],
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
interface FilteredAudienceHistoryData {
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
