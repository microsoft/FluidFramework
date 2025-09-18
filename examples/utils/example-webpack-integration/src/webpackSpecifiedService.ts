/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @internal
 */
export const getExampleDriverServiceWebpackPlugin = (service: string) => {
	return { EXAMPLE_DRIVER_SERVICE: JSON.stringify(service) };
};
