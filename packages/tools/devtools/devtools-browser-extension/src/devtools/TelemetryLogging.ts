/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as UTel from "@microsoft/oteljs";
import { EventThrottler, OneDSEndpoint, OneDSSink } from "@microsoft/oteljs-1ds";
import { ITelemetryBaseLogger, ITelemetryBaseEvent } from "@fluid-experimental/devtools-view";
import type {
	TelemetryEventPropertyType,
	ITaggedTelemetryPropertyType,
} from "@fluidframework/common-definitions";

// These probably can be lowered
const singleEventThrottleLimit = 100;
const totalEventThrottleLimit = 1000;

/**
 * Logger that sends logs to the OneDS collection endpoint.
 */
export class DevtoolsOtelLogger implements ITelemetryBaseLogger {
	private readonly telemetryLogger: UTel.ISimpleTelemetryLogger;
	private readonly oneDsSink: OneDSSink;

	public constructor() {
		const config: UTel.ITelemetryConfig = { enableQueue: true };
		this.telemetryLogger = new UTel.TelemetryLogger(undefined, undefined, config);

		// Copied from office-bohemia; this is for the Office Fluid Test tenant in Aria
		this.telemetryLogger.setTenantToken("<nampespace-prefix>", "<token>", UTel.SuppressNexus);
		this.registerOtelErrorsListener();

		this.oneDsSink = new OneDSSink([], { endpointUrl: OneDSEndpoint.PUBLIC });

		this.oneDsSink.setFullEventsEnabled(true);

		// We throttle on the client as a safety net in case a bug causes us to log a vast amount of events in a tight loop.
		const eventThrottler = new EventThrottler("_", this.oneDsSink);
		// Not more than 100 events of any one type per second.
		eventThrottler.setSingleEventThrottle(singleEventThrottleLimit);
		// Not more than 1000 events per second.
		eventThrottler.setTotalEventThrottle(totalEventThrottleLimit);
		this.oneDsSink.addPreprocessor(eventThrottler);

		// Add sink to underlying logger
		this.telemetryLogger.addSink(this.oneDsSink);
		this.telemetryLogger.flushQueue();
	}

	public send(event: ITelemetryBaseEvent): void {
		const telemetryEvent = this.getBasicOtelEvent(event);
		telemetryEvent.eventFlags.dataCategories =
			UTel.EnumObjects.DataCategories.ProductServiceUsage;
		telemetryEvent.dataFields = this.getDataFieldsFromProps(event);
		this.telemetryLogger.sendTelemetryEvent(telemetryEvent);
	}

	/**
	 * Shut down the underlying sink, which includes flushing any pending events in the queue.
	 */
	public shutdown(): void {
		this.oneDsSink.shutdown();
	}
	private getBasicOtelEvent(event: ITelemetryBaseEvent): UTel.TelemetryEvent {
		// // Otel APIs will fail if the last part of the eventName is not uppercase
		// let eventType = event.category && `${event.category.charAt(0).toUpperCase()}${event.category.substring(1)}`;

		return {
			eventName: "<fully-namespaced-event-name>",
			eventFlags: {},
		};
	}

	private getDataFieldsFromProps(props: ITelemetryBaseEvent): UTel.DataField[] {
		const dataFields: UTel.DataField[] = [];
		for (const key of Object.keys(props)) {
			const dataField: UTel.DataField | undefined = getOtelDataField(props[key], key);
			if (!dataField) {
				break;
			}
			dataFields.push(dataField);
		}
		return dataFields;
	}

	private registerOtelErrorsListener(): void {
		UTel.onNotification().addListener((event) => {
			if (event.category === 0 && event.level === 0) {
				console.error(event.message());
			}
		});
	}
}

/**
 * Helper method that returns Data fields in the form that Otel expects
 * @param value - Value for the field
 * @param key - Key for the field
 * @returns A field that the OTel library can handle
 */
const getOtelDataField = (
	value: TelemetryEventPropertyType | ITaggedTelemetryPropertyType,
	key: string,
): UTel.DataField | undefined => {
	if (value === undefined) {
		return undefined;
	}
	if ((value as ITaggedTelemetryPropertyType).value !== undefined) {
		// In Fluid Devtools we don't currently plan to log tagged properties because we don't intend to capture any
		// user-identifiable or user-generated information. If we do later, we'll need to add support for this.
		throw new Error(`Tagged properties not supported`);
	}
	if (typeof value === "string") return UTel.makeStringDataField(key, value);
	if (typeof value === "number") return UTel.makeDoubleDataField(key, value);
	if (typeof value === "boolean") return UTel.makeBooleanDataField(key, value);

	// This shouldn't happen, we were exhaustive above, but the compiler was not letting me skip the last if
	throw new Error(`Unknown data type for key ${key}`);
};
