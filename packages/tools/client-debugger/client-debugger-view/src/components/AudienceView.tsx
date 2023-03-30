/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DefaultPalette, Icon, IStackItemStyles, Stack, StackItem } from "@fluentui/react";
import React from "react";

import { IClient } from "@fluidframework/protocol-definitions";
import {
	HasContainerId,
	AudienceChangeLogEntry,
	AudienceClientMetaData,
	IDebuggerMessage,
	handleIncomingMessage,
	InboundHandlers,
	AudienceSummaryMessageData,
	AudienceSummaryMessage,
} from "@fluid-tools/client-debugger";

import { useMessageRelay } from "../MessageRelayContext";
import { combineMembersWithMultipleConnections } from "../Audience";
import { AudienceMemberViewProps } from "./client-data-views";
import { Waiting } from "./Waiting";

// TODOs:
// - Special annotation for the member elected as the summarizer

const loggingContext = "EXTENSION(AudienceView)";

/**
 * {@link AudienceView} input props.
 */
export interface AudienceViewProps extends HasContainerId {
	/**
	 * Callback to render data about an individual audience member.
	 */
	onRenderAudienceMember(props: AudienceMemberViewProps): React.ReactElement;
}

/**
 * Displays information about a container's audience.
 */
export function AudienceView(props: AudienceViewProps): React.ReactElement {
	const { containerId, onRenderAudienceMember } = props;

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
					onRenderAudienceMember={onRenderAudienceMember}
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
	audience: AudienceClientMetaData[];

	/**
	 * My client ID, if the Container is connected.
	 */
	myClientId: string | undefined;

	/**
	 * My client connection data, if the Container is connected.
	 */
	myClientConnection: IClient | undefined;

	/**
	 * Callback to render data about an individual audience member.
	 */
	onRenderAudienceMember(props: AudienceMemberViewProps): React.ReactElement;
}

/**
 * Displays a list of current audience members and their metadata.
 */
function MembersView(props: MembersViewProps): React.ReactElement {
	const { audience, myClientId, myClientConnection, onRenderAudienceMember } = props;

	const transformedAudience = combineMembersWithMultipleConnections(audience);

	const memberViews: React.ReactElement[] = [];
	for (const member of transformedAudience.values()) {
		memberViews.push(
			<StackItem key={member.userId}>
				{onRenderAudienceMember({
					audienceMember: member,
					myClientId,
					myClientConnection,
				})}
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
