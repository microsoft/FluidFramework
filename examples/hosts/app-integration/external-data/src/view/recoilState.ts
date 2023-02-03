/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { atom } from "recoil";

export const localUnsavedChangesState = atom({
	key: "localUnsavedChanges",
	default: 0,
});
