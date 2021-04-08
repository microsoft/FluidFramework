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
