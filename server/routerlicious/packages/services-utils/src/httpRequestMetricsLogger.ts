/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	convertRequestErrorToNetworkError,
	type IRestWrapperMetricProps,
} from "@fluidframework/server-services-client";
import { LumberEventName, Lumberjack } from "@fluidframework/server-services-telemetry";

export const logHttpMetrics = (requestProps: IRestWrapperMetricProps) => {
	const { requestError, ...sanitizedRequestProps } = requestProps;
	const httpMetric = Lumberjack.newLumberMetric(
		LumberEventName.RestWrapper,
		sanitizedRequestProps,
	);
	httpMetric.setProperty("successful", requestError ? false : true);
	if (requestError) {
		const networkError = convertRequestErrorToNetworkError(requestError);
		httpMetric.error("HttpRequest failed", networkError);
	} else {
		httpMetric.success("HttpRequest completed");
	}
};
