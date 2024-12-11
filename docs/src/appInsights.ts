/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReactPlugin } from "@microsoft/applicationinsights-react-js";
import { ApplicationInsights } from "@microsoft/applicationinsights-web";
const reactPlugin = new ReactPlugin();

const appInsights = new ApplicationInsights({
	config: {
		connectionString:
			"InstrumentationKey=8bce9107-e3f7-445c-be87-153f7ecbbe47;IngestionEndpoint=https://centralus-2.in.applicationinsights.azure.com/;LiveEndpoint=https://centralus.livediagnostics.monitor.azure.com/;ApplicationId=11a3a32b-28c1-4f28-97fb-4b113a61c1e9",
		enableAutoRouteTracking: true,
		enableDebug: true,
		extensions: [reactPlugin],
	},
});
appInsights.loadAppInsights();

export default appInsights;
