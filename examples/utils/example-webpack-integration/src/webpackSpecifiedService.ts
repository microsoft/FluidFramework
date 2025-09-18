/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Helper to create a DefinePlugin for specifying the driver service to use.
 * @internal
 */
export const getExampleDriverServiceWebpackPlugin = (service: string) => {
	return { EXAMPLE_DRIVER_SERVICE: JSON.stringify(service) };
};
