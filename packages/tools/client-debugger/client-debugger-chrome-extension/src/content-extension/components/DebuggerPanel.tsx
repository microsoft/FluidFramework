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

import { ContainerSummaryView } from "./ContainerStateView";
import { Waiting } from "./Waiting";

/**
 * TODO
 */
export function DebuggerPanel(): React.ReactElement {
	const [containers, setContainers] = React.useState<ContainerMetadata[] | undefined>();

	React.useEffect(() => {
		function handleMessage(event: MessageEvent<IDebuggerMessage>): void {
			function formatLogMessage(message: string): string {
				return `CONTENT(DebuggerPanel): ${message}`;
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
				case "REGISTRY_CHANGE":
					console.log(formatLogMessage('"REGISTRY_CHANGE" message received!'));

					// eslint-disable-next-line no-case-declarations
					const message = event.data as RegistryChangeMessage;
					setContainers(message.data.containers);
					break;
				default:
					console.log(
						formatLogMessage(
							`Unhandled inbound message type received: "${event.data.type}".`,
						),
					);
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
		<Waiting />
	) : (
		<PopulatedDebuggerPanel containers={containers} />
	);
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
			<ContainerSummaryView containerId={selectedContainerId} />
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
