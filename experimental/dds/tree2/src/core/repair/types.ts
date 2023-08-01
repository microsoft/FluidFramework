/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../../util";
import { ChangeAtomId } from "../rebase";
import { FieldKey } from "../tree";

/**
 * A function which will be called when repair data should be generated.
 * @alpha
 */
export type RepairDataHandler = (changeId: ChangeAtomId) => FieldKey;

/**
 * A repair data handler which will throw an error if called.
 * This should be used for any change family which does not support repair data.
 */
export const unsupportedRepairDataHandler: RepairDataHandler = () =>
	fail("Unexpected call to repairDataHandler");
