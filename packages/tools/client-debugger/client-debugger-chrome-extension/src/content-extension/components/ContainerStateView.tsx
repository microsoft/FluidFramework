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
			if ((event.source as unknown) !== globalThis) {
				// Ignore events coming from outside of this window / global context
				return;
			}

			if (event.data?.type === undefined) {
				return;
			}

			function log(message: string): void {
				console.log(`CONTENT(ContainerStateView): ${message}`);
			}

			switch (event.data.type) {
				case "CONTAINER_STATE_CHANGE":
					// eslint-disable-next-line no-case-declarations
					const message = event.data as ContainerStateChangeMessage;
					if (message.data.containerState.id === containerId) {
						log('"CONTAINER_STATE_CHANGE" message received!');
						setContainerState(message.data.containerState);
					}
					break;
				default:
					log(`Unhandled inbound message type received: "${event.data.type}".`);
					break;
			}
		}

		globalThis.addEventListener("message", handleMessage);

		globalThis.postMessage({
			type: "GET_CONTAINER_LIST",
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
