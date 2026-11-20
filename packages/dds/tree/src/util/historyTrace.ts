/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Content-free properties for internal history diagnostics.
 */
export type HistoryTraceProperties = Readonly<
	Record<string, string | number | boolean | undefined>
>;

/**
 * Optional diagnostics supplied by a tree's opt-in history trace.
 */
export interface HistoryTraceSink {
	record(activity: string, properties?: HistoryTraceProperties): void;
}

/**
 * Records diagnostics without allowing a sink failure to change the observed operation.
 */
export function recordHistoryTrace(
	trace: HistoryTraceSink | undefined,
	activity: string,
	properties?: HistoryTraceProperties,
): void {
	try {
		trace?.record(activity, properties);
	} catch {
		// Diagnostics must preserve the original operation and any original error.
	}
}
