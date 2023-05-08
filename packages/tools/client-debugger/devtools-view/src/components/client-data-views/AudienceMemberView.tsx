/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack, StackItem } from "@fluentui/react";
import { tokens } from "@fluentui/react-components";
import React from "react";

import { IClient } from "@fluidframework/protocol-definitions";

import { AudienceMember } from "../../Audience";
import { Accordion } from "../utility-components";

/**
 * Input props describing a Fluid {@link @fluidframework/fluid-static#IMember | audience member}.
 */
export interface AudienceMemberViewProps {
	/**
	 * The member of the audience to display.
	 */
	audienceMember: AudienceMember;

	/**
	 * My client connection ID, if the Container is connected.
	 */
	myClientId: string | undefined;

	/**
	 * My client connection, if the Container is connected.
	 */
	myClientConnection: IClient | undefined;
}

/**
 * Displays basic information about the provided {@link AudienceMemberViewProps.audienceMember}.
 */
export function AudienceMemberView(props: AudienceMemberViewProps): React.ReactElement {
	const { audienceMember, myClientId, myClientConnection } = props;

	const connectionCount = audienceMember.clients.size;

	const isUserMyself =
		myClientConnection !== undefined && myClientConnection.user.id === audienceMember.userId;

	const accordionHeaderView = (
		<Stack>
			<StackItem>
				<b>User ID</b>: {`${audienceMember.userId}${isUserMyself ? " (me)" : ""}`}
			</StackItem>
			<StackItem>{`Connections: ${connectionCount}`}</StackItem>
		</Stack>
	);

	const headerBackgroundColor = isUserMyself
		? tokens.colorPaletteBlueBackground2
		: tokens.colorPaletteYellowBackground2;

	let view: React.ReactElement;
	if (connectionCount === 1) {
		const [clientId, client] = [...audienceMember.clients.entries()][0];
		view = (
			<SingleConnectionView
				clientId={clientId}
				client={client}
				isMyClient={clientId === myClientId}
				showClientIdEntry={true}
			/>
		);
	} else {
		view = (
			<MultipleConnectionsView myClientId={myClientId} connections={audienceMember.clients} />
		);
	}

	return (
		<Accordion
			header={accordionHeaderView}
			headerStyles={{
				root: {
					backgroundColor: headerBackgroundColor,
				},
			}}
		>
			{view}
		</Accordion>
	);
}

/**
 * {@link MultipleConnectionsView} input props.
 */
interface MultipleConnectionsView {
	connections: Map<string, IClient>;
	myClientId: string | undefined;
}

/**
 * Displays a list of Accordion drop-downs with details about each individual client connection.
 */
function MultipleConnectionsView(props: MultipleConnectionsView): React.ReactElement {
	const { connections, myClientId } = props;

	const clientViewList: React.ReactElement[] = [];
	for (const [clientId, client] of connections) {
		const isMyClient = myClientId === clientId;

		clientViewList.push(
			<Accordion
				key={clientId}
				header={<div>{`${clientId}${isMyClient ? " (me)" : ""}`}</div>}
			>
				<SingleConnectionView
					clientId={clientId}
					client={client}
					isMyClient={isMyClient}
					showClientIdEntry={false}
				/>
			</Accordion>,
		);
	}

	return (
		<Stack>
			<StackItem>
				<div>
					<b>Connections</b>
				</div>
			</StackItem>
			<StackItem>{clientViewList}</StackItem>
		</Stack>
	);
}

/**
 * {@link SingleConnectionView} input props.
 */
interface SingleConnectionViewProps {
	clientId: string;
	client: IClient;
	isMyClient: boolean;

	/**
	 * Whether or not to render a list entry for the client ID.
	 */
	showClientIdEntry: boolean;
}

/**
 * Displays a list of details about an individual client connection.
 */
function SingleConnectionView(props: SingleConnectionViewProps): React.ReactElement {
	const { clientId, client, isMyClient, showClientIdEntry } = props;
	return (
		<Stack>
			<StackItem>
				{showClientIdEntry ? (
					<StackItem>
						<b>Client ID</b>: {`${clientId}${isMyClient ? " (me)" : ""}`}
					</StackItem>
				) : (
					<></>
				)}
				<StackItem>
					<b>Connection Mode</b>: {client.mode}
				</StackItem>
				{client.permission.length === 0 ? (
					<></>
				) : (
					<StackItem>
						<b>Permissions</b>: {client.permission.join(", ")}
					</StackItem>
				)}
				{client.scopes.length === 0 ? (
					<></>
				) : (
					<StackItem>
						<b>Scopes</b>: {client.scopes.join(", ")}
					</StackItem>
				)}
			</StackItem>
		</Stack>
	);
}
