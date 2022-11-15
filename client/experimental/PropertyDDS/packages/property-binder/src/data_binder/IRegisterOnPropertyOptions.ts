/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CallbackOptions } from "./dataBinding";

/**
 * Options to be used with {@link DataBinding.registerOnProperty}
 */
export interface IRegisterOnPropertyOptions extends CallbackOptions {
  /**
   *  If true the callback will only be called if the corresponding Property exists, i.e. it won't be called for
   *  'remove' events. The default is false.
   */
  requireProperty?: boolean;
}
