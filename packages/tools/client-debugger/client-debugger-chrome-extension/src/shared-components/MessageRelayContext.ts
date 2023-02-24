/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { IMessageRelay } from "../messaging";

/**
 * Context for accessing a shared {@link IMessageRelay} for communicating messages with the webpage.
 *
 * @remarks
 *
 * Any message listening / posting should go through here, rather than directly through the
 * `window` (`globalThis`) to ensure general compatibility regardless of how the Chrome Extension
 * is configured / what context the components are run in.
 */
export const MessageRelayContext = React.createContext<IMessageRelay | undefined>(
	// False positive
	// eslint-disable-next-line unicorn/no-useless-undefined
	undefined,
);
