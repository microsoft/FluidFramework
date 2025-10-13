/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITrace } from "@fluidframework/protocol-definitions";

/**
 * @internal
 */
export interface IMetricClient {
	writeLatencyMetric(series: string, traces: ITrace[]): Promise<void>;
}

// Default client for loca run.
/**
 * @internal
 */
export class DefaultMetricClient implements IMetricClient {
	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public writeLatencyMetric(series: string, traces: ITrace[]): Promise<void> {
		return Promise.resolve();
	}
}
