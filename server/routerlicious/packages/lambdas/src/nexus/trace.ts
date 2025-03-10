/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IDocumentMessage } from "@fluidframework/protocol-definitions";
import { getRandomInt } from "@fluidframework/server-services-client";
import { DefaultServiceConfiguration } from "@fluidframework/server-services-core";
import { BaseTelemetryProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
/**
 * Whether to add a trace to a message based on sampling rate.
 */
export function sampleMessages(numberOfMessagesPerTrace: number): boolean {
	return getRandomInt(numberOfMessagesPerTrace) === 0;
}

/**
 * Add a trace to a message depending on sampling rate.
 */
export function addNexusMessageTrace(
	message: IDocumentMessage,
	numberOfMessagesPerTrace: number,
	clientId: string,
	tenantId: string,
	documentId: string,
): IDocumentMessage {
	if (
		message &&
		DefaultServiceConfiguration.enableTraces &&
		sampleMessages(numberOfMessagesPerTrace)
	) {
		if (message.traces === undefined) {
			message.traces = [];
		}
		message.traces.push({
			action: "start",
			service: "nexus",
			timestamp: Date.now(),
		});

		const lumberjackProperties = {
			[BaseTelemetryProperties.tenantId]: tenantId,
			[BaseTelemetryProperties.documentId]: documentId,
			clientId,
			clientSequenceNumber: message.clientSequenceNumber,
			traces: message.traces,
			opType: message.type,
		};
		Lumberjack.info(`Message received by Nexus.`, lumberjackProperties);
	}

	return message;
}

interface IStageTrace {
	/**
	 * Name of the Stage.
	 */
	stage: string;
	/**
	 * Start time of the stage relative to the previous stage's start time.
	 */
	ts: number;
}
export class StageTrace<T extends { toString(): string }> {
	private readonly traces: IStageTrace[] = [];
	private lastStampedTraceTime: number = performance.now();
	constructor(initialStage?: T) {
		if (initialStage) {
			this.traces.push({ stage: initialStage.toString(), ts: 0 });
		}
	}
	public get trace(): IStageTrace[] {
		return this.traces;
	}
	public stampStage(stage: T): void {
		const now = performance.now();
		this.traces.push({ stage: stage.toString(), ts: now - this.lastStampedTraceTime });
		this.lastStampedTraceTime = now;
	}
}
