/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import {
	ContainerMetadata,
	IDebuggerMessage,
	RegistryChangeMessage,
} from "@fluid-tools/client-debugger";
import { ContainerSelectionDropdown } from "@fluid-tools/client-debugger-view";

import { ContainerStateView } from "./ContainerStateView";

/**
 * TODO
 */
export function DebuggerPanel(): React.ReactElement {
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
				console.log(`CONTENT(DebuggerPanel): ${message}`);
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

		return (): void => {
			globalThis.removeEventListener("message", handleMessage);
		};
	}, [setContainers]);

	return containers === undefined ? (
		<WaitingView />
	) : (
		<PopulatedDebuggerPanel containers={containers} />
	);
}

function WaitingView(): React.ReactElement {
	// TODO: spinner
	return <div>Waiting for initial response from webpage...</div>;
}

/**
 * {@link PopulatedDebuggerPanel} input props.
 */
interface PopulatedDebuggerPanelProps {
	containers: ContainerMetadata[];
}

function PopulatedDebuggerPanel(props: PopulatedDebuggerPanelProps): React.ReactElement {
	const { containers } = props;

	const [selectedContainerId, setSelectedContainerId] = React.useState<string | undefined>();

	React.useEffect(() => {
		function getDefaultSelection(): string | undefined {
			return containers.length === 0 ? undefined : containers[0].id;
		}

		if (
			selectedContainerId !== undefined &&
			!containers.some((container) => container.id === selectedContainerId)
		) {
			// If the selected debugger no longer exists in the list, reset to default.
			setSelectedContainerId(getDefaultSelection());
		} else if (selectedContainerId === undefined && containers.length > 0) {
			// If there is no current selection, but 1+ containers, set selection to default.
			setSelectedContainerId(containers[0].id);
		}
	}, [containers, setSelectedContainerId]);

	if (containers.length === 0) {
		return <div>No debuggers registered.</div>;
	}

	const innerView =
		selectedContainerId === undefined ? (
			<div>Select a Container to view its state.</div>
		) : (
			<ContainerStateView containerId={selectedContainerId} />
		);

	return (
		<div>
			<ContainerSelectionDropdown
				initialSelection={selectedContainerId}
				options={containers}
				onChangeSelection={setSelectedContainerId}
			/>
			{innerView}
		</div>
	);
}
