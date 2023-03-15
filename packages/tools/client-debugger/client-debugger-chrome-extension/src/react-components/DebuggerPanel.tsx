/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IconButton, Stack, StackItem, TooltipHost } from "@fluentui/react";
import { useId } from "@fluentui/react-hooks";
import React from "react";

import {
	ContainerMetadata,
	handleIncomingMessage,
	IDebuggerMessage,
	InboundHandlers,
	RegistryChangeMessage,
} from "@fluid-tools/client-debugger";
import { ContainerSelectionDropdown } from "@fluid-tools/client-debugger-view";

import { extensionMessageSource } from "../messaging";
import { ContainerView } from "./ContainerView";
import { Waiting } from "./Waiting";
import { useMessageRelay } from "./MessageRelayContext";

const loggingContext = "EXTENSION(DebuggerPanel)";

/**
 * Message sent to the webpage to query for the full container list.
 */
const getContainerListMessage: IDebuggerMessage = {
	type: "GET_CONTAINER_LIST",
	source: extensionMessageSource,
	data: undefined,
};

/**
 * Root Debugger view.
 *
 * @remarks Must be run under a {@link MessageRelayContext}.
 */
export function DebuggerPanel(): React.ReactElement {
	const [containers, setContainers] = React.useState<ContainerMetadata[] | undefined>();

	const messageRelay = useMessageRelay();

	const refreshButtonTooltipId = useId("refresh-button-tooltip");

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
		 * Event handler for messages coming from the Message Relay
		 */
		function messageHandler(message: Partial<IDebuggerMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers, {
				context: loggingContext,
			});
		}

		messageRelay.on("message", messageHandler);

		messageRelay.postMessage(getContainerListMessage);

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [setContainers, messageRelay]);

	return containers === undefined ? (
		<Stack>
			<StackItem>
				<Waiting label="Waiting for Container list." />
			</StackItem>
			<StackItem align="center">
				<TooltipHost content="Connect Container" id={refreshButtonTooltipId}>
					<IconButton
						onClick={(): void => messageRelay.postMessage(getContainerListMessage)}
					>
						Search again.
					</IconButton>
				</TooltipHost>
			</StackItem>
		</Stack>
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
