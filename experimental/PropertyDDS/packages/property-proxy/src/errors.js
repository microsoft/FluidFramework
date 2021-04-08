/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * The Object containing the PropertyProxy related errors.
 */
export const PropertyProxyErrors = {
  /**
   * @alias PropertyProxy-000
   */
  INVALID_PROPERTY: 'PropertyProxy-000: Only valid properties can be proxied.',

  /**
   * @alias PropertyProxy-001
   */
  NON_DYNAMIC_INSERT: 'PropertyProxy-001: Insertion is only possible on dynamic properties.',

  /**
   * @alias PropertyProxy-002
   */
  ITERABLE_INSERTION: 'PropertyProxy-002: ' +
    'Insertion of iterables is not possible. Please provide it as a Array/Map/SetProperty.',

  /**
   * @alias PropertyProxy-003
   */
  NON_ITERABLE: 'PropertyProxy-003: A valid iterable, that is not a string, should be provided.',

  /**
   * @alias PropertyProxy-004
   */
  ONLY_STRING_KEYS: 'PropertyProxy-004: Map proxy just support keys of type string.',

  /**
   * @alias PropertyProxy-005
   */
  INVALID_GUID: 'PropertyProxy-005: The specified value is not compatible with a NamedProperty.',

  /**
   * @alias PropertyProxy-006
   */
  NON_DYNAMIC_REMOVE: 'PropertyProxy-006: It is not possible to delete properties from a non-dynamic parent.',

  /**
   * @alias PropertyProxy-007
   */
  ASSIGN_ITERABLE_TO_SINGLE: 'PropertyProxy-007: ' +
    'Cannot assign an iterable to a property that has "single" defined as its context.',

  /**
   * @alias PropertyProxy-008
   */
  NON_REFERENCE_ASSIGN: 'PropertyProxy-008: Only ReferenceProperties can be set via the [propertyName*] syntax.',

  /**
   * @alias PropertyProxy-009
   */
  INVALID_REFERENCE: 'PropertyProxy-009: ' +
    'Trying to set an invalid Reference, check if the referenced property is in the workspace.',

  /**
   * @alias PropertyProxy-010
   */
  DIRECT_CHILDREN_ONLY: 'PropertyProxy-010: getProperty() only provides access to direct child properties.',
};
