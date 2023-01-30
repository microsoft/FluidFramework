/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConfigTypes, IConfigProviderBase } from "@fluidframework/telemetry-utils";

/**
 * Generates a config provider that returns feature flag information.
 * @param settings - Feature flags to set.
 */
export const mockConfigProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => {
	return {
		getRawConfig: (name: string): ConfigTypes => settings[name],
	};
};
