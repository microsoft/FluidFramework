/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-unused-vars, max-len */
var PropertyError = function() {
  return;
};

/**
 * @constructor
 * @protected
 */
var PropertyFactoryError = function() {
  return;
};

/**
 * @constructor
 * @protected
 */
var RepositoryError = function() {
  return;
};

/**
 * @constructor
 * @protected
 */
var ServerError = function() {
  return;
};

/**
 * @constructor
 * @protected
 */
var ChangeSetError = function() {
  return;
};

/**
 * @constructor
 * @protected
 * @private
 */
var HFDMError = function() {
  return;
};

/**
 * @constructor
 * @protected
 * @private
 */
var WorkspaceError = function() {
  return;
};

/**
 * @constructor
 * @protected
 */
var UtilsError = function() {
  return;
};

/**
 * @constructor
 * @protected
 */
var PssClientError = function() {
  return;
};

/**
 * @fileoverview This file contains constants, including error messages.
 */

/**
 * @constructor
 * @protected
 * @description This file contains constants, including error messages.
 */
var SchemaValidatorError = function() {
  return;
};

/**
 * @constructor
 * @protected
 */
var TypeidHelperError = function() {
  return;
};

/**
 * Error messages for the HFDM Schema Validator
 * @alias FORGE.HFDMSchemaValidator.MSG
 */
const VALIDATOR_MSG = {
  /**
   * @alias SV-001
   * @memberof SchemaValidatorError
   * @summary 'SV-001: Only properties that inherit from NamedProperty can have a context of "set"'
   * @description methods: PropertyFactory.register
   * The context ‘set’ is only valid for properties that are instances of NamedProperties. If you want to
   * use a context of ‘set’, make sure your template includes:
   * Inherits: ‘NamedProperty’
   * Or
   * Inherits: [‘NamedProperty’, …]
   */
  SET_ONLY_NAMED_PROPS:
    'SV-001: Only properties that inherit from NamedProperty can have a context of "set". typeid: ',

  /**
   * @alias SV-002
   * @memberof SchemaValidatorError
   * @summary 'SV-002: Template mutation requires a higher version change level: '
   * @description You updated an existing template but the change to the version number was not as expected.
   * Make sure you updated your version number correctly. You may have violated one of the following rules:
   * - Adding one or more template attributes is a MINOR change.
   * - Removing one or more template attributes is a MAJOR change.
   */
  CHANGE_LEVEL_TOO_LOW_1:
    'SV-002: Template mutation requires a higher version change level: ',

  /**
   * @alias SV-003
   * @memberof SchemaValidatorError
   * @summary "SV-003: Invalid template version in 'typeid' attribute: "
   * @description methods: PropertyFactory.register
   * The template version number is not valid. A valid version number should look like: ‘1.0.0’
   */
  INVALID_VERSION_1:
    "SV-003: Invalid template version in 'typeid' attribute: ",

  /**
   * @alias SV-004
   * @memberof SchemaValidatorError
   * @summary "SV-004: Template is missing the mandatory 'typeid' attribute. This is not a valid template: "
   * @description methods: PropertyFactory.register
   * Your property template should include a typeid attribute.
   * @example {
   *   "typeid": "my.example:point2d-1.0.0",
   *   "properties": [
   *      {"id": "x", "typeid": "Float64"},
   *      {"id": "y", "typeid": "Float64"}
   *   ]
   * }
   */
  MISSING_TYPE_ID:
    "SV-004: Template is missing the mandatory 'typeid' attribute. This is not a valid template: ",

  /**
   * @alias SV-005
   * @memberof SchemaValidatorError
   * @summary "SV-005: Missing template version in 'typeid' attribute: "
   * @description methods: PropertyFactory.register
   * Typeid should contain a template version number.
   * @example “typeid: my.example:point2d-1.0.0”
   */
  MISSING_VERSION:
    "SV-005: Missing template version in 'typeid' attribute: ",

  /**
   * @alias SV-006
   * @memberof SchemaValidatorError
   * @summary 'SV-006: Template has changed at path: '
   * @description methods: PropertyFactory.register
   * The template you are using is different from the previous version and you did not update the version number.
   * If any changes were made to the template, you should update the version number to a higher number.
   * - Major change: removing one or more attribute (e.g. 1.0.0 -> 2.0.0)
   * - Minor change: adding one or more attribute (e.g. 1.0.0 -> 1.1.0)
   * - Patch: template description changes (e.g. 1.0.0 -> 1.0.1)
   */
  MODIFIED_TEMPLATE_1:
    'SV-006: Template has changed at path: ',

  /**
   * @alias SV-007
   * @memberof SchemaValidatorError
   * @summary 'SV-007: Template has changed but its version was not increased. Path: '
   * @description methods: PropertyFactory.register
   * When changing your template, you need to increase its version number. For example, if the previous version
   * number was 1.0.0, it should increase to 1.0.1 for a patch (if the template description has changed),
   * to 1.1.0 for a minor change (if you added one or more attributes) or to 2.0.0 for a major change (if you
   * removed one or more attributes).
   */
  MODIFIED_TEMPLATE_SAME_VERSION_1:
    'SV-007: Template has changed but its version was not increased. Path: ',

  /**
   * @alias SV-008
   * @memberof SchemaValidatorError
   * @summary 'SV-008: Template cannot be null or undefined.'
   * @description methods: PropertyFactory.register
   * PropertyFactory.register requires a template as a parameter.
   */
  NO_TEMPLATE:
    'SV-008: Template cannot be null or undefined.',

  /**
   * @alias SV-009
   * @memberof SchemaValidatorError
   * @summary 'SV-009: New template version is older than the previously registered version: '
   * @description methods: PropertyFactory.register
   * When updating a template’s version number, the version number can only increase, never decrease.
   */
  VERSION_REGRESSION_1:
    'SV-009: New template version is older than the previously registered version: ',

  /**
   * @alias SV-010
   * @memberof SchemaValidatorError
   * @summary 'SV-010: typeid must be a string. This is not valid: '
   * @description Your template contains a typeid that is not a string.
   */
  TYPEID_MUST_BE_STRING:
    'SV-010: typeid must be a string. This is not valid: ',

  /**
   * @alias SV-011
   * @memberof SchemaValidatorError
   * @summary 'SV-011: Internal error: TemplateValidator constructor missing one of inheritsFrom or hasSchema function'
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   * The TemplateValidator constructor should have in its parameters param.inheritsFrom and params.hasSchema.
   * Neither of them can be undefined.
   */
  MISSING_INHERITSFROM_OR_HASSCHEMA:
    'SV-011: Internal error: TemplateValidator constructor missing one of inheritsFrom or hasSchema function',

  /**
   * @alias SV-012
   * @memberof SchemaValidatorError
   * @summary 'SV-012: A key of a typeid key type map must be typeids'
   * @description Your template has an invalid key for the kind of map it is.
   */
  KEY_MUST_BE_TYPEID:
    'SV-012: A key of a typeid key map must be a valid typeids. Key: ',

  /**
   * @alias SV-013
   * @memberof SchemaValidatorError
   * @summary 'SV-013: A map with typeids as keys must be constant'
   * @description Your template has an invalid contextKeyType parameter.
   */
  INVALID_OPTION_NONE_CONSTANTS:
    'SV-013: A map with typeids as keys must be constant',

  /**
   * @alias SV-014
   * @memberof SchemaValidatorError
   * @summary 'SV-014: By default, draft is not a valid version for a typeId. Set allowDraft to true to support this.'
   * @description You tried to use draft as a versoin when it is not enabled.
   */
  DRAFT_AS_VERSION_TYPEID:
    'SV-014: By default, draft is not a valid version for a typeId. Set allowDraft to true to support this.',

  /**
   * @alias TH-001
   * @memberof TypeidHelperError
   * @summary 'TH-001: extractVersion requires a typeid parameter'
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   */
  TYPEID_NOT_DEFINED:
    'TH-001: extractVersion requires a typeid parameter'
};

/**
 * Error messages for the PropertySets library
 * @alias property-common._constants.MSG
 */
var MSG = {
  // PROPERTIES ERRORS
  /**
   * @alias PR-001
   * @memberof PropertyError
   * @summary 'PR-001: Trying to modify read only property value (array.length).'
   * @description methods: ArrayProperty.length.set, StringProperty.length.set
   * Cannot directly set the array.length or string.length. This is a read-only property.
   */
  MODIFY_READ_ONLY:                       'PR-001: Trying to modify read only property value (array.length).',

  /**
   * @alias PR-002
   * @memberof PropertyError
   * @summary "PR-002: No path between "
   * @description methods: Property.getRelativePath
   * There is no path between the property and the ancestor you passed in to .getRelativePath.
   */
  NO_PATH_BETWEEN:                        'PR-002: No path between ',

  /**
   * @alias PR-003
   * @memberof PropertyError
   * @summary "PR-003: Invalid path in ChangeSet: "
   * @description methods: Property.applyChangeSet
   * One of the paths included in your changeSet is not valid for this property.
   * Check that the modifications in the changeSet match the structure of the template.
   */
  INVALID_PATH:                           'PR-003: Invalid path in ChangeSet: ',

  /**
   * @alias PR-004
   * @memberof PropertyError
   * @summary 'PR-004: Cannot change the ID of a property that has a parent. Could not change id: '
   * @description methods: NodeProperty.insert
   * The property you inserted into a NodeProperty has a parent.
   * If your property has a parent, changing the property’s id will break the parent.
   * Make the change to the parent first.
   */
  ID_CHANGE_FOR_PROPERTY_WITH_PARENT:     'PR-004: Cannot change the ID of a property that has a parent. Could not change id: ',

  /**
   * @alias PR-005
   * @memberof PropertyError
   * @summary "PR-005: ResolvePath error: accessed a child via an invalid path syntax: "
   * @description methods: Property.resolvePath
   * Part of the path entered to Property.resolvePath was not valid.
   */
  INVALID_PATH_TOKEN:                     'PR-005: ResolvePath error: accessed a child via an invalid path syntax: ',

  /**
   * @alias PR-006
   * @memberof PropertyError
   * @summary "PR-006: The property already exists in this collection: "
   * @description methods: MapProperty.insert, NodeProperty.insert, ReferenceMapProperty.insert, Workspace.insert,
   *  SetProperty.insert
   * Your map, set or nodeproperty already contains an entry under in_key.
   */
  PROPERTY_ALREADY_EXISTS:                'PR-006: The property already exists in this collection: ',

  /**
   * @alias PR-007
   * @memberof PropertyError
   * @summary 'PR-007: Inserted an already existing entry: '
   * @description methods: MapProperty.applyChangeset, NodeProperty.applyChangeset, SetProperty.applyChangeset
   * The changeset you applied contains properties that have already been inserted.
   * Check the ‘insert’ fields in your changeSet for properties that might already exist.
   */
  INSERTED_EXISTING_ENTRY:                'PR-007: Inserted an already existing entry: ',

  /**
   * @alias PR-008
   * @memberof PropertyError
   * @summary "PR-008: Trying to remove a non-existing entry."
   * @description methods: MapProperty.remove, SetProperty.remove
   * Tried to remove an entry that does not exist.
   * This can be caused indirectly by deserialize / applyChangeset methods.
   * One of the ‘remove’ fields in your changeSet must contain a property that does not exist.
   */
  REMOVED_NON_EXISTING_ENTRY:             'PR-008: Trying to remove a non-existing entry: ',

  /**
   * @alias PR-009
   * @memberof PropertyError
   * @summary "PR-009: Trying to modify a not existing entry."
   * @description methods: MapProperty.applyChangeset, NodeProperty.applyChangeset, SetProperty.applyChangeset
   * One of the key you are trying to modify in your changeSet does not exist.
   * One of the ‘modify’ fields in your changeSet refers to a property that does not exist.
   */
  MODIFY_NON_EXISTING_ENTRY:              'PR-009: Trying to modify a not existing entry: ',

  /**
   * @alias PR-010
   * @memberof PropertyError
   * @summary "PR-010: Trying to insert into a collection a property that already has a parent."
   * @description methods: MapProperty.insert, MapProperty.set, SetProperty.insert, NodeProperty.insert
   * The value you are trying to insert in your map property, set property or node property has a parent.
   * You cannot insert a property that has a parent.
   */
  INSERTED_ENTRY_WITH_PARENT:             'PR-010: Trying to insert into a collection a property that already has ' +
                                          'a parent.',

  /**
   * @alias PR-011
   * @memberof PropertyError
   * @summary "PR-011: ResolvePath error: Encountered empty token in path: "
   * @description methods: Property.resolvePath, Workspace.resolvePath
   * Paths should not contain empty sections such as ‘..’, ‘//’ or ‘[], etc.
   * Sections in the path are delimited by ‘.’ ‘[ ]’, ‘/’ .
   * There should always be a path between any two delimiters.
   */
  EMPTY_TOKEN:                            'PR-011: ResolvePath error: Encountered empty token in path: ',

  /**
   * @alias PR-012
   * @memberof PropertyError
   * @summary "PR-012: ResolvePath error: Quotes must only be at the start and the end of a path. Error in path: "
   * @description methods: Property.resolvePath, Workspace.resolvePath
   * Paths should not contain quotes except at the beginning and end of the path.
   * For example: resolvePath('my"path.nested".other') is not valid because the first quote is in front of ‘path’
   * but after the ‘.nested’ which is part of the subsequent path.
   */
  QUOTES_WITHIN_TOKEN:                    'PR-012: ResolvePath error: Quotes must only be at the start and the ' +
                                          'end of a path. Error in path: ',

  /**
   * @alias PR-013
   * @memberof PropertyError
   * @summary "PR-013: ResolvePath error: Encountered a dot at the end of path: "
   * @description methods: Property.resolvePath, Workspace.resolvePath
   * Paths should not end with a ‘.’
   */
  DOT_AT_END:                             'PR-013: ResolvePath error: Encountered a dot at the end of path: ',

  /**
   * @alias PR-014
   * @memberof PropertyError
   * @summary "PR-014: ResolvePath error: Encountered a dot within a square bracket. These have to be escaped. Error in path: "
   * @description methods: Property.resolvePath, Workspace.resolvePath
   * Paths using square brackets should not contain ‘.’ within those square brackets.
   * If your path contains any dots, these should be escaped e.g. [my\.path] instead of [my.path].
   */
  DOTS_IN_SQUARE_BRACKETS:                'PR-014: ResolvePath error: Encountered a dot within a square bracket. ' +
                                          'These have to be escaped. Error in path: ',

  /**
   * @alias PR-015
   * @memberof PropertyError
   * @summary "PR-015: Missing . or [ at segment start in path: "
   * @description methods: Property.resolvePath, Workspace.resolvePath
   * resolvePath error while parsing your string.
   * It encountered an end to a path segment that was not
   * followed by a “.” or a “[“ indicating the beginning of a new segment.
   */
  MISSING_DOT_AT_SEGMENT_START:           'PR-015: Missing . or [ at segment start in path: ',

  /**
   * @alias PR-016
   * @memberof PropertyError
   * @summary "PR-016: ResolvePath error: Square brackets have to be followed either by '.' or by '[' or by '*'. Error in path: "
   * @description methods: Property.resolvePath, Workspace.resolvePath
   * Closing square bracket not followed by the correct character (., [ or *).
   * For example, this is not valid: resolvePath(myArray[2]nested).
   * This is valid: resolvePath(myArray[2].nested).
   */
  INVALID_END_OF_SQUARE_BRACKETS:         'PR-016: ResolvePath error: Square brackets have to be followed either ' +
                                          'by "." or by "[" or by "*". Error in path: ',

  /**
   * @alias PR-017
   * @memberof PropertyError
   * @summary "PR-017: ResolvePath error: Unclosed brackets at the end of path: "
   * @description methods: Property.resolvePath, Workspace.resolvePath
   * Every opening bracket ([) needs a matching closing bracket (])
   */
  UNCLOSED_BRACKETS:                      'PR-017: ResolvePath error: Unclosed brackets at the end of path: ',

  /**
   * @alias PR-018
   * @memberof PropertyError
   * @summary "PR-018: ResolvePath error: Encountered closing bracket without corresponding opening one in path: "
   * @description methods: Property.resolvePath, Workspace.resolvePath
   * Any closing bracket (]) must be preceded by a matching opening bracket ([).
   */
  CLOSING_BRACKET_WITHOUT_OPENING:        'PR-018: ResolvePath error: Encountered closing bracket without ' +
                                          'corresponding opening one in path: ',

  /**
   * @alias PR-019
   * @memberof PropertyError
   * @summary "PR-019: Encountered an invalid escape sequence in path: "
   * @description methods: Property.resolvePath, Workspace.resolvePath
   */
  INVALID_ESCAPE_SEQUENCE:                'PR-019: Encountered an invalid escape sequence in path: ',

  /**
   * @alias PR-020
   * @memberof PropertyError
   * @summary "PR-020: ResolvePath error: Encountered unclosed quotation marks in path: "
   * @description methods: Property.resolvePath, Workspace.resolvePath
   * A quotation mark at the beginning of a path must have a matching closing quotation mark
   *  at the end of the same path.
   */
  UNCLOSED_QUOTATION_MARKS:               'PR-020: ResolvePath error: Encountered unclosed quotation marks in path: ',

  /**
   * @alias PR-021
   * @memberof PropertyError
   * @summary "PR-021: Set can only contain named properties"
   * @description methods: SetProperty.insert, SetProperty.set, SetProperty.setValues
   * The property you insert in a setProperty must be an instance of NamedProperty.
   * When creating the property to be inserted, make sure it inherits from NamedProperty.
   * @example <caption>Creating a property that inherits from NamedProperty</caption>
   * {
   *   typeid:”my.example:myprop-1.0.0”,
   *   inherits:’NamedProperty’ (or [‘NamedProperty’, …]
   *   ...
   * }
   */
  CANT_INSERT_NON_NAMED_PROPERTIES:       'PR-021: Set can only contain named properties',

  /**
   * @alias PR-022
   * @memberof PropertyError
   * @summary "PR-022: Added child without id."
   * @description methods: NodeProperty.insert, Workspace.insert
   * The property you inserted does not have an id.
   * Unless the property is an instance of NamedProperty, you must pass in an id as the first parameter
   * (and the property second)
   */
  ADDED_CHILD_WITHOUT_ID:                 'PR-022: Added child without id.',

  /**
   * @alias PR-023
   * @memberof PropertyError
   * @summary "PR-023: Path resolution is not supported for primitive type arrays."
   * @description methods: ArrayProperty.resolvePath
   * Cannot use .resolvePath on a primitive array, only on a Custom type array.
   * For a primitive array, use .getValue instead.
   * For example, instead of MyValueArray.resolvePath(1), use MyValueArray.getValue(1)
   */
  NO_PATHS_FOR_NON_PRIMITIVE_ARRAYS:      'PR-023: Path resolution is not supported for primitive type arrays.',

  /**
   * @alias PR-024
   * @memberof PropertyError
   * @summary "PR-024: ResolvePath error: Accessed an array via an non numeric index: "
   * @description methods: ArrayProperty.resolvePath
   * When using an array index as part of your path, it needs to have a numeric value.
   */
  INVALID_NON_NUMERIC_SEGMENT_IN_PATH:    'PR-024: ResolvePath error: Accessed an array via an non numeric index: ',

  /**
   * @alias PR-025
   * @memberof PropertyError
   * @summary "PR-025: Internal error: _getPathSegmentForChildNode has been called for an entry that is not an entry of the collection. "
   * @description methods: ArrayProperty.getRelativePath, ArrayProperty.getAbsolutePath
   * INTERNAL ERROR
   * If you encounter this error, please contact the development team.
   * Part of the path you are trying to find points to a non-existing array item.
   */
  GET_PATH_SEGMENT_CALLED_FOR_NON_ENTRY:  'PR-025: Internal error: _getPathSegmentForChildNode has been called ' +
                                          'for an entry that is not an entry of the collection. ',

  /**
   * @alias PR-026
   * @memberof PropertyError
   * @summary "PR-026: deserialize was called with a non-normalized ChangeSet."
   * @description methods:
   * The changeSet passed to .deserialize was not a valid non-normalized changeset.
   */
  NO_NORMALIZED_CHANGESET:                'PR-026: deserialize was called with a non-normalized ChangeSet.',

  /**
   * @alias PR-027
   * @memberof PropertyError
   * @summary 'PR-027: Missing GUID in a normalized ChangeSet with named properties'
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   * One of your changesets contained a NamedProperty without a GUID.
   * This should not happen and should have been validated already.
   */
  MISSING_GUID_IN_NORMALIZED_CHANGESET:   'PR-027: Missing GUID in a normalized ChangeSet with named properties',

  /**
   * @alias PR-028
   * @memberof PropertyError
   * @summary 'PR-028: enum value unknown: '
   * @description methods: EnumProperty.getEnumString, EnumProperty.setValue, EnumProperty.setEnumByString,
   * EnumProperty.getEnumString, EnumArrayProperty.getEnumStrings
   * This Enum Property does not have any entry with that value.
   * EnumProperty.getEnumByString -> the EnumProperty you used to pass this function does not have an entry.
   * EnumProperty.setValue -> no entry exists for in_value
   * EnumProperty.setEnumByString -> no entry exists for in_stringId
   * EnumArrayProperty.getEnumString -> the value found at in_position does not correspond to an entry.
   * EnumArrayProperty.getEnumStrings -> one of the values found at one of the positions sought does
   * not correspond to an entry.
   */
  UNKNOWN_ENUM:                           'PR-028: enum value unknown: ',

  /**
   * @alias PR-029
   * @memberof PropertyError
   * @summary 'PR-029: Unknown ChangeSet operation: '
   * @description methods: Property.applyChangeSet
   * Changeset contains an operation that is unknown.
   * Valid operations are insert, modify and remove.
   */
  UNKNOWN_OPERATION:                      'PR-029: Unknown ChangeSet operation: ',

  /**
   * @alias PR-033
   * @memberof PropertyError
   * @summary 'PR-033: Trying to remove something that does not exist: '
   * @description methods: Workspace.remove, NodeProperty.remove
   * The property you passed to workspace.remove or nodeProperty.remove does not exist.
   * Check that you passed the correct property, and that it has not yet been removed.
   */
  REMOVING_NON_EXISTING_KEY:              'PR-033: Trying to remove something that does not exist: ',

  /**
   * @alias PR-034
   * @memberof PropertyError
   * @summary 'PR-034: in_id must be a string, a number or an array of these. This is not valid: '
   * @description methods: Workspace.get, Property.get
   * Workspace.get and Property.get take in an id (string or number) or an array of ids.
   * @example <caption>for example: </caption>
   *  .get(‘position’).get(‘x’) or .get([‘property’, ‘x’])
   */
  STRING_OR_ARRAY_STRINGS:                'PR-034: in_id must be a string, a number or an array of these. This is not valid: ',

  /**
   * @alias PR-035
   * @memberof PropertyError
   * @summary 'PR-035: Argument of serialize() should be an object.'
   * @description methods: Property.serialize
   * Property.serialize only takes in one parameter: an options object. That parameter is optional.
   */
  SERIALIZE_TAKES_OBJECT:                 'PR-035: Argument of serialize() should be an object.',

  /**
   * @alias PR-036
   * @memberof PropertyError
   * @summary 'PR-036: ArrayProperty: insert range - Start offset is invalid: '
   * @description ArrayProperty.insert, ArrayProperty.insertRange
   * The in_position (for .insert) or in_offset (for .insertRange) should not be smaller than 0
   * or larger than the length of the array.
   */
  START_OFFSET_INVALID:                   'PR-036: ArrayProperty: insert range - Start offset is invalid: ',

  // PR-037 removed

  /**
   * @alias PR-038
   * @memberof PropertyError
   * @summary 'PR-038: Internal error: Trying to remove from an array a property that has not the array as parent.'
   * @description ArrayProperty.remove, ArrayProperty.removeRange, ArrayProperty.pop
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   * The item (or one of the items) you are trying to remove from the array has a parent that is not the array.
   * This should not happen because you should not have been able to insert the item in the array in the first place.
   */
  CANNOT_REMOVE_WITH_DIFFERENT_PARENT:    'PR-038: Internal error: Trying to remove from an array a property that ' +
                                          'has not the array as parent.',

  /**
   * @alias PR-039
   * @memberof PropertyError
   * @summary 'PR-039: ArrayProperty: Modify range - Start offset cannot be negative: '
   * @description methods ArrayProperty.set, ArrayProperty.setRange
   * Your first parameter: in_position (for .set) and in_offset (for .setRange) cannot have a negative value.
   */
  START_OFFSET_NEGATIVE:                  'PR-039: ArrayProperty: Modify range - Start offset cannot be negative: ',

  // ERROR PR-040 NOT FOUND? CHECK BINARYPROP
  // ERROR PR-041 NOT FOUND? CHECK BINARYPROP
  // PR-042 - PR-048 removed

  /**
   * @alias PR-049
   * @memberof PropertyError
   * @summary 'PR-049: This parameter must be a number: parameter: '
   * @description methods: ArrayProperty.removeRange, ArrayProperty.setRange, ArrayProperty.insertRange,
   *   ArrayProperty.insert, EnumArrayProperty.getEnumStrings
   * The parameter needs to be a number.
   * For .removeRange: in_offset and in_deleteCount
   * For .setRange: in_offset
   * For .insertRange: in_offset
   * For .getEnumStrings: in_offset, in_length
   * For StringProperty.insert: in_position
   */
  NOT_NUMBER:                             'PR-049: This parameter must be a number: parameter: ',

  /**
   * @alias PR-050
   * @memberof PropertyError
   * @summary 'PR-050: traverseUp / traverseDown parameter: in_callback must be a function.'
   * @description methogs: Property.traverseUp, Property.traverseDown
   * Property.traverseUp and Property.traverseDown take one parameter: a callback function
   */
  CALLBACK_NOT_FCT:                       'PR-050: traverseUp / traverseDown parameter: in_callback must ' +
                                          'be a function.',

  /**
   * @alias PR-051
   * @memberof PropertyError
   * @summary 'PR-051: Parameter error: in_array must be an array.'
   * @description methods: ArrayProperty.insertRange
   * Array.insertRange takes two parameters. The second one (in_array) must be an array.
   * To pass in only one item, either use .insert(index, item)
   * or put that item into an array: .insertRange(index, [item])
   */
  IN_ARRAY_NOT_ARRAY:                     'PR-051: Parameter error: in_array must be an array for method: ',

  /**
   * @alias PR-052
   * @memberof PropertyError
   * @summary 'PR-052: EnumProperty.setEnumByString parameter: in_stringId must be a string. This is not valid: '
   * @description methods: EnumProperty.setEnumByString
   * EnumProperty.setEnumByString takes one parameter: a string id. It must be a string.
   */
  STRING_ID_MUST_BE_STRING:               'PR-052: EnumProperty.setEnumByString parameter: in_stringId must ' +
                                          'be a string. This is not valid: ',

  /**
   * @alias PR-053
   * @memberof PropertyError
   * @summary 'PR-053: Integer64Property.setValueHigh parameter: in_high must be a number. This is not valid: '
   * @description methods: Integer64Property.setValueHigh
   * Integer64Property.setValueHigh takes one parameter: a number.
   */
  IN_HIGH_MUST_BE_NUMBER:                 'PR-053: Integer64Property.setValueHigh parameter: in_high must ' +
                                          'be a number. This is not valid: ',

  /**
   * @alias PR-054
   * @memberof PropertyError
   * @summary 'PR-054: Integer64Property.setValueLow parameter: in_low must be a number. This is not valid: '
   * @description methods: Integer64Property.setValueLow
   * Integer64Property.setValueLow takes one parameter: a number.
   */
  IN_LOW_MUST_BE_NUMBER:                  'PR-054: Integer64Property.setValueLow parameter: in_low must ' +
                                          'be a number. This is not valid: ',

  /**
   * @alias PR-055
   * @memberof PropertyError
   * @summary 'PR-055: Integer64Property.toString parameter: in_radix must be a number. This is not valid: '
   * @description methods: IntegerProperty.toString
   * Integer64Property.toString takes one optional parameter: a number (in_radix).
   * If no value is passed, will default to 10.
   */
  IN_RADIX_MUST_BE_NUMBER:                'PR-055: Integer64Property.toString parameter: in_radix must be a number. This is not valid: ',

  /**
   * @alias PR-056
   * @memberof PropertyError
   * @summary 'PR-056: Integer64Property.fromString parameter: in_string must be a string. This is not valid: '
   * @description methods: IntegerProperty.fromString
   * Integer64Property.fromString takes two parameters. The first parameter (in_string) must be a string.
   * (the second parameter is in_radix, a number. It is optional: defaults to 10).
   */
  IN_STRING_MUST_BE_STRING:               'PR-056: Integer64Property.fromString parameter: in_string must ' +
                                          'be a string. This is not valid: ',

  /**
   * @alias PR-057
   * @memberof PropertyError
   * @summary 'PR-057: Integer64Property.fromString parameter: in_radix must be a number between 2 and 36. This is not valid: '
   * @description methods: Integer64Property.fromString
   * Integer64Property.fromString takes two parameters. The second parameter is optional but if passed,
   * it must be a number between 2 and 36. If not passed, it defaults to 10. (the first parameter is
   * in_string and must be a string).
   */
  IN_RADIX_BETWEEN_2_36:                  'PR-057: Integer64Property.fromString parameter: in_radix must be a ' +
                                          'number between 2 and 36. This is not valid: ',

  /**
   * @alias PR-058
   * @memberof PropertyError
   * @summary PR-058: MapProperty.insert / ReferenceMapProperty.set parameter: in_key must be a string. This is not valid: '
   * @description @methods MapProperty.insert, ReferenceMapProperty.set
   * MapProperty.insert and ReferenceMapProperty.set both take two parameters.
   * The first parameter (in_key) must be a string.
   */
  KEY_NOT_STRING:                         'PR-058: MapProperty.insert / ReferenceMapProperty.set parameter: ' +
                                          'in_key must be a string. This is not valid: ',

  /**
   * @alias PR-059
   * @memberof PropertyError
   * @summary 'PR-059: NodeProperty.insert parameter in_property is not a property. The property you passed is not a valid property.'
   * @description methods: NodeProperty.insert, Workspace.insert
   * he second parameter (in_property) must be a valid property (it must be an instance of BaseProperty).
   */
  NOT_A_PROPERTY:                         'PR-059: NodeProperty.insert parameter in_property is not a property. ' +
                                          'The property you passed is not a valid property.',

  /**
   * @alias PR-060
   * @memberof PropertyError
   * @summary 'PR-060: Parameter for setting a Reference should be a path to a property, a property or undefined. This is not valid: (<type>) <value>'
   * @description methods: ReferenceProperty.set / setValue, ReferenceMapProperty.insert / set / setValue / setValues,
   * ReferenceArrayProperty.enqueue / push / unshift / insert / insertRange / set / setRange / setValue / setValues
   * The provided value (or values) must be a valid property (an instance of BaseProperty), be undefined or a string (a path).
   */
  PROPERTY_OR_UNDEFINED:
    'PR-060: Parameter for setting a Reference should be a path to a property, a property or undefined. This is not valid: ',

  // PR-061 and PR-062 removed
  // PR-063, 064 and 065 empty
  // PR-066 to PR-071 removed
  // PR-072 to PR-077 not merged in yet??
  // PR-078 to PR-087 removed

  /**
   * @alias PR-088
   * @memberof PropertyError
   * @summary 'PR-088: Internal error: Trying to insert a property into an array or string that already has a parent.'
   * @description ArrayProperty.insertRange, ArrayProperty.insert, ArrayProperty.push
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   * The item (or one of the items) you are trying to insert in this array has a parent that is not the array.
   */
  NO_INSERT_WITH_PARENT:                  'PR-088: Internal error: Trying to insert a property into an array or ' +
                                          'string that already has a parent.',

  // PR-089 and PR-090 removed
  // PR-091 empty

  /**
   * @alias PR-092
   * @memberof PropertyError
   * @summary 'PR-092: The first item in the in_position array must be an array position (a number). This is not valid: '
   * @description methods: ArrayProperty.get
   * ArrayProperty.get takes in one parameter: in_position, which can a single position or an array.
   * If it is a single position, it is the numerical position of the item in the array.
   * It must be a number or a string that parses into a number (e.g. '2').
   * If you pass in an array, the first item of the array must be a number or a string that parses into a number.
   * (other items in the array are child paths within the array item at this position).
   * This error happens only when in_position is an array.
   */
  FIRST_ITEM_MUST_BE_NUMBER:              'PR-092: The first item in the in_position array must be an array ' +
                                          'position (a number). This is not valid: ',

  /**
   * @alias PR-093
   * @memberof PropertyError
   * @summary 'PR-093: in_position must be a number. This is not valid: '
   * @description methods: ArrayProperty.get
   * ArrayProperty.get takes in one parameter: in_position, which can a single position or an array.
   * If it is a single position, it is the numerical position of the item in the array.
   * It must be a number or a string that parses into a number (e.g. '2').
   * If you pass in an array, the first item of the array must be a number or a string that parses into a number
   * (other items in the array are child paths within the array item at this position).
   * This error happens only when in_position is a single position.
   */
  IN_POSITION_MUST_BE_NUMBER:             'PR-093: in_position must be a number. This is not valid: ',

  // PR-094 removed

  /**
   * @alias PR-095
   * @memberof PropertyError
   * @summary 'PR-095: Property.getValue parameter: in_id cannot be an empty array.'
   * @description methods: Property.getValue
   * Property.getValue takes one parameter: in_id.
   * It can either be a string or an array of strings. It cannot be an empty array.
   */
  CANNOT_BE_EMPTY_ARRAY:                  'PR-095: Property.getValue parameter: in_id cannot be an empty array.',

  /**
   * @alias PR-096
   * @memberof PropertyError
   * @summary 'PR-096: EnumArrayProperty.set parameter: in_value should be a number. To set the value of an enum string, use .setEnumByString instead.'
   * @description methods: EnumArrayProperty.set
   * EnumArrayProperty.set takes two parameters: in_index and in_value.
   * In_value should be a number. setValue cannot be used to set enum by string.
   * Use .setEnumByString instead.
   */
  VALUE_SHOULD_BE_NUMBER:                 'PR-096: EnumArrayProperty.set parameter: in_value should be ' +
                                          'a number. To set the value of an enum string, use .setEnumByString ' +
                                          'instead.',
  // PR-097 empty

  /**
   * @alias PR-098
   * @memberof PropertyError
   * @summary 'PR-098: EnumArrayProperty.setEnumByString parameter: in_value should be a string. To set a number, use .set instead.'
   * @description methods: EnumArrayProperty.setEnumByString
   * EnumArrayProperty.setEnumByString cannot be use to set enum by number. Use .set instead.
   */
  VALUE_SHOULD_BE_STRING:                 'PR-098: EnumArrayProperty.setEnumByString parameter: in_value should be ' +
                                          'a string. To set a number, use .set instead.',

  // PR-099 ?
  // PR-100 to PR-103 removed
  // PR-104 empty
  // PR-105 removed

  /**
   * @alias PR-106
   * @memberof PropertyError
   * @summary 'PR-106: Trying to access out of bounds at index: '
   * @description methods: ArrayProperty.get
   * In_position or in_offset is either lower than 0 or higher than the length of the array.
   * Make sure that the property you are trying to get from the array exists and that the position is correct.
   */
  GET_OUT_OF_RANGE:                       'PR-106: Trying to access out of bounds at index: ',

  /**
   * @alias PR-107
   * @memberof PropertyError
   * @summary 'PR-107: Trying to set out of bounds.'
   * @description methods: ArrayProperty.setRange, ArrayProperty.set
   * setRange: Either in_offset is lower than zero or in_offset + length of in_array is higher than
   * the length of the array. If you need to add items that were not there before, add those using
   * .push, .insert or .insertRange.
   */
  SET_OUT_OF_BOUNDS:                      'PR-107: Trying to set out of bounds. ',

  // PR-108 removed
  // PR-109 ?

  /**
   * @alias PR-110
   * @memberof PropertyError
   * @summary 'PR-110: Trying to remove out of bounds.'
   * @description methods: ArrayProperty.removeRange, ArrayProperty.remove
   * RemoveRange: Either in_offset is smaller than zero or in_offset + in_deleteCount is higher than
   * the length of the array. Make sure that the properties you are trying to remove exist in that
   * array and that you entered the positions correctly.
   * Remove: in_offset is either smaller than zero or larger than the length of the array.
   */
  REMOVE_OUT_OF_BOUNDS:                   'PR-110: Trying to remove out of bounds. ',

  /**
   * @alias PR-111
   * @memberof PropertyError
   * @summary 'PR-111: Internal error: PropertyFactory.create failed to create this property.'
   * @description methods: PropertyFactory.create
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   * (warning) Something went wrong when creating your property: it did not successfully create
   * the property and then tried to set its value.
   */
  NON_EXISTING_PROPERTY_REPOSITORY_REFERENCE: 'PR-111: Internal error: PropertyFactory.create failed to create ' +
                                          'this property.',

  // PR-112 to PR-114 removed

  /**
   * @alias PR-115
   * @memberof PropertyError
   * @summary 'PR-115: trying to set value to a path leading to a property: '
   * @description methods: Property.setValues
   * One of the path you used in .setValues leads to a property.
   * When passing an object to setValues, make sure that all paths lead to a primitive value.
   */
  SET_VALUES_PATH_PROPERTY:               'PR-115: trying to set value to a path leading to a property: ',

  /**
   * @alias PR-116
   * @memberof PropertyError
   * @summary 'PR-116: trying to set value to an invalid path: '
   * @description methods: Property.setValues
   * One of the path in the object you passed to .setValues does not match the structure of this property.
   */
  SET_VALUES_PATH_INVALID:                'PR-116: trying to set value to an invalid path: ',

  /**
   * @alias PR-117
   * @memberof PropertyError
   * @summary 'PR-117: setValues parameter: in_properties must be an object.'
   * @description methods: Property.setValues
   * .setValues takes one parameter: an object containing paths to the values to be changed.
   * It should be an object (or in the case of ArrayProperty, an array)
   */
  SET_VALUES_PARAM_NOT_OBJECT:            'PR-117: setValues parameter: in_properties must be an object.',

  /**
   * @alias PR-118
   * @memberof PropertyError
   * @summary 'PR-118: Unknown typeid in array: '
   * @description methods: PropertyFactory.create
   * The array you tried to create had a typeid that was no recognized.
   * It was not a custom type array or one of the following: ‘String’, ‘Int64’, ‘Uint64’ or ‘Bool’.
   */
  UNKNOWN_ARRAY_TYPEID:                   'PR-118: Unknown typeid in array: ',

  /**
   * @alias PR-119
   * @memberof PropertyError
   * @summary 'PR-119: id should be a string or a number. This is not valid: '
   * @description methods: MapProperty.insert, MapProperty.set
   * .insert and .set take two parameters. The first one is in_id (or in_key), which is the id under
   * which the property is added. It can only be a string or a number. Only in the case of named
   * property can it be omitted.
   */
  ID_STRING_OR_NUMBER:                    'PR-119: id should be a string or a number. This is not valid: ',

  // PR-120 removed

  /**
   * @alias PR-121
   * @memberof PropertyError
   * @summary 'PR-121: ValueProperty.deserialize() called on an empty changeset'
   * @description methods: ValueProperty.deserialize
   * .deseralize takes on parameter: a serialized object. It cannot be undefined.
   */
  DESERIALIZE_EMPTY_CHANGESET:            'PR-121: ValueProperty.deserialize() called on an empty changeset',

  /**
   * @alias PR-122
   * @memberof PropertyError
   * @summary 'PR-122: Tried to use (u)Int64MapProperty or (u)Int64ArrayProperty with an invalid type.'
   * @description methods: IntMapProperty.insert, UintMapProperty.insert
   * You tried to insert into a (u)Int64MapProperty or (u)Int64ArrayProperty properties that
   * were not Int64 or Utin64 properties or properties that can be casted to the correct type.
   */
  INT_64_NON_INT64_TYPE:              'PR-122: Tried to use (u)Int64MapProperty or (u)Int64ArrayProperty with an invalid type.',

  /**
   * @alias PR-123
   * @memberof PropertyError
   * @summary 'PR-123: Base is out of range. Base should be in range [2,36]. This is not valid: '
   * @description methods: Integer64.toString, Integer64.fromString
   */
  BASE_OUT_OF_RANGE:                      'PR-123: Base is out of range. Base should be in range [2,36]. This is not valid: ',

  /**
   * @alias PR-124
   * @memberof PropertyError
   * @summary 'PR-124: Cannot update value to negative: '
   * @description methods: Integer64.fromString
   * If your property is an instance of Uint64, you cannot set it to a negative number.
   * Uint64 does not support negative numbers. Use Int64 if you need to support negative numbers.
   */
  CANNOT_UPDATE_TO_NEGATIVE:              'PR-124: Cannot update value to negative: ',

  /**
   * @alias PR-125
   * @memberof PropertyError
   * @summary 'PR-125: Cannot parse. String contains invalid characters: '
   * @description methods: Integer64.fromString
   * The string you passed as a first parameter to .fromString contains non-numerical characters.
   */
  CANNOT_PARSE_INVALID_CHARACTERS:        'PR-125: Cannot parse. String contains invalid characters: ',

  /**
   * @alias PR-126
   * @memberof PropertyError
   * @summary  'PR-126: Internal error: Object expected as parameters to BaseProperty constructor'
   * @description methods: Property constructor
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   * Something went wrong while the property constructor was creating a property.
   * The parameters it received were not objects.
   */
  PROP_CONSTRUCTOR_EXPECTS_OBJECTS:       'PR-126: Internal error: Object expected as parameters to ' +
                                          'BaseProperty constructor',

  // PR-127 to PR-130 have been removed

  /**
   * @alias PR-131
   * @memberof PropertyError
   * @summary 'PR-131: modified property - index invalid: '
   * @description methods: Property.applyChangeSet
   * One of the ‘modify’ field in your changeset points to an index in the array that does not exist.
   * Check that the changeset you passed to applyChangeSet is valid. If you did not enter the changeSet yourself,
   * this is an internal error and you should contact the development team.
   */
  INDEX_INVALID:                          'PR-131: modified property - index invalid: ',

  /**
   * @alias PR-132
   * @memberof PropertyError
   * @summary 'PR-132: isAncestorOf parameter: in_otherProperty must be specified.'
   * @description methods: Property.isAncestorOf, Property.isDescendantOf
   * Property.isAncestorOf and .isDescendantOf take one parameter: a property. It cannot be undefined.
   */
  MISSING_IN_OTHERPROP:                   'PR-132: isAncestorOf parameter: in_otherProperty must be specified.',

  /**
   * @alias PR-133
   * @memberof PropertyError
   * @summary 'PR-133: parameter error: in_value must be a string. This is not valid: '
   * @description methods: StringProperty.insert, StringProperty.push
   * StringProperty.insert takes two parameters: in_position and in_value.
   * The second one (in_value) must be a string.
   * StringProperty.push takes only one parameter (in_value), which must be a string.
   */
  IN_VALUE_MUST_BE_STRING:                'PR-133: parameter error: in_value must be a string. This is not valid: ',

  /**
   * @alias PR-134
   * @memberof PropertyError
   * @summary 'PR-134: Cannot use .getValues on value properties or strings. Use .getValue instead.'
   * @description methods: ValueProperty.getValues
   * You cannot use the method .getValues on value properties. getValues is used to get multiple nested
   * values from a custom property. To get the value of a primitive property, use .getValue instead.
   */
  NO_VALUE_PROPERTY_GETVALUES:            'PR-134: Cannot use .getValues on value properties or strings. ' +
                                          'Use .getValue instead.',

  // PR-135 to PR-138 removed
  // PR-139 ?

  /**
   * @alias PR-140
   * @memberof PropertyError
   * @summary 'PR-140: Modifications of constants are not allowed.'
   * @description methods: Property.setValues, ArrayProperty.insertRange, ArrayProperty.removeRange,
   * ArrayProperty.setRange, EnumArrayProperty.setEnumByString, ArrayProperty.insert, ArrayProperty.set,
   * ArrayProperty.clear
   * If a property is created as a constant, it cannot be changed.
   */
  MODIFICATION_OF_CONSTANT_PROPERTY:      'PR-140: Modifications of constants are not allowed.',

  /**
   * @alias PR-141
   * @memberof PropertyError
   * @summary 'PR-141: In an array of properties, you can only insert instances of properties. This value is not valid: '
   * @description methods: ArrayProperty.insert, ArrayProperty.insertRange
   * In a non-primitive array, you can only insert instances of properties. You should use PropertyFactory.create
   * to create an instance of your property before inserting it into the array.
   */
  INSERT_NOT_A_PROP:                      'PR-141: In an array of properties, you can only insert instances of ' +
                                          'properties. This value is not valid: ',
  // PR-142 to PR-159 removed

  /**
   * @alias PR-160
   * @memberof PropertyError
   * @summary 'PR-160: in_ids does not resolve to a ValueProperty: '
   * @description methods: Property.getValue
   * Property.getValue(in_ids) is a shortcut for Property.get(in_ids).getValue().
   * Property.get(in_ids) must resolve to a ValueProperty.
   */
  GET_VALUE_NOT_A_VALUE:                  'PR-160: in_ids does not resolve to a ValueProperty: ',

  /**
   * @alias PR-161
   * @memberof PropertyError
   * @summary 'PR-161: In a map of properties, you can only insert properties.'
   * @description methods: MapProperty.insert
   * If your map is not a ValueMap, in_property must be an instance of BaseProperty.
   * Use PropertyFactory.create to create an instance of a property.
   */
  NONVALUE_MAP_INSERT_PROP:               'PR-161: In a map of properties, you can only insert properties.',

  // PR-162 has been removed

  /**
   * @alias PR-163
   * @memberof PropertyError
   * @summary 'PR-163: Property context is different than expected: '
   * @description methods: PropertyFactory.create
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   * This error is thrown while creating a Property, when the actual context
   * ('array', 'map', 'set' or 'single') is different than what was expected.
   */
  CONTEXT_NOT_AS_EXPECTED:                'PR-163: Property context is different than expected: ',
                                                                                          // <actual> != <expected>

  /**
   * @alias PR-164
   * @memberof PropertyError
   * @summary 'PR-164: Cannot deserialize invalid change set for Int64 property'
   * @description methods: Property.deserialize
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   * This error is thrown by .deserialize but is caused by an invalid changeSet. A serialized ChangeSet for an
   * Integer64Property must be an array of 2 integers: the low and the high values. Since users cannot yet supply
   * their changesets directly, this should not happen.
   */
  INVALID_INT64_CHANGESET:                'PR-164: Cannot deserialize invalid change set for Int64 property',

  /**
   * @alias PR-165
   * @memberof PropertyError
   * @summary 'PR-165: String.set first parameter should be an index (number). This is not valid: '
   * @description methods: StringProperty.set
   * StringProperty.set takes two parameters: in_index (a number, the index of the string that you wish to change)
   * and in_string (the string you want to insert at that index). To set the value of the whole string, use
   * setValue.
   */
  STRING_SET_NEEDS_INDEX:                 'PR-165: String.set first parameter should be an index (number). This is not valid: ',

  /**
   * @alias PR-166
   * @memberof PropertyError
   * @summary 'PR-166: Cannot use a dereference token only with .get'
   * @description methods: Property.get
   * The token DEREFERENCE_TOKEN should only be used with .get when the in_ids passed to .get is an array.
   * the DEREFERENCE_TOKEN should follow a path to a reference.
   * @example <caption>valid: </caption>
   * myProp.get(['myReference', TOKENS.DEREFERENCE_TOKEN])
   * @example <caption>not valid: </caption>
   * myProp.get('myReference').get(TOKENS.DEREFERENCE_TOKEN)
   */
  NO_GET_DEREFERENCE_ONLY:                'PR-166: Cannot use a dereference token only with .get',


  /**
   * @alias PR-167
   * @memberof PropertyError
   * @summary 'PR-167: setValues is not a valid method for String Properties'
   * @description methods: StringProperty.setValues
   * You cannot call .setValues on a StringProperty. To set the value of the string, use .setValue
   * instead.
   */
  NO_VALUE_PROPERTY_SETVALUES:            'PR-167: setValues is not a valid method for String Properties',

  /**
   * @alias PR-169
   * @memberof PropertyError
   * @summary 'PR-169: More than one paths exist between '
   * @description methods: Property.getRelativePath
   * In cases where you have more than one repository reference property pointing to the same repository, finding a path
   * between a properties in different repositories can lead to more than one valid results. In that case, .getRelativePath
   * will return the first valid path it finds. If you want to control how which path is used, you should construct the
   * string path by concatenating the absolute path for the prop in the nested repository and the relative path between your
   * repository reference and the target property.
   */
  MORE_THAN_ONE_PATH:   'PR-169: More than one paths exist between ',

  /**
   * @alias PR-170
   * @memberof PropertyError
   * @summary 'PR-170: getRelativePath parameter error: in_fromProperty must be a property'
   * @description methods: Property.getRelativePath
   * getRelativePath takes one parameter: the property from which the path will start. This must be an instance of
   * BaseProperty. The method will return the path from that property to the property on which it was called ('this')
   */
  IN_FROMPROPERTY_MUST_BE_PROPERTY: 'PR-170: getRelativePath parameter error: in_fromProperty must be a property',

  /**
   * @alias PR-171
   * @memberof PropertyError
   * @summary 'PR-171: cannot get a path from a child repository to a parent repository'
   * @description methods: Property.getRelativePath
   * getRelativePath does not return a path between a property that is inside a child repository to one that is in
   * a parent repository. A path like this could not be used with .resolvePath or be used in a reference property
   * because neither method can go from the root of a referenced repository to a reference property.
   */
  NO_PATH_FROM_CHILD_REPO: 'PR-171: cannot get a path from a child repository to a parent repository',

  /**
   * @alias PR-173
   * @memberof PropertyError
   * @summary 'PR-173: This repository reference is in read-only mode. Call enableWrite() to access the workspace.
   * @description methods: getReferencedWorkspace
   * This repository reference is in read-only mode. Call enableWrite() to access the workspace.
   */
  REPOSITORY_REFERENCE_WORKSPACE_READ_ONLY:
    'PR-173: This repository reference is in read-only mode. Call enableWrite() to access the workspace.',

  /**
   * @alias PR-174
   * @memberof PropertyError
   * @summary 'PR-174: Repository reference is already in writable mode.'
   * @description methods: Property.enableWrite
   * Repository reference is already in writable mode.
   */
  REPOSITORY_REFERENCE_WORKSPACE_EXIST_ALREADY: 'PR-174: Repository reference is already in writable mode',

  /**
   * @alias PR-175
   * @memberof PropertyError
   * @summary 'PR-175: Writable repository reference need an HFDM object.'
   * @description methods: Property.enableWrite, Property.setSynchronizeMode
   * Writable repository reference need an HFDM object.
   */
  WRITABLE_REPOSITORY_REFERENCE_NEED_WORKSPACE:
    'PR-175: To use this method the repository reference need to be attached to an hfdm object. Method: ',

  /**
   * @alias PR-176
   * @memberof PropertyError
   * @summary 'PR-176: Can't enable write on an empty repository reference without at least a repositoryGUID and branchGUID.'
   * @description methods: Property.enableWrite
   * Can't enable write on an empty repository reference without at least a repositoryGUID and branchGUID.
   */
  WRITABLE_REPOSITORY_REFERENCE_NEED_GUIDS:
    'PR-176: Can\'t enable write on an empty repository reference without at least a repositoryGUID and branchGUID',

  /**
   * @alias PR-177
   * @memberof PropertyError
   * @summary 'PR-177: Repository reference failed to automatically commit the new commitGUID.
   * @description methods: Property.enableWrite
   * Repository reference failed to automatically commit the new commitGUID.
   */
  WRITABLE_REPOSITORY_AUTO_COMMIT_FAIL: 'PR-177: Repository reference failed to automatically commit the new commitGUID',

  /**
   * @alias PR-178
   * @memberof PropertyError
   * @summary 'PR-178: An unexpected error occurred while trying to switch a repository reference followBranch property'
   * @description methods: Property._setFollowBranch
   * An unexpected error occurred while trying to switch a repository reference followBranch property
   */
  WRITABLE_REPOSITORY_SET_FOLLOW_BRANCH_FAILED:
    'PR-178: An unexpected error occurred while trying to switch a repository reference followBranch property to ',


  /**
   * @alias PR-179
   * @memberof PropertyError
   * @summary 'PR-179: id should not be an empty string.'
   * @description methods: MapProperty.insert, MapProperty.set
   * .insert and .set take two parameters. The first one is in_id (or in_key), which is the id under
   * which the property is added. It can not be an empty string.
   */
  ID_SHOULD_NOT_BE_EMPTY_STRING:
    'PR-179: id should not be an empty string.',


  /**
   * @alias PR-180
   * @memberof PropertyError
   * @summary 'PR-180: String.set, only one character can be set.'
   * @description methods: StringProperty.set
   * StringProperty.set: in_character must have a length of 1.
   */
  STRING_SET_ONE_CHAR: 'PR-180: String.set, only one character can be set (in_character must have a length of 1).',

  /**
   * @alias PR-181
   * @memberof PropertyError
   * @summary 'PR-181: in_value should be a string or a number. This is not valid: '
   * @description methods: EnumArrayProperty.set
   * EnumArrayProperty.set only accepts a string or number as input for in_value
   */
  VALUE_STRING_OR_NUMBER:
    'PR-181: in_value should be a string or a number. This is not valid: ',

  /**
   * @alias PR-182
   * @memberof PropertyError
   * @summary 'PR-182: Array.set, only one element can be set. '
   * @description methods: ArrayProperty.set
   * The in_value input of ArrayProperty.set should not be an array.
   */
  ARRAY_SET_ONE_ELEMENT:
    'PR-182: in_value should be a single element. This is not valid: ',

  /**
   * @alias PR-183
   * @memberof PropertyError
   * @summary 'PR-183: Can't dirty missing property'
   * Can't apply dirty flags to a missing property
   */
  CANT_DIRTY_MISSING_PROPERTY:
    'PR-183: Can\'t dirty missing property: ',

  /**
   * @alias PR-184
   * @memberof PropertyError
   * @summary "PR-184: Trying to insert a root property into a collection."
   * @description methods: MapProperty.insert, MapProperty.set, SetProperty.insert, NodeProperty.insert
   * The property you are trying to insert in your map property, set property or node property is a root.
   */
  INSERTED_ROOT_ENTRY:
    'PR-184: Trying to insert a root property into a collection.',

  /**
   * @alias PR-185
   * @memberof PropertyError
   * @summary "PR-185: Trying to insert a property in itself or in one of its children."
   * @description methods: MapProperty.insert, MapProperty.set, SetProperty.insert, NodeProperty.insert
   * The property you are trying to insert in your map property, set property or node property is already
   * a parent of the map, set, or node property. You cannot insert this property there or you would create
   * a cycle in your data tree.
   */
  INSERTED_IN_OWN_CHILDREN:
    'PR-185: Trying to insert a property in itself or in one of its children.',

  /**
   * @alias PR-186
   * @memberof PropertyError
   * @summary "PR-186: Trying to insert a property outside the paths covered by the partial checkout."
   * @description methods: MapProperty.insert, MapProperty.set, SetProperty.insert, NodeProperty.insert
   * The property you are trying to insert (or at least one if its children) in your map property, set
   * property or node property is not covered by the paths of the partial checkout.
   * You cannot insert this property because you would not receive updates for this path after the
   * insertion and you could corrupt your data by doing subsequent modifications.
   */
  INSERTED_OUTSIDE_PATHS:
    'PR-186: Trying to insert a property outside the paths covered by the partial checkout.',

  /**
   * @alias PR-187
   * @memberof PropertyError
   * @summary 'PR-187: Property must be inserted in the workspace before sharing.'
   */
  SHARED_BEFORE_INSERTED:
    'PR-187: Property must be inserted in the workspace before sharing.',

  /**
   * @alias PR-188
   * @memberof PropertyError
   * @summary 'PR-188: The following property does not support custom id: '
   */
  CUSTOM_ID_NOT_ALLOWED:
    'PR-188: The following property does not support custom id: ',


  // PROPERTY FACTORY ERRORS

  /**
   * @alias PF-001
   * @memberof PropertyFactoryError
   * @summary 'PF-001: Id already exists: '
   * @description methods: PropertyFactory.create
   * Each property created with PropertyFactory.create should have a unique id. You should make sure your
   * code generates a unique id for each property created, or make your property an instanced of NamedProperties
   * (which are identified by a unique Urn)
   */
  OVERWRITING_ID:                         'PF-001: Id already exists: ',

  // PF-002 DOES NOT EXIST
  // PF-003 Moved to HFDM Schema Validator (is now SV-001).

  /**
   * @alias PF-004
   * @memberof PropertyFactoryError
   * @summary 'PF-004: Template structures do not match for typeid: '
   * @description methods: PropertyFactory.register
   * (warning) The template passed into the register method does not match the expected structure for this type.
   */
  TEMPLATE_MISMATCH:                      'PF-004: Template structures do not match for typeid: ',

  /**
   * @alias PF-005
   * @memberof PropertyFactoryError
   * @summary 'PF-005: Templates must be versioned.'
   * @description methods: PropertyFactory.register
   * The typeid assigned to your property template should include a version.
   * E.g. 1.0.0 - an example of a valid typeid: “my.example:point2d-1.0.0”
   */
  UNVERSIONED_TEMPLATE:                   'PF-005: Templates must be versioned.',

  /**
   * @alias PF-006
   * @memberof PropertyFactoryError
   * @summary 'PF-006: Internal error: Remote template is not versioned.'
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   * Error occurs when a template has been inserted into the branch without a SEMVER version.
   * This can occur when registering templates through the commit REST interface. At this point
   * the data is corrupted and should be reported to the development team
   */
  UNVERSIONED_REMOTE_TEMPLATE:            'PF-006: Internal error: Remote template is not versioned.',

  /**
   * @alias PF-007
   * @memberof PropertyFactoryError
   * @summary 'PF-007: Repository references are not yet fully implemented and may not yet be used'
   * @description methods: PropertyFactory.create
   * RepositoryReferences are not yet fully implemented. They will be soon.
   */
  REPOSITORY_REF_NOT_FULLY_IMPLEMENTED:   'PF-007: Repository references are not yet fully implemented and may not ' +
                                          'yet be used',

  /**
   * @alias PF-008
   * @memberof PropertyFactoryError
   * @summary 'PF-008: Internal error: Inherits must be an Array or a String.'
   * @description methods: PropertyFactory.create
   * When using ‘inherits’ in your property template, it must be a string or an array.
   * @example {
   * typeid:'my.example:point2d-1.0.0',
   * inherits: ‘ another property’
   * }
   * or :
   * {
   *   typeid:'my.example:point2d-1.0.0',
   * inherits: [‘another property’, ‘property2’]
   * }
   */
  INHERITS_ARRAY_OR_STRING:               'PF-008: Internal error: Inherits must be an Array or a String. This is not valid: ',

  /**
   * @alias PF-009
   * @memberof PropertyFactoryError
   * @summary 'PF-009: Unknown context specified: '
   * @description methods: PropertyFactory.create
   * Context can be ‘array, ‘set’, ‘map’, ‘enum’ or ‘single’. If not specified, will default to ‘single’.
   */
  UNKNOWN_CONTEXT_SPECIFIED:              'PF-009: Unknown context specified: ',

  /**
   * @alias PF-010
   * @memberof PropertyFactoryError
   * @summary 'PF-010: Unknown typeid specified: '
   * @description methods: PropertyFactory.create
   * The property you entered into PropertyFactory.create has a typeid that is not registered.
   * Make sure you register the template before creating an instance of that property. This could
   * also be caused by a failure in the registration process.
   */
  UNKNOWN_TYPEID_SPECIFIED:               'PF-010: Unknown typeid specified: ',

  /**
   * @alias PF-011
   * @memberof PropertyFactoryError
   * @summary 'PF-011: Missing template for the property you entered or one of the templates it inherits from: '
   * @description methods: PropertyFactory.getAllParentsForTemplate, PropertyFactory.inheritsFrom
   * Cannot find a template for this typeid. Make sure you registered the template and that the typeid
   * is entered correctly. This can be an error with the template you are trying to insert or one of the
   * templates it inherits from.
   */
  NON_EXISTING_TYPEID:                    'PF-011: Missing template for the property you entered or one of the templates it inherits from: ',

  /**
   * @alias PF-012
   * @memberof PropertyFactoryError
   * @summary 'PF-012: Cannot register a primitive property with the public `register` function typeid = '
   * @description methods: PropertyFactory.register
   * The property you passed in to .register is a primitive property. These do not need to be registered with a
   * typeid. It can be created without being registered. E.g. PropertyFactory.create(‘String’)
   */
  CANNOT_REGISTER_PRIMITIVE:              'PF-012: Cannot register a primitive property with the public `register` ' +
                                          'function typeid = ',

  // PF-013 Moved to HFDM Schema Validator (is now SV-002).
  // PF-014 Moved to HFDM Schema Validator (is now SV-003).
  // PF-015 Moved to HFDM Schema Validator (is now SV-004).
  // PF-016 Moved to HFDM Schema Validator (is now SV-005).
  // PF-017 Moved to HFDM Schema Validator (is now SV-006).
  // PF-018 Moved to HFDM Schema Validator (is now SV-007).
  // PF-019 Moved to HFDM Schema Validator (is now SV-008).
  // PF-020 Moved to HFDM Schema Validator (is now SV-009).
  // PF-021 AND PF-022 empty
  // PF-023 Moved to HFDM Schema Validator (is now SV-010).

  /**
   * @alias PF-024
   * @memberof PropertyFactoryError
   * @summary 'PF-024: Value "id" of a definition should be a string. "'
   * @description methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
   * Your template’s id field must be a string.
   */
  DEFINITION_ID_MUST_BE_STRING:           'PF-024: Value "id" of a definition should be a string. "',

  /**
   * @alias PF-025
   * @memberof PropertyFactoryError
   * @summary 'PF-025: Value of "$ref" should be a string. "'
   * @description methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
   * The "$ref" keyword is used to reference a schema, and provides the ability to validate recursive structures
   * through self-reference.
   * An object schema with a "$ref" property MUST be interpreted as a "$ref" reference. The value of the "$ref"
   * property MUST be a URI Reference (a string)
   */
  REF_SHOULD_BE_STRING:                   'PF-025: Value of "$ref" should be a string. "',

  /**
   * @alias PF-026
   * @memberof PropertyFactoryError
   * @summary 'PF-026: Couldn't find reference "'
   * @description methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
   * The identifier passed to $ref does not point to any schema.
   */
  COULD_NOT_FIND_REFERENCE:               'PF-026: Couldn\'t find reference "',

  /**
   * @alias PF-027
   * @memberof PropertyFactoryError
   * @summary 'PF-027: A referenced definition should be an object. "'
   * @description methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
   * The identifier passed to $ref does not point to an object.
   */
  REFERENCED_DEFINITION_SHOULD_BE_OBJECT: 'PF-027: A referenced definition should be an object. "',

  /**
   * @alias PF-028
   * @memberof PropertyFactoryError
   * @summary 'PF-028: The "properties" value should be an object. "'
   * @description methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
   * In a JSON schema, the properties field must be an object.
   */
  PROPERTIES_SHOULD_BE_OBJECT:            'PF-028: The "properties" value should be an object. "',

  /**
   * @alias PF-029
   * @memberof PropertyFactoryError
   * @summary 'PF-029: The "oneOf" object is supported only for arrays of one object.'
   * @description methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
   * oneOf’s value MUST be a non-empty array. Each item of the array MUST be a valid JSON Schema.
   * An instance validates successfully against this keyword if it validates successfully against exactly one
   * schema defined by this keyword's value.
   */
  ONE_OF_ONLY_FOR_ARRAYS_OF_ONE_OBJECT:   'PF-029: The "oneOf" object is supported only for arrays of one object.',

  /**
   * @alias PF-030
   * @memberof PropertyFactoryError
   * @summary 'PF-030: The "oneOf" array should contain objects. "'
   * @description methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
   * oneOf’s value MUST be a non-empty array. Each item of the array MUST be a valid JSON Schema.
   */
  ONE_OF_SHOULD_CONTAIN_OBJECTS:          'PF-030: The "oneOf" array should contain objects. "',

  /**
   * @alias PF-031
   * @memberof PropertyFactoryError
   * @summary 'PF-031: The "allOf" object should be an array.'
   * @description methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
   * This keyword's value MUST be a non-empty array. Each item of the array MUST be a valid JSON Schema.
   */
  ALL_OF_SHOULD_BE_ARRAY:                 'PF-031: The "allOf" object should be an array.',

  /**
   * @alias PF-032
   * @memberof PropertyFactoryError
   * @summary 'PF-032: The "allOf" array should contain objects. Element '
   * @description methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
   * This keyword's value MUST be a non-empty array. Each item of the array MUST be a valid JSON Schema.
   */
  ALL_OF_SHOULD_CONTAIN_OBJECTS:          'PF-032: The "allOf" array should contain objects. Element ',

  /**
   * @alias PF-033
   * @memberof PropertyFactoryError
   * @summary 'PF-033: Infinite recursion detected in path: '
   * @description methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
   * Your schema definition contains infinite recursion. For example, if your definition ‘a’ refers to definition
   * ‘b’ as being one of its children and ‘b’ refers to ‘a’ as one of its children.
   */
  INFINITE_RECURSION:                     'PF-033: Infinite recursion detected in path: ',

  /**
   * @alias PF-034
   * @memberof PropertyFactoryError
   * @summary 'PF-034: Unsupported value of field "type": '
   * @description methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
   * One part of your template object might contain something that is not of type ‘object’, ‘string’,
   * ‘number’ or ‘integer’.
   */
  UNSUPPORTED_VALUE_TYPE:                 'PF-034: Unsupported value of field "type": ',

  /**
   * @alias PF-035
   * @memberof PropertyFactoryError
   * @summary 'PF-035: Required property name should be a string, "'
   * @description ‘Required’ field should be an array of strings.
   */
  REQUIRED_PROPERTY_NAME_NOT_STRING:      'PF-035: Required property name should be a string, "',

  /**
   * @alias PR-036
   * @memberof PropertyFactoryError
   * @summary 'PF-036: Required property name does not match any property in object: '
   * @description This property is required but it is not listed in the properties field.
   */
  PROPERTY_NAME_DOES_NOT_MATCH:           'PF-036: Required property name does not match any property in object: ',

  /**
   * @alias PR-037
   * @memberof PropertyFactoryError
   * @summary 'PF-037: The "inherits" object should be a string or an array of strings. This is not valid: '
   * @description The ‘inherits’ field in your template object should be a string or an array of strings.
   */
  INHERITS_SHOULD_BE_STRING:              'PF-037: The "inherits" object should be a string or an array of strings. This is not valid: ',

  /**
   * @alias PR-038
   * @memberof PropertyFactoryError
   * @summary 'PF-038: The "context" value should be a string. This is not valid: '
   * @description The ‘context’ field in your template should be a string.
   */
  CONTEXT_SHOULD_BE_STRING:               'PF-038: The "context" value should be a string. This is not valid: ',

  /**
   * @alias PR-039
   * @memberof PropertyFactoryError
   * @summary 'PF-039: ignoring "length" value since "context" is not "array".'
   * @description methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
   * (warning) If you have a ‘length’ field in your template and the context is not set to ‘array’,
   * ‘length’ will be ignored.
   */
  IGNORING_LENGTH_NOT_ARRAY:              'PF-039: ignoring "length" value since "context" is not "array".',

  /**
   * @alias PR-040
   * @memberof PropertyFactoryError
   * @summary 'PF-040: The "length" value should be a number. This is not valid: '
   * @description methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
   * In your template, the field ‘length’ should be a number.
   */
  LENGTH_SHOULD_BE_NUMBER:                'PF-040: The "length" value should be a number. This is not valid: ',

  /**
   * @alias PR-041
   * @memberof PropertyFactoryError
   * @summary 'PF-041: Duplicate definition for '
   * @description methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
   * Your template contains more than one definition field for this field.
   */
  DUPLICATE_DEFINITION:                   'PF-041: Duplicate definition for ',

  /**
   * @alias PR-042
   * @memberof PropertyFactoryError
   * @summary 'PF-042: Field "id" is required.'
   * @description methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
   * The field ‘id’ is missing from your JSON schema.
   */
  FIELD_ID_IS_REQUIRED:                   'PF-042: Field "id" is required.',

  /**
   * @alias PR-043
   * @memberof PropertyFactoryError
   * @summary 'PF-043: Field "typeid" is required. It is the "typeid" of the resulting PropertySets Template.'
   * @description methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
   * You need a ‘typeid’ field in your template schema.
   * @example {
   *   ‘typeid’: 'autodesk.test:set.set-1.0.0',
   *   ‘properties’: [
   *     {‘typeid’: 'String',
   *      ‘context’: 'set',
   *      ‘id’: 'DummySet',
   *      ‘inherits’:['NamedProperty']}
   *   ]
   * }
   */
  FIELD_TYPEID_IS_REQUIRED:               'PF-043: Field "typeid" is required. It is the "typeid" of the resulting ' +
                                          'PropertySets Template.',

  // PF-044 has been removed

  /**
   * @alias PF-045
   * @memberof PropertyFactoryError
   * @summary 'PF-045: length must be a number. This is not valid: '
   * @description methods: PropertyFactory.register
   * The ‘length’ field in your template must be a number.
   */
  LENGTH_MUST_BE_NUMBER:                  'PF-045: length must be a number. This is not valid: ',

  /**
   * @alias PF-046
   * @memberof PropertyFactoryError
   * @summary 'PF-046: Enum: typeid missing'
   * @description methods: PropertyFactory.register
   * Each entry in your enum property array must have an id.
   * @example {
   *   "typeid": "Adsk.Core:Units.Metric-1.0.0",
   *   "inherits": "Enum",
   *   "annotation": { "description": "The metric units" },
   *   "properties": [
   *     { "id": "m" , "value": 1, "annotation": { "description": "meter" }},
   *     { "id": "cm", "value": 2, "annotation": { "description": "centimeter" }},
   *     { "id": "mm", "value": 3, "annotation": { "description": "millimeter" }}
   *   ]
   * }
   */
  ENUM_TYPEID_MISSING:                    'PF-046: Enum: typeid missing',

  /**
   * @alias PF-047
   * @memberof PropertyFactoryError
   * @summary 'PF-047: Enum: value must be a number. This is not valid: '
   * @description methods: PropertyTemplate constructor
   * Each entry in your enum property must have a value that is a number.
   * @example {
   *   "typeid": "Adsk.Core:Units.Metric-1.0.0",
   *   "inherits": "Enum",
   *   "annotation": { "description": "The metric units" },
   *   "properties": [
   *     { "id": "m" , "value": 1, "annotation": { "description": "meter" }},
   *     { "id": "cm", "value": 2, "annotation": { "description": "centimeter" }},
   *     { "id": "mm", "value": 3, "annotation": { "description": "millimeter" }}
   *   ]
   * }
   */
  ENUM_VALUE_NOT_NUMBER:                  'PF-047: Enum: value must be a number. This is not valid: ',

  /**
   * @alias PF-048
   * @memberof PropertyFactoryError
   * @summary 'PF-048: Internal error: Template is not versioned.'
   * @description methods: PropertyTemplate.getVersion
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   * (Warning) you that the template on which you are calling the .getVersion method is not versioned.
   * The method will return undefined. This should not happen as we now validate that all templates are
   * versioned when registering them.
   */
  TEMPLATE_NOT_VERSIONED:                 'PF-048: Internal error: Template is not versioned.',

  /**
   * @alias PF-049
   * @memberof PropertyFactoryError
   * @summary 'PF-049: Registering a typeid that already exists typeid = '
   * @description methods: PropertyFactory.register
   * (Warning) Template already exists. The incoming template MUST match what is currently registered.
   * If they do not match, an error will be thrown letting you know that the templates are incompatible.
   * See error PF-004
   */
  REGISTERING_EXISTING_TYPEID:            'PF-049: Registering a typeid that already exists typeid = ',

  /**
   * @alias PF-050
   * @memberof PropertyFactoryError
   * @summary 'PF-050: Failed to register typeid = '
   * @description methods: PropertyFactory.register
   * There were errors validating the template you are trying to register. See detailed errors attached.
   */
  FAILED_TO_REGISTER:                     'PF-050: Failed to register typeid = ',

  /**
   * @alias PF-051
   * @memberof PropertyFactoryError
   * @summary 'PF-051: Unknown type: '
   * @description methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
   * So far, these methods can only convert from a JSON schema. The first parameter (in_fromType)
   * must be ‘JSONSchema’.
   */
  UNKNOWN_TYPE:                           'PF-051: Unknown type: ',

  // PF-052 ?

  /**
   * @alias PF-053
   * @memberof PropertyFactoryError
   * @summary 'PF-053 Copying into incompatible target property template: '
   * @description methods: PropertyTemplate.serializeCanonical
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   * This error shouldn’t occur. The underlying private function that is called is a close cousin of the
   * deepCopy function which could have an arbitrary target specified. This doesn’t happen in the case of
   * the serializeCanonical.
   */
  INVALID_TARGET_PROPERTY_TEMPLATE:       'PF-053 Copying into incompatible target property template: ',

  /**
   * @alias PF-054
   * @memberof PropertyFactoryError
   * @summary 'PF-054 Missing case in template canonical serialization: '
   * @description methods: PropertyFactory.loadTemplate
   * In order for the PropertyFactory to retrieve templates from remote store it has to have at least one store
   * interface to interact with. This is accomplished by making the PropertyFactory.addStore call.
   */
  MISSING_CASE_IN_TEMPLATE_SERIALIZATION: 'PF-054 Missing case in template canonical serialization: ',

  // PF-055 to PF-056 ?

  /**
   * @alias PF-057
   * @memberof PropertyFactoryError
   * @summary 'PF-057: Overriding of inherited typed properties is not allowed: '
   */
  OVERRIDDING_INHERITED_TYPES:            'PF-057: Overriding of inherited typed properties is not allowed: ',

  /**
   * @alias PF-058
   * @memberof PropertyFactoryError
   * @summary 'PF-058: register only accepts strings, json structures or array of those'
   * @description methods: PropertyFactory.register
   * PropertyFactory.register takes one parameter, which can be a string (typeid), a json object (a template) or an
   * array of these.
   */
  ATTEMPT_TO_REGISTER_WITH_BAD_ARGUMENT:  'PF-058: register only accepts strings, json structures or array of those',

  /**
   * @alias PF-059
   * @memberof PropertyFactoryError
   * @summary 'PF-059: No store has been initialized yet to the PropertyFactory.'
   * @description methods: PropertyFactory.resolve
   * No store has been added yet to the PropertyFactory. A template store has to be instantiated then added with
   * propertyFactory.addStore()
   */
  NO_STORE_HAS_BEEN_INITIALIZED_YET:      'PF-059: No store has been initialized yet to the PropertyFactory.',

  /**
   * @alias PF-060
   * @memberof PropertyFactoryError
   * @summary 'PF-060: Dependencies resolution already in progress'
   * @description methods: PropertyFactory.resolve
   * resolve cannot be called until previous call to resolve has completed.
   */
  DEPENDENCIES_RESOLUTION_IN_PROGRESS:    'PF-060: Dependencies resolution already in progress',

  /**
   * @alias PF-061
   * @memberof PropertyFactoryError
   * @summary 'PF-061: Typed values must be derived from base type: '
   * @description methods: PropertyFactory.create
   * Typed values must contain properties that inherit from the base type.
   */
  TYPED_VALUES_MUST_DERIVE_FROM_BASE_TYPE:    'PF-061: Typed values must be derived from base type: ',

  /**
   * @alias PF-062
   * @memberof PropertyFactoryError
   * @summary 'PF-062: Field "value" is required.'
   * @description methods: PropertyFactory.create
   * The field ‘value’ is missing from your JSON schema.
   */
  FIELD_VALUE_IS_REQUIRED:                   'PF-062: Field "value" is required: ',

  // PF-063 Moved to HFDM Schema Validator (is now SV-011).

  /**
   * @alias PF-064
   * @memberof PropertyFactoryError
   * @summary 'PF-064: Template structures do not match an already registered remote template with the same typeid for typeid: '
   * @description methods: PropertyFactory.register
   * (warning) The structure of the template passed into the register method does not match the structure of a remote template registered under the same typeid.
   */
  REMOTE_TEMPLATE_MISMATCH:          'PF-064: Template structures do not match an already registered remote template with the same typeid for typeid: ',

  /**
   * @alias PF-065
   * @memberof PropertyFactoryError
   * @summary 'PF-065: The initializeSchemaStore method must be passed options.'
   * @description methods: PropertyFactory.initializeSchemaStore
   * (warning) The initializeSchemaStore method must be provided with an options object
              containing a getBearerToken function and the url to the ForgeSchemaService.
   */
  MISSING_FSS_INIT_OPTIONS:         'PF-065: The initializeSchemaStore method must be provided with an options object ' +
                                    'containing a getBearerToken function and the url to the ForgeSchemaService.',

  /**
   * @alias PF-066
   * @memberof PropertyFactoryError
   * @summary 'PF-066: The initializeSchemaStore method must be passed a valid url.'
   * @description methods: PropertyFactory.initializeSchemaStore
   * (warning) The initializeSchemaStore method url option must be passed a valid base url.
   */
  FSS_BASEURL_WRONG:         'PF-066: The initializeSchemaStore method url option must be passed a valid base url.',

  /**
   * @alias PF-067
   * @memberof PropertyFactoryError
   * @summary 'PF-067: Overridden properties must have same context as the base type: '
   * @description methods: PropertyFactory.create
   * Overridden properties must have same context as the base type.
   */
  OVERRIDEN_PROP_MUST_HAVE_SAME_CONTEXT_AS_BASE_TYPE:    'PF-067: Overridden properties must have same context as the base type: ',

  /**
   * @alias PF-068
   * @memberof PropertyFactoryError
   * @summary 'PF-068: Primitive types does not support typedValues: '
   * @description methods: PropertyFactory.create
   * Primitive types does not support typedValues.
   */
  TYPED_VALUES_FOR_PRIMITIVES_NOT_SUPPORTED:    'PF-068: Primitive types does not support typedValues: ',

  /**
   * @alias PF-069
   * @memberOf PropertyFactoryError
   * @summary 'PF-069: The provided type does not inherit from Enum: '
   * @description methods: PropertyFactory.inheritsFrom
   */
  TYPEID_IS_NOT_ENUM: 'PF-069: The provided type does not inherit from Enum: ',


  // REPOSITORY ERRORS

  /**
   * @alias RE-001
   * @memberof RepositoryError
   * @summary 'RE-001: Removing non existing id: '
   * @description methods: NodeProperty.remove
   * The property you tried to remove does not exist (its id was not found) - check that the id is correct
   * and that the property has not already been removed.
   */
  REMOVING_NON_EXISTING_ID:               'RE-001: Removing non existing id: ',

  /**
   * @alias RE-004
   * @memberof RepositoryError
   * @summary 'RE-004: BranchNode.isEqual / CommitNode.isEqual missing parameter: in_node'
   * @description methods: BranchNode.isEqual, CommitNode.isEqual
   * In_node parameter is required. In_node is the branch or commit you wish to compare to ‘this’ branch/commit
   * node to check for equality.
   */
  MISSING_IN_NODE_PARAM:                  'RE-004: BranchNode.isEqual / CommitNode.isEqual missing ' +
                                          'parameter: in_node',

  // ERROR RE-005 COMES FROM UTILS

  /**
   * @alias RE-006
   * @memberof RepositoryError
   * @summary 'RE-006: Missing guid field'
   * @description methods: BranchNode, CommitNode, Workspace.commit
   * The BranchNode or CommitNode constructor was called without in_params.guid or we tried to send a commit
   * without a guid.
   */
  MISSING_GUID_FIELD:                     'RE-006: Missing guid field',

  /**
   * @alias RE-007
   * @memberof RepositoryError
   * @summary 'RE-007: Remote branch urn must equal the local branch urn'
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   */
  LOCAL_AND_REMOTE_BRANCH_NOT_EQUAL:      'RE-007: Remote branch urn must equal the local branch urn',

  /**
   * @alias RE-008
   * @memberof RepositoryError
   * @summary RE-008: Branch is not a remote branch'
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   */
  BRANCH_NOT_REMOTE_BRANCH:               'RE-008: Branch is not a remote branch ',

  /**
   * @alias RE-009
   * @memberof RepositoryError
   * @summary 'RE-009: Should not rebase commit more than once: <commit guid> already rebased to <commit guid>,
   * now rebasing to <commit guid>'
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   * A commit node already rebased has been rebased again.
   */
  COMMIT_ALREADY_REBASED:                 'RE-009: Should not rebase commit more than once: ',

  /**
   * @alias RE-010
   * @memberof RepositoryError
   * @summary 'RE-010: Adding commit to remote branch <branch>. <message>',
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   * A new commit has been received from the server but was not expected. See specific message for more details.
   */
  UNEXPECTED_COMMIT_FROM_SERVER:          'RE-010: Adding commit to remote branch ',

  /**
   * @alias RE-011
   * @memberof RepositoryError
   * @summary 'RE-011: Internal Error: The repository hasn't been found.
   * @description: This error will occur if the repository associated to a branch hasn't been found.
   */
  REPOSITORY_NOT_FOUND:
    'RE-011: Internal Error: The repository hasn\'t been found.',

  /**
   * @alias RE-012
   * @memberof RepositoryError
   * @summary 'RE-012: The branch hasn't been found.
   * @description: This error will occur if the branch within a repository hasn't been found.
   */
  BRANCH_NOT_FOUND:
    'RE-012: The branch hasn\'t been found.',


  // SERVER ERRORS

  /**
   * @alias SE-001
   * @memberof ServerError
   * @summary 'SE-001: Url must be a string.'
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   */
  URL_MUST_BE_STRING:                     'SE-001: Url must be a string.',

  /**
   * @alias SE-002
   * @memberof ServerError
   * @summary 'SE-002: Port must be a number'
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   */
  PORT_MUST_BE_NUMBER:                    'SE-002: Port must be a number',

  // SE-003 has been removed

  // CHANGESET ERRORS

  /**
   * @alias CS-001
   * @memberof ChangeSetError
   * @summary 'CS-001: Unknown context: '
   * @description Context can only be ‘single’, ‘array’, ‘map’, ‘set’ or ‘enum’. All other values are invalid.
   */
  UNKNOWN_CONTEXT:                        'CS-001: Unknown context: ',

  // CS-002 removed

  /**
   * @alias CS-003
   * @memberof ChangeSetError
   * @summary 'CS-003: Internal error: Added an already existing entry: '
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   */
  ALREADY_EXISTING_ENTRY:                 'CS-003: Internal error: Added an already existing entry: ',

  /**
   * @alias CS-004
   * @memberof ChangeSetError
   * @summary 'CS-004: Internal error: Old value not found while inverting a change set. The change set is probably not reversible.'
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   * The ChangeSet did not include an oldValue member which is computed when making the ChangeSet reversible.
   */
  OLD_VALUE_NOT_FOUND:                    'CS-004: Internal error: Old value not found while inverting a change set. The change set is probably not reversible.',


  // HFDM ERRORS

  /**
   * @alias HF-001
   * @memberof HFDMError
   * @summary 'HF-001: Hfdm.connect parameter: in_options.serverUrl must be a string. This is not valid: '
   * @description methods: Hfdm.connect
   * Use Hfdm.connect({serverUrl:’...’}) (the value of serverUrl should be a string)
   * The complete set of parameters: Hfdm.connect({serverUrl:’<string>’, getBearerToken: <function>,
   * headers: <object, optional>})
   */
  SERVER_URL_NOT_STRING:                  'HF-001: Hfdm.connect parameter: in_options.serverUrl must be a string. This is not valid: ',

  /**
   * @alias HF-002
   * @memberof HFDMError
   * @summary HF-002: Hfdm.connect parameter: in_options.getBearerToken must be a function.'
   * @description methods: Hfdm.connect
   * The value of in_option.getBearerToken should be a function.
   * The complete set of parameters: Hfdm.connect({serverUrl:’<string>’, getBearerToken: <function>,
   * headers: <object, optional>})
   */
  GETBEARERTOKEN_NOT_FUNCTION:            'HF-002: Hfdm.connect parameter: in_options.getBearerToken must be ' +
                                          'a function.',

  /**
   * @alias HF-003
   * @memberof HFDMError
   * @summary 'HF-003: Hfdm.connect parameter: in_options.headers must be an object.'
   * @description methods: Hfdm.connect
   * If in_options.headers is passed in to hfdm.connect, it should be an object.
   * The complete set of parameters: Hfdm.connect({serverUrl:’<string>’, getBearerToken: <function>,
   * headers: <object, optional>})
   */
  HEADERS_NOT_OBJECT:                     'HF-003: Hfdm.connect parameter: in_options.headers must be an object.',

  /**
   * @alias HF-004
   * @memberof HFDMError
   * @summary 'HF-004: Internal error: Branch not joined'
   * @description methods: Hfdm.disconnect, Hfdm.destroyWorkspace, Workspace.destroy
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   * You cannot leave or destroy a branch that you did not join.Either you did not join the branch yet or you
   * already left that branch.
   */
  NOT_JOINED:                             'HF-004: Internal error: Branch not joined',

  /**
   * @alias HF-005
   * @memberof HFDMError
   * @summary 'HF-005: Hfdm.getRepository parameter: in_urn must be a string.'
   * @description methods: Hrdm.getRepository
   * Hfdm.getRepository needs a urn as a parameter. A urn is a string that looks like:
   * urn:adsk.hfdmprd:hfdm.branch:e0b66b2f-d944-2f81-87d8-11771c7ed805/1526e892-f1a3-4e30-b9ad-49c8f6633caf
   * You can get the current active urn by using Workspace.getActiveUrn() or by calling .getUrn() on
   * the branch node or the commit node.
   */
  URN_MUST_BE_STRING:                     'HF-005: Hfdm.getRepository parameter: in_urn must be a string.',

  /**
   * @alias HF-006
   * @memberof HFDMError
   * @summary 'HF-006: Hfdm.getBranch parameter: in_urn must be a branch Urn. This is not valid: '
   * @description methods: Hfdm.getBranch
   * The parameter you pass in to Hfdm.getBranch should be the urn for a branch. If your workspace was initialized
   * with a branch urn, you can get that urn with workspace.getActiveUrn. You can also call .getUrn on the branch
   * node.
   */
  MUST_BE_BRANCH_URN:                     'HF-006: Hfdm.getBranch parameter: in_urn must be a branch Urn. This is not valid: ',

  /**
   * @alias HF-007
   * @memberof HFDMError
   * @summary 'HF-007: Hfdm.getCommit parameter: in_urn must be a commit Urn. This is not valid: '
   * @description methods: Hfdm.getCommit
   * The parameter you pass in to Hfdm.getCommit should be the urn for a commit. If your workspace was
   * initialized with a branch urn, you can get that urn with workspace.getActiveUrn. You can also
   * use .getUrn on a commit node to get that comm
   * it’s urn.
   */
  MUST_BE_COMMIT_URN:                     'HF-007: Hfdm.getCommit parameter: in_urn must be a commit Urn. This is not valid: ',

  /**
   * @alias HF-008
   * @memberof HFDMError
   * @summary 'HF-008: Internal error: Unknown repository for branch: '
   * @description methods: Workspace.destroy, Hfdm.disconnect
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   * Could not find a repository for the branch you are on.
   */
  UNKNOWN_REPOSITORY:                     'HF-008: Internal error: Unknown repository for branch: ',

  /**
   * @alias HF-009
   * @memberof HFDMError
   * @summary 'HF-009: Internal error: Missing branch. Cannot commit.'
   * @description methods: Workspace.commit
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   * Could not find an active branch for your current workspace.
   */
  MISSING_BRANCH:                         'HF-009: Internal error: Missing branch. Cannot commit.',

  /**
   * @alias HF-010
   * @memberof HFDMError
   * @summary 'HF-010: Not connected to the backend.'
   * @description methods: Hfdm.disconnect, Workspace.destroy, Hfdm.share, Hfdm.unshare, Workspace.checkout,
   * Hfdm.getExpiry, Hfdm.setExpiry, Hfdm.delete, Hfdm.undelete
   * Check your server connection. Make sure that Hfdm.connect has resolved before using one of those methods.
   */
  NOT_CONNECTED:                          'HF-010: Not connected to the backend. ',

  /**
   * @alias HF-011
   * @memberof HFDMError
   * @summary 'HF-011: Cannot fetch commit. '
   * @description methods Workspace.checkout, Repository.checkout
   * Could not fetch a remote commit. Check your server connection. Make sure that Hfdm.connect was called and
   * resolved successfully.
   */
  CANNOT_FETCH_COMMIT:                    'HF-011: Cannot fetch commit. ',

  /**
   * @alias HF-012
   * @memberof HFDMError
   * @summary 'HF-012: Internal error: Cannot call modify on a repository that does not yet have a checked out root.'
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   * The repository does not have a root.
   */
  NO_ROOT_IN_MODIFY:                      'HF-012: Internal error: Cannot call modify on a repository that does ' +
                                          'not yet have a checked out root.',

  /**
   * @alias HF-013
   * @memberof HFDMError
   * @summary 'HF-013: Already connected'
   * @description methods: Hfdm.connect
   * You called Hfdm.connect while you were already connected. Remove this .connect or run .disconnect first.
   * If you are already using .disconnect, make sure it resolves before calling .connect again.
   */
  ALREADY_CONNECTED:                      'HF-013: Already connected',

  /**
   * @alias HF-014
   * @memberof HFDMError
   * @summary 'HF-014: In the process of connecting'
   * @description methods: Hfdm.connect
   * You called Hfdm.connect while Hfdm was already in the process of connecting. Remove this .connect or run
   * .disconnect once the connection is complete before connecting again.
   */
  CONNECTING:                             'HF-014: In the process of connecting',

  /**
   * @alias HF-015
   * @memberof HFDMError
   * @summary 'HF-015: Failed to persist local branch. Server error: '
   * @description methods: Workspace.branch
   * The remote branch was not created: a server error occurred. If you want to create a local branch instead,
   * pass in local:true
   * For example: Workspace.branch({local:true}) (the local option defaults to false)
   * If you really meant to create a remote branch, check your server connection.
   */
  FAILED_TO_PERSIST:                      'HF-015: Failed to persist local branch. Server error: ',

  /**
   * @alias HF-016
   * @memberof HFDMError
   * @summary 'HF-016: Internal error: Parent commit does not exist.'
   * @description methods: Workspace.branch
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   * No parent was found for active commit because no repository was found for this commit.
   */
  NO_PARENT_COMMIT:                       'HF-016: Internal error: Parent commit does not exist.',

  /**
   * @alias HF-017
   * @memberof HFDMError
   * @summary 'HF-017: Internal error: Cannot leave a local branch.'
   * @description methods: Hfdm.disconnect, Workspace.destroy
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   * Called by disconnect, destroy… but shouldn’t be called on a local branch.
   */
  CANNOT_LEAVE_LOCAL_BRANCH:              'HF-017: Internal error: Cannot leave a local branch.',

  /**
   * @alias HF-018
   * @memberof HFDMError
   * @summary 'HF-018: Internal error: Invalid state, join counter should be > 0'
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   * There was an inconsistency between the join counter and the hasJoined status of your branch.
   */
  JOIN_COUNTER_SHOULD_BE_MORE_ZERO:       'HF-018: Internal error: Invalid state, join counter should be > 0',

  /**
   * @alias HF-019
   * @memberof HFDMError
   * @summary 'HF-019: Internal error: Invalid state, join counter should be 0.'
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   * There was an inconsistency between the join counter and the hasJoined status of your branch.
   */
  JOIN_COUNTER_SHOULD_BE_ZERO:            'HF-019: Internal error: Invalid state, join counter should be 0.',

  /**
   * @alias HF-020
   * @memberof HFDMError
   * @summary 'HF-020: Internal error: Invalid state, join counter should be 1.'
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   * There was an inconsistency between the join counter and the hasJoined status of your branch.
   */
  JOIN_COUNTER_SHOULD_BE_ONE:             'HF-020: Internal error: Invalid state, join counter should be 1.',

  /**
   * @alias HF-021
   * @memberof HFDMError
   * @summary 'HF-021: Internal error: in_branchGuid must be a GUID. This is not valid: '
   * @description methods: Hfdm.disconnect, Workspace.destroy
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   * It looks like the active branch did not return a Guid or the room.id did not exist. Neither of these
   * things should happen.
   */
  BRANCH_GUID_MUST_BE_A_GUID:             'HF-021: Internal error: in_branchGuid must be a GUID. This is not valid: ',

  /**
   * @alias HF-022
   * @memberof HFDMError
   * @summary 'HF-022: Internal error: Could not find Branch or Commit with GUID: '
   * @description methods: Workspace.rebase
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   * Rebases onto the active branch. This error could only happen if the Hfdm._rebase function could not find a
   * repository for the workspace’s active branch.
   */
  COULD_NOT_FIND_BRANCH_OR_COMMIT:        'HF-022: Internal error: Could not find Branch or Commit with GUID: ',

  // HF-023 removed

  /**
   * @alias HF-024
   * @memberof HFDMError
   * @summary 'HF-024: Hfdm.getExpiry parameter: in_urn must be a repository Urn. This is not valid: '
   * @description methods: Hfdm.getExpiry
   * Hfdm.getExpiry takes only one parameter: a repository urn.
   */
  GET_EXPIRY_URN:                         'HF-024: Hfdm.getExpiry parameter: in_urn must be a repository Urn. This is not valid: ',

  /**
   * @alias HF-025
   * @memberof HFDMError
   * @summary 'HF-025: Hfdm.delete parameter: in_urn must be a repository Urn. This is not valid: '
   * @description methods: Hfdm.delete
   * The first parameter for Hfdm.delete must be a valid repository urn.
   */
  DELETE_URN_PARAMETER:                   'HF-025: Hfdm.delete parameter: in_urn must be a repository Urn. This is not valid: ',

  /**
   * @alias HF-026
   * @memberof HFDMError
   * @summary 'HF-026: Hfdm.undelete parameter: in_urn must be a repository Urn. This is not valid: '
   * @description methods: Hfdm.undelete
   * Hfdm.undelete takes only one parameter: a repository urn.
   */
  UNDELETE_URN_PARAMETER:                 'HF-026: Hfdm.undelete parameter: in_urn must be a repository Urn. This is not valid: ',

  /**
   * @alias HF-027
   * @memberof HFDMError
   * @summary 'HF-027: Hfdm.setExpiry parameter: in_urn must be a repository Urn. This is not valid: '
   * @description methods: Hfdm.setExpiry
   * The first parameter for Hfdm.setExpiry must be a valid repository urn.
   */
  SET_EXPIRY_URN:                         'HF-027: Hfdm.setExpiry parameter: in_urn must be a repository Urn. This is not valid: ',

  /**
   * @alias HF-028
   * @memberof HFDMError
   * @summary 'HF-028: Failed to leave previous checkedout branch: '
   * @description methods: Workspace.checkout
   * You performed a checkout on a branch or commit while you had already checked out another branch or commit.
   * The workspace tried to leave the previous branch but was unable to. See attached error message for details.
   */
  FAILED_TO_LEAVE_PREVIOUS_BRANCH:        'HF-028: Failed to leave previous checkedout branch: ',

  // HF-029 removed

  /**
   * @alias HF-030
   * @memberof HFDMError
   * @summary 'HF-030: Internal error: Trying to remove a commit node that doesn't have a GUID'
   * @description methods: Hfdm.disconnect, Repository.removeBranch
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   * Attempted to remove a commit node that doesn't have a GUID.
   */
  MISSING_COMMIT_NODE_GUID:               'HF-030: Internal error: Trying to remove a commit node that ' +
                                          'doesn\'t have a GUID',

  /**
   * @alias HF-031
   * @memberof HFDMError
   * @summary 'HF-031: Internal error: Client attempts to commit to a repository after leaving the branch.'
   * @description methods: Workspace.commit
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   * Active branch was found but it does not belong to any repository.
   */
  MISSING_REPOSITORY:                     'HF-031: Internal error: Client attempts to commit to a repository ' +
                                          'after leaving the branch.',

  /**
   * @alias HF-032
   * @memberof HFDMError
   * @summary 'HF-032: Internal error: Received an event while not on branch. Event: <event>, Branch: <branch>'
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   * This is likely a race condition. This is not a fatal error but it should technically not happen.
   */
  EVENT_WHILE_NOT_ON_BRANCH:              'HF-032: Internal error: Received an event while not on branch. ',

  /**
   * @alias HF-033
   * @memberof HFDMError
   * @summary 'HF-033: Websocket disconnect: <reason>'
   * @description Local commits have been pushed to the server, but before the server could answer that it accepted
   * or rejected the commits, the websocket connection with it has been closed.
   */
  WEBSOCKET_DISCONNECT:                   'HF-033: Websocket disconnect: ',

  /**
   * @alias HF-034
   * @memberof HFDMError
   * @summary 'HF-034: Expected a local branch in call to <function>.'
   * @description methods: Workspace.commit, Workspace.synchronize, Workspace.push, Workspace.pull,
   * Workspace.getPushCount, Workspace.getPullCount
   * A function of the BranchNode class that is supposed to be applied to a local branch has been called on a remote
   * branch. If the given function is an internal function (name starts with '_'), it is an internal error, please
   * contact the development team.
   */
  EXPECTED_LOCAL_BRANCH:                  'HF-034: Expected a local branch in call to ',

  /**
   * @alias HF-035
   * @memberof HFDMError
   * @summary 'HF-035: Failure in local branch management. Branch: <branch>. <message>'
   * @description methods: Workspace.commit, Workspace.synchronize, Workspace.push, Workspace.pull
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   * The internal local branch management system encountered an error.
   */
  LOCAL_BRANCH_MANAGEMENT_FAILURE:        'HF-035: Failure in local branch management. Branch: ',

  /**
   * @alias HF-036
   * @memberof HFDMError
   * @summary 'HF-036: Parameter error: in_workspace must be a valid workspace.'
   * @description methods: HFDM.destroyWorkspace
   * HFDM.destroyWorkspace must take one parameter, which should be a workspace object.
   */
  NO_WORKSPACE_FOUND:                     'HF-036: Parameter error: in_workspace must be a valid workspace.',

  /**
   * @alias HF-037
   * @memberof HFDMError
   * @summary 'HF-037: Joining same branch with different 'paths' options is not supported. Please create another
   * HFDM object to achieve that. New: <new 'paths' option> Previous: <previous 'paths' option>.'
   * @description methods: Workspace.initialize, Workspace.checkout
   * You are trying to join a branch that has already been joined by this HFDM object, but you're trying to use a
   * different value for the 'paths' option. This is not supported. To achieve that, you need to use another
   * HFDM object.
   */
  SAME_BRANCH_DIFFERENT_PATHS:            'HF-037: Joining same branch with different \'paths\' options is not ' +
                                          'supported. Please create another HFDM object to achieve that. ',

  /**
   * @alias HF-038
   * @memberof HFDMError
   * @summary 'HF-038: Failed to rejoin branch after socket reconnection <branch>'
   * @description We failed to join the branch after the websocket connection has been reestablished with the server.
   */
  FAILED_REJOIN_ON_RECONNECT:             'HF-038: Failed to rejoin branch after socket reconnection ',

  /**
   * @alias HF-039
   * @memberof HFDMError
   * @summary 'HF-039: Checkout has been aborted. [Branch <branch guid>|Commit <commit guid>]'
   * @description methods: Workspace.checkout
   * The checkout of the branch or commit failed because it has been aborted by the user (another
   * branch or a commit has been checked out or workspace has been destroyed) while the checkout
   * operation was still ongoing.
   */
  CHECKOUT_ABORTED:                       'HF-039: Checkout has been aborted. ',

  /**
   * @alias HF-040
   * @memberof HFDMError
   * @summary 'HF-040: Received event after leaving room.'
   * @description Means that an event has been received shortly after leaving a room, which is
   *              a normal condition. You can safely ignore this error.
   */
  EVENT_RECEIVED_FOR_CLOSED_ROOM:
    'HF-040: Received event after leaving room.',

  /**
   * @alias HF-041
   * @memberof HFDMError
   * @summary 'HF-041: Received event for unknown room.'
   * @description INTERNAL ERROR - If you encounter this error often, please contact the development team.
   *              This could be caused by a busy system.
   */
  EVENT_RECEIVED_FOR_UNKNOWN_ROOM:
    'HF-041: Received event for unknown room.',

  /**
   * @alias HF-042
   * @memberof HFDMError
   * @summary 'HF-042: Hfdm.enumerateBranches parameter: in_repositoryUrn must be a repository Urn. This is not valid: '
   * @description methods: Hfdm.undelete
   * Hfdm.undelete takes only one parameter: a repository urn.
   */
  ENUM_BRANCHES_URN_PARAMETER:
    'HF-042: Hfdm.enumerateBranches parameter: in_repositoryUrn must be a repository Urn. This is not valid: ',

  /**
   * @alias HF-043
   * @memberof HFDMError
   * @summary 'HF-043: Reconnection has failed'
   * @description INTERNAL ERROR - If you encounter this error often, please contact the development team.
   */
  FAILED_TO_RECONNECT:
  'HF-043: Reconnection has failed',

  /**
   * @alias HF-044
   * @memberof HFDMError
   * @summary 'HF-044: Expected the previous state to be a detached head state.'
   * @description INTERNAL ERROR - If you encounter this error often, please contact the development team.
   */
  EXPECTED_DETACHED_HEAD_STATE:
  'HF-044: Expected the previous state to be a detached head state.',

    /**
   * @alias HF-045
   * @memberof HFDMError
   * @summary 'HF-045: A high number of active connection has been reached.'
   * @description ERROR - If non intentional, there is probably connection leaks in the user's code.
   */
  HIGH_NUMBER_ACTIVE_CONNECTIONS:
  'HF-045: A high number of active connection has been reached.',

  // WORKSPACE ERRORS

  /**
   * @alias WS-001
   * @memberof WorkspaceError
   * @summary 'WS-001: _setParentRepository called with non existing checked out repository '
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   */
  SET_PARENT_REPO_INVALID:                'WS-001: _setParentRepository called with non existing checked ' +
                                          'out repository ',

  /**
   * @alias WS-002
   * @memberof WorkspaceError
   * @summary 'WS-002: INTERNAL ERROR: Tried to register a checkout view for a commit GUID that already exists. This shouldn't happen. The caller of _updateRepositoryInfo should have taken care of this'
   * @description: INTERNAL ERROR - If you encounter this error, please contact the development team.
   */
  DUPLICATED_COMMIT_UPDATE:               'WS-002: INTERNAL ERROR: Tried to register a checkout view for a ' +
                                          'commit GUID that already exists. This shouldn\'t happen. The caller of ' +
                                          '_updateRepositoryInfo should have taken care of this',

  /**
   * @alias WS-003
   * @memberof WorkspaceError
   * @summary 'WS-003: Rebase is needed. Branch guid: <branch guid>'
   * @description methods: Workspace.commit, Workspace.push
   * The remote repository is ahead of your local workspace. You need to rebase before you can push your changes.
   */
  REBASE_NEEDED:                          'WS-003: Rebase is needed. Branch guid: ',

  /**
   * @alias WS-004
   * @memberof WorkspaceError
   * @summary 'WS-004: Remote branch is not tracked. Branch guid: <branch guid>'
   * @description methods: Workspace.commit, Workspace.push
   * Cannot commit or push to the remote repository because no remote repository is tracked.
   */
  REMOTE_BRANCH_NOT_TRACKED:              'WS-004: Remote branch is not tracked. Branch guid: ',

  /**
   * @alias WS-005
   * @memberof WorkspaceError
   * @summary 'WS-005: Failed to push local commits. '
   * @description methods: Workspace.commit, Workspace.push
   * Tried to push local commits to a remote repository but encountered an error (usually from the server).
   */
  FAILED_PUSH:                            'WS-005: Failed to push local commits. ',

  /**
   * @alias WS-006
   * @memberof WorkspaceError
   * @summary 'WS-006: Cannot checkout a branch more than once -'
   * @description methods: Workspace.checkout
   * You already checked out this branch. You cannot checkout the same branch more than once.
   */
  CANNOT_CHECKOUT_AGAIN:                  'WS-006: Cannot checkout a branch more than once -',

  /**
   * @alias WS-007
   * @memberof WorkspaceError
   * @summary 'WS-007: Workspace.checkout parameter: in_commitOrBranchUrn must be a valid commit or branch urn. This is not valid: '
   * @description methods: Workspace.checkout
   * Workspace.checkout takes one parameter: in_commitOrBranchUrn. It must be a valid branch or commit urn.
   * You can obtain your workspace’s current active urn (which can be either a branch or a commit urn, depending
   * on what you used to initialize the workspace) with workspace.getActiveUrn. You can also call .getUrn on a
   * branch node or a commit node.
   */
  NOT_A_VALID_URN:                        'WS-007: Workspace.checkout parameter: in_commitOrBranchUrn must be a ' +
                                          'valid commit or branch urn. This is not valid: ',

  /**
   * @alias WS-008
   * @memberof WorkspaceError
   * @summary 'WS-008: Cannot checkout a remote commit/branch - Not Connected'
   * @description Check your server connection. Make sure that hfdm.connect has resolved before using
   * Workspace.checkout.
   */
  CANNOT_CHECKOUT_NOT_CONNECTED:          'WS-008: Cannot checkout a remote commit/branch - Not Connected',

  /**
   * @alias WS-009
   * @memberof WorkspaceError
   * @summary 'WS-009: Missing branch guid in remote commit urn.'
   * @description methods: workspace.checkout
   * @description: INTERNAL ERROR - If you encounter this error, please contact the development team.
   * No branch found for this commit urn
   */
  MISSING_BRANCH_IN_REMOTE_COMMIT:        'WS-009: Missing branch guid in remote commit urn.',

  /**
   * @alias WS-010
   * @memberof WorkspaceError
   * @summary 'WS-010: Workspace.setSynchronizeMode parameter in_value not valid: '
   * @description methods: Workspace.setSynchronizeMode
   * Sync mode can be: ‘MANUAL’, ‘PUSH’, ‘PULL’ OR ‘SYNCHRONIZE’. Any other value is invalid.
   */
  UNKNOWN_SYNCHRONIZE_MODE:               'WS-010: Workspace.setSynchronizeMode parameter in_value not valid: ',

  /**
   * @alias WS-011
   * @memberof WorkspaceError
   * @summary 'WS-011: Workspace is on a detached head'
   * @description methods: Workspace.rebase, Workspace.pull, Workspace.synchronize
   * Cannot rebase, pull or synchronize when the workspace is in detached head state. This happens if you checkout
   * a commit that is not at the head of its branch.
   */
  DETACHED_HEAD:                          'WS-011: Workspace is on a detached head',

  /**
   * @alias WS-012
   * @memberof WorkspaceError
   * @summary 'WS-012: Workspace.setConflictHandler parameter: in_callback must be a function.'
   * @description methods: Workspace.setConflictHandler, Property.traverseUp, Property.traverseDown
   * Workspace.setConflictHandler takes one parameter: in_callback. It must be a function.
   */
  IN_CALLBACK_MUST_BE_FCT:                'WS-012: Workspace.setConflictHandler parameter: in_callback must ' +
                                          'be a function.',

  /**
   * @alias WS-013
   * @memberof WorkspaceError
   * @summary 'WS-013: No repository has been checked out yet. <message>'
   * @description methods: Workspace.getPendingChanges, Workspace.getActiveBranch, Workspace.getActiveCommit,
   * Workspace.getActiveRepository, Workspace.synchronize, Workspace.resolvePath, Workspace.insert, Workspace.remove
   * Workspace.getIds, Workspace.get, Workspace.has, Workspace.getEntriesReadOnly, Workspace.prettyPrint
   * Call workspace.checkout(urn) first. Make sure the checkout promise has resolved before calling these functions.
   */
  NO_REPOSITORY_CHECKED_OUT:              'WS-013: No repository has been checked out yet. ',

  // WS-014 does not exist

  /**
   * @alias WS-015
   * @memberof WorkspaceError
   * @summary 'WS-015: Unbalanced number of pushNotificationDelayScope and popNotificationDelayScope calls'
   * @description methods: Workspace.popModifiedEventScope
   * You cannot call popModifiedEventScope more times than pushModifiedEventScope has been called so far. Make sure
   * that you called pushModifiedEventScope first, and that the number of calls for popModifiedEventScope does not
   * exceed that of pushModifiedEventScope calls.
   */
  UNBALANCED_PUSH_AND_POP_DELAY:          'WS-015: Unbalanced number of pushNotificationDelayScope and ' +
                                          'popNotificationDelayScope calls',
  // WS-016 does not exist
  // WS-017 does not exist

  /**
   * @alias WS-018
   * @memberof WorkspaceError
   * @summary 'WS-018: Workspace.remove parameter: in_property should be a valid property or an id (string).'
   * @description methods: Workspace.remove
   * Workspace.remove takes one parameter: in_property. It can either be a valid property or the id of a valid
   * property.
   */
  NOT_A_PROPERTY_OR_STRING:               'WS-018: Workspace.remove parameter: in_property should be a valid ' +
                                          'property or an id (string).',

  /**
   * @alias WS-019
   * @memberof WorkspaceError
   * @summary 'WS-019: Cannot commit to detached head.'
   * @description methods: Workspace.commit
   * Cannot commit to detached head. This happens if you checkout a commit that is not at the head of its branch.
   */
  CANNOT_COMMIT_TO:                       'WS-019: Cannot commit to detached head.',

  /**
   * @alias WS-020
   * @memberof WorkspaceError
   * @summary 'WS-020: Nothing to commit'
   * @description methods: Workspace.commit
   * The changeset that you are trying to commit is empty.
   */
  NOTHING_TO_COMMIT:                      'WS-020: Nothing to commit',

  /**
   * @alias WS-021
   * @memberof WorkspaceError
   * @summary 'WS-021: Cannot merge to detached head'
   * @description methods: Workspace.merge
   * You cannot merge your workspace with a branch or commit when you are in detached head state.
   * This happens if you checkout a commit that is not at the head of its branch.
   */
  CANNOT_MERGE_TO_DETACHED_HEAD:          'WS-021: Cannot merge to detached head',

  /**
   * @alias WS-022
   * @memberof WorkspaceError
   * @summary 'WS-022: No checkout view has been supplied.'
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   */
  NO_CHECKOUT_VIEW:                       'WS-022: No checkout view has been supplied.',

  /**
   * @alias WS-023
   * @memberof WorkspaceError
   * @summary 'WS-023: No commit given in branch operation'
   * @description methods: Workspace.branch
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   * Could not find the currently active commit from which to create a branch.
   */
  NO_COMMIT_IN_BRANCH:                    'WS-023: No commit given in branch operation',

  /**
   * @alias WS-024
   * @memberof WorkspaceError
   * @summary 'WS-024: No valid branch given in resetBranch operation'
   * @description methods: Workspace.push
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   */
  NO_BRANCH_IN_RESET:                     'WS-024: No valid branch given in resetBranch operation',

  /**
   * @alias WS-025
   * @memberof WorkspaceError
   * @summary 'WS-025: No valid commit given in resetBranch operation'
   * @description methods: Workspace.push
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   */
  NO_COMMIT_IN_RESET:                     'WS-025: No valid commit given in resetBranch operation',

  /**
   * @alias WS-026
   * @memberof WorkspaceError
   * @summary 'WS-026: Rebase not possible for a CheckOutView in a detached head state'
   * @description methods: Workspace.rebase, Workspace.synchronize, Workspace.pull
   * You cannot rebase, pull or synchronize your workspace when you are in detached head state. This happens if you
   * checkout a commit that is not at the head of its branch.
   */
  CANNOT_REBASE_DETACHED_HEAD:            'WS-026: Rebase not possible for a CheckOutView in a detached head state',

  /**
   * @alias WS-027
   * @memberof WorkspaceError
   * @summary 'WS-027: Invalid onto commit in rebase specified'
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   */
  INVALID_ONTO_IN_REBASE:                 'WS-027: Invalid onto commit in rebase specified',

  /**
   * @alias WS-028
   * @memberof WorkspaceError
   * @summary 'WS-028: Invalid rebase branch specified'
   * @description methods: Workspace.rebase, Workspace.synchronize, Workspace.pull
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   */
  INVALID_REBASE_BRANCH:                  'WS-028: Invalid rebase branch specified',

  /**
   * @alias WS-029
   * @memberof WorkspaceError
   * @summary 'WS-029: Cache contained a non existing node'
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   */
  NON_EXISTING_NODE_IN_CACHE:             'WS-029: Cache contained a non existing node',

  // WS-030 removed
  // WS-031 NOT MERGED IN YET

  /**
   * @alias WS-032
   * @memberof WorkspaceError
   * @summary 'WS-032: Function not implemented: '
   * @description This Method or Workspace event is not yet implemented.
   */
  NOT_IMPLEMENTED:                        'WS-032: Function not implemented: ',

  /**
   * @alias WS-033
   * @memberof WorkspaceError
   * @summary 'WS-033: Conflict handling must be one of the following : NONE, INDEPENDENT_PROPERTIES. This is not valid: '
   * @description methods: Workspace.setServerAutoRebaseMode
   * The serverAutoRebaseMode can only be 'NONE' or 'INDEPENDENT_PROPERTIES'. Other values are invalid.
   */
  UNSUPPORTED_SERVER_AUTOREBASE_MODE:     'WS-033: Conflict handling must be one of the following : ' +
                                          'NONE, INDEPENDENT_PROPERTIES. This is not valid: ',

  /**
   * @alias WS-034
   * @memberof WorkspaceError
   * @summary 'WS-034: Rebase callback notification modes should be one of the following : ALWAYS, CONFLICTS. This is not valid: '
   * @description methods: Workspace.setRebaseCallback
   * If you specify a callback modification mode, it must be either 'ALWAYS' or 'CONFLICTS'. Any other value
   * is invalid.
   */
  UNSUPPORTED_REBASE_CALLBACK_NOTIFICATION_MODES:
    'WS-034: Rebase callback notification modes should be one of the following : ALWAYS, CONFLICTS. This is not valid: ',

  /**
   * @alias WS-035
   * @memberof WorkspaceError
   * @summary 'WS-035: Missing reference to hfdm instance.'
   * @description methods: Workspace constructor
   * INTERNAL ERROR - If you encounter this error, please contact the development team.
   */
  MISSING_REF_TO_HFDM:                    'WS-035: Missing reference to hfdm instance.',

  // WS-036 removed

  /**
   * @alias WS-037
   * @memberof WorkspaceError
   * @summary 'WS-037: HFDM "branchMoved" event error: '
   * @description An error occurred during the branchMoved event callback.
   */
  BRANCHMOVED_EVENT_ERROR:                'WS-037: HFDM "branchMoved" event error: ',

  /**
   * @alias WS-038
   * @memberof WorkspaceError
   * @summary 'WS-038: Internal error: Currently, there should be no modifications for sub-repositories without a change on the root.'
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   */
  NO_MODIF_SUB_REPOSITORY:                'WS-038: Internal error: Currently, there should be no modifications for ' +
                                          'sub-repositories without a change on the root.',

  /**
   * @alias WS-039
   * @memberof WorkspaceError
   * @summary 'WS-039: Received unrequested commit: '
   * @description (warning) The workspace received a commit that was not specifically requested.
   */
  RECEIVED_UNREQUESTED_COMMIT:            'WS-039: Received unrequested commit: ',

  /**
   * @alias WS-040
   * @memberof WorkspaceError
   * @summary 'WS-040: Internal error: There should not be any modifications of dynamic entries on the reference property.'
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   * changeSet does not contain any modify, insert or remove fields.
   */
  NO_MODIF_DYNAMIC_ENTRIES:               'WS-040: Internal error: There should not be any modifications of ' +
                                          'dynamic entries on the reference property.',

  // WS-041 has been removed

  /**
   * @alias WS-042
   * @memberof WorkspaceError
   * @summary 'WS-042: Multiple modifications for the same CheckedOutRepositoryInfo'
   */
  MULTIPLE_MODIFICATIONS_INFO:            'WS-042: Multiple modifications for the same CheckedOutRepositoryInfo',

  /**
   * @alias WS-043
   * @memberof WorkspaceError
   * @summary 'WS-043: resolvePath parameter: in_path should be a string. This is not valid: '
   * @description methods: Workspace.resolvePath
   * workspace.resolvePath takes only one parameter: the path to be resolved. It must be a string.
   */
  IN_PATH_STRING:                         'WS-043: resolvePath parameter: in_path should be a string. This is not valid: ',

  /**
   * @alias WS-044
   * @memberof WorkspaceError
   * @summary 'WS-044: Workspace does not know about typeid: '
   * @description methods: Workspace.commit
   * Workspace cannot find a template for this typeid. The most probable cause for that is that you registered
   * your template with a PropertyFactory that is different than the one known by your Workspace. Please do not
   * mix multiple versions of forge-hfdm or property-sets libraries and do not instantiate other PropertyFactory.
   * Use the one that comes with your library.
   */
  UNKNOWN_TYPEID_FOR_WORKSPACE:           'WS-044: Workspace does not know about typeid: ',

  /**
   * @alias WS-045
   * @memberof WorkspaceError
   * @summary 'WS-045: Error occurred in an event handler. Event: '
   */
  ERROR_IN_EVENT_HANDLER:                 'WS-045: Error occurred in an event handler. Event: ',

  /**
   * @alias WS-046
   * @memberof WorkspaceError
   * @summary 'WS-046: Workspace has been destroyed. Please create a new Workspace. '
   * @description methods: Workspace.commit
   * Workspace was destroyed before the commit promise is returned.
   */
  WORKSPACE_DESTROYED:                    'WS-046: Workspace has been destroyed. Please create a new Workspace. ',

  /**
   * @alias WS-047
   * @memberof WorkspaceError
   * @summary 'WS-047: Workspace.setAutoUpload parameter: in_state should be a valid state.'
   * @description methods: Workspace.setAutoUpload
   * Workspace.setAutoUpload takes one parameter: in_state. It's required and can only be a boolean.
   */
  AUTOUPLOAD_NOT_A_BOOLEAN:              'WS-047: Workspace.setAutoUpload parameter: in_state must be a valid ' +
                                          'state (boolean).',

  /**
   * @alias WS-048
   * @memberof WorkspaceError
   * @summary 'WS-048: Cannot merge if workspace has pending uncommitted changes.'
   * @description methods: Workspace.merge
   * You cannot merge with a branch or commit if your workspace has pending uncommitted changes.
   */
  CANNOT_MERGE_PENDING_CHANGES: 'WS-048: Cannot merge if workspace has pending uncommitted changes.',

  /**
   * @alias WS-049
   * @memberof WorkspaceError
   * @summary 'WS-049: Cannot merge in a local repository.'
   * @description methods: Workspace.merge
   * You cannot merge with a branch or commit in a local repository.
   */
  MERGE_ONLY_IN_LOCAL_REPO_NOT_SUPPORTED: 'WS-049: Merging in a local repository is not supported.',

  /**
   * @alias WS-050
   * @memberof WorkspaceError
   * @summary 'WS-050: Cannot find a common ancestor to apply the merge.'
   * @description methods: Workspace.merge
   * You cannot merge two commits that don't have a common ancestor.
   */
  MERGE_COMMON_ANCESTOR_NOT_FOUND: 'WS-050: Cannot find a common ancestor to apply the merge. ' +
    'To be able to merge two branches they must have at least one commit common to both of them which is neither the source or target commit.',

  /**
   * @alias WS-051
   * @memberof WorkspaceError
   * @summary 'WS-051: Merge source cannot be the same as merge target.'
   * @description methods: Workspace.merge
   * Merge source cannot be the same as merge target.
   */
  MERGE_SAME_SOURCE_TARGET: 'WS-051: Merge source cannot be the same as merge target.',

  /**
   * @alias WS-052
   * @memberof WorkspaceError
   * @summary 'WS-052: Merging a commit that resides in a different repository is not supported.'
   * @description methods: Workspace.merge
   * Merging a commit that resides in a different repository is not supported.
   */
  MERGE_IN_DIFFERENT_REPOSITORIES: 'WS-052: Merging a commit that resides in a different repository is not supported.',

  /**
   * @alias WS-053
   * @memberof WorkspaceError
   * @summary 'WS-053: Merging with an ancestor commit is not supported.'
   * @description methods: Workspace.merge
   * Merging with an ancestor commit is not supported.
   */
  MERGE_WITH_ANCESTOR: 'WS-053: Merging with an ancestor commit is not supported.',

  /**
   * @alias WS-054
   * @memberof WorkspaceError
   * @summary 'WS-054: Merge callback notification modes should be one of the following : ALWAYS, CONFLICTS. This is not valid: '
   * @description methods: Workspace.setMergeCallback
   * If you specify a callback modification mode, it must be either 'ALWAYS' or 'CONFLICTS'. Any other value
   * is invalid.
   */
  UNSUPPORTED_MERGE_CALLBACK_NOTIFICATION_MODES:
    'WS-054: Merge callback notification modes should be one of the following : ALWAYS, CONFLICTS. This is not valid: ',

  /**
   * @alias WS-055
   * @memberof WorkspaceError
   * @summary 'WS-055: Multi LCA merges are not supported.'
   * @description methods: Workspace.merge
   * Multi LCA merges are not supported.
   */
  MERGE_WITH_MULTI_LCA: 'WS-055: Multi LCA merges are not supported',

  /**
   * @alias WS-056
   * @memberof WorkspaceError
   * @summary 'WS-056: Merging two branches that don't share a direct ancestor,
   * is not supported.'
   * @description methods: Workspace.merge
   * Merging two branches that don't share a direct ancestor is not supported.
   */
  MERGE_WITH_INDIRECT_BRANCH: 'WS-056: Merging two branches that don\'t share a direct ancestor is not supported.',

  /**
   * @alias WS-057
   * @memberof WorkspaceError
   * @summary 'WS-057: Merging a desynchronized branch is not supported, rebase pending changes before merging.'
   * @description methods: Workspace.merge
   * Merging a desynchronized branch is not supported, rebase pending changes before merging.
   */
  MERGE_DESYNCHRONIZED_BRANCH: 'WS-057: Merging a desynchronized branch is not supported, ' +
                                'rebase pending changes before merging.',

  /**
   * @alias WS-058
   * @memberof WorkspaceError
   * @summary 'WS-058: Merge requires workspace to have SYNC_MODE set to SYNCHRONIZE and '
   * SERVER_AUTO_REBASE_MODES set to NONE.
   * @description methods: Workspace.merge
   * Merge requires workspace to have SYNC_MODE set to SYNCHRONIZE and SERVER_AUTO_REBASE_MODES set to NONE.
   */
  MERGE_UNSUPPORTED_SYNC_REBASE_MODE: 'WS-058: Merge requires workspace to have SYNC_MODE set to SYNCHRONIZE and ' +
                                'SERVER_AUTO_REBASE_MODES set to NONE.',

  /**
   * @alias WS-059
   * @memberof WorkspaceError
   * @summary 'WS-059: Workspace has been reset.'
   * @description methods: Workspace.commit
   * Workspace was reset before the commit promise is returned.
   */
  WORKSPACE_RESET:                    'WS-059: Workspace has been reset.',

  /**
   * @alias WS-060
   * @memberof WorkspaceError
   * @summary 'WS-060: No branch has been checked out yet.'
   * @description methods:Workspace.serializeActiveBranch
   * Call workspace.checkout(urn) first. Make sure the checkout promise has resolved before calling these functions.
   */
  NO_BRANCH_CHECKED_OUT:              'WS-060: No branch has been checked out yet. ',

  /**
   * @alias WS-061
   * @memberof WorkspaceError
   * @summary 'WS-061: Workspace creation options (createRepoOptions) cannot be used to checkout an existing workspace.'
   * @description methods: Workspace.initialize
   * An attempt was made at checking out an existing workspace while specifying new workspace options at the same time.
   * The (urn) and (createRepoOptions) parameters are mutually exclusive.
   */
  INITIALIZE_CREATE_OPTION_ON_CHECKOUT: 'WS-061: Workspace creation options (createRepoOptions) cannot be used ' +
    'to checkout an existing workspace.',

  /**
   * @alias WS-062
   * @memberof WorkspaceError
   * @summary 'WS-062: Workspace creation options (createRepoOptions) contain an identifier that is already in use.'
   * @description methods: Workspace.initialize
   * An attempt was made at creating a new workspace using a branch or repo identifier that is already in use.
   * Please provide unique identifiers in (createRepoOptions).
   */
  INITIALIZE_UNIQUE_CONSTRAINT_VIOLATION: 'WS-062: Workspace creation options (createRepoOptions) contain an ' +
    'identifier that is already in use.',

  /**
   * @alias WS-063
   * @memberof WorkspaceError
   * @summary 'WS-063: Workspace path options (paths) is not an array of strings.'
   * @description methods: Workspace.initialize
   * The format of options.paths must be array of strings.
   */
  PATHS_NOT_ARRAY_OF_STRING: 'WS-063: Workspace.initialize parameter: in_options.paths must be an array of strings.' +
                                          ' This is not valid: ',

  /**
   * @alias WS-064
   * @memberof WorkspaceError
   * @summary 'WS-064: The commit does not belong to the active repository.
   * @description methods:Workspace.revertTo
   * Can only revertTo commits which are part of the same repository and have a lca.
   */
  COMMIT_WRONG_REPOSITORY:              'WS-064: The commit does not belong to the active repository.',

  /**
   * @alias WS-065
   * @memberof WorkspaceError
   * @summary 'WS-065: Cannot revert if workspace has pending uncommitted changes.'
   * @description methods: Workspace.revertTo
   * You cannot revert to a previous commit if your workspace has pending uncommitted changes.
   */
  CANNOT_REVERT_PENDING_CHANGES: 'WS-065: Cannot revert if workspace has pending uncommitted changes.',

  /**
   * @alias WS-066
   * @memberof WorkspaceError
   * @summary 'WS-066: Workspace query options is not an array of objects.'
   * @description methods: Workspace.initialize
   * The format of options.query must be array of objects.
   */
  QUERY_NOT_ARRAY_OF_OBJECTS: 'WS-066: Workspace.initialize parameter: in_options.query must be an array of objects.' +
    ' This is not valid: ',

  // UTILS / OTHER ERRORS

  // NOT USED
  INVALID_PATH_IN_REFERENCE:              'UT-001: References may only contain absolute repository references ' +
                                          'or empty strings',

  // UT-003 Moved to HFDM Schema Validator. (now use TH-001)

  /**
   * @alias UT-004
   * @memberof UtilsError
   * @summary 'UT-004: ArrayChangeSetIterator: unknown operator '
   * @description methods: Utils.traverseChangesetRecursively
   * Your changeset contains an operator other than MODIFY, INSERT or REMOVE. If you created the changeset youserlf,
   * check that you only use valid operators. Otherwise, this is an internal error. Please contact the development team.
   */
  UNKNOWN_OPERATOR:                       'UT-004: ArrayChangeSetIterator: unknown operator ',

  /**
   * @alias UT-005
   * @memberof UtilsError
   * @summary 'UT-005: Found a non primitive type array without typeids. This should never happen.'
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   */
  NON_PRIMITIVE_ARRAY_NO_TYPEID:          'UT-005: Found a non primitive type array without typeids. ' +
                                          'This should never happen.',

  /**
   * @alias UT-006
   * @memberof UtilsError
   * @summary 'UT-006: Filtering paths within arrays are not supported'
   * @description Filtering paths within arrays are not supported.
   */
  FILTER_PATH_WITHIN_ARRAY:               'UT-006: Filtering paths within arrays are not supported',

  /**
   * @alias UT-007
   * @memberof UtilsError
   * @summary 'UT-007: INTERNAL ERROR. Failed assertion. <message>'
   * @description INTERNAL ERROR - If you encounter this error, please contact the development team.
   *              See specific message for more details.
   */
  ASSERTION_FAILED:                       'UT-007: INTERNAL ERROR. Failed assertion. ',

  /**
   * @alias UT-008
   * @memberof UtilsError
   * @summary 'UT-008: Deprecated function <function name>. <Custom information>'
   * @description You used a deprecated function. It will likely be removed in the next major version.
   *              See the custom information if provided.
   */
  DEPRECATED_FUNCTION:
    'UT-008: Deprecated function %s.',

  /**
   * @alias UT-009
   * @memberof UtilsError
   * @summary 'UT-009: Deprecated function parameter <parameter name> of <function name>. <Custom information>'
   * @description You used a deprecated function parameter. It will likely be removed in the next major version.
   *              See the custom information if provided.
   */
  DEPRECATED_PARAMETER:
    'UT-009: Deprecated function parameter %s of %s.',

  /**
   * @alias UT-010
   * @memberof UtilsError
   * @summary 'UT-010: Feature <feature name> is experimental and subject to future changes. <Custom information>'
   * @description You used an experimental feature. It will likely changed in future releases.
   *              See the custom information if provided.
   */
  EXPERIMENTAL_FEATURE:
    'UT-010: Feature %s is experimental and subject to future changes.',

  /**
   * @alias PC-001
   * @memberof PssClientError
   * @summary 'PC-001: Server error: Failed to create a repository.'
   * @description This error message will be displayed when a repository creation fails
   */
  FAILED_REPOSITORY_CREATION:
    'PC-001: Server error: Failed to create a repository. ',

  /**
   * @alias PC-002
   * @memberof PssClientError
   * @summary 'PC-002: Server error: Failed to delete a repository. Repository guid: <repository guid>'
   * @description This error message will be displayed when the deletion of a repository fails
   */
  FAILED_REPOSITORY_DELETION:
    'PC-002: Server error: Failed to delete a repository. Repository guid: ',

  /**
   * @alias PC-003
   * @memberof PssClientError
   * @summary 'PC-003: Server error: Failed to undelete a repository. Repository guid: <repository guid>'
   * @description This error message will be displayed when the undelete operation of a repository fails
   */
  FAILED_REPOSITORY_UNDELETION:
    'PC-003: Server error: Failed to undelete a repository. Repository guid: ',

  /**
   * @alias PC-004
   * @memberof PssClientError
   * @summary 'PC-004: Server error: Failed to get the expiry of a repository. Repository guid: <repository guid>'
   * @description This error message will be displayed when getting the expiry of a repository fails
   */
  FAILED_GET_EXPIRY_REQUEST:
    'PC-004: Server error: Failed to get the expiry of a repository. Repository guid: ',

  /**
   * @alias PC-005
   * @memberof PssClientError
   * @summary 'PC-005: Server error: Failed to set the expiry of a repository. Repository guid: <repository guid>'
   * @description This error message will be displayed when setting the expiry of a repository fails
   */
  FAILED_SET_EXPIRY_REQUEST:
    'PC-005: Server error: Failed to set the expiry of a repository. Repository guid: ',

  /**
   * @alias PC-006
   * @memberof PssClientError
   * @summary 'PC-006: Server error: Failed to squash the commit history. Branch guid: <branch guid>'
   * @description This error message will be displayed when squashing commit history fails
   */
  FAILED_SQUASH_COMMIT_HISTORY:
    'PC-006: Server error: Failed to squash the commit history. Branch guid: ',

  /**
   * @alias PC-007
   * @memberof PssClientError
   * @summary 'PC-007: Server error: Failed to fetch a commit. Commit guid: <commit guid>'
   * @description This error message will be displayed when fetching a commit fails
   */
  FAILED_FETCH_COMMIT:
    'PC-007: Server error: Failed to fetch a commit. Commit guid: ',

  /**
   * @alias PC-008
   * @memberof PssClientError
   * @summary 'PC-008: Server error: Failed to create containers.'
   * @description This error message will be displayed when containers creation fails
   */
  FAILED_CONTAINER_CREATION:
    'PC-008: Server error: Failed to create containers. ',

  /**
   * @alias PC-009
   * @memberof PssClientError
   * @summary 'PC-009: Server error: Failed to create a branch.'
   * @description This error message will be displayed when a branch creation fails
   */
  FAILED_BRANCH_CREATION:
    'PC-009: Server error: Failed to create a branch. ',

  // PC-010: Related feature has been deleted (PSS:/assignPolicy)

  /**
   * @alias PC-011
   * @memberof PssClientError
   * @summary 'PC-011: Server error: Failed to commit.
   * @description This error message will be displayed when a commit fails
   */
  FAILED_TO_COMMIT:
    'PC-011: Server error: Failed to commit. ',


  // PC-012: Related feature has been deleted (PSS:/relate)

  /**
   * @alias PC-013
   * @memberof PssClientError
   * @summary 'PC-013: Server error: Failed to share or unshare resources.'
   * @description This error message will be displayed when a share operation fails
   */
  FAILED_SHARE:
    'PC-013: Server error: Failed to share or unshare resources. ',

  /**
  * @alias PC-014
  * @memberof PssClientError
  * @summary 'PC-014: Server error: Failed to get the branches of a repository. Repository guid: <repository guid>'
  * @description This error message will be displayed when getting the branches of a repository fails
  */
  FAILED_GET_ENUMERATE_BRANCHES:
    'PC-014: Server error: Failed to get the branches of a repository. Repository guid: ',

  /**
    * @alias PC-015
    * @memberof PssClientError
    * @summary 'PC-015: Server error: Failed to get the lca.'
    * @description This error message will be displayed when a request to get an lca fails
    */
  FAILED_GET_LCA:
    'PC-015: Server error: Failed to get the lca.',

  /**
   * @alias PC-016
   * @memberof PssClientError
   * @summary 'PC-016: internal error: Failed to commit.
   * @description This error message will be displayed when a commit fails because of an internal error while committing
   */
  FAILED_TO_COMMIT_INTERNAL:
    'PC-016: internal error: Failed to commit.',

  /**
   * @alias PC-017
   * @memberof PssClientError
   * @summary 'PC-013: Server error: Failed to get feature flag from PSS.'
   * @description This error message will be displayed when getting a feature flag fails
   */
  FAILED_TO_GET_FEATURE:
    'PC-017: Server error: Failed to get feature flag from PSS. ',


  /**
   * @alias PC-018
   * @memberof PssClientError
   * @summary 'PC-018: Server error: Failed to get squashed commit range. Branch guid: <branch guid>'
   * @description This error message will be displayed when getting squashed commit range fails
   */
  FAILED_TO_GET_SQUASHED_COMMIT_RANGE:
    'PC-018: Server error: Failed to get squashed commit range. Branch guid: ',

  /**
   * @alias BP-001
   * @memberof BinaryPropertyError
   * @summary 'BP-001: No object key has been provided.
   * @description This error message will be displayed when the workflow requires an object key to be present, but
   *              none has been provided
   */
  BP_NO_OBJECT_KEY_PROVIDED:
    'BP-001: No object key has been provided.',

  /**
   * @alias BP-002
   * @memberof BinaryPropertyError
   * @summary 'BP-002: No DataSource has been provided.
   * @description This error message will be displayed when the workflow requires a DataSource to be present, but
   *              none has been provided
   */
  BP_NO_DATASOURCE_PROVIDED:
    'BP-002: No DataSource has been provided.',

  /**
   * @alias BP-003
   * @memberof BinaryPropertyError
   * @summary 'BP-003: No PSS client has been provided.
   * @description This error message will be displayed when the workflow requires a PSS client to be present, but
   *              none has been provided
   */
  BP_NO_PSS_CLIENT_PROVIDED:
    'BP-003: No PSS client has been provided.',

  /**
   * @alias BP-004
   * @memberof BinaryPropertyError
   * @summary 'BP-004: No workspace has been provided.
   * @description This error message will be displayed when the workflow requires a workspace to be present, but
   *              none has been provided
   */
  BP_NO_WORKSPACE_PROVIDED:
    'BP-004: No workspace has been provided.',

  /**
   * @alias BP-005
   * @memberof BinaryPropertyError
   * @summary 'BP-005: No active branch has been provided.
   * @description This error message will be displayed when the workflow requires an active branch to be present, but
   *              none has been provided
   */
  BP_NO_ACTIVE_BRANCH_PROVIDED:
    'BP-005: No active branch has been provided.',

  /**
   * @alias BP-006
   * @memberof BinaryPropertyError
   * @summary 'BP-006: The BinaryProperty must be uploaded before calling this method.
   * @description This error message will be displayed when a BP method is called which requires the Binary property
   *              to have been uploaded beforehand
   */
  BP_UPLOAD_REQUIRED:
    'BP-006: The BinaryProperty must be uploaded before calling this method.',

  /**
   * @alias BP-007
   * @memberof BinaryPropertyError
   * @summary 'BP-007: Automatic upload failed with error: <error>
   * @description This error message will be displayed when an automatic upload (one not explicitly
   *              requested by the user) fails.
   */
  BP_UPLOAD_FAILED_WITH_ERROR:
    'BP-007: Automatic upload failed with error: ',

  /**
   * @alias BP-008
   * @memberof BinaryPropertyError
   * @summary 'BP-008: Cannot upload more than 5GB in a single request.
   * @description This error message will be displayed when a user tries to upload a file larger than 5GB in a
   *              single request, instead of using multipart upload.
   */
  BP_PART_SIZE_EXCEEDED:
    'BP-008: Cannot upload more than 5GB in a single request.',

  /**
   * @alias BP-009
   * @memberof BinaryPropertyError
   * @summary 'BP-009: Request ID is already in use.
   * @description This error message will be displayed when a user tries to start an upload or download request
   *              with an ID that is already used by an in-progress upload or download for that property.
   */
  BP_REQUEST_ID_IN_USE:
    'BP-009: Request ID is already in use.',

  // UNCLASSIFIED / UNKNOWN
  CHILD_WITHOUT_ID_ADDED:                 'A child without an ID cannot be added to a NodeProperty',
  INSERTING_INTO_MODIFY_CHANGESET:        'Tried to add an insert to a ChangeSet that already contains a modify',
  INVALID_STATE_MISSING_REPOSITORY_BY_BRANCH: 'Invalid state - attempting to add a commit node to an unknown ' +
  'repository referenced by branch: '
};

var WORKSPACE_STATE = {
  // No changes have been made.
  MERGING: 'merging',
  // There are pending changes.
  PENDING_CHANGES: 'pending_changes',
  // Pending changes conflict.
  CONFLICTED: 'conflicted',
  // In rebase mode.
  REBASING: 'rebasing'
};

const NATIVE_BINARY_CONSTANTS = {
  /**
   * Native Binary Property States.
   * @enum {NATIVE_BINARY_PROPERTY_STATUS}
   * @alias property-common._constants.NATIVE_BINARY_PROPERTY_STATUS
   */
  // This object has the corresponding values for the status enum property of the NativeBinaryProperty.
  STATUS: {
    // Status upon NativeBinaryProperty creation.
    NEW: 0,
    // Status after upload begins.
    UPLOADING: 1,
    // Status after upload completes.
    UPLOADED: 2,
    // Status if the upload fails.
    UPLOAD_FAILED: 3,
    // Status if the upload is cancelled.
    CANCELLED: 4
  },
  DEFAULT_CONFIG: {
    MULTIPART_CHUNK_SIZE: 5242880,
    MULTIPART_THRESHOLD: 5242880,
    S3_DOWNLOAD_TIMEOUT: 10000,
    S3_UPLOAD_TIMEOUT: 0, // Infinite
    S3_UPLOAD_RESPONSE_TIMEOUT: 10000
  }
};

const CONNECTIVITY_RETRYABLE_ERRORS = {
  ESOCKETTIMEDOUT: 'ESOCKETTIMEDOUT',
  ECONNRESET: 'ECONNRESET',
  ECONNREFUSED: 'ECONNREFUSED',
  ETIMEDOUT: 'ETIMEDOUT',
  SOCKET_HANG_UP: 'socket hang up',
  WEBSOCKET_ERROR: 'websocket error',
  TRANSPORT_CLOSE: 'transport close',
  REQUEST_ABORTED: 'The request has been aborted',
  RECONNECTION_IN_PROCESS: 'Reconnection in process',
  UNAVAILABLE_PSS_INSTANCE: 'The PSS instance for this branch is temporarily unavailable',
  CS_UNAVAILABLE: 'Collaboration service temporarily unavailable'
};

const DETACHED_HEAD = 'DETACHED HEAD';

module.exports = {
  'CONNECTIVITY_RETRYABLE_ERRORS': CONNECTIVITY_RETRYABLE_ERRORS,
  'NATIVE_BINARY_CONSTANTS': NATIVE_BINARY_CONSTANTS,
  'WORKSPACE_STATE': WORKSPACE_STATE,
  'MSG': Object.assign(MSG, VALIDATOR_MSG),
  'PROPERTY_PATH_DELIMITER': '.',
  'DETACHED_HEAD': DETACHED_HEAD
};
