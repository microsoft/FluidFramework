/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConfigTypes, IConfigProviderBase } from "@fluidframework/telemetry-utils";

export const mockConfigProvider = (
	settings: Record<string, ConfigTypes> = {},
): IConfigProviderBase => {
	return {
		getRawConfig: (name: string): ConfigTypes => settings[name],
		getRawConfigEntries: (): [string, string][] =>
			Object.entries(settings).map(([key, value]) => [key, `${value}`]),
	};
};
