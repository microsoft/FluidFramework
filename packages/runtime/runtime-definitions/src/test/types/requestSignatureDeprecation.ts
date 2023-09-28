/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint deprecation/deprecation: "error" */

import { IDataStore } from "../../dataStoreContext";


declare const dataStore: IDataStore;

// These are deprecated
// eslint-disable-next-line deprecation/deprecation
dataStore.request({ url: "/" });
// eslint-disable-next-line deprecation/deprecation
dataStore.request({ url: "/", headers: { shouldBeDeprecated: true } });
// eslint-disable-next-line deprecation/deprecation
dataStore.request({ url: "/should/be/deprecated" });
