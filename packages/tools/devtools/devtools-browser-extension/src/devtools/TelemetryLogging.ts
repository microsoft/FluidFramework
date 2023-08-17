/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AppInsightsCore, IExtendedConfiguration } from "@microsoft/1ds-core-js";
import { PostChannel, IChannelConfiguration, IXHROverride } from "@microsoft/1ds-post-js";
import { ITelemetryBaseLogger, ITelemetryBaseEvent } from "@fluid-experimental/devtools-view";
import { ITaggedTelemetryPropertyType } from "@fluidframework/core-interfaces";

const fetchHttpXHROverride: IXHROverride = {
	sendPOST: (payload, oncomplete, sync) => {
		const telemetryRequestData =
			typeof payload.data === "string"
				? payload.data
				: new TextDecoder().decode(payload.data);

		const requestInit: RequestInit = {
			body: telemetryRequestData,
			method: "POST",
			headers: payload.headers,
			credentials: "include",
		};
		fetch(payload.urlString, requestInit)
			.then((response) => {
				const headerMap: { [key: string]: string } = {};
				// response.headers is not a run-of-the-mill array, it satisfies a particular interface that
				// only has forEach, not a general iterator.
				// eslint-disable-next-line unicorn/no-array-for-each
				response.headers.forEach((value: string, name: string) => {
					headerMap[name] = value;
				});

				if (response.body) {
					response
						.text()
						.then((text) => {
							oncomplete(response.status, headerMap, text);
						})
						.catch((error) => {
							// Something wrong with the response body? Play it safe by passing the response status; don't try to
							// explicitly re-send the telemetry events by specifying status 0.
							oncomplete(response.status, headerMap, "");
						});
				} else {
					oncomplete(response.status, headerMap, "");
				}
			})
			.catch((error) => {
				console.error("Error issuing telemetry request:", error);
				// Error sending the request. Set the status to 0 so that the events can be retried.
				oncomplete(0, {});
			});
	},
};
/**
 * Logger that sends logs to the OneDS collection endpoint.
 */
export class OneDSLogger implements ITelemetryBaseLogger {
	private readonly appInsightsCore = new AppInsightsCore();
	private readonly postChannel: PostChannel = new PostChannel();

	private readonly enabled: boolean = false;

	public constructor() {
		const channelConfig: IChannelConfiguration = {
			alwaysUseXhrOverride: true,
			httpXHROverride: fetchHttpXHROverride,
		};

		// Configure App insights core to send to collector
		const coreConfig: IExtendedConfiguration = {
			instrumentationKey: "<KEY-GOES-HERE>",
			endpointUrl: "https://mobile.events.data.microsoft.com/OneCollector/1.0",
			loggingLevelConsole: 0, // Do not log to console
			disableDbgExt: true, // Small perf optimization
			extensions: [
				this.postChannel, // Removing this as part of telemetry opt-in would be ideal
			],
			extensionConfig: {
				[this.postChannel.identifier]: channelConfig,
			},
		};

		if ((coreConfig.instrumentationKey ?? "") !== "") {
			this.enabled = true;
			this.appInsightsCore.initialize(coreConfig, []);
		}
	}

	public send(event: ITelemetryBaseEvent): void {
		if (!this.enabled) {
			return;
		}

		// Note: some APIs might fail if the last part of the eventName is not uppercase
		const category = event.category
			? `${event.category.charAt(0).toUpperCase()}${event.category.slice(1)}`
			: "Generic";
		const eventType = `Office.Fluid.Devtools.${category}`;

		const telemetryEvent = {
			name: eventType, // Dictates which table the event goes to
			data: {
				["Event.Time"]: new Date().toISOString(),
				["Event.Name"]: eventType, // Same as 'name' but is an actual column in Kusto; useful for cross-table queries
			},
		};

		// Add properties from the passed-in event with the appropriate keys in the final event to be sent to the server
		for (const key of Object.keys(event)) {
			const value = event[key];
			if (value === undefined) {
				continue;
			}
			if ((value as ITaggedTelemetryPropertyType).value !== undefined) {
				// In Fluid Devtools we don't currently plan to log tagged properties because we don't intend to capture any
				// user-identifiable or user-generated information. If we do later, we'll need to add support for this.
				throw new Error(`Tagged properties not supported by telemetry logger`);
			}
			if (!["string", "number", "boolean"].includes(typeof value)) {
				throw new Error(`Unknown data type for key ${key}`);
			}
			telemetryEvent.data[`Data.${key}`] = value;
		}

		this.appInsightsCore.track(telemetryEvent);
	}

	/**
	 * Shut down the underlying sink, which includes flushing any pending events in the queue.
	 */
	public flush(): void {
		if (this.enabled) {
			this.appInsightsCore.flush();
		}
	}
}
