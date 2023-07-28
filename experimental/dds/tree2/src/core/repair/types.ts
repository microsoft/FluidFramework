/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeAtomId } from "../rebase";
import { FieldKey } from "../tree";

/**
 * A function which will be called when repair data should be generated.
 * @alpha
 */
export type RepairDataHander = (changeId: ChangeAtomId) => FieldKey;
