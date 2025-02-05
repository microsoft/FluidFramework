/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IBasicRestWrapperMetricProps } from "@fluidframework/server-services-client";
import { LumberEventName, Lumberjack } from "@fluidframework/server-services-telemetry";

export const logHttpMetrics = (requestProps: IBasicRestWrapperMetricProps) => {
	if (requestProps.axiosError) {
		if (requestProps.axiosError.config) {
			// Since we send requests to riddler with the token in the body this would potentially log the token unless we redact it
			requestProps.axiosError.config.data = "FLUID_REDACTED";
		}
	}
	const httpMetric = Lumberjack.newLumberMetric(LumberEventName.RestWrapper, requestProps);
	if (requestProps.axiosError) {
		httpMetric.error("HttpRequest failed");
	} else {
		httpMetric.success("HttpRequest completed");
	}
};
