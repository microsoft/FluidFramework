/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Delta, FieldKey, RepairDataBuilder } from "../../core";
import { brand } from "../../util";

export function makeRepairDataBuilder(): {
	repairDataBuilder: RepairDataBuilder;
	repairDataMarks: Map<FieldKey, Delta.MarkList>;
} {
	const repairDataMarks = new Map<FieldKey, Delta.MarkList>();
	let repairDataCounter = 0;

	const repairDataHandler = () => {
		const fieldKey: FieldKey = brand(`repair-data-${repairDataCounter++}`);
		return fieldKey;
	};

	return {
		repairDataBuilder: {
			handler: repairDataHandler,
			accumulator: (key, marks) => {
				repairDataMarks.set(key, marks);
			},
		},
		repairDataMarks,
	};
}
