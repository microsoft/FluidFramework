/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICache } from "@fluidframework/server-services-core";
import { LumberEventName, Lumberjack } from "@fluidframework/server-services-telemetry";

export interface IConnectionCountLogger {
    /**
     * This function will store total connection count per node and per cluster in Redis, and
     * will also log these counters using ConnectionCountPerNode and TotalConnectionCount metrics respectively.
     */
    logConnectionCount(isConnect: boolean): any;
}

export class ConnectionCountLogger implements IConnectionCountLogger {
    constructor(private readonly nodeName: string = "nodeName", private readonly cache: ICache | undefined) {
    }

    public async logConnectionCount(isConnect: boolean): Promise<void> {
        const connectionCountPerNodeMetric = Lumberjack.newLumberMetric(LumberEventName.ConnectionCountPerNode);
        const totalConnectionCountMetric = Lumberjack.newLumberMetric(LumberEventName.TotalConnectionCount);
        const perNodeKeyName = `totalConnections_${this.nodeName}`;
        const perClusterKeyName = `totalConnections`;
        if(!this.cache) {
            connectionCountPerNodeMetric.error(`Redis Cache not found.`);
            totalConnectionCountMetric.error(`Redis Cache not found.`);
            return;
        }
        if (isConnect) {
            this.cache.incr(perNodeKeyName).then((val) => {
                connectionCountPerNodeMetric.setProperty("TotalConnectionCount", val);
                connectionCountPerNodeMetric.success("Connection count incremented for node.");
            },
            (error) => {
                connectionCountPerNodeMetric.error(
                    `Error while incrementing connection count for node.`, error);
            });
            this.cache.incr(perClusterKeyName).then((val) => {
                totalConnectionCountMetric.setProperty("TotalConnectionCount", val);
                totalConnectionCountMetric.success("Total connection count incremented.");
            },
            (error) => {
                totalConnectionCountMetric.error(
                    `Error while incrementing total connection count for cluster.`, error);
            });
        } else {
            this.cache.decr(perNodeKeyName).then((val) => {
                connectionCountPerNodeMetric.setProperty("TotalConnectionCount", val);
                connectionCountPerNodeMetric.success("Connection count decremented for node.");
            },
            (error) => {
                connectionCountPerNodeMetric.error(
                    `Error while decrementing connection count for node`, error);
            });
            this.cache.decr(perClusterKeyName).then((val) => {
                totalConnectionCountMetric.setProperty("TotalConnectionCount", val);
                totalConnectionCountMetric.success("Total connection count decremented.");
            },
            (error) => {
                totalConnectionCountMetric.error(
                    `Error while decrementing total connection count for cluster.`, error);
            });
        }
    }
}
