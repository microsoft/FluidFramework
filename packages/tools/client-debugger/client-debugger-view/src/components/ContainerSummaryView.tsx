/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Stack, StackItem } from "@fluentui/react";
import React from "react";

import { ContainerStateMetadata } from "@fluid-tools/client-debugger";
import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";

import { HasClientDebugger } from "../CommonProps";
import { useMyClientConnection, useMyClientId } from "../ReactHooks";
import { connectionStateToString } from "../Utilities";

/**
 * {@link ContainerSummaryView} input props.
 */
export type ContainerSummaryViewProps = HasClientDebugger;

/**
 * Debugger view displaying basic Container stats.
 */
export function ContainerSummaryView(props: ContainerSummaryViewProps): React.ReactElement {
	const { clientDebugger } = props;
	const { container, containerNickname, containerId } = clientDebugger;

	const myClientId = useMyClientId(clientDebugger);
	const myClientConnection = useMyClientConnection(clientDebugger);

	const [containerAttachState, setContainerAttachState] = React.useState<AttachState>(
		container.attachState,
	);
	const [containerConnectionState, setContainerConnectionState] = React.useState<ConnectionState>(
		container.connectionState,
	);
	const [isContainerClosed, setIsContainerClosed] = React.useState<boolean>(container.closed);

	React.useEffect(() => {
		function onContainerAttached(): void {
			setContainerAttachState(container.attachState);
		}

		function onContainerConnectionChange(): void {
			setContainerConnectionState(container.connectionState);
		}

		function onContainerClosed(): void {
			setIsContainerClosed(true);
		}

		container.on("attached", onContainerAttached);
		container.on("connected", onContainerConnectionChange);
		container.on("disconnected", onContainerConnectionChange);
		container.on("closed", onContainerClosed);

		return (): void => {
			container.off("attached", onContainerAttached);
			container.off("connected", onContainerConnectionChange);
			container.off("disconnected", onContainerConnectionChange);
			container.off("closed", onContainerClosed);
		};
	}, [container, setContainerAttachState, setContainerConnectionState, setIsContainerClosed]);

	return (
		<_ContainerSummaryView
			id={containerId}
			nickname={containerNickname}
			attachState={containerAttachState}
			connectionState={containerConnectionState}
			closed={isContainerClosed}
			clientId={myClientId}
			audienceId={myClientConnection?.user.id}
		/>
	);
}

/**
 * {@link _ContainerSummaryView} input props.
 */
export type _ContainerSummaryViewProps = ContainerStateMetadata;

/**
 * Debugger view displaying basic Container stats.
 *
 * @remarks Operates strictly on raw data, so it can be potentially re-used in contexts that don't have
 * direct access to the Client Debugger.
 *
 * @internal
 */
export function _ContainerSummaryView(props: _ContainerSummaryViewProps): React.ReactElement {
	const { id, attachState, connectionState, closed, clientId, audienceId } = props;

	// Build up status string
	const statusComponents: string[] = [];
	if (closed) {
		statusComponents.push("Closed");
	} else {
		statusComponents.push(attachState);
		if (attachState === AttachState.Attached) {
			statusComponents.push(connectionStateToString(connectionState));
		}
	}
	const statusString = statusComponents.join(" | ");

	return (
		<Stack className="container-summary-view">
			<StackItem>
				<span>
					<b>Container ID</b>: {id}
				</span>
			</StackItem>
			<StackItem>
				<span>
					<b>Status</b>: {statusString}
				</span>
			</StackItem>
			<StackItem>
				{clientId === undefined ? (
					<></>
				) : (
					<span>
						<b>Client ID</b>: {clientId}
					</span>
				)}
			</StackItem>
			<StackItem>
				{audienceId === undefined ? (
					<></>
				) : (
					<span>
						<b>Audience ID</b>: {audienceId}
					</span>
				)}
			</StackItem>
		</Stack>
	);
}
