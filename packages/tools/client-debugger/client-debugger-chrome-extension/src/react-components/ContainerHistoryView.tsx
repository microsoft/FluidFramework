/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack, StackItem } from "@fluentui/react";
import React from "react";

import {
	ContainerStateHistoryMessage,
	IDebuggerMessage,
	InboundHandlers,
	handleIncomingMessage,
	HasContainerId,
	ConnectionStateChangeLogEntry,
} from "@fluid-tools/client-debugger";
import { _ContainerHistoryView } from "@fluid-tools/client-debugger-view";
import { Waiting } from "./Waiting";
import { MessageRelayContext } from "./MessageRelayContext";

const loggingContext = "EXTENSION(ContainerHistoryView)";

/**
 * {@link ContainerHistory} input props.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ContainerHistoryProps extends HasContainerId {
	// TODO
}

/**
 * Displays information about the provided {@link IFluidClientDebugger.getContainerConnectionLog}.
 */
export function ContainerHistoryView(props: ContainerHistoryProps): React.ReactElement {
	const { containerId } = props;
	const messageRelay = React.useContext(MessageRelayContext);
	if (messageRelay === undefined) {
		throw new Error(
			"MessageRelayContext was not defined. Parent component is responsible for ensuring this has been constructed.",
		);
	}

	const [containerHistory, setContainerHistory] = React.useState<
		ConnectionStateChangeLogEntry[] | undefined
	>();

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to the registry.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			["CONTAINER_STATE_HISTORY"]: (untypedMessage) => {
				const message = untypedMessage as ContainerStateHistoryMessage;
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
		function messageHandler(message: Partial<IDebuggerMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers, {
				context: loggingContext,
			});
		}

		messageRelay.on("message", messageHandler);

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containerHistory, messageRelay, setContainerHistory]);

	if (containerHistory === undefined) {
		return <Waiting label="Waiting for Container Summary data." />;
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
				<_ContainerHistoryView containerHistory={containerHistory} />
			</StackItem>
		</Stack>
	);
}
