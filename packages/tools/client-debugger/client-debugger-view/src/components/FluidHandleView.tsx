/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import {
	DataVisualizationMessageType,
	IDebuggerMessage,
	InboundHandlers,
	handleIncomingMessage,
	HasContainerId,
	HasFluidObjectId,
	FluidObjectNode,
	DataVisualizationMessage,
} from "@fluid-tools/client-debugger";
import { useMessageRelay } from "../MessageRelayContext";
import { Accordion } from "./utility-components/";
import { Waiting } from "./Waiting";
import { TreeDataView } from "./TreeDataView";

const loggingContext = "EXTENSION(HandleView)";

/**
 * {@link FluidHandleView} input props.
 */
export interface FluidHandleViewProps extends HasContainerId, HasFluidObjectId {}

/**
 * Displays visual summary trees for DDS_s within the container.
 */
export function FluidHandleView(props: FluidHandleViewProps): React.ReactElement {
	const { containerId, fluidObjectId } = props;
	const messageRelay = useMessageRelay();

	const [visualTree, setVisualTree] = React.useState<FluidObjectNode | undefined>();

	React.useEffect(() => {
		/**
		 * Handlers for inbound message related to Data View.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			[DataVisualizationMessageType]: (untypedMessage) => {
				const message: DataVisualizationMessage =
					untypedMessage as DataVisualizationMessage;

				if (
					message.data.containerId === containerId &&
					message.data.fluidObjectId === fluidObjectId
				) {
					setVisualTree(message.data.visualization);
					return true;
				} else {
					return false;
				}
			},
		};

		/**
		 * Event handler for messages coming from the Message Relay.
		 */
		function messageHandler(message: Partial<IDebuggerMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers, {
				context: loggingContext,
			});
		}

		messageRelay.on("message", messageHandler);

		// POST Request for FluidObjectNode.
		messageRelay.postMessage({
			type: "GET_DATA_VISUALIZATION",
			data: {
				containerId,
				fluidObjectId,
			},
		});
	}, [containerId, setVisualTree, fluidObjectId, messageRelay]);

	if (visualTree === undefined) {
		return <Waiting/>;
	}

	// <TreeDataView containerId={containerId} node={visualTree} />;
	return (
		<Accordion key={containerId} header={<div>{`${visualTree.metadata}, ${visualTree.nodeKind}`}</div>} className="FluidHandleView">
			<TreeDataView containerId={containerId} node={visualTree} />;
		</Accordion>
	)
}
