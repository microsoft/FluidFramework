/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { atom } from "recoil";

export const fetchingExternalData = atom({
	key: "fetchingExternalData",
	default: false,
});

export const unresolvedConflicts = atom({
	key: "unresolvedConflicts",
	default: false,
});
