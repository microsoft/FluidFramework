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
	}, [containerId, setVisualTree, fluidObjectId, messageRelay]);

	if (visualTree === undefined) {
		return <Waiting />;
	}

	return (
		<Accordion
			key={containerId}
			header={<div>{`${visualTree.metadata}, ${visualTree.nodeKind}`}</div>}
		>
			<TreeDataView containerId={containerId} node={visualTree} />;
		</Accordion>
	);
}
