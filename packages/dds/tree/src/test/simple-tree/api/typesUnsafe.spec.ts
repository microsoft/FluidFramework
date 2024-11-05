/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import type { ReadonlyMapInlined } from "../../../simple-tree/api/typesUnsafe.js";
// eslint-disable-next-line import/no-internal-modules
import type { numberSchema } from "../../../simple-tree/leafNodeSchema.js";
import type { areSafelyAssignable, requireTrue } from "../../../util/index.js";

type MapInlined = ReadonlyMapInlined<string, typeof numberSchema>;

type _check = requireTrue<areSafelyAssignable<MapInlined, ReadonlyMap<string, number>>>;
