/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { HasContainerId } from "@fluid-tools/client-debugger-view";

import { extensionMessageSource } from "../messaging";
import { ContainerSummaryView } from "./ContainerSummaryView";
import { MessageRelayContext } from "./MessageRelayContext";

/**
 * {@link ContainerView} input props.
 */
export type ContainerViewProps = HasContainerId;

/**
 * Root debug view for an individual Container.
 */
export function ContainerView(props: ContainerViewProps): React.ReactElement {
	const { containerId } = props;

	const messageRelay = React.useContext(MessageRelayContext);
	if (messageRelay === undefined) {
		throw new Error(
			"MessageRelayContext was not defined. Parent component is responsible for ensuring this has been constructed.",
		);
	}

	React.useEffect(() => {
		console.log(
			"CONTENT(ContainerView): Activating debugger's message posting for Container:",
			containerId,
		);
		// Activate message posting for the debugger associated with our Container ID
		messageRelay.postMessage({
			source: extensionMessageSource,
			type: "INITIATE_DEBUGGER_MESSAGING",
			data: {
				containerId,
			},
		});

		return (): void => {
			console.log(
				"CONTENT(ContainerView): Deactivating debugger's message posting for Container:",
				containerId,
			);

			// Activate message posting for the debugger associated with our Container ID
			messageRelay.postMessage({
				source: extensionMessageSource,
				type: "TERMINATE_DEBUGGER_MESSAGING",
				data: {
					containerId,
				},
			});
		};
	}, [containerId, messageRelay]);

	// TODO: render tab nav and inner tab views
	return <ContainerSummaryView containerId={containerId} />;
}
