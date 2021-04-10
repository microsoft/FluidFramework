/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObjectClass, SharedObjectClass } from "./types";

export const isDataObjectClass = (obj: any): obj is DataObjectClass<any> => {
    return obj?.factory !== undefined;
};

export const isSharedObjectClass = (obj: any): obj is SharedObjectClass<any> => {
    return obj?.getFactory !== undefined;
};
