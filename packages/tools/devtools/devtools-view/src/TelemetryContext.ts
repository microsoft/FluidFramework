/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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