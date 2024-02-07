/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuidv4 } from "uuid";

const CONTINUITY_ID_KEY = "myAppBrowserId";

/**
 * Method generating/grabbing browserID
 * @returns string for browserID
 */
export const getOrCreateContinuityID = (): string => {
	let continuityID = localStorage.getItem(CONTINUITY_ID_KEY);

	if (continuityID === null || continuityID === "") {
		continuityID = uuidv4();
		localStorage.setItem(CONTINUITY_ID_KEY, continuityID);
	}

	return continuityID;
};
