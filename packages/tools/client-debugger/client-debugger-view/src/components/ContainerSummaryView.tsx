/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IconButton, IStackItemStyles, Stack, StackItem, TooltipHost } from "@fluentui/react";
import { useId } from "@fluentui/react-hooks";
import React from "react";

import { ContainerStateChangeMessage, ContainerStateMetadata, handleIncomingMessage, HasContainerId, IDebuggerMessage, IMessageRelay, InboundHandlers } from "@fluid-tools/client-debugger";
import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";

import { initializeFluentUiIcons } from "../InitializeIcons";
import { connectionStateToString } from "../Utilities";
import { useMessageRelay } from "../MessageRelayContext";
import { Waiting } from "./Waiting";

// Ensure FluentUI icons are initialized for use below.
initializeFluentUiIcons();

// TODOs:
// - Add info tooltips (with question mark icons?) for each piece of Container status info to
//   help education consumers as to what the different statuses mean.

/**
 * {@link ContainerSummaryView} input props.
 */
export type ContainerSummaryViewProps = HasContainerId;

/**
 * Debugger view displaying basic Container stats.
 */
export function ContainerSummaryView(props: ContainerSummaryViewProps): React.ReactElement {
	const { containerId } = props;

	const messageRelay: IMessageRelay = useMessageRelay();

	const [containerState, setContainerState] = React.useState<
		ContainerStateMetadata | undefined
	>();

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to the registry.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			["CONTAINER_STATE_CHANGE"]: (untypedMessage) => {
				const message = untypedMessage as ContainerStateChangeMessage;
				if (message.data.containerId === containerId) {
					setContainerState(message.data.containerState);
					return true;
				}
				return false;
			},
		};

		/**
		 * Event handler for messages coming from the webpage.
		 */
		function messageHandler(message: Partial<IDebuggerMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers, {
				context: "ContainerSummaryView", // TODO: fix
			});
		}

		messageRelay.on("message", messageHandler);

		// Reset Container State data, to ensure we aren't displaying stats for the wrong container while
		// we wait for a response from the new debugger.
		// eslint-disable-next-line unicorn/no-useless-undefined
		setContainerState(undefined);

		// Request state info for the newly specified containerId
		messageRelay.postMessage({
			type: "GET_CONTAINER_STATE",
			data: {
				containerId,
			},
		});

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containerId, setContainerState, messageRelay]);

	if (containerState === undefined) {
		return <Waiting label="Waiting for Container Summary data." />;
	}

	function tryConnect(): void {
		messageRelay.postMessage({
			type: "CONNECT_CONTAINER",
			data: {
				containerId,
			},
		});
	}

	function forceDisconnect(): void {
		messageRelay.postMessage({
			type: "DISCONNECT_CONTAINER",
			data: {
				containerId,
				/* TODO: Specify debugger reason here once it is supported */
			},
		});
	}

	function closeContainer(): void {
		messageRelay.postMessage({
			type: "CLOSE_CONTAINER",
			data: {
				containerId,
				/* TODO: Specify debugger reason here once it is supported */
			},
		});
	}

	return (
		<_ContainerSummaryView
			{...containerState}
			tryConnect={tryConnect}
			forceDisconnect={forceDisconnect}
			closeContainer={closeContainer}
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
		nickname,
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
					<b>Container</b>: {nickname !== undefined ? `${nickname} (${id})` : { id }}
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
