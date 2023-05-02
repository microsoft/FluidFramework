/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import {
	DataVisualization,
	GetDataVisualization,
	ISourcedDevtoolsMessage,
	InboundHandlers,
	handleIncomingMessage,
	HasContainerId,
	HasFluidObjectId,
	FluidObjectNode,
} from "@fluid-tools/client-debugger";
import { useMessageRelay } from "../MessageRelayContext";
import { Waiting } from "./Waiting";
import { TreeDataView } from "./TreeDataView";
import { HasLabel } from "./CommonInterfaces";

const loggingContext = "EXTENSION(HandleView)";

/**
 * {@link FluidHandleView} input props.
 */
export interface FluidHandleViewProps extends HasContainerId, HasFluidObjectId, HasLabel {}

/**
 * Render data with type VisualNodeKind.FluidHandleNode and render its children.
 */
export function FluidHandleView(props: FluidHandleViewProps): React.ReactElement {
	const { containerId, fluidObjectId, label } = props;
	const messageRelay = useMessageRelay();

	const [visualTree, setVisualTree] = React.useState<FluidObjectNode | undefined>();

	React.useEffect(() => {
		/**
		 * Handlers for inbound message related to Data View.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			[DataVisualization.MessageType]: (untypedMessage) => {
				const message = untypedMessage as DataVisualization.Message;
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
		function messageHandler(message: Partial<ISourcedDevtoolsMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers, {
				context: loggingContext,
			});
		}

		messageRelay.on("message", messageHandler);

		// POST Request for FluidObjectNode.
		messageRelay.postMessage(
			GetDataVisualization.createMessage({
				containerId,
				fluidObjectId,
			}),
		);

		// Callback to clean up our message handlers.
		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containerId, setVisualTree, fluidObjectId, messageRelay]);

	if (visualTree === undefined) {
		return <Waiting />;
	}

	return <TreeDataView containerId={containerId} label={label} node={visualTree} />;
}
