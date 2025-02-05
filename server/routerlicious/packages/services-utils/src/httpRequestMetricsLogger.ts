/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IBasicRestWrapperMetricProps } from "@fluidframework/server-services-client";
import { LumberEventName, Lumberjack } from "@fluidframework/server-services-telemetry";

export const logHttpMetrics = (requestProps: IBasicRestWrapperMetricProps) => {
	const { axiosError, ...sanitizedRequestProps } = requestProps;
	const httpMetric = Lumberjack.newLumberMetric(
		LumberEventName.RestWrapper,
		sanitizedRequestProps,
	);
	httpMetric.setProperty("successful", axiosError ? false : true);
	if (axiosError) {
		if (axiosError.config) {
			// Since we send requests to riddler with the token in the body this would potentially log the token unless we redact it
			axiosError.config.data = "FLUID_REDACTED";
		}
		httpMetric.error("HttpRequest failed", axiosError);
	} else {
		httpMetric.success("HttpRequest completed");
	}
};
