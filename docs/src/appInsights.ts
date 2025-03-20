/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-unresolved
import siteConfig from "@generated/docusaurus.config";
import { ReactPlugin } from "@microsoft/applicationinsights-react-js";
import { ApplicationInsights } from "@microsoft/applicationinsights-web";

const reactPlugin = new ReactPlugin();
let appInsights: ApplicationInsights | undefined;

if (siteConfig?.customFields?.INSTRUMENTATION_KEY === undefined) {
	console.warn("Instrumentation Key is missing. App Insights will not be initialized.");
}

// Only initialize Application Insights if not in local development.
// Remove the condition if you want to run Application Insights locally.
if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
	appInsights = new ApplicationInsights({
		config: {
			connectionString: `InstrumentationKey=${siteConfig?.customFields?.INSTRUMENTATION_KEY}`,
			enableAutoRouteTracking: true,
			enableDebug: true,
			extensions: [reactPlugin],
		},
	});
	appInsights.loadAppInsights();
}

export default appInsights;
