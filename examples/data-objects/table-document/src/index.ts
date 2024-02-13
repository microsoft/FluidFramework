/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { TableDocument } from "./document.js";
export { TableSlice } from "./slice.js";
export { ITable } from "./table.js";
export { TableDocumentType, TableSliceType } from "./componentTypes.js";
export { parseRange, colIndexToName } from "./cellrange.js";
export { createTableWithInterception } from "./interception/index.js";
