/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { compareArrays } from "../../index.js";

// Paranoid check that typing will prevent comparing with non-Array types like 'compareArrays(null, null)',
// which would otherwise pass the trivial acceptance clause.

// @ts-expect-error 'undefined' is not an array
compareArrays(undefined, undefined);

// @ts-expect-error 'null' is not an array
compareArrays(null, null); // eslint-disable-line unicorn/no-null

const s = Symbol();
// @ts-expect-error 'Symbol()' is not an array
compareArrays(s, s);

// @ts-expect-error 'true' is not an array
compareArrays(true, true);

// @ts-expect-error '0' is not an array
compareArrays(0, 0);

// @ts-expect-error 'string' is not an array
compareArrays("", "");
