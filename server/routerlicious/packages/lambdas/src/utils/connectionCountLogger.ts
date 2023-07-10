/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICache } from "@fluidframework/server-services-core";
import { LumberEventName, Lumberjack } from "@fluidframework/server-services-telemetry";

export interface IConnectionCountLogger {
	/**
	 * This function will increment and store total connection count per node and per cluster in Redis, and
	 * will also log these counters using ConnectionCountPerNode and TotalConnectionCount metrics respectively.
	 */
	incrementConnectionCount(): void;

	/**
	 * This function will decrement and store total connection count per node and per cluster in Redis, and
	 * will also log these counters using ConnectionCountPerNode and TotalConnectionCount metrics respectively.
	 */
	decrementConnectionCount(): void;
}

export class ConnectionCountLogger implements IConnectionCountLogger {
	private readonly perNodeKeyName: string;
	private readonly perClusterKeyName = `totalConnections`;
	constructor(
		private readonly nodeName: string = "nodeName",
		private readonly cache: ICache | undefined,
	) {
		this.perNodeKeyName = `totalConnections_${this.nodeName}`;
	}

	public incrementConnectionCount(): void {
		if (!this.cache || !this.cache.incr) {
			return;
		}
		const connectionCountPerNodeMetric = Lumberjack.newLumberMetric(
			LumberEventName.ConnectionCountPerNode,
		);
		const totalConnectionCountMetric = Lumberjack.newLumberMetric(
			LumberEventName.TotalConnectionCount,
		);
		this.cache.incr(this.perNodeKeyName).then(
			(val) => {
				connectionCountPerNodeMetric.setProperty("TotalConnectionCount", val);
				connectionCountPerNodeMetric.success("Connection count incremented for node.");
			},
			(error) => {
				connectionCountPerNodeMetric.error(
					`Error while incrementing connection count for node.`,
					error,
				);
			},
		);
		this.cache.incr(this.perClusterKeyName).then(
			(val) => {
				totalConnectionCountMetric.setProperty("TotalConnectionCount", val);
				totalConnectionCountMetric.success("Total connection count incremented.");
			},
			(error) => {
				totalConnectionCountMetric.error(
					`Error while incrementing total connection count for cluster.`,
					error,
				);
			},
		);
	}

	public decrementConnectionCount(): void {
		if (!this.cache || !this.cache.decr) {
			return;
		}
		const connectionCountPerNodeMetric = Lumberjack.newLumberMetric(
			LumberEventName.ConnectionCountPerNode,
		);
		const totalConnectionCountMetric = Lumberjack.newLumberMetric(
			LumberEventName.TotalConnectionCount,
		);
		this.cache.decr(this.perNodeKeyName).then(
			(val) => {
				connectionCountPerNodeMetric.setProperty("TotalConnectionCount", val);
				connectionCountPerNodeMetric.success("Connection count decremented for node.");
			},
			(error) => {
				connectionCountPerNodeMetric.error(
					`Error while decrementing connection count for node`,
					error,
				);
			},
		);
		this.cache.decr(this.perClusterKeyName).then(
			(val) => {
				totalConnectionCountMetric.setProperty("TotalConnectionCount", val);
				totalConnectionCountMetric.success("Total connection count decremented.");
			},
			(error) => {
				totalConnectionCountMetric.error(
					`Error while decrementing total connection count for cluster.`,
					error,
				);
			},
		);
	}
}
