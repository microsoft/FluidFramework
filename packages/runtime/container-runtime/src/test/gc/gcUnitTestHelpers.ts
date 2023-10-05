/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConfigTypes, IConfigProviderBase } from "@fluidframework/telemetry-utils";
import { ReadAndParseBlob } from "@fluidframework/runtime-utils";

export const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

export const parseNothing: ReadAndParseBlob = async <T>() => {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const x: T = {} as T;
	return x;
};
