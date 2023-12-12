/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint deprecation/deprecation: "error" */

import { IContainer } from "../../loader";

declare const container: IContainer;

// These are deprecated
// eslint-disable-next-line deprecation/deprecation
container.request({ url: "/" });
// eslint-disable-next-line deprecation/deprecation
container.request({ url: "/", headers: { shouldBeDeprecated: true } });
// eslint-disable-next-line deprecation/deprecation
container.request({ url: "/should/be/deprecated" });
