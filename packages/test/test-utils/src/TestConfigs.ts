/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";

/**
 * Extension of IConfigProviderBase that supports setting a config value and clearing all
 * config values for testing.
 *
 * @internal
 */
export interface ITestConfigProvider extends IConfigProviderBase {
	/** Set a config value */
	set: (key: string, value: ConfigTypes) => void;
	/** Clear all config values */
	clear: () => void;
}

/**
 * Creates a test config provider with the ability to set configs values and clear all config values.
 * @internal
 */
export const createTestConfigProvider = (
	defaults: Record<string, ConfigTypes> = {},
): ITestConfigProvider => {
	const settings: Record<string, ConfigTypes> = { ...defaults };
	return {
		getRawConfig: (name: string): ConfigTypes => settings[name],
		set: (key: string, value: ConfigTypes) => {
			settings[key] = value;
		},
		clear: () => {
			Object.keys(settings).forEach((key) => {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete settings[key];
			});
		},
	};
};
