/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDebuggerMessage, InboundHandlers, handleIncomingMessage, HasContainerId, FluidObjectNode, VisualTreeNodeBase, DataVisualizationMessage, NodeKind } from "@fluid-tools/client-debugger";
import React from "react";
import { useMessageRelay } from "../MessageRelayContext";
import { Waiting } from "./Waiting";
import { ValueView } from "./ValueView";

const loggingContext = "EXTENSION(HandleView)";

/**
 * {@link FluidHandleView} input props. 
 */
export interface FluidHandleViewProps extends HasContainerId {
	fluidObjectId: string; 
}

/**
 * Displays visual summary trees for DDS_s within the container  
 */
export function FluidHandleView(props: FluidHandleViewProps): React.ReactElement {
	const { containerId, fluidObjectId } = props;

	const messageRelay = useMessageRelay();
	
	const [visualTree, setVisualTree] = React.useState<FluidObjectNode | undefined>();

	React.useEffect(() => {
		/**
		 * Handlers for inbound message related to Data View
		 */
		const inboundMessageHandlers: InboundHandlers = {
			["DATA_VISUALIZATION"]: (untypedMessage) => {
				const message: DataVisualizationMessage = untypedMessage as DataVisualizationMessage;

				if (message.data.containerId === containerId && message.data.fluidObjectId === fluidObjectId) {
					setVisualTree(message.data.visualization);
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
		messageRelay.postMessage({
			type: "GET_DATA_VISUALIZATION",
			data: {
				fluidObjectId,
			},	
		});
	}, [containerId, visualTree, fluidObjectId, messageRelay])

	if (visualTree === undefined) {
		return <Waiting label="Waiting for container DDS data." />;
	}

	return (
		<> {renderNodeBasedOnKind(visualTree)} </>
	)
}

function renderNodeBasedOnKind(visualTree: FluidObjectNode | VisualTreeNodeBase): React.ReactElement {
	switch (visualTree.nodeKind) {
	  case NodeKind.ValueNode:
		return <ValueView node={visualTree} />;
	  default:
		return <Waiting label="Unknown data format." />;
	}
  }
  