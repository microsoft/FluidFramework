/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	ContainerDataMessage,
	handleIncomingMessage,
	HasContainerId,
	InboundHandlers,
	ISourcedDebuggerMessage,
} from "@fluid-tools/client-debugger";
import React from "react";
import { useMessageRelay } from "../MessageRelayContext";

import { SharedObjectRenderOptions } from "../RendererOptions";
import { DynamicDataView } from "./data-object-views";

/**
 * {@link DataObjectsView} input props.
 */
export interface DataObjectsViewProps extends HasContainerId {
	/**
	 * {@inheritDoc RendererOptions}
	 */
	renderOptions: SharedObjectRenderOptions;
}

/**
 * Displays the data inside a container.
 *
 * @remarks
 *
 * Dispatches data object rendering based on those provided view {@link DataObjectsViewProps.renderOptions}.
 */
export function DataObjectsView(props: DataObjectsViewProps): React.ReactElement {
	const { containerId, renderOptions } = props;

	const messageRelay = useMessageRelay();

	const [containerData, setContainerData] = React.useState<unknown | undefined>();

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages from the registry.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			["CONTAINER_DATA"]: (untypedMessage) => {
				const message = untypedMessage as ContainerDataMessage;
				if (message.data.containerId === containerId) {
					setContainerData(message.data.containerData);
					return true;
				}
				return false;
			},
		};

		/**
		 * Event handler for messages coming from the webpage.
		 */
		function messageHandler(message: Partial<ISourcedDebuggerMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers, {
				context: "ContainerDataView", // TODO: Fix
			});
		}

		messageRelay.on("message", messageHandler);

		// Reset state with Container data, to ensure we aren't displaying stale data (for the wrong container) while we
		// wait for a response to the message sent below. Especially relevant for the Container-related views because this
		// component wont be unloaded and reloaded if the user just changes the menu selection from one Container to another.
		// eslint-disable-next-line unicorn/no-useless-undefined
		setContainerData(undefined);

		// Request state info for the newly specified containerId
		messageRelay.postMessage({
			type: "GET_CONTAINER_DATA",
			data: {
				containerId,
			},
		});

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containerId, messageRelay, setContainerData]);

	return (
		<div className="data-objects-view">
			<h3>Container Data</h3>
			{containerData === undefined ? (
				<div>No Container data available.</div>
			) : (
				<DynamicDataView data={containerData} renderOptions={renderOptions} />
			)}
		</div>
	);
}
