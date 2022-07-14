/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Brand, Opaque } from "../../util";

export interface SequenceChangeset { }

// TODO: Unify with MoveId in Delta?
export interface MoveId extends Opaque<Brand<number, "tree.MoveId">> {}
