/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IconButton, IStackItemStyles, Stack, StackItem, TooltipHost } from "@fluentui/react";
import { useId } from "@fluentui/react-hooks";
import React from "react";

import { ContainerStateMetadata } from "@fluid-tools/client-debugger";
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
	const { container, containerNickname, containerId } = clientDebugger;

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

		setContainerAttachState(container.attachState);
		setContainerConnectionState(container.connectionState);
		setIsContainerClosed(container.closed);

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
			tryConnect={(): void => container.connect()}
			forceDisconnect={(): void =>
				container.disconnect(/* TODO: Specify debugger reason here once it is supported */)
			}
			closeContainer={(): void =>
				container.close(/* TODO: Specify debugger reason here once it is supported */)
			}
		/>
	);
}

/**
 * Container actions supported by the debugger view.
 */
export interface IContainerActions {
	/**
	 * Attempt to connect a disconnected Container.
	 *
	 * @remarks Button controls will be disabled if this is not provided.
	 */
	tryConnect?: () => void;

	/**
	 * Disconnect a connected Container.
	 *
	 * @remarks Button controls will be disabled if this is not provided.
	 */
	forceDisconnect?: () => void;

	/**
	 * Close the container.
	 *
	 * @remarks Button controls will be disabled if this is not provided.
	 */
	closeContainer?: () => void;
}

/**
 * {@link _ContainerSummaryView} input props.
 */
export interface _ContainerSummaryViewProps extends ContainerStateMetadata, IContainerActions {}

/**
 * Debugger view displaying basic Container stats.
 *
 * @remarks Operates strictly on raw data, so it can be potentially re-used in contexts that don't have
 * direct access to the Client Debugger.
 *
 * @internal
 */
export function _ContainerSummaryView(props: _ContainerSummaryViewProps): React.ReactElement {
	const {
		id,
		attachState,
		connectionState,
		closed,
		clientId,
		audienceId,
		tryConnect,
		forceDisconnect,
		closeContainer,
	} = props;

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
			<StackItem align="end">
				<ActionsBar
					isContainerConnected={connectionState === ConnectionState.Connected}
					tryConnect={tryConnect}
					forceDisconnect={forceDisconnect}
					closeContainer={closeContainer}
				/>
			</StackItem>
		</Stack>
	);
}

interface ActionsBarProps extends IContainerActions {
	isContainerConnected: boolean;
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
				disabled={forceDisconnect === undefined}
				menuIconProps={{ iconName: "PlugDisconnected" }}
				aria-describedby={disconnectButtonTooltipId}
			/>
		</TooltipHost>
	) : (
		<TooltipHost content="Connect Container" id={connectButtonTooltipId}>
			<IconButton
				onClick={tryConnect}
				disabled={tryConnect === undefined}
				menuIconProps={{ iconName: "PlugConnected" }}
				aria-describedby={connectButtonTooltipId}
			/>
		</TooltipHost>
	);

	const disposeContainerButton = (
		<TooltipHost content="Close Container" id={disposeContainerButtonTooltipId}>
			<IconButton
				onClick={closeContainer}
				disabled={closeContainer === undefined}
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
