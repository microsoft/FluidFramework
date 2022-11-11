/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ICollection, ISequencedOperationMessage } from "@fluidframework/server-services-core";
import { LivenessMonitorProperties, LumberEventName, Lumberjack } from "@fluidframework/server-services-telemetry";

const MsPerHour = 3600 * 1000;
export async function oldestOpCheck(opCollection: ICollection<ISequencedOperationMessage>): Promise<void> {
	const query = {};
	const sort = { _id: 1 };
	const limit = 1;

	const metric = Lumberjack.newLumberMetric(LumberEventName.OldestOpCheck);
	try {
		const oldestOps = await opCollection?.find(query, sort, limit);
		if (oldestOps?.length) {
			const ageInSec = (Date.now() - oldestOps[0].operation.timestamp) / MsPerHour;
			metric.setProperty(LivenessMonitorProperties.oldestOpAge, ageInSec);
		}

		metric.success("oldestOpCheck succeeded");
	} catch (err) {
		metric.error("oldestOpCheck failed", err);
		throw err;
	}
}
