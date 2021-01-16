/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Comlink from "comlink";

export const MakeThinProxy = <T>(obj: T): () => Promise<T> => {
    return Comlink.proxy(async () => obj);
};
