/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeAtomId, FieldKey, RepairDataHandler } from "../../core";
import { brand } from "../../util";

export function makeRepairDataHandler(): {
	repairData: Map<ChangeAtomId, FieldKey>;
	repairDataHandler: RepairDataHandler;
} {
	const repairData = new Map<ChangeAtomId, FieldKey>();
	let repairDataCounter = 0;

	const repairDataHandler = (changeAtomId: ChangeAtomId) => {
		const fieldKey: FieldKey = brand(`repair-data-${repairDataCounter++}`);
		repairData.set(changeAtomId, fieldKey);
		return fieldKey;
	};

	return { repairData, repairDataHandler };
}
