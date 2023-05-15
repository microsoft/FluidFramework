/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { IMessageRelay } from "@fluid-experimental/devtools-core";
import { DevtoolsView } from "./DevtoolsView";
import { MessageRelayContext } from "./MessageRelayContext";

/**
 * {@link DevtoolsPanel} input props.
 */
export interface DevtoolsPanelProps {
	/**
	 * An instance of {@link @fluid-experimental/devtools-core#IMessageRelay} that can handle message passing between the
	 * debugger's "brain" and its UI, in whatever context the latter is being rendered (e.g. in the same page as the
	 * application, or in the browser's DevTools panel).
	 */
	messageRelay: IMessageRelay;
}

/**
 * Top-level view for the Fluid Devtools.
 *
 * @remarks
 *
 * Initializes the message relay context required by internal components.
 */
export function DevtoolsPanel(props: DevtoolsPanelProps): React.ReactElement {
	return (
		<MessageRelayContext.Provider value={props.messageRelay}>
			<DevtoolsView />
		</MessageRelayContext.Provider>
	);
}
