/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Spinner } from "@fluentui/react-components";
import {
	DataVisualization,
	type FluidObjectNode,
	GetDataVisualization,
	type HasContainerKey,
	type HasFluidObjectId,
	type ISourcedDevtoolsMessage,
	type InboundHandlers,
	handleIncomingMessage,
} from "@fluidframework/devtools-core/internal";
import React from "react";

import { useMessageRelay } from "../../MessageRelayContext.js";

import type { HasLabel } from "./CommonInterfaces.js";
import { TreeDataView } from "./TreeDataView.js";
import { TreeHeader } from "./TreeHeader.js";
import { TreeItem } from "./TreeItem.js";

const loggingContext = "EXTENSION(HandleView)";

/**
 * {@link FluidHandleView} input props.
 */
export interface FluidHandleViewProps extends HasContainerKey, HasFluidObjectId, HasLabel {}

/**
 * Render data with type VisualNodeKind.FluidHandleNode and render its children.
 */
export function FluidHandleView(props: FluidHandleViewProps): React.ReactElement {
	const { containerKey, fluidObjectId, label } = props;
	const messageRelay = useMessageRelay();

	const [visualTree, setVisualTree] = React.useState<FluidObjectNode | undefined>();

	React.useEffect(() => {
		/**
		 * Handlers for inbound message related to Data View.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			[DataVisualization.MessageType]: async (untypedMessage) => {
				const message = untypedMessage as DataVisualization.Message;
				if (
					message.data.containerKey === containerKey &&
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
				containerKey,
				fluidObjectId,
			}),
		);

		// Callback to clean up our message handlers.
		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containerKey, setVisualTree, fluidObjectId, messageRelay]);

	if (visualTree === undefined) {
		const header = <TreeHeader label={label} inlineValue={<Spinner size="tiny" />} />;
		return <TreeItem header={header} />;
	} else {
		return <TreeDataView containerKey={containerKey} label={label} node={visualTree} />;
	}
}
