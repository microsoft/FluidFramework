/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDataStore } from "../../dataStoreContext";

/* eslint deprecation/deprecation: "error" */

export async function test(dataStore: IDataStore) {
	// This is ok
	await dataStore.request({ url: "/" });

	// These are deprecated
	// eslint-disable-next-line deprecation/deprecation
	await dataStore.request({ url: "/", headers: { shouldBeDeprecated: true } });
	// eslint-disable-next-line deprecation/deprecation
	await dataStore.request({ url: "/should/be/deprecated" });
}
