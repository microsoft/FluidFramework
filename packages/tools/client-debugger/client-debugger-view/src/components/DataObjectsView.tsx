/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import {
	RootDataVisualizations,
	GetRootDataVisualizations,
	handleIncomingMessage,
	HasContainerId,
	ISourcedDevtoolsMessage,
	InboundHandlers,
	RootHandleNode,
} from "@fluid-tools/client-debugger";

import { useMessageRelay } from "../MessageRelayContext";
import { Waiting } from "./Waiting";
import { TreeDataView } from "./TreeDataView";

const loggingContext = "INLINE(VIEW)";

/**
 * {@link DataObjectsView} input props.
 */
export type DataObjectsViewProps = HasContainerId;

/**
 * Displays the data inside a container.
 *
 * @remarks
 *
 * Dispatches data object rendering based on those provided view {@link TreeDataView}.
 */
export function DataObjectsView(props: DataObjectsViewProps): React.ReactElement {
	const { containerId } = props;

	const messageRelay = useMessageRelay();

	const [rootDataHandles, setRootDataHandles] = React.useState<
		Record<string, RootHandleNode> | undefined
	>();

	React.useEffect(() => {
		const inboundMessageHandlers: InboundHandlers = {
			[RootDataVisualizations.MessageType]: (untypedMessage) => {
				const message = untypedMessage as RootDataVisualizations.Message;

				if (message.data.containerId === containerId) {
					setRootDataHandles(message.data.visualizations);

					return true;
				} else {
					return false;
				}
			},
		};

		function messageHandler(message: Partial<ISourcedDevtoolsMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers, {
				context: loggingContext,
			});
		}

		messageRelay.on("message", messageHandler);

		// POST Request for DDS data in container.
		messageRelay.postMessage(
			GetRootDataVisualizations.createMessage({
				containerId,
			}),
		);

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containerId, setRootDataHandles, messageRelay]);

	if (rootDataHandles === undefined) {
		return <Waiting />;
	}

	return (
		<>
			{Object.entries(rootDataHandles).map(([key, fluidObject], index) => {
				return <TreeDataView key={key} containerId={containerId} node={fluidObject} />;
			})}
		</>
	);
}
