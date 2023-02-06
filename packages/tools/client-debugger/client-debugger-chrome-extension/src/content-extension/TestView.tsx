/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ContainerMetadata,
	IDebuggerMessage,
	RegistryChangeMessage,
} from "@fluid-tools/client-debugger";
import React from "react";

/**
 * {@link TestView} input props.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface TestViewProps {
	// TODO
}

/**
 * Temporary test view while prototyping message-passing
 */
export function TestView(props: TestViewProps): React.ReactElement {
	const [containers, setContainers] = React.useState<ContainerMetadata[] | undefined>();

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
				console.log(`CONTENT: ${message}`);
			}

			switch (event.data.type) {
				case "REGISTRY_CHANGE":
					log('"REGISTRY_CHANGE" message received!');

					// eslint-disable-next-line no-case-declarations
					const message = event.data as RegistryChangeMessage;
					setContainers(message.data.containers);
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
	}, [setContainers]);

	if (containers === undefined) {
		return <div>Loading...</div>;
	}
	if (containers.length === 0) {
		return <div>No debuggers registered.</div>;
	}
	return (
		<div>
			<ul>
				{containers.map((containerMetadata) => (
					<li key={`container-list-${containerMetadata.id}`}>
						{containerMetadata.id}
						{containerMetadata.nickname === undefined
							? ""
							: `(${containerMetadata.nickname})`}
					</li>
				))}
			</ul>
		</div>
	);
}
