/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { Divider } from "@fluentui/react-components";
import {
	type ConnectionStateChangeLogEntry,
	ContainerStateHistory,
	GetContainerState,
	handleIncomingMessage,
	type HasContainerKey,
	type ISourcedDevtoolsMessage,
	type InboundHandlers,
} from "@fluid-experimental/devtools-core";
import { useMessageRelay } from "../MessageRelayContext";
import { ContainerHistoryLog } from "./ContainerHistoryLog";
import { Waiting } from "./Waiting";

/**
 * {@link ContainerHistoryView} input props.
 */
export type ContainerHistoryProps = HasContainerKey;

/**
 * Displays information about the container state history.
 *
 * @param props - See {@link ContainerHistoryViewProps}.
 */
export function ContainerHistoryView(props: ContainerHistoryProps): React.ReactElement {
	const { containerKey } = props;
	const messageRelay = useMessageRelay();

	const [containerHistory, setContainerHistory] = React.useState<
		readonly ConnectionStateChangeLogEntry[] | undefined
	>();

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to the registry.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			[ContainerStateHistory.MessageType]: async (untypedMessage) => {
				const message = untypedMessage as ContainerStateHistory.Message;
				if (message.data.containerKey === containerKey) {
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
		setContainerHistory(undefined);

		// Request state info for the newly specified containerKey
		messageRelay.postMessage(GetContainerState.createMessage({ containerKey }));

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containerKey, messageRelay, setContainerHistory]);

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
