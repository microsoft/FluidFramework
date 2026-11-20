/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LogLevel } from "@fluidframework/core-interfaces";
import {
	loggerToMonitoringContext,
	type TelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import { pkgVersion } from "../packageVersion.js";
import type {
	HistoryTraceProperties as TraceProperties,
	HistoryTraceSink,
} from "../util/index.js";

/**
 * Opt-in, content-free diagnostics for local history debugging.
 * @remarks
 * These verbose events are separate from aggregate telemetry.
 * A diagnostic sink must not throw or change the history operation being observed.
 */
export class HistoryTrace {
	private operationId = 0;
	private eventSequence = 0;
	private context: TraceProperties = {};

	private constructor(
		private readonly logger: TelemetryLoggerExt,
		private readonly treeId: string,
		private readonly sessionId: string,
		private readonly isSummarizer: () => boolean,
	) {}

	public static create(
		logger: TelemetryLoggerExt | undefined,
		treeId: string,
		sessionId: string,
		isSummarizer: () => boolean,
	): HistoryTrace | undefined {
		if (
			logger === undefined ||
			loggerToMonitoringContext(logger).config.getBoolean(
				"Fluid.SharedTree.HistoryDebugTrace",
			) !== true
		) {
			return undefined;
		}
		return new HistoryTrace(logger, treeId, sessionId, isSummarizer);
	}

	public nextOperationId(): number {
		return ++this.operationId;
	}

	/**
	 * Binds child diagnostics to the enclosing history operation.
	 */
	public scoped(properties: TraceProperties): HistoryTraceSink {
		return {
			record: (activity, details) => this.record(activity, { ...properties, ...details }),
		};
	}

	/**
	 * Carries correlation through synchronous summary generation and restores it on every exit.
	 */
	public runWithContext<T>(properties: TraceProperties, action: () => T): T {
		const previous = this.context;
		this.context = { ...previous, ...properties };
		try {
			return action();
		} finally {
			this.context = previous;
		}
	}

	public record(activity: string, properties?: TraceProperties): void {
		try {
			this.logger.sendTelemetryEvent(
				{
					eventName: "HistoryTrace",
					...this.context,
					...properties,
					activity,
					treeId: this.treeId,
					sessionId: this.sessionId,
					isSummarizer: this.isSummarizer(),
					treePackageVersion: pkgVersion,
					revisionRemapMaxIdTracking: true,
					eventSequence: ++this.eventSequence,
				},
				undefined,
				LogLevel.verbose,
			);
		} catch {
			// Diagnostics must not interrupt edits, trimming, or summarization.
		}
	}
}
