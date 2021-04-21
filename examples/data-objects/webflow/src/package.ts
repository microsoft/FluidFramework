/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { name, version } = require("../package.json");
/* eslint-enable @typescript-eslint/no-var-requires */

const makeTypeName = (type: string) => `${name}/${type}@${version}`;

export const hostType = makeTypeName("host");
export const documentType = makeTypeName("flow-document");
