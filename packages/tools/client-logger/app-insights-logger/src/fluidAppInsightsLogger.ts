/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/common-definitions";

export class FluidAppInsightsLogger implements ITelemetryBaseLogger {
	protected readonly baseLoggingClient: ApplicationInsights;

	public constructor(client: ApplicationInsights) {
		this.baseLoggingClient = client;
		this.baseLoggingClient.loadAppInsights();
	}

	send(event: ITelemetryBaseEvent): void {
		this.baseLoggingClient.trackEvent({
			name: event.eventName,
			properties: event,
		});
	}

	flush(): void {
		this.baseLoggingClient.flush();
	}
}
