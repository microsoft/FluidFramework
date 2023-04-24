/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { Divider } from "@fluentui/react-components";
import {
	ConnectionStateChangeLogEntry,
	ContainerStateHistory,
	GetContainerState,
	handleIncomingMessage,
	HasContainerId,
	ISourcedDevtoolsMessage,
	InboundHandlers,
} from "@fluid-tools/client-debugger";
import { useMessageRelay } from "../MessageRelayContext";
import { ContainerHistoryLog } from "../ContainerHistoryLog";
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

	return (
		<>
			<Divider appearance="brand"> Container State Log </Divider>
			<ContainerHistoryLog containerHistory={containerHistory} />
		</>
	);
}
