/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateRefParams, IPatchRefParams } from "@fluidframework/gitresources";
/**
 * Required params to create ref with config
 */
export interface ICreateRefParamsExternal extends ICreateRefParams {
    config?: IExternalWriterConfig;
}

/**
 * Required params to patch ref with config
 */
export interface IPatchRefParamsExternal extends IPatchRefParams {
    config?: IExternalWriterConfig
}


interface IExternalWriterConfig {
    enabled: boolean;
}
