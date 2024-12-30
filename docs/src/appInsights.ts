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
let hasConsent = false;

/**
 * Updates the Application Insights consent setting.
 * This disables or enables telemetry based on the user's consent.
 * @param consent - The new consent setting.
 */
export const updateAppInsightsConsent = (consent: boolean): void => {
	try {
		hasConsent = consent;
		if (appInsights) {
			appInsights.config.disableTelemetry = !consent;
		}
	} catch (error) {
		console.error("Error updating App Insights consent:", error);
	}
};

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
	appInsights.config.disableTelemetry = !hasConsent;
}

export default appInsights;
