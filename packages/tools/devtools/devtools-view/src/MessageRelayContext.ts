/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { IMessageRelay } from "@fluid-experimental/devtools-core";

/**
 * Context for accessing a shared {@link @fluid-experimental/devtools-core#IMessageRelay} for communicating with the webpage.
 *
 * @remarks
 *
 * Any message listening / posting should go through here, rather than directly through the
 * `window` (`globalThis`) or through the `chrome.runtime` APIs to ensure general compatibility, regardless of
 * how the Chrome Extension is configured / what context the components are run in.
 */
export const MessageRelayContext = React.createContext<IMessageRelay | undefined>(undefined);

/**
 * Gets the {@link @fluid-experimental/devtools-core#IMessageRelay} from the local {@link MessageRelayContext}.
 *
 * @throws If {@link MessageRelayContext} has not been set.
 */
export function useMessageRelay(): IMessageRelay {
	const messageRelay = React.useContext(MessageRelayContext);
	if (messageRelay === undefined) {
		throw new Error(
			"MessageRelayContext was not defined. Parent component is responsible for ensuring this has been constructed.",
		);
	}
	return messageRelay;
}
