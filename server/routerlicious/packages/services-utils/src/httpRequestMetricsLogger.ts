/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IBasicRestWrapperMetricProps } from "@fluidframework/server-services-client";
import {
	CommonProperties,
	LumberEventName,
	Lumberjack,
} from "@fluidframework/server-services-telemetry";

export const logHttpMetrics = (requestProps: IBasicRestWrapperMetricProps) => {
	const properties = {
		...requestProps,
		[CommonProperties.telemetryGroupName]: "http_requests",
	};
	const httpMetric = Lumberjack.newLumberMetric(LumberEventName.RestWrapper, properties);
	if (requestProps.axiosError) {
		httpMetric.error("HttpRequest failed");
	} else {
		httpMetric.success("HttpRequest completed");
	}
};
