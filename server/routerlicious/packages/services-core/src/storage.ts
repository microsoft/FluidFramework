/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateRefParams } from "@fluidframework/gitresources";
/**
 * Required params to create ref with config
 */
export interface ICreateRefParamsExternal extends ICreateRefParams {
    config?: IExternalWriterConfig;
}

interface IExternalWriterConfig {
    enabled: boolean;
}
