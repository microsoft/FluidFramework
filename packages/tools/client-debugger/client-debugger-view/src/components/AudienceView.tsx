/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DefaultPalette, IStackItemStyles, Icon, Stack, StackItem } from "@fluentui/react";
import React from "react";

import { IClient } from "@fluidframework/protocol-definitions";

import { AudienceChangeLogEntry, AudienceClientMetaData } from "@fluid-tools/client-debugger";

import { combineMembersWithMultipleConnections } from "../Audience";
import { HasClientDebugger } from "../CommonProps";
import { useMyClientId } from "../ReactHooks";
import { AudienceMemberViewProps } from "./client-data-views";

// TODOs:
// - Special annotation for the member elected as the summarizer
// - History of audience changes

/**
 * {@link AudienceView} input props.
 */
export interface AudienceViewProps extends HasClientDebugger {
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
	const { clientDebugger, onRenderAudienceMember } = props;
	const { audience } = clientDebugger;

	const myClientId = useMyClientId(clientDebugger);

	const [allAudienceMembers, setAllAudienceMembers] = React.useState<Map<string, IClient>>(
		audience.getMembers(),
	);
	const [audienceHistory, setAudienceHistory] = React.useState<readonly AudienceChangeLogEntry[]>(
		clientDebugger.getAudienceHistory(),
	);

	React.useEffect(() => {
		function onAudienceMembersChanged(): void {
			setAllAudienceMembers(audience.getMembers());
			setAudienceHistory(clientDebugger.getAudienceHistory());
		}

		audience.on("addMember", onAudienceMembersChanged);
		audience.on("removeMember", onAudienceMembersChanged);

		return (): void => {
			audience.off("addMember", onAudienceMembersChanged);
			audience.off("removeMember", onAudienceMembersChanged);
		};
	}, [clientDebugger, audience, setAllAudienceMembers, setAudienceHistory]);

	const audienceClientMetaData: AudienceClientMetaData[] = [...allAudienceMembers.entries()].map(
		([clientId, client]): AudienceClientMetaData => ({ clientId, client }),
	);

	return (
		<_AudienceView
			clientId={myClientId}
			audienceClientMetaData={audienceClientMetaData}
			onRenderAudienceMember={onRenderAudienceMember}
			audienceHistory={audienceHistory}
		/>
	);
}

/**
 * {@link _AudienceView} input props.
 *
 * @privateRemarks TODO: Remove onRenderAudienceMember
 */
export interface _AudienceViewProps {
	/*
	 * Local users's clientId.
	 */
	clientId: string | undefined;

	/**
	 * Metadata of audiences containing clientId and IClient.
	 */
	audienceClientMetaData: AudienceClientMetaData[];

	/**
	 * Callback to render data about an individual audience member.
	 */
	onRenderAudienceMember: (props: AudienceMemberViewProps) => React.ReactElement;

	/**
	 * History of audience connected or disconnected to the container.
	 */
	audienceHistory: readonly AudienceChangeLogEntry[];
}

/**
 * Audience View displaying current audience members and audience history
 *
 * @remarks Operates strictly on raw data, so it can be potentially re-used in contexts that don't have
 * direct access to the Client Debugger.
 *
 * @internal
 */
export function _AudienceView(props: _AudienceViewProps): React.ReactElement {
	const { clientId, audienceClientMetaData, onRenderAudienceMember, audienceHistory } = props;

	const myClientConnection = audienceClientMetaData.find(
		(audience) => audience.clientId === clientId,
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
				<div className="audience-view-members-list">
					<h3>Audience members ({audienceClientMetaData.length})</h3>
				</div>
				<MembersView
					audience={audienceClientMetaData}
					myClientId={clientId}
					myClientConnection={myClientConnection}
					onRenderAudienceMember={onRenderAudienceMember}
				/>
			</StackItem>
			<StackItem>
				<div className="history-list">
					<h3>History</h3>
				</div>
				<HistoryView history={audienceHistory} />
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
