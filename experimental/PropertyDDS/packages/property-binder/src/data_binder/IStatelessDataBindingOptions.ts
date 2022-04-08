/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataBindingParams } from "./dataBinding";

/**
 * Definition of the options block for {@link StatelessDataBinding}
 */
export interface IStatelessDataBindingOptions extends DataBindingParams {
  /**
   * A user supplied object
   */
  userData?: any;
}
