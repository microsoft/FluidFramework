/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReactPlugin } from "@microsoft/applicationinsights-react-js";
import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import siteConfig from "@generated/docusaurus.config"
const reactPlugin = new ReactPlugin();

const appInsights = new ApplicationInsights({
	config: {
		connectionString:
			`InstrumentationKey=${siteConfig?.customFields?.INSTRUMENTATION_KEY};IngestionEndpoint=https://centralus-2.in.applicationinsights.azure.com/;LiveEndpoint=https://centralus.livediagnostics.monitor.azure.com/;ApplicationId=${siteConfig?.customFields?.APPLICATION_ID}`,
		enableAutoRouteTracking: true,
		enableDebug: true,
		extensions: [reactPlugin],
	},
});
appInsights.loadAppInsights();

export default appInsights;
