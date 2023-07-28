/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeAtomId } from "../rebase";
import { FieldKey } from "../tree";

export type RepairDataHander = (changeId: ChangeAtomId) => FieldKey;