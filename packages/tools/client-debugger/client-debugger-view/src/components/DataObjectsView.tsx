/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import {
	handleIncomingMessage,
	RootDataVisualizationsMessage,
	HasContainerId,
	IDebuggerMessage,
	InboundHandlers,
	RootHandleNode,
} from "@fluid-tools/client-debugger";
import { SharedObjectRenderOptions } from "../RendererOptions";

import { useMessageRelay } from "../MessageRelayContext";
import { Waiting } from "./Waiting";
import { FluidHandleView } from "./FluidHandleView";


const loggingContext = "EXTENSION(DataObjectsView)";

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
	const { containerId } = props;

	const messageRelay = useMessageRelay();

	const [rootDataHandles, setRootDataHandles] = React.useState<Record<string, RootHandleNode> | undefined>();

	React.useEffect(() => {
		/**
		 * Handlers for inbound message related to Data View 
		 */
		const inboundMessageHandlers: InboundHandlers = {
			["ROOT_DATA_VISUALIZATIONS"]: (untypedMessage) => {
				const message: RootDataVisualizationsMessage = untypedMessage as RootDataVisualizationsMessage;

				if (message.data.containerId === containerId) {
					setRootDataHandles(message.data.visualizations);
					
					return true;
				} else {
					return false; 
				}
			}
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

		// Request the current DDS State of the Container 
		messageRelay.postMessage({
			type: "GET_ROOT_DATA_VISUALIZATIONS",
			data: {
				containerId,
			}
		});

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containerId, rootDataHandles, messageRelay]);

	if (rootDataHandles === undefined) {
		return <Waiting label="Waiting for container DDS data." />;
	}

	return (
		<div className="data-objects-view">
			<h3>Container Data</h3>
			<div>TODO: .</div>
			<>
				{Object.entries(rootDataHandles).map(([key, handle], index) => (
					<FluidHandleView key={index} containerId={containerId} fluidObjectId={handle.fluidObjectId} />
				))}
			</>

		</div>
	);
}
