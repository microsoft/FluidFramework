/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Tree as FluentTree } from "@fluentui/react-components";
import {
	GetRootDataVisualizations,
	type HasContainerKey,
	type ISourcedDevtoolsMessage,
	type InboundHandlers,
	RootDataVisualizations,
	type RootHandleNode,
	handleIncomingMessage,
} from "@fluidframework/devtools-core/internal";
import React from "react";

import { useMessageRelay } from "../MessageRelayContext.js";

import { Waiting } from "./Waiting.js";
import { TreeDataView } from "./data-visualization/index.js";

const loggingContext = "INLINE(VIEW)";

/**
 * {@link DataObjectsView} input props.
 */
export type DataObjectsViewProps = HasContainerKey;

/**
 * Displays the data inside a container.
 *
 * @remarks
 *
 * Dispatches data object rendering based on those provided view {@link TreeDataView}.
 */
export function DataObjectsView(props: DataObjectsViewProps): React.ReactElement {
	const { containerKey } = props;

	const messageRelay = useMessageRelay();

	const [rootDataHandles, setRootDataHandles] = React.useState<
		Record<string, RootHandleNode> | undefined
	>();

	React.useEffect(() => {
		const inboundMessageHandlers: InboundHandlers = {
			[RootDataVisualizations.MessageType]: async (untypedMessage) => {
				const message = untypedMessage as RootDataVisualizations.Message;

				if (message.data.containerKey === containerKey) {
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
				containerKey,
			}),
		);

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containerKey, setRootDataHandles, messageRelay]);

	if (rootDataHandles === undefined) {
		return <Waiting />;
	}

	return (
		<FluentTree aria-label="Data tree view">
			{Object.entries(rootDataHandles).map(([key, fluidObject], index) => {
				return (
					<TreeDataView key={key} containerKey={containerKey} label={key} node={fluidObject} />
				);
			})}
		</FluentTree>
	);
}
