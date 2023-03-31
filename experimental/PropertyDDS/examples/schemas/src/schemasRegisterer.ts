/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ALL_SCHEMAS } from "./";

// TODO: Use something other than `any`
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
export const registerSchemas = function (propertyFactory: any): void {
	for (const schemas of Object.values(ALL_SCHEMAS)) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
		propertyFactory.register(Object.values(schemas));
	}
};
