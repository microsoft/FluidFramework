/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConfigTypes } from "@fluidframework/core-interfaces";
import { ReadAndParseBlob } from "@fluidframework/runtime-utils";

/**
 * Creates a test config provider with the ability to set configs values and clear all config values.
 * @internal
 */
export const createTestConfigProvider = () => {
	const settings: Record<string, ConfigTypes> = {};
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

export const parseNothing: ReadAndParseBlob = async <T>() => {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const x: T = {} as T;
	return x;
};
