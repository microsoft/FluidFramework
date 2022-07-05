/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Definition of the options block for {@link DataBinder.activateDataBinding}.
 */
export interface IActivateDataBindingOptions {
  /**
   * If set, the activated databinding is only created when the absolute path of the
   * property being considered has `includePrefix` as a prefix. Defaults to the empty string,
   * in other words, any property is accepted.
   */
  includePrefix?: string;

  /**
   * If set, the activated databinding is only created when the absolute path of the
   * property does not have `excludePrefix` as a prefix. If empty string,
   * the excludePrefix is ignored. Defaults to the empty string (ignored).
   */
  excludePrefix?: string;

  /**
   * The activated binding is only created when its path in the workspace is exactly `exactPath`.
   * Empty path is ignored. Defaults to the empty string (ignored).
   * If both `exactPath` and at least one of {@link IActivateDataBindingOptions.includePrefix} or
   * {@link IActivateDataBindingOptions.excludePrefix} are specified, then `exactPath` takes precedence.
   */
  exactPath?: string;

  /**
   * A user supplied object that will be passed to each Data Binding created.
   */
  userData?: any;
}
