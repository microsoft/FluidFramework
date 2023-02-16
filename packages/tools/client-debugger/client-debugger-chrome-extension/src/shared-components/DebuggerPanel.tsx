/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import {
	ContainerMetadata,
	handleIncomingMessage,
	IDebuggerMessage,
	InboundHandlers,
	RegistryChangeMessage,
} from "@fluid-tools/client-debugger";
import { ContainerSelectionDropdown } from "@fluid-tools/client-debugger-view";

import { ContainerView } from "./ContainerView";
import { Waiting } from "./Waiting";

const loggingContext = "EXTENSION(DebuggerPanel)";

// TODO
// enum PanelOptions {
// 	ContainerSummary = "Container Summary",
// 	ContainerData = "Container Data",
// 	Audience = "Audience",
// }

/**
 * TODO
 */
export function DebuggerPanel(): React.ReactElement {
	const [containers, setContainers] = React.useState<ContainerMetadata[] | undefined>();

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to the registry.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			["REGISTRY_CHANGE"]: (untypedMessage) => {
				const message = untypedMessage as RegistryChangeMessage;
				setContainers(message.data.containers);
				return true;
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

		globalThis.postMessage({
			type: "GET_CONTAINER_LIST",
		});

		return (): void => {
			globalThis.removeEventListener("message", messageHandler);
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
			<ContainerView containerId={selectedContainerId} />
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
