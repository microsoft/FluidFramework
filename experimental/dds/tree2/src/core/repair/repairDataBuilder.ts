/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../../util";
import { ChangeAtomId } from "../rebase";
import { FieldKey } from "../schema-stored";
import { Delta } from "../tree";

/**
 * A function that associates a change that produces repair data with the detached
 * field where the repair data should be stored.
 * @alpha
 */
export type RepairDataHandler = (changeId: ChangeAtomId) => FieldKey;

/**
 * A function that collects a delta that produces repair data associated with the given detached field.
 * @alpha
 */
export type RepairDataAccumulator = (key: FieldKey, delta: Delta.MarkList) => void;

/**
 * A builder for generating and keeping track of repair data.
 * @alpha
 */
export interface RepairDataBuilder {
	/**
	 * {@inheritDoc RepairDataHandler}
	 */
	handler: RepairDataHandler;
	/**
	 * {@inheritDoc RepairDataAccumulator}
	 */
	accumulator: RepairDataAccumulator;
}

/**
 * A repair data handler which will throw an error if called.
 * This should be used for any change family which does not support repair data.
 */
export const unsupportedRepairDataHandler: RepairDataHandler = () =>
	fail("Unexpected call to repairDataHandler");
