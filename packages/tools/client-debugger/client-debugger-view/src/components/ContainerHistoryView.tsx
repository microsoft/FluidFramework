/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DefaultPalette, IStackItemStyles, Icon, Stack, StackItem } from "@fluentui/react";
import React from "react";

import {
	ConnectionStateChangeLogEntry,
	ContainerStateChangeKind,
	ContainerStateHistory,
	GetContainerState,
	handleIncomingMessage,
	HasContainerId,
	ISourcedDevtoolsMessage,
	InboundHandlers,
} from "@fluid-tools/client-debugger";
import { useMessageRelay } from "../MessageRelayContext";
import { Waiting } from "./Waiting";

/**
 * {@link ContainerHistoryView} input props.
 */
export type ContainerHistoryProps = HasContainerId;

/**
 * Displays information about the container state history.
 *
 * @param props - See {@link ContainerHistoryViewProps}.
 */
export function ContainerHistoryView(props: ContainerHistoryProps): React.ReactElement {
	const { containerId } = props;
	const messageRelay = useMessageRelay();

	const [containerHistory, setContainerHistory] = React.useState<
		readonly ConnectionStateChangeLogEntry[] | undefined
	>();

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to the registry.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			[ContainerStateHistory.MessageType]: (untypedMessage) => {
				const message = untypedMessage as ContainerStateHistory.Message;
				if (message.data.containerId === containerId) {
					setContainerHistory(message.data.history);
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
				context: "ContainerHistoryView", // TODO: Fix
			});
		}

		messageRelay.on("message", messageHandler);

		// Reset state with Container data, to ensure we aren't displaying stale data (for the wrong container) while we
		// wait for a response to the message sent below. Especially relevant for the Container-related views because this
		// component wont be unloaded and reloaded if the user just changes the menu selection from one Container to another.
		// eslint-disable-next-line unicorn/no-useless-undefined
		setContainerHistory(undefined);

		// Request state info for the newly specified containerId
		messageRelay.postMessage(GetContainerState.createMessage({ containerId }));

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containerId, messageRelay, setContainerHistory]);

	if (containerHistory === undefined) {
		return <Waiting label="Waiting for Container Summary data." />;
	}

	const nowTimeStamp = new Date();
	const historyViews: React.ReactElement[] = [];

	// Newest events are displayed first
	for (let i = containerHistory.length - 1; i >= 0; i--) {
		const changeTimeStamp = new Date(containerHistory[i].timestamp);
		const wasChangeToday = nowTimeStamp.getDate() === changeTimeStamp.getDate();

		const accordionBackgroundColor: IStackItemStyles = {
			root: {
				background:
					containerHistory[i].newState === ContainerStateChangeKind.Connected
						? "#F0FFF0" // green
						: containerHistory[i].newState === ContainerStateChangeKind.Attached
						? "#F0FFFF" // blue
						: containerHistory[i].newState === ContainerStateChangeKind.Disconnected
						? "#FDF5E6" // yellow
						: containerHistory[i].newState === ContainerStateChangeKind.Closed
						? "#FFF0F5" // red
						: containerHistory[i].newState === ContainerStateChangeKind.Disposed
						? "#FFE4E1" // dark red
						: "#C0C0C0", // grey for unknown state
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
			<div key={`container-history-info-${i}`}>
				<Stack horizontal={true} styles={accordionBackgroundColor}>
					<StackItem styles={iconStyle}>
						<Icon
							iconName={
								containerHistory[i].newState === ContainerStateChangeKind.Connected
									? "PlugConnected"
									: containerHistory[i].newState ===
									  ContainerStateChangeKind.Attached
									? "Attach"
									: containerHistory[i].newState ===
									  ContainerStateChangeKind.Disconnected
									? "PlugDisconnected"
									: containerHistory[i].newState ===
									  ContainerStateChangeKind.Disposed
									? "RemoveLink"
									: containerHistory[i].newState ===
									  ContainerStateChangeKind.Closed
									? "SkypeCircleMinus"
									: "Help"
							}
						/>
					</StackItem>
					<StackItem>
						<div
							key={`${containerHistory[i].newState}-${containerHistory[i].timestamp}`}
						>
							<b>State: </b>
							{containerHistory[i].newState}
							<br />
							<b>Time: </b>
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
					height: "100%",
				},
			}}
		>
			<StackItem>
				<h3>Container State History</h3>
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
			</StackItem>
		</Stack>
	);
}
