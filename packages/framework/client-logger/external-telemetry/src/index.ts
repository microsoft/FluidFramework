/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	IExternalTelemetry,
	ExternalTelemetryEventName,
	ITelemetryConsumer,
} from "./common/index.js";
export {
	IContainerTelemetry,
	ContainerTelemetryEventName,
	ContainerTelemetryEventNames,
	ContainerConnectedTelemetry,
	ContainerClosedTelemetry,
	ContainerDisconnectedTelemetry,
	ContainerAttachingTelemetry,
	ContainerAttachedTelemetry,
} from "./container/index.js";
export {
	startTelemetry,
	createAppInsightsTelemetryConsumer,
	TelemetryConfig,
} from "./factory/index.js";
