/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TelemetryContext } from "./telemetryContext";

export const getGlobal = () => (typeof window !== "undefined" ? window : global);

export const getGlobalTelemetryContext = () =>
	(getGlobal() as any).telemetryContext as TelemetryContext | undefined;
