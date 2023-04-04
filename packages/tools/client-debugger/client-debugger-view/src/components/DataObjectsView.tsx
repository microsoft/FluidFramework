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

import { useMessageRelay } from "../MessageRelayContext";
import { Waiting } from "./Waiting";
import { waitingLabels } from "./WaitingLabels";
import { FluidDataView } from "./FluidDataView";

const loggingContext = "EXTENSION(DataObjectsView)";

/**
 * {@link DataObjectsView} input props.
 */
export type DataObjectsViewProps = HasContainerId;

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

	const [rootDataHandles, setRootDataHandles] = React.useState<
		Record<string, RootHandleNode> | undefined
	>();

	React.useEffect(() => {
		const inboundMessageHandlers: InboundHandlers = {
			["ROOT_DATA_VISUALIZATIONS"]: (untypedMessage) => {
				const message: RootDataVisualizationsMessage =
					untypedMessage as RootDataVisualizationsMessage;

				if (message.data.containerId === containerId) {
					setRootDataHandles(message.data.visualizations);

					return true;
				} else {
					return false;
				}
			},
		};

		function messageHandler(message: Partial<IDebuggerMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers, {
				context: loggingContext,
			});
		}

		messageRelay.on("message", messageHandler);

		// POST Request for DDS data in container.
		messageRelay.postMessage({
			type: "GET_ROOT_DATA_VISUALIZATIONS",
			data: {
				containerId,
			},
		});

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containerId, setRootDataHandles, messageRelay]);

	if (rootDataHandles === undefined) {
		return <Waiting label={waitingLabels.containerError} />;
	}

	return (
		<div>
			{Object.entries(rootDataHandles).map(([key, fluidObject], index) => {
				return <FluidDataView key={key} containerId={containerId} node={fluidObject} />;
			})}
		</div>
	);
}
