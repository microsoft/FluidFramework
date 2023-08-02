/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeAtomId, Delta, FieldKey, RepairData } from "../../core";
import { brand } from "../../util";

export function makeRepairDataHandler(): {
	repairDataFields: Map<ChangeAtomId, FieldKey>;
	repairData: RepairData;
} {
	const repairDataFields = new Map<ChangeAtomId, FieldKey>();
	const repairDataMarks = new Map<FieldKey, Delta.MarkList>();
	let repairDataCounter = 0;

	const repairDataHandler = (changeAtomId: ChangeAtomId) => {
		const fieldKey: FieldKey = brand(`repair-data-${repairDataCounter++}`);
		repairDataFields.set(changeAtomId, fieldKey);
		return fieldKey;
	};

	const repairData = {
		handler: repairDataHandler,
		marks: repairDataMarks,
	};

	return { repairDataFields, repairData };
}
