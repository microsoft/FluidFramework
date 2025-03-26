/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	convertAxiosErrorToNetorkError,
	type IBasicRestWrapperMetricProps,
} from "@fluidframework/server-services-client";
import { LumberEventName, Lumberjack } from "@fluidframework/server-services-telemetry";

export const logHttpMetrics = (requestProps: IBasicRestWrapperMetricProps) => {
	const { axiosError, ...sanitizedRequestProps } = requestProps;
	const httpMetric = Lumberjack.newLumberMetric(
		LumberEventName.RestWrapper,
		sanitizedRequestProps,
	);
	httpMetric.setProperty("successful", axiosError ? false : true);
	if (axiosError) {
		const networkError = convertAxiosErrorToNetorkError(axiosError);
		httpMetric.error("HttpRequest failed", networkError);
	} else {
		httpMetric.success("HttpRequest completed");
	}
};
