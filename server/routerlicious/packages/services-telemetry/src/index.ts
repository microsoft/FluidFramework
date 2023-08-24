/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getGlobal } from "./isomorphicUtils";
import { TelemetryContext } from "./telemetryContext";

// It is possible for multiple versions of services-telemetry to be imported.
// We only want to set telemetryContext once, and we want to do so before Lumberjack can be initialized.
if (!(getGlobal() as any).telemetryContext) {
	(getGlobal() as any).telemetryContext = new TelemetryContext();
}

declare global {
	export const telemetryContext: TelemetryContext | undefined;
}

export { getGlobalTelemetryContext } from "./isomorphicUtils";
export { Lumber } from "./lumber";
export { LumberEventName } from "./lumberEventNames";
export { Lumberjack, ILumberjackOptions } from "./lumberjack";
export {
	TestEngine1,
	TestEngine2,
	TestLumberjack,
	TestSchemaValidator,
} from "./lumberjackCommonTestUtils";
export {
	BaseTelemetryProperties,
	CommonProperties,
	getLumberBaseProperties,
	handleError,
	HttpProperties,
	ILumberjackEngine,
	ILumberjackSchemaValidationResult,
	ILumberjackSchemaValidator,
	LogLevel,
	LumberType,
	QueuedMessageProperties,
	SessionState,
	ThrottlingTelemetryProperties,
} from "./resources";
export {
	BaseLumberjackSchemaValidator,
	BasePropertiesValidator,
	LambdaSchemaValidator,
} from "./schema";
export type { TelemetryContext };
export { ITelemetryContextProperties, ITelemetryContextPropertyProvider } from "./telemetryContext";
