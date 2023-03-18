/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack, StackItem } from "@fluentui/react";
import React from "react";

// import { IClient } from "@fluidframework/protocol-definitions";

import { HasContainerId } from "@fluid-tools/client-debugger";

// import { combineMembersWithMultipleConnections } from "../Audience";
import { AudienceMemberViewProps } from "./client-data-views";

// TODOs:
// - Special annotation for the member elected as the summarizer
// - History of audience changes

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
 * Displays information about the provided {@link @fluidframework/fluid-static#IServiceAudience | audience}.
 *
 * @param props - See {@link AudienceViewProps}.
 */
export function AudienceView(props: AudienceViewProps): React.ReactElement {
	// const { containerId, onRenderAudienceMember } = props;

	// TODO: waiting for Ji's changes in https://github.com/microsoft/FluidFramework/pull/14507

	return (
		<Stack
			styles={{
				root: {
					height: "100%",
				},
			}}
		>
			<StackItem>
				<div className="audience-view-members-list">
					<h3>Audience members ({0})</h3>
				</div>
				{/* <MembersView
					audience={allAudienceMembers}
					myClientId={myClientId}
					myClientConnection={myClientConnection}
					onRenderAudienceMember={onRenderAudienceMember}
				/> */}
				<div>Waiting for functionality</div>
			</StackItem>
			<StackItem>
				<div className="history-list">
					<h3>History</h3>
				</div>
				{/* <HistoryView history={audienceHistory} /> */}
				<div>Waiting for functionality</div>
			</StackItem>
		</Stack>
	);
}

// /**
//  * {@link MembersView} input props.
//  */
// interface MembersViewProps {
// 	/**
// 	 * The current audience
// 	 */
// 	audience: Map<string, IClient>;

// 	/**
// 	 * My client ID, if the Container is connected.
// 	 */
// 	myClientId: string | undefined;

// 	/**
// 	 * My client connection data, if the Container is connected.
// 	 */
// 	myClientConnection: IClient | undefined;

// 	/**
// 	 * Callback to render data about an individual audience member.
// 	 */
// 	onRenderAudienceMember(props: AudienceMemberViewProps): React.ReactElement;
// }

// /**
//  * Displays a list of current audience members and their metadata.
//  */
// function MembersView(props: MembersViewProps): React.ReactElement {
// 	const { audience, myClientId, myClientConnection, onRenderAudienceMember } = props;

// 	const transformedAudience = combineMembersWithMultipleConnections(audience);

// 	const memberViews: React.ReactElement[] = [];
// 	for (const member of transformedAudience.values()) {
// 		memberViews.push(
// 			<StackItem key={member.userId}>
// 				{onRenderAudienceMember({
// 					audienceMember: member,
// 					myClientId,
// 					myClientConnection,
// 				})}
// 			</StackItem>,
// 		);
// 	}

// 	return <Stack>{memberViews}</Stack>;
// }

// /**
//  * {@link HistoryView} input props.
//  */
// interface HistoryViewProps {
// 	/**
// 	 * History of audience changes tracked by the debugger.
// 	 */
// 	history: readonly AudienceChangeLogEntry[];
// }

// /**
//  * Displays a historical log of audience member changes.
//  */
// function HistoryView(props: HistoryViewProps): React.ReactElement {
// 	const { history } = props;

// 	const nowTimeStamp = new Date();
// 	const historyViews: React.ReactElement[] = [];

// 	// Reverse history such that newest events are displayed first
// 	for (let i = history.length - 1; i >= 0; i--) {
// 		const changeTimeStamp = new Date(history[i].timestamp);
// 		const wasChangeToday = nowTimeStamp.getDate() === changeTimeStamp.getDate();

// 		const accordianBackgroundColor: IStackItemStyles = {
// 			root: {
// 				background: history[i].changeKind === "added" ? "#90ee90" : "#FF7377",
// 				borderStyle: "solid",
// 				borderWidth: 1,
// 				borderColor: DefaultPalette.neutralTertiary,
// 				padding: 3,
// 			},
// 		};

// 		const iconStyle: IStackItemStyles = {
// 			root: {
// 				padding: 10,
// 			},
// 		};

// 		historyViews.push(
// 			<div key={`audience-history-info-${i}`}>
// 				<Stack horizontal={true} styles={accordianBackgroundColor}>
// 					<StackItem styles={iconStyle}>
// 						<Icon
// 							iconName={
// 								history[i].changeKind === "added" ? "AddFriend" : "UserRemove"
// 							}
// 							title={
// 								history[i].changeKind === "added" ? "Member Joined" : "Member Left"
// 							}
// 						/>
// 					</StackItem>
// 					<StackItem>
// 						<div key={`${history[i].clientId}-${history[i].changeKind}`}>
// 							<b>Client ID: </b>
// 							{history[i].clientId}
// 							<br />
// 							<b>Time: </b>{" "}
// 							{wasChangeToday
// 								? changeTimeStamp.toTimeString()
// 								: changeTimeStamp.toDateString()}
// 							<br />
// 						</div>
// 					</StackItem>
// 				</Stack>
// 			</div>,
// 		);
// 	}

// 	return (
// 		<Stack
// 			styles={{
// 				root: {
// 					overflowY: "auto",
// 					height: "300px",
// 				},
// 			}}
// 		>
// 			<div style={{ overflowY: "scroll" }}>{historyViews}</div>
// 		</Stack>
// 	);
// }
