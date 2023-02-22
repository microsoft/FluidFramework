/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { IMessageRelay } from "../messaging";

/**
 * {@link messageRelayContext} data.
 */
export interface MessageRelayContextData {
	/**
	 * Message handler for communicating with the webpage.
	 * Any message listening / posting should go through here, rather than directly through the
	 * `window` (`globalThis`) to ensure general compatibility regardless of how the Chrome Extension
	 * is configured / what context the components are run in.
	 */
	messageRelay: IMessageRelay;
}

/**
 * Context for accessing a shared {@link IMessageRelay} for communicating messages with the webpage.
 */
export const messageRelayContext = React.createContext<MessageRelayContextData | undefined>(undefined);