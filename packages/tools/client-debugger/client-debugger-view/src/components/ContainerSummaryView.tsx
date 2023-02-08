/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IconButton, IStackItemStyles, Stack, StackItem, TooltipHost } from "@fluentui/react";
import { useId } from "@fluentui/react-hooks";
import React from "react";

import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";

import { HasClientDebugger } from "../CommonProps";
import { useMyClientConnection, useMyClientId } from "../ReactHooks";
import { connectionStateToString } from "../Utilities";

// TODOs:
// - Add info tooltips (with question mark icons?) for each piece of Container status info to
//   help education consumers as to what the different statuses mean.

/**
 * {@link ContainerSummaryView} input props.
 */
export type ContainerSummaryViewProps = HasClientDebugger;

/**
 * Debugger view displaying basic Container stats.
 */
export function ContainerSummaryView(props: ContainerSummaryViewProps): React.ReactElement {
	const { clientDebugger } = props;
	const { container, containerId } = clientDebugger;

	// #region Audience state

	const myClientId = useMyClientId(clientDebugger);
	const myClientConnection = useMyClientConnection(clientDebugger);

	// #endregion

	// #region Container State

	const [containerAttachState, setContainerAttachState] = React.useState<AttachState>(
		container.attachState,
	);
	const [containerConnectionState, setContainerConnectionState] = React.useState<ConnectionState>(
		container.connectionState,
	);
	const [isContainerDirty, setIsContainerDirty] = React.useState<boolean>(container.isDirty);
	const [isContainerClosed, setIsContainerClosed] = React.useState<boolean>(container.closed);

	React.useEffect(() => {
		function onContainerAttached(): void {
			setContainerAttachState(container.attachState);
		}

		function onContainerConnectionChange(): void {
			setContainerConnectionState(container.connectionState);
		}

		function onContainerDirty(): void {
			setIsContainerDirty(true);
		}

		function onContainerSaved(): void {
			setIsContainerDirty(false);
		}

		function onContainerClosed(): void {
			setIsContainerClosed(true);
		}

		container.on("attached", onContainerAttached);
		container.on("connected", onContainerConnectionChange);
		container.on("disconnected", onContainerConnectionChange);
		container.on("dirty", onContainerDirty);
		container.on("saved", onContainerSaved);
		container.on("closed", onContainerClosed);

		setContainerAttachState(container.attachState);
		setContainerConnectionState(container.connectionState);
		setIsContainerDirty(container.isDirty);
		setIsContainerClosed(container.closed);

		return (): void => {
			container.off("attached", onContainerAttached);
			container.off("connected", onContainerConnectionChange);
			container.off("disconnected", onContainerConnectionChange);
			container.off("dirty", onContainerDirty);
			container.off("saved", onContainerSaved);
			container.off("closed", onContainerClosed);
		};
	}, [
		container,
		setContainerAttachState,
		setContainerConnectionState,
		setIsContainerDirty,
		setIsContainerClosed,
	]);

	// #endregion

	// Only show core Container state until the Container itself is closed (disposed).
	// After that, just display a note indicating that it has been closed.
	// All other state data at that point is obsolete.
	let innerStateView: React.ReactElement;
	// eslint-disable-next-line unicorn/prefer-ternary
	if (isContainerClosed) {
		innerStateView = (
			<StackItem>
				<span>
					<b>Container Status</b>: Closed
				</span>
			</StackItem>
		);
	} else {
		innerStateView = (
			<>
				<StackItem>
					<span>
						<b>Attach State</b>: {containerAttachState}
					</span>
				</StackItem>
				<StackItem>
					<span>
						<b>Connection State</b>: {connectionStateToString(containerConnectionState)}
					</span>
				</StackItem>
				<StackItem>
					<span>
						<b>Local Edit State</b>: {isContainerDirty ? "Dirty" : "Saved"}
					</span>
				</StackItem>
				<StackItem>
					{myClientId === undefined ? (
						<></>
					) : (
						<span>
							<b>Client ID</b>: {myClientId}
						</span>
					)}
				</StackItem>
				<StackItem>
					{myClientConnection === undefined ? (
						<></>
					) : (
						<span>
							<b>Audience ID</b>: {myClientConnection.user.id}
						</span>
					)}
				</StackItem>
				<StackItem align="end">
					<ActionsBar
						isContainerConnected={
							containerConnectionState === ConnectionState.Connected
						}
						tryConnect={(): void => container.connect()}
						forceDisconnect={(): void => container.disconnect()}
						closeContainer={(): void => container.close()}
					/>
				</StackItem>
			</>
		);
	}

	return (
		<Stack className="container-summary-view">
			<StackItem>
				<span>
					<b>Container ID</b>: {containerId}
				</span>
			</StackItem>
			{innerStateView}
		</Stack>
	);
}

interface ActionsBarProps {
	isContainerConnected: boolean;
	tryConnect(): void;
	forceDisconnect(): void;
	closeContainer(): void;
}

function ActionsBar(props: ActionsBarProps): React.ReactElement {
	const { isContainerConnected, tryConnect, forceDisconnect, closeContainer } = props;

	const connectButtonTooltipId = useId("connect-button-tooltip");
	const disconnectButtonTooltipId = useId("disconnect-button-tooltip");
	const disposeContainerButtonTooltipId = useId("dispose-container-button-tooltip");

	const changeConnectionStateButton = isContainerConnected ? (
		<TooltipHost content="Disconnect Container" id={disconnectButtonTooltipId}>
			<IconButton
				onClick={forceDisconnect}
				menuIconProps={{ iconName: "PlugDisconnected" }}
				aria-describedby={disconnectButtonTooltipId}
			/>
		</TooltipHost>
	) : (
		<TooltipHost content="Connect Container" id={connectButtonTooltipId}>
			<IconButton
				onClick={tryConnect}
				menuIconProps={{ iconName: "PlugConnected" }}
				aria-describedby={connectButtonTooltipId}
			/>
		</TooltipHost>
	);

	const disposeContainerButton = (
		<TooltipHost content="Close Container" id={disposeContainerButtonTooltipId}>
			<IconButton
				onClick={closeContainer}
				menuIconProps={{ iconName: "Delete" }}
				aria-describedby={disposeContainerButtonTooltipId}
			/>
		</TooltipHost>
	);

	const itemStyles: IStackItemStyles = {
		root: {
			padding: "5px",
		},
	};

	return (
		<Stack horizontal>
			<StackItem styles={itemStyles}>{changeConnectionStateButton}</StackItem>
			<StackItem styles={itemStyles}>{disposeContainerButton}</StackItem>
		</Stack>
	);
}
