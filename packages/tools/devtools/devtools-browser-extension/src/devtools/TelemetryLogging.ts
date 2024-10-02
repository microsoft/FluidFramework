/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ITelemetryBaseEvent,
	type ITelemetryBaseLogger,
	isTelemetryOptInEnabled,
} from "@fluid-internal/devtools-view";
import type { Tagged, TelemetryBaseEventPropertyType } from "@fluidframework/core-interfaces";
import { AppInsightsCore, type IExtendedConfiguration } from "@microsoft/1ds-core-js";
import {
	type IChannelConfiguration,
	type IXHROverride,
	PostChannel,
} from "@microsoft/1ds-post-js";
import { v4 as uuidv4 } from "uuid";

import { formatDevtoolsScriptMessageForLogging } from "./Logging.js";

const extensionVersion = chrome.runtime.getManifest().version;

const fetchHttpXHROverride: IXHROverride = {
	sendPOST: (payload, oncomplete, sync) => {
		const telemetryRequestData =
			typeof payload.data === "string" ? payload.data : new TextDecoder().decode(payload.data);

		const requestInit: RequestInit = {
			body: telemetryRequestData,
			method: "POST",
			headers: payload.headers,
			credentials: "include",
		};
		fetch(payload.urlString, requestInit)
			.then((response) => {
				const headerMap: Record<string, string> = {};
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

	/**
	 * Controls whether this class initializes and uses any necessary underlying objects that send logs to a remote
	 * endpoint. It's only set to true when an instrumentation key is provided, so no attempts are made to issue any
	 * requests during local development or other scenarios where a key is not passed in.
	 */
	private readonly enabled: boolean = false;
	// We expect the following usage identifiers to be mutated when the user opts in/out of reporting telemetry.
	/**
	 * Identifier that's generated on each Fluid Devtools session
	 * @remarks
	 */
	private sessionID?: string;
	/**
	 * This identifies a specific browser instance and is reused in subsequent sessions.
	 */
	private continuityID?: string;

	private readonly CONTINUITY_ID_KEY = "Fluid.Devtools.ContinuityId";

	public constructor() {
		const channelConfig: IChannelConfiguration = {
			alwaysUseXhrOverride: true,
			httpXHROverride: fetchHttpXHROverride,
		};

		this.generateIdentifiers();

		// NOTE: this doesn't really use environment variables at runtime.
		// The dotenv-webpack plugin for webpack does a search-and-replace for `process.env.<variable-name>`
		// and replaces them with inlined values if the corresponding variables exist in the environment
		// at bundle time, or `undefined` if not.
		const instrumentationKey = process.env.DEVTOOLS_TELEMETRY_TOKEN ?? "";

		// Configure App insights core to send to collector
		const coreConfig: IExtendedConfiguration = {
			instrumentationKey,
			loggingLevelConsole: 0, // Do not log to console
			disableDbgExt: true, // Small perf optimization
			extensions: [
				// Passing no channels here when the user opts out of telemetry would be ideal, completely ensuring telemetry
				// could not be sent out at all. Could be a later improvement.
				this.postChannel,
			],
			extensionConfig: {
				[this.postChannel.identifier]: channelConfig,
			},
		};

		if ((coreConfig.instrumentationKey ?? "") !== "") {
			this.enabled = true;
			this.appInsightsCore.initialize(coreConfig, []);
			console.log(formatDevtoolsScriptMessageForLogging(`Injected telemetry token.`));
		}
	}

	/**
	 * Generates/fetches a unique ID that's created the first time the Devtools extension is used in a browser.
	 * @returns string for continuityID
	 */
	private getOrCreateContinuityID(): string {
		let continuityID = localStorage.getItem(this.CONTINUITY_ID_KEY);

		if (continuityID === null || continuityID === "") {
			continuityID = uuidv4();
			localStorage.setItem(this.CONTINUITY_ID_KEY, continuityID);
		}

		return continuityID;
	}
	private generateIdentifiers(): void {
		this.sessionID = uuidv4();
		this.continuityID = this.getOrCreateContinuityID();
	}

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#ITelemetryBaseLogger.send}
	 */
	public send(event: ITelemetryBaseEvent): void {
		const optIn = isTelemetryOptInEnabled();

		// Clear localStorage and reset identifiers if the user opts out
		if (!optIn) {
			localStorage.removeItem(this.CONTINUITY_ID_KEY);
			// Reset identifiers, ensuring any subsequent telemetry will have fresh identifiers if the user opts in again.
			this.continuityID = undefined;
			this.sessionID = undefined;
			return;
		}

		if (!this.enabled) {
			return;
		}

		if ((this.sessionID === undefined || this.continuityID === undefined) && optIn) {
			this.generateIdentifiers();
		}

		// Note: the calls that the 1DS SDK makes to external endpoints might fail if the last part of the eventName is not uppercase
		// Note: "Fluid.Framework" here has a connection to the Aria tenant(s) we're targetting, and the full string
		// impacts the way the data is structured once ingested. Don't change this without proper consideration.
		const eventType = `Fluid.Framework.Devtools.Usage`;

		const telemetryEvent = {
			name: eventType, // Dictates which table the event goes to
			data: {
				["Event.Time"]: new Date(),
				["Event.Name"]: eventType, // Same as 'name' but is an actual column in Kusto; useful for cross-table queries
				["Data.extensionVersion"]: extensionVersion,
				["Data.sessionID"]: this.sessionID,
				["Data.continuityID"]: this.continuityID,
			},
		};

		// Add properties from the passed-in event with the appropriate keys in the final event to be sent to the server
		for (const key of Object.keys(event)) {
			const value = event[key];
			if (value === undefined) {
				continue;
			}
			if ((value as Tagged<TelemetryBaseEventPropertyType>).value !== undefined) {
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
	 * Flush the underlying sink, forcing any events that haven't been sent to the remote endpoint to be sent immediately.
	 */
	public flush(): void {
		if (this.enabled) {
			this.appInsightsCore.flush();
		}
	}
}
