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
	postMessageToWindow,
	GetContainerStateMessage,
} from "@fluid-tools/client-debugger";
import { HasContainerId, _ContainerSummaryView } from "@fluid-tools/client-debugger-view";

import { extensionMessageSource } from "../messaging";
import { Waiting } from "./Waiting";

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
		 * Event handler for messages coming from the window (globalThis).
		 */
		function messageHandler(event: MessageEvent<Partial<IDebuggerMessage>>): void {
			handleIncomingMessage(event, inboundMessageHandlers, {
				context: loggingContext,
			});
		}

		globalThis.addEventListener("message", messageHandler);

		// Reset Container State data, to ensure we aren't displaying stats for the wrong container while
		// we wait for a response from the new debugger.
		// eslint-disable-next-line unicorn/no-useless-undefined
		setContainerState(undefined);

		// Request state info for the newly specified containerId
		postMessageToWindow<GetContainerStateMessage>({
			source: extensionMessageSource,
			type: "GET_CONTAINER_STATE",
			data: {
				containerId,
			},
		});

		return (): void => {
			globalThis.removeEventListener("message", messageHandler);
		};
	}, [containerId, setContainerState]);

	if (containerState === undefined) {
		return <Waiting />;
	}

	// TODO: connect/disconnect, close handlers

	return <_ContainerSummaryView {...containerState} />;
}
