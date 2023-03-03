/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import {
	ContainerStateMetadata,
	ContainerStateChangeMessage,
	IDebuggerMessage,
	InboundHandlers,
	handleIncomingMessage,
	HasContainerId,
} from "@fluid-tools/client-debugger";
import { _ContainerSummaryView } from "@fluid-tools/client-debugger-view";

import { extensionMessageSource } from "../messaging";
import { Waiting } from "./Waiting";
import { MessageRelayContext } from "./MessageRelayContext";

const loggingContext = "EXTENSION(ContainerSummaryView)";

/**
 * {@link ContainerSummaryView} input props.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ContainerStateViewProps extends HasContainerId {}

/**
 * Displays information about the container's internal state, including its disposal status,
 * connection state, attach state, etc.
 */
export function ContainerSummaryView(props: ContainerStateViewProps): React.ReactElement {
	const { containerId } = props;

	const [containerState, setContainerState] = React.useState<
		ContainerStateMetadata | undefined
	>();

	const messageRelay = React.useContext(MessageRelayContext);
	if (messageRelay === undefined) {
		throw new Error(
			"MessageRelayContext was not defined. Parent component is responsible for ensuring this has been constructed.",
		);
	}

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
				context: loggingContext,
			});
		}

		messageRelay.on("message", messageHandler);

		// Reset Container State data, to ensure we aren't displaying stats for the wrong container while
		// we wait for a response from the new debugger.
		// eslint-disable-next-line unicorn/no-useless-undefined
		setContainerState(undefined);

		// Request state info for the newly specified containerId
		messageRelay.postMessage({
			source: extensionMessageSource,
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

	// TODO: connect/disconnect, close handlers
	return (
		<_ContainerSummaryView
			{...containerState}
			tryConnect={undefined}
			forceDisconnect={undefined}
			closeContainer={undefined}
		/>
	);
}
