/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import {
	postMessageToWindow,
	InitiateDebuggerMessagingMessage,
	TerminateDebuggerMessagingMessage,
} from "@fluid-tools/client-debugger";
import { HasContainerId } from "@fluid-tools/client-debugger-view";

import { extensionMessageSource } from "../messaging";
import { ContainerSummaryView } from "./ContainerSummaryView";

/**
 * {@link ContainerView} input props.
 */
export type ContainerViewProps = HasContainerId;

/**
 * Root debug view for an individual Container.
 */
export function ContainerView(props: ContainerViewProps): React.ReactElement {
	const { containerId } = props;

	React.useEffect(() => {
		console.log(
			"CONTENT(ContainerView): Activating debugger's message posting for Container:",
			containerId,
		);
		// Activate message posting for the debugger associated with our Container ID
		postMessageToWindow<InitiateDebuggerMessagingMessage>({
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
			postMessageToWindow<TerminateDebuggerMessagingMessage>({
				source: extensionMessageSource,
				type: "TERMINATE_DEBUGGER_MESSAGING",
				data: {
					containerId,
				},
			});
		};
	}, [containerId]);

	// TODO: render tab nav and inner tab views
	return <ContainerSummaryView containerId={containerId} />;
}
