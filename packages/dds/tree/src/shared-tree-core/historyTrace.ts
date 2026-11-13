/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LogLevel } from "@fluidframework/core-interfaces";
import {
	loggerToMonitoringContext,
	type TelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

type TraceProperties = Readonly<Record<string, string | number | boolean | undefined>>;

/**
 * Opt-in, content-free diagnostics for local history debugging.
 * @remarks
 * These verbose events are separate from aggregate telemetry.
 * A diagnostic sink must not throw or change the history operation being observed.
 */
export class HistoryTrace {
	private operationId = 0;
	private eventSequence = 0;

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

	public record(activity: string, properties?: TraceProperties): void {
		try {
			this.logger.sendTelemetryEvent(
				{
					eventName: "HistoryTrace",
					...properties,
					activity,
					treeId: this.treeId,
					sessionId: this.sessionId,
					isSummarizer: this.isSummarizer(),
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
