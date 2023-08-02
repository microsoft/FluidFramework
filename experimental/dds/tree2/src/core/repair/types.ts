/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../../util";
import { ChangeAtomId } from "../rebase";
import { Delta, FieldKey } from "../tree";

/**
 * A function that associates a change that produces repair data with the detached
 * field where the repair data should be stored.
 * @alpha
 */
export type RepairDataHandler = (changeId: ChangeAtomId) => FieldKey;

/**
 * TODO rename everything
 * @alpha
 */
export interface RepairData {
	handler: RepairDataHandler;
	/**
	 * A map of detached fields to the delta that would move in the appropriate repair data.
	 */
	marks: Map<FieldKey, Delta.MarkList>;
}

/**
 * A repair data handler which will throw an error if called.
 * This should be used for any change family which does not support repair data.
 */
export const unsupportedRepairDataHandler: RepairDataHandler = () =>
	fail("Unexpected call to repairDataHandler");
