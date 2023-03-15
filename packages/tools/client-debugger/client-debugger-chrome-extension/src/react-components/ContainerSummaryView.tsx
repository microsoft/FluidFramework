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
import { useMessageRelay } from "./MessageRelayContext";

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

	const messageRelay = useMessageRelay();

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

	function tryConnect(): void {
		messageRelay?.postMessage({
			source: extensionMessageSource,
			type: "CONNECT_CONTAINER",
			data: {
				containerId,
			},
		});
	}

	function forceDisconnect(): void {
		messageRelay?.postMessage({
			source: extensionMessageSource,
			type: "DISCONNECT_CONTAINER",
			data: {
				containerId,
			},
		});
	}

	function closeContainer(): void {
		messageRelay?.postMessage({
			source: extensionMessageSource,
			type: "CLOSE_CONTAINER",
			data: {
				containerId,
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
