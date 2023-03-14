/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IconButton, Spinner, Stack, StackItem, TooltipHost } from "@fluentui/react";
import { useId } from "@fluentui/react-hooks";
import React from "react";

import { ISummaryTree } from "@fluidframework/protocol-definitions";
import {
	ContainerDataSummaryMessage,
	GetContainerDataMessage,
	handleIncomingMessage,
	HasContainerId,
	IDebuggerMessage,
	InboundHandlers,
} from "@fluid-tools/client-debugger";
import { SummaryTreeView } from "@fluid-tools/client-debugger-view";

import { extensionMessageSource } from "../messaging";
import { useMessageRelay } from "./MessageRelayContext";

const loggingContext = "EXTENSION(ContainerDataView)";

/**
 * {@link ContainerDataView} input props.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ContainerDataViewProps extends HasContainerId {
	// TODO
}

/**
 * View containing a drop-down style view of {@link ContainerDataViewProps.initialObjects}.
 *
 * @remarks
 *
 * Dispatches data object rendering based on those provided view {@link ContainerDataViewProps.renderOptions}.
 */
export function ContainerDataView(props: ContainerDataViewProps): React.ReactElement {
	const { containerId } = props;

	const messageRelay = useMessageRelay();

	/**
	 * Message sent to the webpage to query for the Container data summary.
	 */
	const getContainerDataMessage: GetContainerDataMessage = {
		type: "GET_CONTAINER_DATA",
		source: extensionMessageSource,
		data: {
			containerId,
		},
	};

	// TODO: Post message requesting Container data
	// TODO: Listen for Container data updates

	const [summary, setSummary] = React.useState<ISummaryTree | undefined>();

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to the registry.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			["CONTAINER_DATA_SUMMARY"]: (untypedMessage) => {
				const message = untypedMessage as ContainerDataSummaryMessage;
				if (message.data.containerId === containerId) {
					setSummary(message.data.summary);
					return true;
				}
				return false;
			},
		};

		/**
		 * Event handler for messages coming from the webpage.
		 */
		function messageHandler(message: Partial<IDebuggerMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers, {
				context: loggingContext,
			});
		}

		messageRelay.on("message", messageHandler);

		// Reset Container data summary, to ensure we aren't displaying info for the wrong container while
		// we wait for a response from the new debugger.
		// eslint-disable-next-line unicorn/no-useless-undefined
		setSummary(undefined);

		// Request state info for the newly specified containerId
		messageRelay.postMessage({
			source: extensionMessageSource,
			type: "GET_CONTAINER_DATA",
			data: {
				containerId,
			},
		});

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containerId, setSummary]);

	const refreshButtonTooltipId = useId("refresh-button-tooltip");

	return (
		<Stack>
			<StackItem>
				<Stack horizontal>
					<StackItem>
						<h3>Container Data</h3>
					</StackItem>
					<StackItem>
						<TooltipHost content="Refresh Data" id={refreshButtonTooltipId}>
							<IconButton
								onClick={(): void =>
									messageRelay.postMessage(getContainerDataMessage)
								}
							></IconButton>
						</TooltipHost>
					</StackItem>
				</Stack>
			</StackItem>
			<StackItem>
				{summary === undefined ? <Spinner /> : <SummaryTreeView summary={summary} />}
			</StackItem>
		</Stack>
	);
}
