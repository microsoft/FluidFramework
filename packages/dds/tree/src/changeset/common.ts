/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Brand, Opaque } from "../util";

/**
 * An identifier that a node might carry.
 * No uniqueness guarantees (across any scope) are made at this time.
 * TODO: Update comment once uniqueness guarantees can be made.
 */
 export interface NodeId extends Opaque<Brand<string, "delta.NodeId">> {}
