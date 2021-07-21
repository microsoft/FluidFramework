/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseProperty } from "@fluid-experimental/property-properties"

/**
 * Returned only from the [[PropertyProxy]].[[getParentOfReferencedProperty]] method.
 */
export interface IParentAndPathOfReferencedProperty {
  /**
   * The parent of the referenced property.
   */
  referencedPropertyParent: BaseProperty;
  /**
   * The relative path from the parent to the referenced property.
   */
  relativePathFromParent: string;
}
