/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  EnumArrayProperty,
  EnumProperty,
  Int64Property,
  ReferenceMapProperty,
  SetProperty,
  ArrayProperty,
  BaseProperty,
  MapProperty,
  PropertyFactory,
  ReferenceArrayProperty,
  Uint64Property,
} from "@fluid-experimental/property-properties";
import { TypeIdHelper } from "@fluid-experimental/property-changeset";

import memoize from "memoize-one";

export class Utils {
  public static isReferenceCollectionTypeid = memoize((typeid: string) => {
    return TypeIdHelper.isReferenceTypeId(typeid);
  });

  public static isUint64Property(property: any): property is Uint64Property {
    return PropertyFactory.instanceOf(property, "Uint64");
  }

  public static isInt64Property(property: any): property is Int64Property {
    return PropertyFactory.instanceOf(property, "Int64");
  }

  public static isEnumProperty(property: BaseProperty): property is EnumProperty {
    return PropertyFactory.instanceOf(property, "Enum");
  }

  public static isEnumArrayProperty(property: BaseProperty): property is EnumArrayProperty {
    return PropertyFactory.instanceOf(property, "Enum", "array");
  }

  public static isReferenceArrayProperty(property: BaseProperty): property is ReferenceArrayProperty {
    return PropertyFactory.instanceOf(property, "Reference", "array");
  }

  public static isReferenceMapProperty(property: BaseProperty): property is ReferenceMapProperty {
    return PropertyFactory.instanceOf(property, "Reference", "map");
  }

  public static isArrayProperty(property: BaseProperty): property is ArrayProperty {
    return property.getContext() === "array";
  }

  public static isMapProperty(property: BaseProperty): property is MapProperty {
    return property.getContext() === "map";
  }

  public static isSetProperty(property: BaseProperty): property is SetProperty {
    return property.getContext() === "set";
  }

  public static isReferenceProperty(property: BaseProperty): property is SetProperty {
    return PropertyFactory.instanceOf(property, "Reference");
  }

  /**
   * Checks if the property is a collection
   * @param property the metadata
   * @return true if collection , false if not
   */
  public static isCollectionProperty(property: BaseProperty): boolean {
    return !(property.getContext === undefined || property.getContext() === "single");
  }
}
