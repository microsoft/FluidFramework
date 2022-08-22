/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

/**
 * Error messages for the Schema Validator
 */
const SchemaValidatorError = {
    /**
     * methods: PropertyFactory.register
     * The context ‘set’ is only valid for properties that are instances of NamedProperties. If you want to
     * use a context of ‘set’, make sure your template includes:
     * Inherits: ‘NamedProperty’
     * Or
     * Inherits: [‘NamedProperty’, …]
     */
    SET_ONLY_NAMED_PROPS:
        'SV-001: Only properties that inherit from NamedProperty can have a context of "set". typeid: ',

    /**
     * You updated an existing template but the change to the version number was not as expected.
     * Make sure you updated your version number correctly. You may have violated one of the following rules:
     * - Adding one or more template attributes is a MINOR change.
     * - Removing one or more template attributes is a MAJOR change.
     */
    CHANGE_LEVEL_TOO_LOW_1:
        "SV-002: Template mutation requires a higher version change level: ",

    /**
     * methods: PropertyFactory.register
     * The template version number is not valid. A valid version number should look like: ‘1.0.0’
     */
    INVALID_VERSION_1:
        "SV-003: Invalid template version in 'typeid' attribute: ",

    /**
     * methods: PropertyFactory.register
     * Your property template should include a typeid attribute.
     * @example
     *```json
     * {
     *  "typeid": "my.example:point2d-1.0.0",
     *  "properties": [
     *    {"id": "x", "typeid": "Float64"},
     *    {"id": "y", "typeid": "Float64"}
     *  ]
     *}
     *```
     */
    MISSING_TYPE_ID:
        "SV-004: Template is missing the mandatory 'typeid' attribute. This is not a valid template: ",

    /**
     * methods: PropertyFactory.register
     * Typeid should contain a template version number.
     * @example
     * “typeid: my.example:point2d-1.0.0”
     */
    MISSING_VERSION:
        "SV-005: Missing template version in 'typeid' attribute: ",

    /**
     * methods: PropertyFactory.register
     * The template you are using is different from the previous version and you did not update the version number.
     * If any changes were made to the template, you should update the version number to a higher number.
     * - Major change: removing one or more attribute (e.g. 1.0.0 -\> 2.0.0)
     * - Minor change: adding one or more attribute (e.g. 1.0.0 -\> 1.1.0)
     * - Patch: template description changes (e.g. 1.0.0 -\> 1.0.1)
     */
    MODIFIED_TEMPLATE_1:
        "SV-006: Template has changed at path: ",

    /**
     * methods: PropertyFactory.register
     * When changing your template, you need to increase its version number. For example, if the previous version
     * number was 1.0.0, it should increase to 1.0.1 for a patch (if the template description has changed),
     * to 1.1.0 for a minor change (if you added one or more attributes) or to 2.0.0 for a major change (if you
     * removed one or more attributes).
     */
    MODIFIED_TEMPLATE_SAME_VERSION_1:
        "SV-007: Template has changed but its version was not increased. Path: ",

    /**
     * methods: PropertyFactory.register
     * PropertyFactory.register requires a template as a parameter.
     */
    NO_TEMPLATE:
        "SV-008: Template cannot be null or undefined.",

    /**
     * methods: PropertyFactory.register
     * When updating a template’s version number, the version number can only increase, never decrease.
     */
    VERSION_REGRESSION_1:
        "SV-009: New template version is older than the previously registered version: ",

    /**
     * Your template contains a typeid that is not a string.
     */
    TYPEID_MUST_BE_STRING:
        "SV-010: typeid must be a string. This is not valid: ",

    /**
     * INTERNAL ERROR - If you encounter this error, please contact the development team.
     * The TemplateValidator constructor should have in its parameters param.inheritsFrom and params.hasSchema.
     * Neither of them can be undefined.
     */
    MISSING_INHERITSFROM_OR_HASSCHEMA:
        "SV-011: Internal error: TemplateValidator constructor missing one of inheritsFrom or hasSchema function",

    /**
     * Your template has an invalid key for the kind of map it is.
     */
    KEY_MUST_BE_TYPEID:
        "SV-012: A key of a typeid key map must be a valid typeids. Key: ",

    /**
     * Your template has an invalid contextKeyType parameter.
     */
    INVALID_OPTION_NONE_CONSTANTS:
        "SV-013: A map with typeids as keys must be constant",

    /**
     * You tried to use draft as a versoin when it is not enabled.
     */
    DRAFT_AS_VERSION_TYPEID:
        "SV-014: By default, draft is not a valid version for a typeId. Set allowDraft to true to support this.",
};

const TypeidHelperError = {
    /**
    * INTERNAL ERROR - If you encounter this error, please contact the development team.
    */
    TYPEID_NOT_DEFINED: "TH-001: extractVersion requires a typeid parameter",
};

const PropertyError = {
    TYPEID_NOT_NATIVE: "TYPEID_NOT_NATIVE",
    /**
     * methods: ArrayProperty.length.set, StringProperty.length.set
     * Cannot directly set the array.length or string.length. This is a read-only property.
     */
    MODIFY_READ_ONLY: "PR-001: Trying to modify read only property value (array.length).",

    /**
     * methods: Property.getRelativePath
     * There is no path between the property and the ancestor you passed in to .getRelativePath.
     */
    NO_PATH_BETWEEN: "PR-002: No path between ",

    /**
     * methods: Property.applyChangeSet
     * One of the paths included in your changeSet is not valid for this property.
     * Check that the modifications in the changeSet match the structure of the template.
     */
    INVALID_PATH: "PR-003: Invalid path in ChangeSet: ",

    /**
     * methods: NodeProperty.insert
     * The property you inserted into a NodeProperty has a parent.
     * If your property has a parent, changing the property’s id will break the parent.
     * Make the change to the parent first.
     */
    ID_CHANGE_FOR_PROPERTY_WITH_PARENT: "PR-004: Cannot change the ID of a property that has a parent. Could not change id: ",

    /**
     * methods: Property.resolvePath
     * Part of the path entered to Property.resolvePath was not valid.
     */
    INVALID_PATH_TOKEN: "PR-005: ResolvePath error: accessed a child via an invalid path syntax: ",

    /**
     * methods: MapProperty.insert, NodeProperty.insert, ReferenceMapProperty.insert, Workspace.insert,
     *  SetProperty.insert
     * Your map, set or nodeproperty already contains an entry under in_key.
     */
    PROPERTY_ALREADY_EXISTS: "PR-006: The property already exists in this collection: ",

    /**
     * methods: MapProperty.applyChangeset, NodeProperty.applyChangeset, SetProperty.applyChangeset
     * The changeset you applied contains properties that have already been inserted.
     * Check the ‘insert’ fields in your changeSet for properties that might already exist.
     */
    INSERTED_EXISTING_ENTRY: "PR-007: Inserted an already existing entry: ",

    /**
     * methods: MapProperty.remove, SetProperty.remove
     * Tried to remove an entry that does not exist.
     * This can be caused indirectly by deserialize / applyChangeset methods.
     * One of the ‘remove’ fields in your changeSet must contain a property that does not exist.
     */
    REMOVED_NON_EXISTING_ENTRY: "PR-008: Trying to remove a non-existing entry: ",

    /**
     * methods: MapProperty.applyChangeset, NodeProperty.applyChangeset, SetProperty.applyChangeset
     * One of the key you are trying to modify in your changeSet does not exist.
     * One of the ‘modify’ fields in your changeSet refers to a property that does not exist.
     */
    MODIFY_NON_EXISTING_ENTRY: "PR-009: Trying to modify a not existing entry: ",

    /**
     * methods: MapProperty.insert, MapProperty.set, SetProperty.insert, NodeProperty.insert
     * The value you are trying to insert in your map property, set property or node property has a parent.
     * You cannot insert a property that has a parent.
     */
    INSERTED_ENTRY_WITH_PARENT: "PR-010: Trying to insert into a collection a property that already has " +
        "a parent.",

    /**
     * methods: Property.resolvePath, Workspace.resolvePath
     * Paths should not contain empty sections such as ‘..’, ‘//’ or ‘[], etc.
     * Sections in the path are delimited by ‘.’ ‘[ ]’, ‘/’ .
     * There should always be a path between any two delimiters.
     */
    EMPTY_TOKEN: "PR-011: ResolvePath error: Encountered empty token in path: ",

    /**
     * methods: Property.resolvePath, Workspace.resolvePath
     * Paths should not contain quotes except at the beginning and end of the path.
     * For example: resolvePath('my"path.nested".other') is not valid because the first quote is in front of ‘path’
     * but after the ‘.nested’ which is part of the subsequent path.
     */
    QUOTES_WITHIN_TOKEN: "PR-012: ResolvePath error: Quotes must only be at the start and the " +
        "end of a path. Error in path: ",

    /**
     * methods: Property.resolvePath, Workspace.resolvePath
     * Paths should not end with a ‘.’
     */
    DOT_AT_END: "PR-013: ResolvePath error: Encountered a dot at the end of path: ",

    /**
     * methods: Property.resolvePath, Workspace.resolvePath
     * Paths using square brackets should not contain ‘.’ within those square brackets.
     * If your path contains any dots, these should be escaped e.g. [my\.path] instead of [my.path].
     */
    DOTS_IN_SQUARE_BRACKETS: "PR-014: ResolvePath error: Encountered a dot within a square bracket. " +
        "These have to be escaped. Error in path: ",

    /**
     * methods: Property.resolvePath, Workspace.resolvePath
     * resolvePath error while parsing your string.
     * It encountered an end to a path segment that was not
     * followed by a “.” or a “[“ indicating the beginning of a new segment.
     */
    MISSING_DOT_AT_SEGMENT_START: "PR-015: Missing . or [ at segment start in path: ",

    /**
     * methods: Property.resolvePath, Workspace.resolvePath
     * Closing square bracket not followed by the correct character (., [ or *).
     * For example, this is not valid: resolvePath(myArray[2]nested).
     * This is valid: resolvePath(myArray[2].nested).
     */
    INVALID_END_OF_SQUARE_BRACKETS: "PR-016: ResolvePath error: Square brackets have to be followed either " +
        'by "." or by "[" or by "*". Error in path: ',

    /**
     * methods: Property.resolvePath, Workspace.resolvePath
     * Every opening bracket ([) needs a matching closing bracket (])
     */
    UNCLOSED_BRACKETS: "PR-017: ResolvePath error: Unclosed brackets at the end of path: ",

    /**
     * methods: Property.resolvePath, Workspace.resolvePath
     * Any closing bracket (]) must be preceded by a matching opening bracket ([).
     */
    CLOSING_BRACKET_WITHOUT_OPENING: "PR-018: ResolvePath error: Encountered closing bracket without " +
        "corresponding opening one in path: ",

    /**
     * methods: Property.resolvePath, Workspace.resolvePath
     */
    INVALID_ESCAPE_SEQUENCE: "PR-019: Encountered an invalid escape sequence in path: ",

    /**
     * methods: Property.resolvePath, Workspace.resolvePath
     * A quotation mark at the beginning of a path must have a matching closing quotation mark
     *  at the end of the same path.
     */
    UNCLOSED_QUOTATION_MARKS: "PR-020: ResolvePath error: Encountered unclosed quotation marks in path: ",

    /**
     * methods: SetProperty.insert, SetProperty.set, SetProperty.setValues
     * The property you insert in a setProperty must be an instance of NamedProperty.
     * When creating the property to be inserted, make sure it inherits from NamedProperty.
     * @example
     * #Creating a property that inherits from NamedProperty
     * ```json
     * {
     *   typeid:”my.example:myprop-1.0.0”,
     *   inherits:’NamedProperty’ (or [‘NamedProperty’, …]
     *   ...
     * }
     *```
     */
    CANT_INSERT_NON_NAMED_PROPERTIES: "PR-021: Set can only contain named properties",

    /**
     * methods: NodeProperty.insert, Workspace.insert
     * The property you inserted does not have an id.
     * Unless the property is an instance of NamedProperty, you must pass in an id as the first parameter
     * (and the property second)
     */
    ADDED_CHILD_WITHOUT_ID: "PR-022: Added child without id.",

    /**
     * methods: ArrayProperty.resolvePath
     * Cannot use .resolvePath on a primitive array, only on a Custom type array.
     * For a primitive array, use .getValue instead.
     * For example, instead of MyValueArray.resolvePath(1), use MyValueArray.getValue(1)
     */
    NO_PATHS_FOR_NON_PRIMITIVE_ARRAYS: "PR-023: Path resolution is not supported for primitive type arrays.",

    /**
     * methods: ArrayProperty.resolvePath
     * When using an array index as part of your path, it needs to have a numeric value.
     */
    INVALID_NON_NUMERIC_SEGMENT_IN_PATH: "PR-024: ResolvePath error: Accessed an array via an non numeric index: ",

    /**
     * methods: ArrayProperty.getRelativePath, ArrayProperty.getAbsolutePath
     * INTERNAL ERROR
     * If you encounter this error, please contact the development team.
     * Part of the path you are trying to find points to a non-existing array item.
     */
    GET_PATH_SEGMENT_CALLED_FOR_NON_ENTRY: "PR-025: Internal error: _getPathSegmentForChildNode has been called " +
        "for an entry that is not an entry of the collection. ",

    /**
     * methods:
     * The changeSet passed to .deserialize was not a valid non-normalized changeset.
     */
    NO_NORMALIZED_CHANGESET: "PR-026: deserialize was called with a non-normalized ChangeSet.",

    /**
     * INTERNAL ERROR - If you encounter this error, please contact the development team.
     * One of your changesets contained a NamedProperty without a GUID.
     * This should not happen and should have been validated already.
     */
    MISSING_GUID_IN_NORMALIZED_CHANGESET: "PR-027: Missing GUID in a normalized ChangeSet with named properties",

    /**
     * methods: EnumProperty.getEnumString, EnumProperty.setValue, EnumProperty.setEnumByString,
     * EnumProperty.getEnumString, EnumArrayProperty.getEnumStrings
     * This Enum Property does not have any entry with that value.
     * EnumProperty.getEnumByString -\> the EnumProperty you used to pass this function does not have an entry.
     * EnumProperty.setValue -\> no entry exists for in_value
     * EnumProperty.setEnumByString -\> no entry exists for in_stringId
     * EnumArrayProperty.getEnumString -\> the value found at in_position does not correspond to an entry.
     * EnumArrayProperty.getEnumStrings -\> one of the values found at one of the positions sought does
     * not correspond to an entry.
     */
    UNKNOWN_ENUM: "PR-028: enum value unknown: ",

    /**
     * methods: Property.applyChangeSet
     * Changeset contains an operation that is unknown.
     * Valid operations are insert, modify and remove.
     */
    UNKNOWN_OPERATION: "PR-029: Unknown ChangeSet operation: ",

    /**
     * methods: Workspace.remove, NodeProperty.remove
     * The property you passed to workspace.remove or nodeProperty.remove does not exist.
     * Check that you passed the correct property, and that it has not yet been removed.
     */
    REMOVING_NON_EXISTING_KEY: "PR-033: Trying to remove something that does not exist: ",

    /**
     * methods: Workspace.get, Property.get
     * Workspace.get and Property.get take in an id (string or number) or an array of ids.
     * @example
     * ```typescript
     *.get(‘position’).get(‘x’) or .get([‘property’, ‘x’])
     * ```
     */
    STRING_OR_ARRAY_STRINGS: "PR-034: in_id must be a string, a number or an array of these. This is not valid: ",

    /**
     * methods: Property.serialize
     * Property.serialize only takes in one parameter: an options object. That parameter is optional.
     */
    SERIALIZE_TAKES_OBJECT: "PR-035: Argument of serialize() should be an object.",

    /**
     * ArrayProperty.insert, ArrayProperty.insertRange
     * The in_position (for .insert) or in_offset (for .insertRange) should not be smaller than 0
     * or larger than the length of the array.
     */
    START_OFFSET_INVALID: "PR-036: ArrayProperty: insert range - Start offset is invalid: ",

    // PR-037 removed

    /**
     * ArrayProperty.remove, ArrayProperty.removeRange, ArrayProperty.pop
     * INTERNAL ERROR - If you encounter this error, please contact the development team.
     * The item (or one of the items) you are trying to remove from the array has a parent that is not the array.
     * This should not happen because you should not have been able to insert the item in the array in the first place.
     */
    CANNOT_REMOVE_WITH_DIFFERENT_PARENT: "PR-038: Internal error: Trying to remove from an array a property that " +
        "has not the array as parent.",

    /**
     * methods ArrayProperty.set, ArrayProperty.setRange
     * Your first parameter: in_position (for .set) and in_offset (for .setRange) cannot have a negative value.
     */
    START_OFFSET_NEGATIVE: "PR-039: ArrayProperty: Modify range - Start offset cannot be negative: ",

    /**
     * methods: ArrayProperty.removeRange, ArrayProperty.setRange, ArrayProperty.insertRange,
     *   ArrayProperty.insert, EnumArrayProperty.getEnumStrings
     * The parameter needs to be a number.
     * For .removeRange: in_offset and in_deleteCount
     * For .setRange: in_offset
     * For .insertRange: in_offset
     * For .getEnumStrings: in_offset, in_length
     * For StringProperty.insert: in_position
     */
    NOT_NUMBER: "PR-049: This parameter must be a number: parameter: ",

    /**
     * methods: Property.traverseUp, Property.traverseDown
     * Property.traverseUp and Property.traverseDown take one parameter: a callback function
     */
    CALLBACK_NOT_FCT: "PR-050: traverseUp / traverseDown parameter: in_callback must " +
        "be a function.",

    /**
     * methods: ArrayProperty.insertRange
     * Array.insertRange takes two parameters. The second one (in_array) must be an array.
     * To pass in only one item, either use .insert(index, item)
     * or put that item into an array: .insertRange(index, [item])
     */
    IN_ARRAY_NOT_ARRAY: "PR-051: Parameter error: in_array must be an array for method: ",

    /**
     * methods: EnumProperty.setEnumByString
     * EnumProperty.setEnumByString takes one parameter: a string id. It must be a string.
     */
    STRING_ID_MUST_BE_STRING: "PR-052: EnumProperty.setEnumByString parameter: in_stringId must " +
        "be a string. This is not valid: ",

    /**
     * methods: Integer64Property.setValueHigh
     * Integer64Property.setValueHigh takes one parameter: a number.
     */
    IN_HIGH_MUST_BE_NUMBER: "PR-053: Integer64Property.setValueHigh parameter: in_high must " +
        "be a number. This is not valid: ",

    /**
     * methods: Integer64Property.setValueLow
     * Integer64Property.setValueLow takes one parameter: a number.
     */
    IN_LOW_MUST_BE_NUMBER: "PR-054: Integer64Property.setValueLow parameter: in_low must " +
        "be a number. This is not valid: ",

    /**
     * methods: IntegerProperty.toString
     * Integer64Property.toString takes one optional parameter: a number (in_radix).
     * If no value is passed, will default to 10.
     */
    IN_RADIX_MUST_BE_NUMBER: "PR-055: Integer64Property.toString parameter: in_radix must be a number. This is not valid: ",

    /**
     * methods: IntegerProperty.fromString
     * Integer64Property.fromString takes two parameters. The first parameter (in_string) must be a string.
     * (the second parameter is in_radix, a number. It is optional: defaults to 10).
     */
    IN_STRING_MUST_BE_STRING: "PR-056: Integer64Property.fromString parameter: in_string must " +
        "be a string. This is not valid: ",

    /**
     * methods: Integer64Property.fromString
     * Integer64Property.fromString takes two parameters. The second parameter is optional but if passed,
     * it must be a number between 2 and 36. If not passed, it defaults to 10. (the first parameter is
     * in_string and must be a string).
     */
    IN_RADIX_BETWEEN_2_36: "PR-057: Integer64Property.fromString parameter: in_radix must be a " +
        "number between 2 and 36. This is not valid: ",

    /**
     * methods MapProperty.insert, ReferenceMapProperty.set
     * MapProperty.insert and ReferenceMapProperty.set both take two parameters.
     * The first parameter (in_key) must be a string.
     */
    KEY_NOT_STRING: "PR-058: MapProperty.insert / ReferenceMapProperty.set parameter: " +
        "in_key must be a string. This is not valid: ",

    /**
     * methods: NodeProperty.insert, Workspace.insert
     * he second parameter (in_property) must be a valid property (it must be an instance of BaseProperty).
     */
    NOT_A_PROPERTY: "PR-059: NodeProperty.insert parameter in_property is not a property. " +
        "The property you passed is not a valid property.",

    /**
     * methods: ReferenceProperty.set / setValue, ReferenceMapProperty.insert / set / setValue / setValues,
     * ReferenceArrayProperty.enqueue / push / unshift / insert / insertRange / set / setRange / setValue / setValues
     * The provided value (or values) must be a valid property (an instance of BaseProperty), be undefined or a string (a path).
     */
    PROPERTY_OR_UNDEFINED:
        "PR-060: Parameter for setting a Reference should be a path to a property, a property or undefined. This is not valid: ",

    /**
     * ArrayProperty.insertRange, ArrayProperty.insert, ArrayProperty.push
     * INTERNAL ERROR - If you encounter this error, please contact the development team.
     * The item (or one of the items) you are trying to insert in this array has a parent that is not the array.
     */
    NO_INSERT_WITH_PARENT: "PR-088: Internal error: Trying to insert a property into an array or " +
        "string that already has a parent.",

    /**
     * methods: ArrayProperty.get
     * ArrayProperty.get takes in one parameter: in_position, which can a single position or an array.
     * If it is a single position, it is the numerical position of the item in the array.
     * It must be a number or a string that parses into a number (e.g. '2').
     * If you pass in an array, the first item of the array must be a number or a string that parses into a number.
     * (other items in the array are child paths within the array item at this position).
     * This error happens only when in_position is an array.
     */
    FIRST_ITEM_MUST_BE_NUMBER: "PR-092: The first item in the in_position array must be an array " +
        "position (a number). This is not valid: ",

    /**
     * methods: ArrayProperty.get
     * ArrayProperty.get takes in one parameter: in_position, which can a single position or an array.
     * If it is a single position, it is the numerical position of the item in the array.
     * It must be a number or a string that parses into a number (e.g. '2').
     * If you pass in an array, the first item of the array must be a number or a string that parses into a number
     * (other items in the array are child paths within the array item at this position).
     * This error happens only when in_position is a single position.
     */
    IN_POSITION_MUST_BE_NUMBER: "PR-093: in_position must be a number. This is not valid: ",

    /**
     * methods: Property.getValue
     * Property.getValue takes one parameter: in_id.
     * It can either be a string or an array of strings. It cannot be an empty array.
     */
    CANNOT_BE_EMPTY_ARRAY: "PR-095: Property.getValue parameter: in_id cannot be an empty array.",

    /**
     * methods: EnumArrayProperty.set
     * EnumArrayProperty.set takes two parameters: in_index and in_value.
     * In_value should be a number. setValue cannot be used to set enum by string.
     * Use .setEnumByString instead.
     */
    VALUE_SHOULD_BE_NUMBER: "PR-096: EnumArrayProperty.set parameter: in_value should be " +
        "a number. To set the value of an enum string, use .setEnumByString " +
        "instead.",

    /**
     * methods: EnumArrayProperty.setEnumByString
     * EnumArrayProperty.setEnumByString cannot be use to set enum by number. Use .set instead.
     */
    VALUE_SHOULD_BE_STRING: "PR-098: EnumArrayProperty.setEnumByString parameter: in_value should be " +
        "a string. To set a number, use .set instead.",

    /**
     * methods: ArrayProperty.get
     * In_position or in_offset is either lower than 0 or higher than the length of the array.
     * Make sure that the property you are trying to get from the array exists and that the position is correct.
     */
    GET_OUT_OF_RANGE: "PR-106: Trying to access out of bounds at index: ",

    /**
     * methods: ArrayProperty.setRange, ArrayProperty.set
     * setRange: Either in_offset is lower than zero or in_offset + length of in_array is higher than
     * the length of the array. If you need to add items that were not there before, add those using
     * .push, .insert or .insertRange.
     */
    SET_OUT_OF_BOUNDS: "PR-107: Trying to set out of bounds. ",

    /**
     * methods: ArrayProperty.removeRange, ArrayProperty.remove
     * RemoveRange: Either in_offset is smaller than zero or in_offset + in_deleteCount is higher than
     * the length of the array. Make sure that the properties you are trying to remove exist in that
     * array and that you entered the positions correctly.
     * Remove: in_offset is either smaller than zero or larger than the length of the array.
     */
    REMOVE_OUT_OF_BOUNDS: "PR-110: Trying to remove out of bounds. ",

    /**
     * methods: PropertyFactory.create
     * INTERNAL ERROR - If you encounter this error, please contact the development team.
     * Warning: Something went wrong when creating your property: it did not successfully create
     * the property and then tried to set its value.
     */
    NON_EXISTING_PROPERTY_REPOSITORY_REFERENCE: "PR-111: Internal error: PropertyFactory.create failed to create " +
        "this property.",

    /**
     * methods: Property.setValues
     * One of the path you used in .setValues leads to a property.
     * When passing an object to setValues, make sure that all paths lead to a primitive value.
     */
    SET_VALUES_PATH_PROPERTY: "PR-115: trying to set value to a path leading to a property: ",

    /**
     * methods: Property.setValues
     * One of the path in the object you passed to .setValues does not match the structure of this property.
     */
    SET_VALUES_PATH_INVALID: "PR-116: trying to set value to an invalid path: ",

    /**
     * methods: Property.setValues
     * .setValues takes one parameter: an object containing paths to the values to be changed.
     * It should be an object (or in the case of ArrayProperty, an array)
     */
    SET_VALUES_PARAM_NOT_OBJECT: "PR-117: setValues parameter: in_properties must be an object.",

    /**
     * methods: PropertyFactory.create
     * The array you tried to create had a typeid that was no recognized.
     * It was not a custom type array or one of the following: ‘String’, ‘Int64’, ‘Uint64’ or ‘Bool’.
     */
    UNKNOWN_ARRAY_TYPEID: "PR-118: Unknown typeid in array: ",

    /**
     * methods: MapProperty.insert, MapProperty.set
     * .insert and .set take two parameters. The first one is in_id (or in_key), which is the id under
     * which the property is added. It can only be a string or a number. Only in the case of named
     * property can it be omitted.
     */
    ID_STRING_OR_NUMBER: "PR-119: id should be a string or a number. This is not valid: ",

    /**
     * methods: ValueProperty.deserialize
     * .deserialize takes on parameter: a serialized object. It cannot be undefined.
     */
    DESERIALIZE_EMPTY_CHANGESET: "PR-121: ValueProperty.deserialize() called on an empty changeset",

    /**
     * methods: IntMapProperty.insert, UintMapProperty.insert
     * You tried to insert into a (u)Int64MapProperty or (u)Int64ArrayProperty properties that
     * were not Int64 or UInt64 properties or properties that can be casted to the correct type.
     */
    INT_64_NON_INT64_TYPE: "PR-122: Tried to use (u)Int64MapProperty or (u)Int64ArrayProperty with an invalid type.",

    /**
     * methods: Integer64.toString, Integer64.fromString
     */
    BASE_OUT_OF_RANGE: "PR-123: Base is out of range. Base should be in range [2,36]. This is not valid: ",

    /**
     * methods: Integer64.fromString
     * If your property is an instance of Uint64, you cannot set it to a negative number.
     * Uint64 does not support negative numbers. Use Int64 if you need to support negative numbers.
     */
    CANNOT_UPDATE_TO_NEGATIVE: "PR-124: Cannot update value to negative: ",

    /**
     * methods: Integer64.fromString
     * The string you passed as a first parameter to .fromString contains non-numerical characters.
     */
    CANNOT_PARSE_INVALID_CHARACTERS: "PR-125: Cannot parse. String contains invalid characters: ",

    /**
     * methods: Property constructor
     * INTERNAL ERROR - If you encounter this error, please contact the development team.
     * Something went wrong while the property constructor was creating a property.
     * The parameters it received were not objects.
     */
    PROP_CONSTRUCTOR_EXPECTS_OBJECTS: "PR-126: Internal error: Object expected as parameters to " +
        "BaseProperty constructor",

    /**
     * methods: Property.applyChangeSet
     * One of the ‘modify’ field in your changeset points to an index in the array that does not exist.
     * Check that the changeset you passed to applyChangeSet is valid. If you did not enter the changeSet yourself,
     * this is an internal error and you should contact the development team.
     */
    INDEX_INVALID: "PR-131: modified property - index invalid: ",

    /**
     * methods: Property.isAncestorOf, Property.isDescendantOf
     * Property.isAncestorOf and .isDescendantOf take one parameter: a property. It cannot be undefined.
     */
    MISSING_IN_OTHERPROP: "PR-132: isAncestorOf parameter: in_otherProperty must be specified.",

    /**
     * methods: StringProperty.insert, StringProperty.push
     * StringProperty.insert takes two parameters: in_position and in_value.
     * The second one (in_value) must be a string.
     * StringProperty.push takes only one parameter (in_value), which must be a string.
     */
    IN_VALUE_MUST_BE_STRING: "PR-133: parameter error: in_value must be a string. This is not valid: ",

    /**
     * methods: ValueProperty.getValues
     * You cannot use the method .getValues on value properties. getValues is used to get multiple nested
     * values from a custom property. To get the value of a primitive property, use .getValue instead.
     */
    NO_VALUE_PROPERTY_GETVALUES: "PR-134: Cannot use .getValues on value properties or strings. " +
        "Use .getValue instead.",

    /**
     * methods: Property.setValues, ArrayProperty.insertRange, ArrayProperty.removeRange,
     * ArrayProperty.setRange, EnumArrayProperty.setEnumByString, ArrayProperty.insert, ArrayProperty.set,
     * ArrayProperty.clear
     * If a property is created as a constant, it cannot be changed.
     */
    MODIFICATION_OF_CONSTANT_PROPERTY: "PR-140: Modifications of constants are not allowed.",

    /**
     * methods: ArrayProperty.insert, ArrayProperty.insertRange
     * In a non-primitive array, you can only insert instances of properties. You should use PropertyFactory.create
     * to create an instance of your property before inserting it into the array.
     */
    INSERT_NOT_A_PROP: "PR-141: In an array of properties, you can only insert instances of " +
        "properties. This value is not valid: ",

    /**
     * If a property is a reference, it cannot be changed.
     */
    MODIFICATION_OF_REFERENCED_PROPERTY: "PR-142: Modifications of referenced properties are not allowed.",

    /**
     * methods: Property.getValue
     * Property.getValue(in_ids) is a shortcut for Property.get(in_ids).getValue().
     * Property.get(in_ids) must resolve to a ValueProperty.
     */
    GET_VALUE_NOT_A_VALUE: "PR-160: in_ids does not resolve to a ValueProperty: ",

    /**
     * methods: MapProperty.insert
     * If your map is not a ValueMap, in_property must be an instance of BaseProperty.
     * Use PropertyFactory.create to create an instance of a property.
     */
    NONVALUE_MAP_INSERT_PROP: "PR-161: In a map of properties, you can only insert properties.",

    /**
     * methods: PropertyFactory.create
     * INTERNAL ERROR - If you encounter this error, please contact the development team.
     * This error is thrown while creating a Property, when the actual context
     * ('array', 'map', 'set' or 'single') is different than what was expected.
     */
    CONTEXT_NOT_AS_EXPECTED: "PR-163: Property context is different than expected: ",

    /**
     * methods: Property.deserialize
     * INTERNAL ERROR - If you encounter this error, please contact the development team.
     * This error is thrown by .deserialize but is caused by an invalid changeSet. A serialized ChangeSet for an
     * Integer64Property must be an array of 2 integers: the low and the high values. Since users cannot yet supply
     * their changesets directly, this should not happen.
     */
    INVALID_INT64_CHANGESET: "PR-164: Cannot deserialize invalid change set for Int64 property",

    /**
     * methods: StringProperty.set
     * StringProperty.set takes two parameters: in_index (a number, the index of the string that you wish to change)
     * and in_string (the string you want to insert at that index). To set the value of the whole string, use
     * setValue.
     */
    STRING_SET_NEEDS_INDEX: "PR-165: String.set first parameter should be an index (number). This is not valid: ",

    /**
     * methods: Property.get
     * The token DEREFERENCE_TOKEN should only be used with .get when the in_ids passed to .get is an array.
     * the DEREFERENCE_TOKEN should follow a path to a reference.
     * @example <caption>valid: </caption>
     * myProp.get(['myReference', TOKENS.DEREFERENCE_TOKEN])
     * @example <caption>not valid: </caption>
     * myProp.get('myReference').get(TOKENS.DEREFERENCE_TOKEN)
     */
    NO_GET_DEREFERENCE_ONLY: "PR-166: Cannot use a dereference token only with .get",

    /**
     * methods: StringProperty.setValues
     * You cannot call .setValues on a StringProperty. To set the value of the string, use .setValue
     * instead.
     */
    NO_VALUE_PROPERTY_SETVALUES: "PR-167: setValues is not a valid method for String Properties",

    /**
     * methods: Property.getRelativePath
     * In cases where you have more than one repository reference property pointing to the same repository, finding a path
     * between a properties in different repositories can lead to more than one valid results. In that case, .getRelativePath
     * will return the first valid path it finds. If you want to control how which path is used, you should construct the
     * string path by concatenating the absolute path for the prop in the nested repository and the relative path between your
     * repository reference and the target property.
     */
    MORE_THAN_ONE_PATH: "PR-169: More than one paths exist between ",

    /**
     * methods: Property.getRelativePath
     * getRelativePath takes one parameter: the property from which the path will start. This must be an instance of
     * BaseProperty. The method will return the path from that property to the property on which it was called ('this')
     */
    IN_FROMPROPERTY_MUST_BE_PROPERTY: "PR-170: getRelativePath parameter error: in_fromProperty must be a property",

    /**
     * methods: Property.getRelativePath
     * getRelativePath does not return a path between a property that is inside a child repository to one that is in
     * a parent repository. A path like this could not be used with .resolvePath or be used in a reference property
     * because neither method can go from the root of a referenced repository to a reference property.
     */
    NO_PATH_FROM_CHILD_REPO: "PR-171: cannot get a path from a child repository to a parent repository",

    /**
     * methods: getReferencedWorkspace
     * This repository reference is in read-only mode. Call enableWrite() to access the workspace.
     */
    REPOSITORY_REFERENCE_WORKSPACE_READ_ONLY:
        "PR-173: This repository reference is in read-only mode. Call enableWrite() to access the workspace.",

    /**
     * methods: Property.enableWrite
     * Repository reference is already in writable mode.
     */
    REPOSITORY_REFERENCE_WORKSPACE_EXIST_ALREADY: "PR-174: Repository reference is already in writable mode",

    /**
     * methods: Property.enableWrite
     * Can't enable write on an empty repository reference without at least a repositoryGUID and branchGUID.
     */
    WRITABLE_REPOSITORY_REFERENCE_NEED_GUIDS:
        "PR-176: Can't enable write on an empty repository reference without at least a repositoryGUID and branchGUID",

    /**
     * methods: Property.enableWrite
     * Repository reference failed to automatically commit the new commitGUID.
     */
    WRITABLE_REPOSITORY_AUTO_COMMIT_FAIL: "PR-177: Repository reference failed to automatically commit the new commitGUID",

    /**
     * methods: Property._setFollowBranch
     * An unexpected error occurred while trying to switch a repository reference followBranch property
     */
    WRITABLE_REPOSITORY_SET_FOLLOW_BRANCH_FAILED:
        "PR-178: An unexpected error occurred while trying to switch a repository reference followBranch property to ",

    /**
     * methods: MapProperty.insert, MapProperty.set
     * .insert and .set take two parameters. The first one is in_id (or in_key), which is the id under
     * which the property is added. It can not be an empty string.
     */
    ID_SHOULD_NOT_BE_EMPTY_STRING:
        "PR-179: id should not be an empty string.",

    /**
     * methods: StringProperty.set
     * StringProperty.set: in_character must have a length of 1.
     */
    STRING_SET_ONE_CHAR: "PR-180: String.set, only one character can be set (in_character must have a length of 1).",

    /**
     * methods: EnumArrayProperty.set
     * EnumArrayProperty.set only accepts a string or number as input for in_value
     */
    VALUE_STRING_OR_NUMBER:
        "PR-181: in_value should be a string or a number. This is not valid: ",

    /**
     * methods: ArrayProperty.set
     * The in_value input of ArrayProperty.set should not be an array.
     */
    ARRAY_SET_ONE_ELEMENT:
        "PR-182: in_value should be a single element. This is not valid: ",

    CANT_DIRTY_MISSING_PROPERTY: "PR-183: Can't dirty missing property: ",

    /**
     * methods: MapProperty.insert, MapProperty.set, SetProperty.insert, NodeProperty.insert
     * The property you are trying to insert in your map property, set property or node property is a root.
     */
    INSERTED_ROOT_ENTRY: "PR-184: Trying to insert a root property into a collection.",

    /**
     * methods: MapProperty.insert, MapProperty.set, SetProperty.insert, NodeProperty.insert
     * The property you are trying to insert in your map property, set property or node property is already
     * a parent of the map, set, or node property. You cannot insert this property there or you would create
     * a cycle in your data tree.
     */
    INSERTED_IN_OWN_CHILDREN:
        "PR-185: Trying to insert a property in itself or in one of its children.",

    /**
     * methods: MapProperty.insert, MapProperty.set, SetProperty.insert, NodeProperty.insert
     * The property you are trying to insert (or at least one if its children) in your map property, set
     * property or node property is not covered by the paths of the partial checkout.
     * You cannot insert this property because you would not receive updates for this path after the
     * insertion and you could corrupt your data by doing subsequent modifications.
     */
    INSERTED_OUTSIDE_PATHS:
        "PR-186: Trying to insert a property outside the paths covered by the partial checkout.",

    SHARED_BEFORE_INSERTED: "PR-187: Property must be inserted in the workspace before sharing.",

    CUSTOM_ID_NOT_ALLOWED: "PR-188: The following property does not support custom id: ",
};

const PropertyFactoryError = {

    /**
     * methods: PropertyFactory.create
     * Each property created with PropertyFactory.create should have a unique id. You should make sure your
     * code generates a unique id for each property created, or make your property an instanced of NamedProperties
     * (which are identified by a unique Urn)
     */
    OVERWRITING_ID: "PF-001: Id already exists: ",

    /**
     * methods: PropertyFactory.register
     * Warning: The template passed into the register method does not match the expected structure for this type.
     */
    TEMPLATE_MISMATCH: "PF-004: Template structures do not match for typeid: ",

    /**
     * methods: PropertyFactory.register
     * The typeid assigned to your property template should include a version.
     * E.g. 1.0.0 - an example of a valid typeid: “my.example:point2d-1.0.0”
     */
    UNVERSIONED_TEMPLATE: "PF-005: Templates must be versioned.",

    /**
     * INTERNAL ERROR - If you encounter this error, please contact the development team.
     * Error occurs when a template has been inserted into the branch without a SEMVER version.
     * This can occur when registering templates through the commit REST interface. At this point
     * the data is corrupted and should be reported to the development team
     */
    UNVERSIONED_REMOTE_TEMPLATE: "PF-006: Internal error: Remote template is not versioned.",

    /**
     * methods: PropertyFactory.create
     * RepositoryReferences are not yet fully implemented. They will be soon.
     */
    REPOSITORY_REF_NOT_FULLY_IMPLEMENTED: "PF-007: Repository references are not yet fully implemented and may not " +
        "yet be used",

    /**
     * methods: PropertyFactory.create
     * When using ‘inherits’ in your property template, it must be a string or an array.
     * @example
     * ```json
     * {
     * typeid:'my.example:point2d-1.0.0',
     * inherits: ‘ another property’
     * }
     * ```
     * or :
     * ```json
     * {
     *   typeid:'my.example:point2d-1.0.0',
     * inherits: [‘another property’, ‘property2’]
     * }
     * ```
     */
    INHERITS_ARRAY_OR_STRING: "PF-008: Internal error: Inherits must be an Array or a String. This is not valid: ",

    /**
     * methods: PropertyFactory.create
     * Context can be ‘array, ‘set’, ‘map’, ‘enum’ or ‘single’. If not specified, will default to ‘single’.
     */
    UNKNOWN_CONTEXT_SPECIFIED: "PF-009: Unknown context specified: ",

    /**
     * methods: PropertyFactory.create
     * The property you entered into PropertyFactory.create has a typeid that is not registered.
     * Make sure you register the template before creating an instance of that property. This could
     * also be caused by a failure in the registration process.
     */
    UNKNOWN_TYPEID_SPECIFIED: "PF-010: Unknown typeid specified: ",

    /**
     * methods: PropertyFactory.getAllParentsForTemplate, PropertyFactory.inheritsFrom
     * Cannot find a template for this typeid. Make sure you registered the template and that the typeid
     * is entered correctly. This can be an error with the template you are trying to insert or one of the
     * templates it inherits from.
     */
    NON_EXISTING_TYPEID: "PF-011: Missing template for the property you entered or one of the templates it inherits from: ",

    /**
     * methods: PropertyFactory.register
     * The property you passed in to .register is a primitive property. These do not need to be registered with a
     * typeid. It can be created without being registered. E.g. PropertyFactory.create(‘String’)
     */
    CANNOT_REGISTER_PRIMITIVE: "PF-012: Cannot register a primitive property with the public `register` " +
        "function typeid = ",

    /**
     * methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
     * Your template’s id field must be a string.
     */
    DEFINITION_ID_MUST_BE_STRING: 'PF-024: Value "id" of a definition should be a string. "',

    /**
     * methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
     * The "$ref" keyword is used to reference a schema, and provides the ability to validate recursive structures
     * through self-reference.
     * An object schema with a "$ref" property MUST be interpreted as a "$ref" reference. The value of the "$ref"
     * property MUST be a URI Reference (a string)
     */
    REF_SHOULD_BE_STRING: 'PF-025: Value of "$ref" should be a string. "',

    /**
     * methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
     * The identifier passed to $ref does not point to any schema.
     */
    COULD_NOT_FIND_REFERENCE: 'PF-026: Couldn\'t find reference "',

    /**
     * methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
     * The identifier passed to $ref does not point to an object.
     */
    REFERENCED_DEFINITION_SHOULD_BE_OBJECT: 'PF-027: A referenced definition should be an object. "',

    /**
     * methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
     * In a JSON schema, the properties field must be an object.
     */
    PROPERTIES_SHOULD_BE_OBJECT: 'PF-028: The "properties" value should be an object. "',

    /**
     * methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
     * oneOf’s value MUST be a non-empty array. Each item of the array MUST be a valid JSON Schema.
     * An instance validates successfully against this keyword if it validates successfully against exactly one
     * schema defined by this keyword's value.
     */
    ONE_OF_ONLY_FOR_ARRAYS_OF_ONE_OBJECT: 'PF-029: The "oneOf" object is supported only for arrays of one object.',

    /**
     * methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
     * oneOf’s value MUST be a non-empty array. Each item of the array MUST be a valid JSON Schema.
     */
    ONE_OF_SHOULD_CONTAIN_OBJECTS: 'PF-030: The "oneOf" array should contain objects. "',

    /**
     * methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
     * This keyword's value MUST be a non-empty array. Each item of the array MUST be a valid JSON Schema.
     */
    ALL_OF_SHOULD_BE_ARRAY: 'PF-031: The "allOf" object should be an array.',

    /**
     * methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
     * This keyword's value MUST be a non-empty array. Each item of the array MUST be a valid JSON Schema.
     */
    ALL_OF_SHOULD_CONTAIN_OBJECTS: 'PF-032: The "allOf" array should contain objects. Element ',

    /**
     * methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
     * Your schema definition contains infinite recursion. For example, if your definition ‘a’ refers to definition
     * ‘b’ as being one of its children and ‘b’ refers to ‘a’ as one of its children.
     */
    INFINITE_RECURSION: "PF-033: Infinite recursion detected in path: ",

    /**
     * methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
     * One part of your template object might contain something that is not of type ‘object’, ‘string’,
     * ‘number’ or ‘integer’.
     */
    UNSUPPORTED_VALUE_TYPE: 'PF-034: Unsupported value of field "type": ',

    REQUIRED_PROPERTY_NAME_NOT_STRING: 'PF-035: Required property name should be a string, "',

    /**
     * This property is required but it is not listed in the properties field.
     */
    PROPERTY_NAME_DOES_NOT_MATCH: "PF-036: Required property name does not match any property in object: ",

    /**
     * The ‘inherits’ field in your template object should be a string or an array of strings.
     */
    INHERITS_SHOULD_BE_STRING: 'PF-037: The "inherits" object should be a string or an array of strings. This is not valid: ',

    /**
     * The ‘context’ field in your template should be a string.
     */
    CONTEXT_SHOULD_BE_STRING: 'PF-038: The "context" value should be a string. This is not valid: ',

    /**
     * methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
     * Warning: If you have a ‘length’ field in your template and the context is not set to ‘array’,
     * ‘length’ will be ignored.
     */
    IGNORING_LENGTH_NOT_ARRAY: 'PF-039: ignoring "length" value since "context" is not "array".',

    /**
     * methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
     * In your template, the field ‘length’ should be a number.
     */
    LENGTH_SHOULD_BE_NUMBER: 'PF-040: The "length" value should be a number. This is not valid: ',

    /**
     * methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
     * Your template contains more than one definition field for this field.
     */
    DUPLICATE_DEFINITION: "PF-041: Duplicate definition for ",

    /**
     * methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
     * The field ‘id’ is missing from your JSON schema.
     */
    FIELD_ID_IS_REQUIRED: 'PF-042: Field "id" is required.',

    /**
     * methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
     * You need a ‘typeid’ field in your template schema.
     * @example
     * ```json
     * {
     *   ‘typeid’: 'autodesk.test:set.set-1.0.0',
     *   ‘properties’: [
     *     {‘typeid’: 'String',
     *      ‘context’: 'set',
     *      ‘id’: 'DummySet',
     *      ‘inherits’:['NamedProperty']}
     *   ]
     * }
     *```
     */
    FIELD_TYPEID_IS_REQUIRED: 'PF-043: Field "typeid" is required. It is the "typeid" of the resulting ' +
        "PropertySets Template.",

    /**
     * methods: PropertyFactory.register
     * The ‘length’ field in your template must be a number.
     */
    LENGTH_MUST_BE_NUMBER: "PF-045: length must be a number. This is not valid: ",

    /**
     * methods: PropertyFactory.register
     * Each entry in your enum property array must have an id.
     * @example
     * ```json
     * {
     *   "typeid": "Adsk.Core:Units.Metric-1.0.0",
     *   "inherits": "Enum",
     *   "annotation": { "description": "The metric units" },
     *   "properties": [
     *     { "id": "m" , "value": 1, "annotation": { "description": "meter" }},
     *     { "id": "cm", "value": 2, "annotation": { "description": "centimeter" }},
     *     { "id": "mm", "value": 3, "annotation": { "description": "millimeter" }}
     *   ]
     * }
     * ```
     */
    ENUM_TYPEID_MISSING: "PF-046: Enum: typeid missing",

    /**
     * methods: PropertyTemplate constructor
     * Each entry in your enum property must have a value that is a number.
     * @example
     * ```json
     * {
     *   "typeid": "Adsk.Core:Units.Metric-1.0.0",
     *   "inherits": "Enum",
     *   "annotation": { "description": "The metric units" },
     *   "properties": [
     *     { "id": "m" , "value": 1, "annotation": { "description": "meter" }},
     *     { "id": "cm", "value": 2, "annotation": { "description": "centimeter" }},
     *     { "id": "mm", "value": 3, "annotation": { "description": "millimeter" }}
     *   ]
     * }
     * ```
     */
    ENUM_VALUE_NOT_NUMBER: "PF-047: Enum: value must be a number. This is not valid: ",

    /**
     * methods: PropertyTemplate.getVersion
     * INTERNAL ERROR - If you encounter this error, please contact the development team.
     * Warning: you that the template on which you are calling the .getVersion method is not versioned.
     * The method will return undefined. This should not happen as we now validate that all templates are
     * versioned when registering them.
     */
    TEMPLATE_NOT_VERSIONED: "PF-048: Internal error: Template is not versioned.",

    /**
     * methods: PropertyFactory.register
     * Warning: Template already exists. The incoming template MUST match what is currently registered.
     * If they do not match, an error will be thrown letting you know that the templates are incompatible.
     * See error PF-004
     */
    REGISTERING_EXISTING_TYPEID: "PF-049: Registering a typeid that already exists typeid = ",

    /**
     * methods: PropertyFactory.register
     * There were errors validating the template you are trying to register. See detailed errors attached.
     */
    FAILED_TO_REGISTER: "PF-050: Failed to register typeid = ",

    /**
     * methods: PropertyFactory.convertToTemplates, PropertyFactory.registerFrom
     * So far, these methods can only convert from a JSON schema. The first parameter (in_fromType)
     * must be ‘JSONSchema’.
     */
    UNKNOWN_TYPE: "PF-051: Unknown type: ",

    /**
     * methods: PropertyTemplate.serializeCanonical
     * INTERNAL ERROR - If you encounter this error, please contact the development team.
     * This error shouldn’t occur. The underlying private function that is called is a close cousin of the
     * deepCopy function which could have an arbitrary target specified. This doesn’t happen in the case of
     * the serializeCanonical.
     */
    INVALID_TARGET_PROPERTY_TEMPLATE: "PF-053 Copying into incompatible target property template: ",

    /**
     * methods: PropertyFactory.loadTemplate
     * In order for the PropertyFactory to retrieve templates from remote store it has to have at least one store
     * interface to interact with. This is accomplished by making the PropertyFactory.addStore call.
     */
    MISSING_CASE_IN_TEMPLATE_SERIALIZATION: "PF-054 Missing case in template canonical serialization: ",

    OVERRIDDING_INHERITED_TYPES: "PF-057: Overriding of inherited typed properties is not allowed: ",

    /**
     * methods: PropertyFactory.register
     * PropertyFactory.register takes one parameter, which can be a string (typeid), a json object (a template) or an
     * array of these.
     */
    ATTEMPT_TO_REGISTER_WITH_BAD_ARGUMENT: "PF-058: register only accepts strings, json structures or array of those",

    /**
     * methods: PropertyFactory.resolve
     * No store has been added yet to the PropertyFactory. A template store has to be instantiated then added with
     * propertyFactory.addStore()
     */
    NO_STORE_HAS_BEEN_INITIALIZED_YET: "PF-059: No store has been initialized yet to the PropertyFactory.",

    /**
     * methods: PropertyFactory.resolve
     * resolve cannot be called until previous call to resolve has completed.
     */
    DEPENDENCIES_RESOLUTION_IN_PROGRESS: "PF-060: Dependencies resolution already in progress",

    /**
     * methods: PropertyFactory.create
     * Typed values must contain properties that inherit from the base type.
     */
    TYPED_VALUES_MUST_DERIVE_FROM_BASE_TYPE: "PF-061: Typed values must be derived from base type: ",

    /**
     * methods: PropertyFactory.create
     * The field ‘value’ is missing from your JSON schema.
     */
    FIELD_VALUE_IS_REQUIRED: 'PF-062: Field "value" is required: ',

    /**
     * methods: PropertyFactory.register
     * Warning: The structure of the template passed into the register method does not match the structure of a remote template registered under the same typeid.
     */
    REMOTE_TEMPLATE_MISMATCH: "PF-064: Template structures do not match an already registered remote template with the same typeid for typeid: ",

    /**
     * methods: PropertyFactory.initializeSchemaStore
     * Warning: The initializeSchemaStore method must be provided with an options object
     * containing a getBearerToken function and the url to the ForgeSchemaService.
     */
    MISSING_FSS_INIT_OPTIONS: "PF-065: The initializeSchemaStore method must be provided with an options object " +
        "containing a getBearerToken function and the url to the ForgeSchemaService.",

    /**
     * methods: PropertyFactory.initializeSchemaStore
     * Warning: The initializeSchemaStore method url option must be passed a valid base url.
     */
    FSS_BASEURL_WRONG: "PF-066: The initializeSchemaStore method url option must be passed a valid base url.",

    /**
     * methods: PropertyFactory.create
     * Overridden properties must have same context as the base type.
     */
    OVERRIDEN_PROP_MUST_HAVE_SAME_CONTEXT_AS_BASE_TYPE: "PF-067: Overridden properties must have same context as the base type: ",

    /**
     * methods: PropertyFactory.create
     * Primitive types does not support typedValues.
     */
    TYPED_VALUES_FOR_PRIMITIVES_NOT_SUPPORTED: "PF-068: Primitive types does not support typedValues: ",

    /**
     * methods: PropertyFactory.inheritsFrom
     */
    TYPEID_IS_NOT_ENUM: "PF-069: The provided type does not inherit from Enum: ",
};

const RepositoryError = {

    /**
     * methods: NodeProperty.remove
     * The property you tried to remove does not exist (its id was not found) - check that the id is correct
     * and that the property has not already been removed.
     */
    REMOVING_NON_EXISTING_ID: "RE-001: Removing non existing id: ",

    /**
     * methods: BranchNode.isEqual, CommitNode.isEqual
     * In_node parameter is required. In_node is the branch or commit you wish to compare to ‘this’ branch/commit
     * node to check for equality.
     */
    MISSING_IN_NODE_PARAM: "RE-004: BranchNode.isEqual / CommitNode.isEqual missing " +
        "parameter: in_node",

    /**
     * methods: BranchNode, CommitNode, Workspace.commit
     * The BranchNode or CommitNode constructor was called without in_params.guid or we tried to send a commit
     * without a guid.
     */
    MISSING_GUID_FIELD: "RE-006: Missing guid field",

    /**
     * INTERNAL ERROR - If you encounter this error, please contact the development team.
     */
    LOCAL_AND_REMOTE_BRANCH_NOT_EQUAL: "RE-007: Remote branch urn must equal the local branch urn",

    /**
     * INTERNAL ERROR - If you encounter this error, please contact the development team.
     */
    BRANCH_NOT_REMOTE_BRANCH: "RE-008: Branch is not a remote branch ",

    /**
     * now rebasing to \<commit guid\>'
     * INTERNAL ERROR - If you encounter this error, please contact the development team.
     * A commit node already rebased has been rebased again.
     */
    COMMIT_ALREADY_REBASED: "RE-009: Should not rebase commit more than once: ",

    /**
     * INTERNAL ERROR - If you encounter this error, please contact the development team.
     * A new commit has been received from the server but was not expected. See specific message for more details.
     */
    UNEXPECTED_COMMIT_FROM_SERVER: "RE-010: Adding commit to remote branch ",

    /**
     * This error will occur if the repository associated to a branch hasn't been found.
     */
    REPOSITORY_NOT_FOUND: "RE-011: Internal Error: The repository hasn't been found.",

    /**
     * This error will occur if the branch within a repository hasn't been found.
     */
    BRANCH_NOT_FOUND: "RE-012: The branch hasn't been found.",
};

const ServerError = {

    /**
     * INTERNAL ERROR - If you encounter this error, please contact the development team.
     */
    URL_MUST_BE_STRING: "SE-001: Url must be a string.",

    /**
     * INTERNAL ERROR - If you encounter this error, please contact the development team.
     */
    PORT_MUST_BE_NUMBER: "SE-002: Port must be a number",
};

const ChangeSetError = {

    /**
     * Context can only be ‘single’, ‘array’, ‘map’, ‘set’ or ‘enum’. All other values are invalid.
     */
    UNKNOWN_CONTEXT: "CS-001: Unknown context: ",

    /**
     * INTERNAL ERROR - If you encounter this error, please contact the development team.
     */
    ALREADY_EXISTING_ENTRY: "CS-003: Internal error: Added an already existing entry: ",

    /**
     * INTERNAL ERROR - If you encounter this error, please contact the development team.
     * The ChangeSet did not include an oldValue member which is computed when making the ChangeSet reversible.
     */
    OLD_VALUE_NOT_FOUND: "CS-004: Internal error: Old value not found while inverting a change set. The change set is probably not reversible.",

    CONTEXT_VALIDATION_IN_PROGRESS: "CONTEXT_VALIDATION_IN_PROGRESS",

    NOT_A_VALID_CONTEXT: "NOT_A_VALID_CONTEXT",

    MISSING_PRE_POST_CALLBACK: "Missing callback. Either pre- or postcallback must be provided.",
};

const UtilsError = {
    INVALID_PATH_IN_REFERENCE: "UT-001: References may only contain absolute repository references " +
        "or empty strings",

    /**
     * methods: Utils.traverseChangesetRecursively
     * Your changeset contains an operator other than MODIFY, INSERT or REMOVE. If you created the changeset youserlf,
     * check that you only use valid operators. Otherwise, this is an internal error. Please contact the development team.
     */
    UNKNOWN_OPERATOR: "UT-004: ArrayChangeSetIterator: unknown operator ",

    /**
     * INTERNAL ERROR - If you encounter this error, please contact the development team.
     */
    NON_PRIMITIVE_ARRAY_NO_TYPEID: "UT-005: Found a non primitive type array without typeids. " +
        "This should never happen.",

    /**
     * Filtering paths within arrays are not supported.
     */
    FILTER_PATH_WITHIN_ARRAY: "UT-006: Filtering paths within arrays are not supported",

    /**
     * INTERNAL ERROR - If you encounter this error, please contact the development team.
     *              See specific message for more details.
     */
    ASSERTION_FAILED: "UT-007: INTERNAL ERROR. Failed assertion. ",

    /**
     * You used a deprecated function. It will likely be removed in the next major version.
     *              See the custom information if provided.
     */
    DEPRECATED_FUNCTION: "UT-008: Deprecated function %s.",

    /**
     * You used a deprecated function parameter. It will likely be removed in the next major version.
     *              See the custom information if provided.
     */
    DEPRECATED_PARAMETER: "UT-009: Deprecated function parameter %s of %s.",

    /**
     * You used an experimental feature. It will likely changed in future releases.
     *              See the custom information if provided.
     */
    EXPERIMENTAL_FEATURE: "UT-010: Feature %s is experimental and subject to future changes.",
};

const PssClientError = {
    /**
     * This error message will be displayed when a repository creation fails
     */
    FAILED_REPOSITORY_CREATION:
        "PC-001: Server error: Failed to create a repository. ",

    /**
     * This error message will be displayed when the deletion of a repository fails
     */
    FAILED_REPOSITORY_DELETION:
        "PC-002: Server error: Failed to delete a repository. Repository guid: ",

    /**
     * This error message will be displayed when the undelete operation of a repository fails
     */
    FAILED_REPOSITORY_UNDELETION:
        "PC-003: Server error: Failed to undelete a repository. Repository guid: ",

    /**
     * This error message will be displayed when getting the expiry of a repository fails
     */
    FAILED_GET_EXPIRY_REQUEST:
        "PC-004: Server error: Failed to get the expiry of a repository. Repository guid: ",

    /**
     * This error message will be displayed when setting the expiry of a repository fails
     */
    FAILED_SET_EXPIRY_REQUEST:
        "PC-005: Server error: Failed to set the expiry of a repository. Repository guid: ",

    /**
     * This error message will be displayed when squashing commit history fails
     */
    FAILED_SQUASH_COMMIT_HISTORY: "PC-006: Server error: Failed to squash the commit history. Branch guid: ",

    /**
     * This error message will be displayed when fetching a commit fails
     */
    FAILED_FETCH_COMMIT: "PC-007: Server error: Failed to fetch a commit. Commit guid: ",

    /**
     * This error message will be displayed when containers creation fails
     */
    FAILED_CONTAINER_CREATION: "PC-008: Server error: Failed to create containers. ",

    /**
     * This error message will be displayed when a branch creation fails
     */
    FAILED_BRANCH_CREATION: "PC-009: Server error: Failed to create a branch. ",

    /**
     * This error message will be displayed when a commit fails
     */
    FAILED_TO_COMMIT: "PC-011: Server error: Failed to commit. ",

    /**
     * This error message will be displayed when a share operation fails
     */
    FAILED_SHARE: "PC-013: Server error: Failed to share or unshare resources. ",

    /**
    * This error message will be displayed when getting the branches of a repository fails
    */
    FAILED_GET_ENUMERATE_BRANCHES: "PC-014: Server error: Failed to get the branches of a repository. Repository guid: ",

    /**
      * This error message will be displayed when a request to get an lca fails
      */
    FAILED_GET_LCA: "PC-015: Server error: Failed to get the lca.",

    /**
     * This error message will be displayed when a commit fails because of an internal error while committing
     */
    FAILED_TO_COMMIT_INTERNAL: "PC-016: internal error: Failed to commit.",

    /**
     * This error message will be displayed when getting a feature flag fails
     */
    FAILED_TO_GET_FEATURE: "PC-017: Server error: Failed to get feature flag from PSS. ",

    /**
     * This error message will be displayed when getting squashed commit range fails
     */
    FAILED_TO_GET_SQUASHED_COMMIT_RANGE: "PC-018: Server error: Failed to get squashed commit range. Branch guid: ",
};

const PROPERTY_PATH_DELIMITER = ".";
const MESSAGE_CONSTANTS = {
    ...ChangeSetError,
    ...PropertyError,
    ...PropertyFactoryError,
    ...RepositoryError,
    ...SchemaValidatorError,
    ...PssClientError,
    ...UtilsError,
    ...TypeidHelperError,
    ...ServerError,
};

export const constants = {
    MSG: MESSAGE_CONSTANTS,
    PROPERTY_PATH_DELIMITER,
};
