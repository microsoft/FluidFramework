/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This package provides a telemetry logger that will route typical Fluid telemetry to Azure App Insights.
 * {@link https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview?tabs=net|Azure App Insights}
 * @packageDocumentation
 */

export {
	type FluidAppInsightsLoggerConfig,
	type TelemetryFilter,
	type CategoryFilter,
	type NamespaceFilter,
	createLogger,
} from "./fluidAppInsightsLogger";

export type { TelemetryEventCategory } from "@fluidframework/telemetry-utils";
