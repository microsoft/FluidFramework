/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DefaultPalette, Icon, IStackItemStyles, Stack, StackItem } from "@fluentui/react";
import React from "react";

import { IClient } from "@fluidframework/protocol-definitions";
import {
	AudienceChangeLogEntry,
	AudienceClientMetadata,
	AudienceSummaryMessage,
	AudienceSummaryMessageData,
	AudienceSummaryMessageType,
	GetAudienceMessage,
	handleIncomingMessage,
	HasContainerId,
	IDebuggerMessage,
	InboundHandlers,
} from "@fluid-tools/client-debugger";

import { useMessageRelay } from "../MessageRelayContext";
import { combineMembersWithMultipleConnections } from "../Audience";
import { Waiting } from "./Waiting";
import { AudienceMemberView } from "./client-data-views";

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
		messageRelay.postMessage<GetAudienceMessage>({
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

	const myClientMetadata = audienceData.audienceState.find(
		(audience) => audience.clientId === audienceData.clientId,
	)?.client;

	return (
		<Stack
			styles={{
				root: {
					height: "100%",
				},
			}}
		>
			<StackItem>
				<h3>Audience members: ({audienceData.audienceState.length})</h3>
				<MembersView
					audience={audienceData.audienceState}
					myClientId={audienceData.clientId}
					myClientConnection={myClientMetadata}
				/>
			</StackItem>
			<StackItem>
				<h3>History</h3>
				<HistoryView history={audienceData.audienceHistory} />
			</StackItem>
		</Stack>
	);
}

/**
 * {@link MembersView} input props.
 */
interface MembersViewProps {
	/**
	 * The current audience
	 */
	audience: AudienceClientMetadata[];

	/**
	 * My client ID, if the Container is connected.
	 */
	myClientId: string | undefined;

	/**
	 * My client connection data, if the Container is connected.
	 */
	myClientConnection: IClient | undefined;
}

/**
 * Displays a list of current audience members and their metadata.
 */
function MembersView(props: MembersViewProps): React.ReactElement {
	const { audience, myClientId, myClientConnection } = props;

	const transformedAudience = combineMembersWithMultipleConnections(audience);

	const memberViews: React.ReactElement[] = [];
	for (const member of transformedAudience.values()) {
		memberViews.push(
			<StackItem key={member.userId}>
				<AudienceMemberView
					audienceMember={member}
					myClientId={myClientId}
					myClientConnection={myClientConnection}
				/>
			</StackItem>,
		);
	}

	return <Stack>{memberViews}</Stack>;
}

/**
 * {@link HistoryView} input props.
 */
interface HistoryViewProps {
	/**
	 * History of audience changes tracked by the debugger.
	 */
	history: readonly AudienceChangeLogEntry[];
}

/**
 * Displays a historical log of audience member changes.
 */
function HistoryView(props: HistoryViewProps): React.ReactElement {
	const { history } = props;

	const nowTimeStamp = new Date();
	const historyViews: React.ReactElement[] = [];

	// Reverse history such that newest events are displayed first
	for (let i = history.length - 1; i >= 0; i--) {
		const changeTimeStamp = new Date(history[i].timestamp);
		const wasChangeToday = nowTimeStamp.getDate() === changeTimeStamp.getDate();

		const accordianBackgroundColor: IStackItemStyles = {
			root: {
				background: history[i].changeKind === "added" ? "#90ee90" : "#FF7377",
				borderStyle: "solid",
				borderWidth: 1,
				borderColor: DefaultPalette.neutralTertiary,
				padding: 3,
			},
		};

		const iconStyle: IStackItemStyles = {
			root: {
				padding: 10,
			},
		};

		historyViews.push(
			<div key={`audience-history-info-${i}`}>
				<Stack horizontal={true} styles={accordianBackgroundColor}>
					<StackItem styles={iconStyle}>
						<Icon
							iconName={
								history[i].changeKind === "added" ? "AddFriend" : "UserRemove"
							}
							title={
								history[i].changeKind === "added" ? "Member Joined" : "Member Left"
							}
						/>
					</StackItem>
					<StackItem>
						<div key={`${history[i].clientId}-${history[i].changeKind}`}>
							<b>Client ID: </b>
							{history[i].clientId}
							<br />
							<b>Time: </b>{" "}
							{wasChangeToday
								? changeTimeStamp.toTimeString()
								: changeTimeStamp.toDateString()}
							<br />
						</div>
					</StackItem>
				</Stack>
			</div>,
		);
	}

	return (
		<Stack
			styles={{
				root: {
					overflowY: "auto",
					height: "300px",
				},
			}}
		>
			<div style={{ overflowY: "scroll" }}>{historyViews}</div>
		</Stack>
	);
}
