/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { IMessageRelay } from "@fluid-tools/client-debugger";
import { DevtoolsView } from "./DevtoolsView";
import { MessageRelayContext } from "./MessageRelayContext";

/**
 * Necessary props to render {@link RootView}.
 */
export interface RootViewProps {
	/**
	 * An instance of {@link @fluid-tools/client-debugger#IMessageRelay} that can handle message passing between the
	 * debugger's "brain" and its UI, in whatever context the latter is being rendered (e.g. in the same page as the
	 * application, or in the browser's DevTools panel).
	 */
	messageRelay: IMessageRelay;
}

/**
 * Top-level component for the Fluid debugger.
 */
export function RootView(props: RootViewProps): React.ReactElement {
	return (
		<MessageRelayContext.Provider value={props.messageRelay}>
			<DevtoolsView />
		</MessageRelayContext.Provider>
	);
}
