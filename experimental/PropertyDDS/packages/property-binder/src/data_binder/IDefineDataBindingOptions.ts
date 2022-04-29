/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { UpgradeType } from '../internal/semvermap';

/**
 * Options for {@link DataBinder.defineDataBinding}
 */
export interface IDefineDataBindingOptions {
  /**
   * Optional value to specify what schemas the databinding will apply to, based on the semver of the rule,
   * and the semver of the property being applied to.
   *
   * If the UpgradeType is MINOR, with a semver of 1.1.0, it will apply to any props with versions >= 1.1.0, < 2.0.0
   *
   * If the UpgradeType is MAJOR, with a semver of 1.1.0, it will apply to any props with versions >= 1.1.0.
   *
   * If the UpgradeType is PATCH, with a semver of 1.1.0, it will apply to any props with versions >= 1.1.0 but < 1.2.0
   *
   * If there is a binding X with MINOR UpgradeType for 1.1.0, and a binding Y with PATCH for 1.1.1, X will apply to
   * all props with versions >= 1.1.0, _except_ for props with versions >= 1.1.1 but < 1.2.0, which will have
   * databinding Y.
   */
  upgradeType?: UpgradeType;
  exactPath?: string;
}
