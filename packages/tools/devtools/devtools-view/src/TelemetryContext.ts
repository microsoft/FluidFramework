/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { v4 as uuidv4 } from "uuid";

const BROWSER_ID_KEY = "myAppBrowserId";

/**
 * Method generating/grabbing browserID
 * @returns string for browserID
 */
export const getOrCreateBrowserId = (): string => {
	let browserId = localStorage.getItem(BROWSER_ID_KEY);

	if (browserId === null || browserId === "") {
		browserId = uuidv4();
		localStorage.setItem(BROWSER_ID_KEY, browserId);
	}

	return browserId;
};

/**
 * Properties of the session context
 */
interface TelemetryContextType {
	sessionId: string | undefined;
	browserId: string | undefined;
}

/**
 * The Session Context
 */
export const TelemetryContext = React.createContext<TelemetryContextType | undefined>({
	sessionId: undefined,
	browserId: undefined,
});

/**
 * Gets sessionId
 * @returns current sessionID
 */
export const useSessionId = (): string | undefined => {
	const context = React.useContext(TelemetryContext);
	if (!context) {
		throw new Error("useSessionId must be used within a TelemetryProvider");
	}
	return context.sessionId;
};

/**
 * Gets browserID
 * @returns current browserID
 */
export const useBrowserId = (): string | undefined => {
	const context = React.useContext(TelemetryContext);
	if (!context) {
		throw new Error("useBrowserId must be used within a TelemetryProvider");
	}
	return context.browserId;
};
