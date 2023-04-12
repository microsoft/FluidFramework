/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IconButton, IStackItemStyles, Stack, StackItem, TooltipHost } from "@fluentui/react";
import { useId } from "@fluentui/react-hooks";
import React from "react";

import {
	CloseContainer,
	ConnectContainer,
	ContainerStateChange,
	ContainerStateMetadata,
	DisconnectContainer,
	GetContainerState,
	handleIncomingMessage,
	HasContainerId,
	IMessageRelay,
	InboundHandlers,
	ISourcedDevtoolsMessage,
} from "@fluid-tools/client-debugger";
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
			[ContainerStateChange.MessageType]: (untypedMessage) => {
				const message = untypedMessage as ContainerStateChange.Message;
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
		function messageHandler(message: Partial<ISourcedDevtoolsMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers, {
				context: "ContainerSummaryView", // TODO: fix
			});
		}

		messageRelay.on("message", messageHandler);

		// Reset state with Container data, to ensure we aren't displaying stale data (for the wrong container) while we
		// wait for a response to the message sent below. Especially relevant for the Container-related views because this
		// component wont be unloaded and reloaded if the user just changes the menu selection from one Container to another.
		// eslint-disable-next-line unicorn/no-useless-undefined
		setContainerState(undefined);

		// Request state info for the newly specified containerId
		messageRelay.postMessage(GetContainerState.createMessage({ containerId }));

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containerId, setContainerState, messageRelay]);

	if (containerState === undefined) {
		return <Waiting label="Waiting for Container Summary data." />;
	}

	function tryConnect(): void {
		messageRelay.postMessage(
			ConnectContainer.createMessage({
				containerId,
			}),
		);
	}

	function forceDisconnect(): void {
		messageRelay.postMessage(
			DisconnectContainer.createMessage({
				containerId,
				/* TODO: Specify debugger reason here once it is supported */
			}),
		);
	}

	function closeContainer(): void {
		messageRelay.postMessage(
			CloseContainer.createMessage({
				containerId,
				/* TODO: Specify debugger reason here once it is supported */
			}),
		);
	}

	// Build up status string
	const statusComponents: string[] = [];
	if (closed) {
		statusComponents.push("Closed");
	} else {
		statusComponents.push(containerState.attachState);
		if (containerState.attachState === AttachState.Attached) {
			statusComponents.push(connectionStateToString(containerState.connectionState));
		}
	}
	const statusString = statusComponents.join(" | ");

	return (
		<Stack className="container-summary-view">
			<StackItem>
				<span>
					<b>Container</b>:{" "}
					{containerState.nickname !== undefined
						? `${containerState.nickname} (${containerState.id})`
						: containerState.id}
				</span>
			</StackItem>
			<StackItem>
				<span>
					<b>Status</b>: {statusString}
				</span>
			</StackItem>
			<StackItem>
				{containerState.clientId === undefined ? (
					<></>
				) : (
					<span>
						<b>Client ID</b>: {containerState.clientId}
					</span>
				)}
			</StackItem>
			<StackItem>
				{containerState.audienceId === undefined ? (
					<></>
				) : (
					<span>
						<b>Audience ID</b>: {containerState.audienceId}
					</span>
				)}
			</StackItem>
			<StackItem align="end">
				<ActionsBar
					isContainerConnected={
						containerState.connectionState === ConnectionState.Connected
					}
					tryConnect={tryConnect}
					forceDisconnect={forceDisconnect}
					closeContainer={closeContainer}
				/>
			</StackItem>
		</Stack>
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
