/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer } from "../../loader";

/* eslint deprecation/deprecation: "error" */

export async function test(container: IContainer) {
	// This is ok
	await container.request({ url: "/" });

	// These are deprecated
	// eslint-disable-next-line deprecation/deprecation
	await container.request({ url: "/", headers: { shouldBeDeprecated: true } });
	// eslint-disable-next-line deprecation/deprecation
	await container.request({ url: "/should/be/deprecated" });
}
