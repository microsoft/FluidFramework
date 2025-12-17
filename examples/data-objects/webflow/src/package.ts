/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { pkgName, pkgVersion } from "./packageVersion.js";

const makeTypeName = (type: string): string => `${pkgName}/${type}@${pkgVersion}`;

export const hostType = makeTypeName("host");
export const documentType = makeTypeName("flow-document");
