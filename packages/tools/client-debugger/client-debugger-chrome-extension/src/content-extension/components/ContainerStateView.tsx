/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import {
	ContainerStateMetadata,
	ContainerStateChangeMessage,
	IDebuggerMessage,
} from "@fluid-tools/client-debugger";
import { HasContainerId, _ContainerStateView } from "@fluid-tools/client-debugger-view";
import { Waiting } from "./Waiting";

/**
 * {@link ContainerStateView} input props.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ContainerStateViewProps extends HasContainerId {}

/**
 * Displays information about the container's internal state, including its disposal status,
 * connection state, attach state, etc.
 */
export function ContainerStateView(props: ContainerStateViewProps): React.ReactElement {
	const { containerId } = props;

	const [containerState, setContainerState] = React.useState<
		ContainerStateMetadata | undefined
	>();

	React.useEffect(() => {
		function handleMessage(event: MessageEvent<IDebuggerMessage>): void {
			function formatLogMessage(message: string): string {
				return `CONTENT(ContainerStateView): ${message}`;
			}

			if ((event.source as unknown) !== globalThis) {
				// Ignore events coming from outside of this window / global context
				console.debug(formatLogMessage("Ignoring incoming message from unknown source."));
				return;
			}

			if (event.data?.type === undefined) {
				console.debug(formatLogMessage("Ignoring incoming message of unknown format."));
				return;
			}

			switch (event.data.type) {
				case "CONTAINER_STATE_CHANGE":
					// eslint-disable-next-line no-case-declarations
					const message = event.data as ContainerStateChangeMessage;
					if (message.data.containerState.id === containerId) {
						console.log(formatLogMessage('"CONTAINER_STATE_CHANGE" message received!'));
						setContainerState(message.data.containerState);
					}
					break;
				default:
					console.debug(
						formatLogMessage(
							`Unhandled inbound message type received: "${event.data.type}".`,
						),
					);
					break;
			}
		}

		globalThis.addEventListener("message", handleMessage);

		globalThis.postMessage({
			type: "GET_CONTAINER_STATE",
			data: {
				containerId,
			},
		});

		return (): void => {
			globalThis.removeEventListener("message", handleMessage);
		};
	}, [containerId, setContainerState]);

	if (containerState === undefined) {
		return <Waiting />;
	}

	return (
		<_ContainerStateView
			disposed={containerState.closed}
			attachState={containerState.attachState}
			connectionState={containerState.connectionState}
		/>
	);
}
