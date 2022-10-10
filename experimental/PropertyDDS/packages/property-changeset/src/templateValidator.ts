/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview
 * @description The TemplateValidator can examine consecutive versions of a given template to detect semantic
 * versioning (semver) errors and warn about incorrect versioning practices.
 */
/* eslint-disable no-use-before-define */

import Ajv from "ajv";
import ajvKeywords from "ajv-keywords";

import each from "lodash/each";
import isEqual from "lodash/isEqual";
import every from "lodash/every";
import isString from "lodash/isString";
import isObject from "lodash/isObject";
import difference from "lodash/difference";
import has from "lodash/has";
import mapValues from "lodash/mapValues";
import includes from "lodash/includes";
import map from "lodash/map";
import find from "lodash/find";
import isEmpty from "lodash/isEmpty";
import { copy as cloneDeep } from "fastest-json-copy";

import { gt, diff, major, valid, compare } from "semver";
import traverse from "traverse";
import { queue } from "async";

// @ts-ignore
import { constants, ConsoleUtils } from "@fluid-experimental/property-common";
import { TemplateSchema } from "./templateSchema";
import { TypeIdHelper } from "./helpers/typeidHelper";
import { SchemaValidationResult, ValidationResultBuilder } from "./validationResultBuilder";

const { MSG } = constants;

const ajvFactory = new Ajv({
    allErrors: true,
    verbose: true,
});

ajvKeywords(ajvFactory, "prohibited");
ajvKeywords(ajvFactory, "typeof");

const _syntaxValidator = ajvFactory.compile(TemplateSchema);

type ValuesType = { [key: string]: ValuesType; };

type PropertyType = {
    id: string;
    context: string;
    typeid: string;
    values: ValuesType;
};

type PropertiesType = PropertyType[];

export interface PropertySchema {
    constants?: any[];
    context: string;
    inherits?: string[];
    annotation?: { [key: string]: string; };
    properties: PropertiesType;
    typeid: string;
    values: ValuesType;
}

type SchemaEntityType = PropertySchema | string[] | PropertiesType;

/**
 * A weighted enumeration of semver change types. Higher values are more important.
 * PATCH: Annotation and comment changes.
 * MINOR: Added properties.
 * MAJOR: Everything else, including deleting properties.
 * @ignore
 */
const CHANGE_LEVEL = {
    patch: 0, // '1.0.0' -> '1.0.1'
    minor: 1, // '1.0.0' -> '1.1.0'
    major: 2, // '1.5.2' -> '2.0.0'

    prerelease: 0, // '1.0.0-alpha.1' -> '1.0.0'
    prepatch: 0, // '1.0.0-alpha.1' -> '1.0.1'
    preminor: 1, // '1.0.0-alpha.1' -> '1.1.0'
    premajor: 2, // '1.0.0-alpha.1' -> '2.0.0'
};

const VALID_CONTEXTS = ["single", "array", "map", "set", "enum"];

const _extractTypeid = function(typeidOrReference: string) {
    // Take Reference<strong-type-id> and return strong-type-id
    if (!isString(typeidOrReference)) {
        throw new Error(MSG.TYPEID_MUST_BE_STRING + typeidOrReference);
    }
    const reference = "Reference<";
    let result = typeidOrReference || "";
    const isReference = result.indexOf(reference) === 0;
    if (isReference) {
        result = typeidOrReference.substring(reference.length, typeidOrReference.length - 1);
    }
    return result;
};

/**
 * Given a typeid string, fetches the semver 'x.y.z' version string.
 * @param in_typeid - A PropertySet typeid. For example: 'TeamLeoValidation2:ColorID-1.0.0'.
 * @returns The semver 'x.y.z' version string, or null if in_typeid is not a valid PropertySet typeid.
 */
const _getSemverFromTypeId = function(in_typeid: string): string | null {
    const semverRegex = /.*-(.*)$/g;
    const match = semverRegex.exec(in_typeid);
    return match ? match[1] : null;
};

/**
 * Fetches the type name of a javascript entity.
 * @param in_obj - A javascript entity.
 * @returns The type name for in_obj.
 */
const _getType = (in_obj: any): string => Object.prototype.toString.call(in_obj).slice(8, -1);

type PathEqualityInfo = {
    isEqual: boolean;
    path: string;
};

function isPropertyArray(source: SchemaEntityType): source is PropertiesType {
    return every(source, (entry: PropertyType) => isObject(entry) && entry.id !== undefined);
}

// function isSchemaTemplate(source: SchemaEntityType): source is PropertySchema {
//     return isObject(source) && !Array.isArray(source);
// }

/**
 * An object deep compare with special handling for pset property arrays.
 * pset property arrays are allowed to be out of order as long as elements can be matched with
 * their id.
 * @param in_source - The source entity to test for deep equality.
 * @param in_target - The target entity to test for deep equality.
 * @returns {isEqual: false, path: 'foo.properties[1].x'}
 *
 * - isEqual: true if in_source and in_target property sets are equal, even if the individual property arrays
 * differ but contain the same out of order elements.
 *
 * - path: path to the property that is not equal.
 */
const _psetDeepEquals = function(in_source: SchemaEntityType, in_target: SchemaEntityType): PathEqualityInfo {
    const idPath = [];
    if (!Array.isArray(in_source) && in_source.typeid) {
        idPath.push(`<${in_source.typeid}>`);
    }

    /**
     * Create the _psetDeepEquals result.
     * @param isEqual - Whether or not a PropertySet result is being constructed for
     * PropertySets that are deeply equal.
     * @returns {{isEqual: boolean, path: string}} An object that indicates whether or not the source
     * and target PropertySets are deeply equal. If they're not, it also contains a path to the
     * property that is not equal.
     */
    const _getPSetDeepEqualsResult = (isEqual: boolean): PathEqualityInfo => ({
        isEqual,
        path: isEqual ? undefined : idPath.join(""),
    });

    /**
     * Performs a recursive, depth first deep equal test against two PropertySets.
     * @param source - The source entity to test for deep equality.
     * @param target - The target entity to test for deep equality.
     * @param id - The current path element being compared.
     * @return The result of _getPSetDeepEqualsResult
     */
    let _depthFirstDeepEquals = function(source: SchemaEntityType, target: SchemaEntityType, id?: string): PathEqualityInfo {
        let result = _getPSetDeepEqualsResult(true);

        if (id) {
            if (typeof id === "number") {
                idPath.push(`[${id}]`);
            } else {
                idPath.push(`.${id}`);
            }
        }

        if (Array.isArray(source)) {
            if (!Array.isArray(target)) {
                return _getPSetDeepEqualsResult(false);
            }

            if (source.length !== target.length) {
                return _getPSetDeepEqualsResult(false);
            }

            if (source.length === 0) {
                return _getPSetDeepEqualsResult(true);
            }

            // See if we're comparing arrays of objects (like properties) or simple arrays of strings
            // like inheritance lists.
            if (isPropertyArray(source)) {
                const targetMap = {};
                each(target, function(element: PropertyType) {
                    targetMap[element.id] = element;
                });

                for (let i = 0; i < source.length && result.isEqual; i++) {
                    const sourceId = source[i].id;
                    result = _depthFirstDeepEquals.call(this, source[i], targetMap[sourceId], sourceId);
                    idPath.pop();
                }
            } else {
                // Element order matters
                for (let i = 0; i < source.length && result.isEqual; i++) {
                    result = _depthFirstDeepEquals.call(this, source[i], target[i], i);
                    idPath.pop();
                }
            }
        } else if (isObject(source)) {
            if (!isObject(target)) {
                return _getPSetDeepEqualsResult(false);
            }

            const keysSource = Object.keys(source);
            const keysTarget = Object.keys(target);
            if (keysSource.length !== keysTarget.length) {
                // A template with abstract properties must equal one with an empty properties array
                // We check the difference in keys between the source and target and if the only difference is the
                // properties array we check if it's empty. Then we reverse the condition so it work both ways.
                if (
                    (isEqual(difference(keysTarget, keysSource), ["properties"]) && !(target as any).properties.length) ||
                    (isEqual(difference(keysSource, keysTarget), ["properties"]) && !source.properties.length)
                ) {
                    return _getPSetDeepEqualsResult(true);
                }

                return _getPSetDeepEqualsResult(false);
            }

            for (let i = 0; i < keysSource.length && result.isEqual; i++) {
                const keyName = keysSource[i];
                let id = keyName === "properties" ? undefined : keyName;
                result = _depthFirstDeepEquals.call(this, source[keyName], target[keyName], id);
                if (id) {
                    idPath.pop();
                }
            }
        } else {
            result = _getPSetDeepEqualsResult(
                _getType.call(this, source) === _getType.call(this, target) && source === target,
            );
        }

        return result;
    };

    return _depthFirstDeepEquals.call(this, in_source, in_target);
};

/**
 * Fetches the non semver part of a typeid string.
 * @param in_typeid - A PropertySet typeid. For example: 'TeamLeoValidation2:ColorID-1.0.0'.
 * @returns The typeid, without a semver.
 */
const _stripSemverFromTypeId = function(in_typeid: string): string | null {
    const semverRegex = /(.*)-.*$/g;
    const match = semverRegex.exec(in_typeid);
    return match ? match[1] : null;
};

const _unresolvedTypes = function(in_template: PropertySchema) {
    let first = true;
    const that = this;
    const accSet = traverse(in_template).reduce(function(acc: { [x: string]: string; }, x: PropertySchema) {
        if (first) {
            acc = {};
            first = false;
        }
        if (isObject(x) && has(x, "typeid")) {
            const extractedTypeid = _extractTypeid.call(that, x.typeid);

            if (!TypeIdHelper.isPrimitiveType(extractedTypeid)) {
                acc[extractedTypeid] = "";
            }
        }
        return acc;
    });

    return Object.keys(accSet);
};

/**
 * Performs basic template validation.
 * @param in_template - The template object to validate.
 */
const _validateBasic = function(in_template: PropertySchema) {
    if (!in_template) {
        this._resultBuilder.addError(new Error(MSG.NO_TEMPLATE));
    } else if (!in_template.typeid) {
        this._resultBuilder.addError(new Error(MSG.MISSING_TYPE_ID + JSON.stringify(in_template)));
    }
};

/**
 * Validations performed when the version increases between consecutive templates.
 *
 * @remarks
 * For example: 1.1.3 -> 2.0.0
 * This function checks the change level (PATCH, MINOR, MAJOR) and analyses the template content
 * to emit warnings if the change level should be higher, given the content that changed.
 * This function assumes that: in_versionPrevious < in_version.
 *
 * @param in_template - The latest template object.
 * @param in_templatePrevious - The previous template object.
 * @param in_version - The latest template version. Ex.: '2.0.0'.
 * @param in_versionPrevious - The previous template version. Ex.: '1.1.3'.
 */
const _validatePositiveIncrement = function(in_template: PropertySchema, in_templatePrevious: PropertySchema, in_version: string, in_versionPrevious: string) {
    ConsoleUtils.assert(
        gt(in_version, in_versionPrevious),
        "property-changeset.TemplateValidator._validatePositiveIncrement called on non incremental " +
        "template versions",
    );

    const versionDiff = diff(in_version, in_versionPrevious);

    if (CHANGE_LEVEL[versionDiff] >= CHANGE_LEVEL.major) {
        // No need to warn about change levels since they're already declared to be major.
        return;
    }

    if (major(in_version) === 0) {
        // Unstable version doesn't produce any warning.
        return;
    }

    const idPath = [`<${in_template.typeid}>`];

    let _depthFirstCompare = function(id: string, sourceObj: SchemaEntityType, targetObj: SchemaEntityType) {
        if (id === "annotation") {
            // Here, we know that the version has increased (patch, prepatch or prerelease), so
            // there's no need to check inside comments for changes.
            return;
        }

        if (id) {
            idPath.push(id);
        }

        if ((sourceObj === undefined) !== (targetObj === undefined)) {
            let minimumLevel: string;
            let mutation: string;

            if (targetObj === undefined) {
                // An element has been deleted.
                minimumLevel = "major";
                mutation = "delete";
            } else {
                // An element has been added
                minimumLevel = "minor";
                mutation = "add";
            }

            if (CHANGE_LEVEL[versionDiff] < CHANGE_LEVEL[minimumLevel]) {
                // Violates rule 6 (warning).
                this._resultBuilder.addWarning(
                    MSG.CHANGE_LEVEL_TOO_LOW_1 + JSON.stringify({
                        mutation,
                        id: idPath.join("."),
                        level: {
                            expected: minimumLevel,
                            actual: versionDiff,
                        },
                        version: {
                            current: in_version,
                            previous: in_versionPrevious,
                        },
                    }),
                );
            }
        } else {
            const sourceObjType = _getType.call(this, sourceObj);
            const targetObjType = _getType.call(this, targetObj);
            if (sourceObjType !== targetObjType) {
                this._resultBuilder.addWarning(
                    MSG.CHANGE_LEVEL_TOO_LOW_1 + JSON.stringify({
                        mutation: "change",
                        id: idPath.join("."),
                        type: {
                            current: targetObjType,
                            previous: sourceObjType,
                        },
                        level: {
                            expected: "major",
                            actual: versionDiff,
                        },
                        version: {
                            current: in_version,
                            previous: in_versionPrevious,
                        },
                    }),
                );
            }

            if (Array.isArray(sourceObj)) {
                let targetMap = {};
                each(targetObj, function(element: any) {
                    targetMap[element.id] = element;
                });

                for (let i = 0; i < sourceObj.length; i++) {
                    const element = sourceObj[i] as any;
                    _depthFirstCompare.call(this, element.id, element, targetMap[element.id]);
                    delete targetMap[element.id];
                }

                if (!isEmpty(targetMap)) {
                    // Added array element.
                    let minimumLevel = "minor";
                    if (CHANGE_LEVEL[versionDiff] < CHANGE_LEVEL[minimumLevel]) {
                        // Violates rule 5 (warning)
                        idPath.push(Object.keys(targetMap)[0]);
                        this._resultBuilder.addWarning(
                            MSG.CHANGE_LEVEL_TOO_LOW_1 + JSON.stringify({
                                mutation: "add",
                                id: idPath.join("."),
                                level: {
                                    expected: minimumLevel,
                                    actual: versionDiff,
                                },
                                version: {
                                    current: in_version,
                                    previous: in_versionPrevious,
                                },
                            }),
                        );
                        idPath.pop();
                    }
                }
            } else if (isObject(sourceObj)) {
                const keysSource = Object.keys(sourceObj);
                let targetMap = {};
                mapValues(targetObj, function(val, key) {
                    targetMap[key] = val;
                });

                for (let i = 0; i < keysSource.length; i++) {
                    let valueSource = sourceObj[keysSource[i]];
                    let valueTarget = targetObj[keysSource[i]];
                    _depthFirstCompare.call(
                        this,
                        keysSource[i] === "properties" ? undefined : keysSource[i],
                        valueSource,
                        valueTarget,
                    );
                    delete targetMap[keysSource[i]];
                }

                const remainingKeys = Object.keys(targetMap);
                if (!isEmpty(remainingKeys)) {
                    // Added new keys to the target. This is a MINOR change, unless they new key is a
                    // comment, in which case this is a PATCH level change.
                    let minimumLevel = remainingKeys.length === 1 && remainingKeys[0] === "annotation" ? "patch" : "minor";
                    if (CHANGE_LEVEL[versionDiff] < CHANGE_LEVEL[minimumLevel]) {
                        // Violates rule 5 (warning)
                        idPath.push(remainingKeys[0]);
                        this._resultBuilder.addWarning(
                            MSG.CHANGE_LEVEL_TOO_LOW_1 + JSON.stringify({
                                mutation: "add",
                                id: idPath.join("."),
                                level: {
                                    expected: minimumLevel,
                                    actual: versionDiff,
                                },
                                version: {
                                    current: in_version,
                                    previous: in_versionPrevious,
                                },
                            }),
                        );
                        idPath.pop();
                    }
                }
            } else {
                if (idPath.length === 2 && id === "typeid") {
                    // This is the root property typeid. Ignore the version component.
                    sourceObj = _stripSemverFromTypeId.call(this);
                    targetObj = _stripSemverFromTypeId.call(this);
                }

                if (sourceObj !== targetObj) {
                    let minimumLevel = id === "value" ? "minor" : "major";
                    if (CHANGE_LEVEL[versionDiff] < CHANGE_LEVEL[minimumLevel]) {
                        this._resultBuilder.addWarning(
                            MSG.CHANGE_LEVEL_TOO_LOW_1 + JSON.stringify({
                                mutation: "change",
                                id: idPath.join("."),
                                level: {
                                    expected: minimumLevel,
                                    actual: versionDiff,
                                },
                                value: {
                                    current: targetObj,
                                    previous: sourceObj,
                                },
                                version: {
                                    current: in_version,
                                    previous: in_versionPrevious,
                                },
                            }),
                        );
                    }
                }
            }
        }

        if (id) {
            idPath.pop();
        }
    };
    // console.assert(has(in_templatePrevious, 'id')); // TODO: Revisit this line after running the tests.
    _depthFirstCompare.call(this, (in_templatePrevious as any).id, in_templatePrevious, in_template);
};

/**
 * Validations performed when the version between consecutive templates doesn't change.
 * For example: 1.1.3 -> 1.1.3.
 * Templates whose version didn't change should have identical content.
 * @param in_template - The latest template object.
 * @param in_templatePrevious - The previous template object.
 */
const _validateSameVersion = function(in_template: PropertySchema, in_templatePrevious: PropertySchema) {
    const result = _psetDeepEquals.call(this, in_templatePrevious, in_template);
    if (!result.isEqual) {
        // Violates rule 3a.
        this._resultBuilder.addError(new Error(MSG.MODIFIED_TEMPLATE_SAME_VERSION_1 + result.path));
    }
};

/**
 * Validate a template
 * Check that the template is syntactically correct as well as semantically correct.
 * @param in_template - The template to check against.
 * Produces an {object|undefined} map of key-value pairs where the path of the invalid property is the key and the
 * value is the error message.
 *
 * i.e.
 *
 * ```
 * <pre>
 *   {
 *     'isValid': true or false,
 *     'typeid': 'The typeid of the object being parsed',
 *     'unresolvedTypes': [ 'An array', 'of strong typeids', 'that were found',
 *       'in the document', 'but not resolved from the local cache' ],
 *     'resolvedTypes': [ 'Array of', 'strong types resolved', 'during template parsing'],
 *     'errors': [ 'Array of', 'objects describing', 'syntax errors in the template' ]
 *     ...
 *   }
 * </pre>
 * ```
 * @throws if context validation fails
 */
const _validateSemanticAndSyntax = function(in_template: PropertySchema) {
    _validateSyntax.call(this, in_template);
    _validateConstants.call(this, in_template);
    // TODO: _validateSemantic
};

/**
 * Validate a template
 * Check that the template is syntactically correct as well as semantically correct.
 * @param in_template - The template to check against
 * @return {Promise} a promise that resolved to nothing
 * @ignore
 */
const _validateSemanticAndSyntaxAsync = async function(in_template: PropertySchema): Promise<any> {
    return _validateSyntaxAsync.call(this, in_template);
};

/**
 * Validates that the semver part of a template's typeid is valid.
 * @param {Object} in_template - The template object to validate.
 * @return {string} The semver string. For example: '1.0.0'.
 * @private
 * @this TemplateValidator
 * @ignore
 */
const _validateSemverFormat = function(in_template) {
    const templateVersion = _getSemverFromTypeId.call(this, in_template.typeid);
    if (!templateVersion) {
        this._resultBuilder.addError(new Error(MSG.MISSING_VERSION + in_template.typeid));
    } else if (valid(templateVersion) !== templateVersion) {
        this._resultBuilder.addError(new Error(MSG.INVALID_VERSION_1 + templateVersion));
    }

    return templateVersion;
};

/**
 * Skip semver validation. Verify that the content is the same for both templates, while ignoring
 * the root 'typeid' property.
 * @param {Object} in_template - The latest template object.
 * @param {Object} in_templatePrevious - The previous template object.
 * @private
 * @this TemplateValidator
 */
const _validateSkipSemver = function(in_template, in_templatePrevious) {
    // Skipping the semver validation. Ignore the root typeid field.
    const result = _psetDeepEquals.call(this, in_template, in_templatePrevious);
    if (!result.isEqual) {
        // Violates rule 3a.
        this._resultBuilder.addError(new Error(MSG.MODIFIED_TEMPLATE_1 + result.path));
    }
};

/**
 * Checks if an invalid context error should be signified
 *
 * @param {String} in_context - The latest template object.
 * @return {Error|undefined} If exists returns the InvalidContext error
 * @private
 * @this TemplateValidator
 */
const getInvalidContextError = function(in_context) {
    if (in_context && !includes(VALID_CONTEXTS, in_context)) {
        return new Error(`${MSG.NOT_A_VALID_CONTEXT} ${in_context}`);
    }

    return undefined;
};

/**
 * Validate that the context is valid
 * Validate that only Named Properties are in sets
 * @param {object} in_template - The template to check against
 * @ignore
 * @throws if the context is invalid.
 */
const _validateContext = function(in_template) {
    const context = in_template.context;

    const error = getInvalidContextError(context);
    if (error) {
        throw error;
    }
    if (context === "map" && in_template.contextKeyType === "typeid") {
        throw new Error(MSG.INVALID_OPTION_NONE_CONSTANTS);
    }
};

/**
 * Validate just the syntax of a template
 * Check that the template is well-formed, according to the schema.
 * @param {object} in_template - The template to check against
 *
 * Context validation makes sure that elements of sets eventually inherit from NamedProperty.
 * If this is not the case, a promise rejection will occur with the appropriate error.
 * @return {Promise} promise that returns without any value and rejects in case of validation error
 * @ignore
 */
const _validateContextAsync = async function(in_template) {
    const that = this;
    const context = in_template.context;

    const error = getInvalidContextError(context);
    if (error) {
        return Promise.reject(error);
    }
    if (context === "map" && in_template.contextKeyType === "typeid") {
        return Promise.reject(new Error(MSG.INVALID_OPTION_NONE_CONSTANTS));
    }
    // If context is not 'set' validation doesn't apply
    if (context !== "set") {
        return Promise.resolve();
    }

    let typedValuePromises = [Promise.resolve()];
    if (in_template.typedValue) {
        typedValuePromises = map(in_template.typedValue, (tv) => that.inheritsFrom(tv.typeid, "NamedProperty"));
    } else {
        // Since context is 'set' the template must eventually inherit from NamedProperty
        if (in_template.inherits === undefined) {
            return Promise.reject(new Error(MSG.SET_ONLY_NAMED_PROPS));
        }

        // Since context is 'set' the template must eventually inherit from NamedProperty (same as above)
        if (includes(in_template.inherits, "NamedProperty") || in_template.inherits === "NamedProperty") {
            return Promise.resolve();
        }
    }
    const typedValuePromise = Promise.all(typedValuePromises);

    let parents = [];
    if (in_template.inherits) {
        parents = Array.isArray(in_template.inherits) ? in_template.inherits : [in_template.inherits];
    }
    const inheritsPromises = parents.map((typeid) => this._inheritsFromAsync(typeid, "NamedProperty"));

    // Combine results from inheritsPromises and typedValuePromise
    inheritsPromises.push(typedValuePromise);
    return Promise.all(inheritsPromises).then(function(results) {
        const foundNamedPropertyDescendant = find(results, (res) => res);
        if (!foundNamedPropertyDescendant) {
            return Promise.reject(Error(MSG.SET_ONLY_NAMED_PROPS));
        }

        return that._hasSchemaAsync(in_template.typeid);
    }).then(function(hasIt) {
        if (!hasIt) {
            return Promise.reject(new Error(MSG.SET_ONLY_NAMED_PROPS));
        }

        return that._inheritsFromAsync(in_template.typeid, "NamedProperty");
    }).then(async function(res) {
        if (res) {
            return undefined;
        }

        return Promise.reject(new Error(MSG.SET_ONLY_NAMED_PROPS));
    });
};

/**
 * Validate that the context is valid
 * Validate that only Named Properties are in sets
 * @param {object} in_template - The template to check against
 * @ignore
 * @throws if the context is invalid.
 */
let _validateConstants = function(in_template) {
    const that = this;
    if (in_template.constants && Array.isArray(in_template.constants)) {
        for (let i = 0; i < in_template.constants.length; i++) {
            const constant = in_template.constants[i];
            const context = constant.context;

            if (context === "map" && constant.contextKeyType === "typeid") {
                each(constant.value, function(value, key) {
                    if (!TypeIdHelper.isTemplateTypeid(key)) {
                        that._resultBuilder.addError(new Error(MSG.KEY_MUST_BE_TYPEID + key));
                    }
                });
            }
        }
    }
};

/**
 * Analyze output of the syntax validation and build error messages
 *
 * @param in_template - The template that was analyzed
 */
const _processValidationResults = function(in_template: PropertySchema) {
    let that = this;
    let result = this._resultBuilder.result;

    result.isValid = _syntaxValidator(in_template);
    if (!result.isValid) {
        ConsoleUtils.assert(!isEmpty(_syntaxValidator.errors), "template validation failed but produced no error");
    }

    if (_syntaxValidator.errors) {
        each(_syntaxValidator.errors, function(error) {
            const regexTypeId = /typeid/;
            switch (error.keyword) {
                case "pattern":
                    if (error.dataPath === ".typeid") {
                        error.message = `typeid should have a pattern like: my.example:point-1.0.0 ${error.data
                            } does not match that pattern`;
                    } else if ("pattern" && regexTypeId.test(error.dataPath)) {
                        error.message = error.schemaPath === "#/definitions/typed-reference-typeid/pattern"
                            ? ""
                            : `${error.dataPath} should follow this pattern: <namespace>:<typeid>-<version> ` +
                                `(for example: Sample:Rectangle-1.0.0) or match one of the Primitive Types (Float32, Float64, ` +
                                `Int8, Uint8, Int16, Uint16, Int32, Uint32, Bool, String, Reference, Enum, Int64, Uint64) or ` +
                                `Reserved Types (BaseProperty, NamedProperty, NodeProperty, NamedNodeProperty, ` +
                                `RelationshipProperty). '${error.data}' is not valid`;
                    }
                    break;

                case "enum":
                    error.message = regexTypeId.test(error.dataPath)
                        ? ""
                        : `${error.dataPath} should match one of the following: ${error.schema}`;
                    break;

                case "type":
                    error.message = `${error.dataPath} should be a ${error.schema}`;
                    break;

                case "not":
                    if (error.schemaPath === "#/switch/1/then/anyOf/0/properties/typeid/not") {
                        // remove .typeid at the end of the dataPath
                        error.message = `For ${error.dataPath.slice(0, -7)
                            }: Properties should have either a typeid or an array of child properties, but not both.`;
                    } else if (error.schemaPath === "#/switch/1/then/anyOf/1/properties/properties/not") {
                        // remove .properties at the end of the dataPath
                        error.message = `For ${error.dataPath.slice(0, -11)
                            }: Properties should have either a typeid or an array of child properties, but not both.`;
                    }
                    break;

                // these errors do not add any information. All necessary information is in the 'enum' errors
                // empty errors will be filtered out before logging.
                case "oneOf":
                case "anyOf":
                    error.message = "";
                    break;

                // for minItems, required and any other error - add dataPath to indicate which part of the
                // template the error refers to.
                default:
                    error.message = `${error.dataPath} ${error.message}`;
                    break;
            }
            // Deep-copy for thread-safety.
            that._resultBuilder.addError(cloneDeep(error));
        });
    }

    result.unresolvedTypes = _unresolvedTypes.call(this, in_template);
};

/**
 * Validate just the syntax of a template
 * Check that the template is well-formed, according to the schema.
 * @param in_template - The template to check against
 * @throws if a property with context set is not an instance of NamedProperties
 * @ignore
 */
let _validateSyntax = function(in_template: PropertySchema) {
    const that = this;
    // recursively test all properties for context
    let recursiveContextCheck = function(template) {
        _validateContext.call(that, template);
        if (template.properties) {
            template.properties.forEach(function(property) {
                recursiveContextCheck(property);
            });
        }
    };

    recursiveContextCheck(in_template);

    _processValidationResults.call(this, in_template);

    const result = this._resultBuilder.result;
    result.unresolvedTypes = _unresolvedTypes.call(this, in_template);
};

const createContextCheckAsyncQueue = function() {
    const that = this;
    const contextCheckWorker = function(in_task, in_callback) {
        const property = in_task.property;
        _validateContextAsync.call(that, property).then(function(response) {
            in_callback();
        }).catch(function(error) {
            in_callback({ error });
        });
    };
    // Async queue for schema context check tasks
    return queue(contextCheckWorker, 5);
};

/**
 * Validate just the syntax of a template
 * Check that the template is well-formed, according to the schema.
 *
 * @param in_template - The template to check against
 * Mainly checks context. See _validateContextAsync
 * @returns Promise that resolves without any result
 * @ignore
 */
let _validateSyntaxAsync = async function(in_template: PropertySchema): Promise<SchemaValidationResult> {
    const that = this;

    return new Promise(function(resolve, reject) {
        if (that.asyncValidationInProgress === true) {
            reject(new Error(MSG.CONTEXT_VALIDATION_IN_PROGRESS));
            return;
        }

        that.asyncValidationInProgress = true;

        const contextCheckAsyncQueue = createContextCheckAsyncQueue.call(that);

        // recursively test all properties for context
        let recursiveContextCheck = function(template) {
            // Does the call to _validateContextAsync
            contextCheckAsyncQueue.push({ property: template }, function(error) {
                if (error !== undefined) {
                    reject(new Error(error));
                    return;
                }
            });
            if (template.properties) {
                template.properties.forEach(function(property) {
                    recursiveContextCheck(property);
                });
            }
        };
        recursiveContextCheck(in_template);

        contextCheckAsyncQueue.drain(
            function() {
                const result = that._resultBuilder.result;
                _processValidationResults.call(that, in_template);
                result.unresolvedTypes = _unresolvedTypes.call(that, in_template);

                that.asyncValidationInProgress = false;
                resolve(result);
            },
        );
    });
};

export interface TemplateValidatorOptions {
    /**
     * When set to true, {@link #validate} only checks the supplied templates' content
     * and fails the validation if they're not identical. Defaults to false.
     */
    skipSemver?: boolean;
    /**
     * When set to true, the typeid of any schema can have '-draft' as a version. Defaults to false.
     */
    allowDraft?: boolean;
    /**
     * Function that checks if a template inherits from another.
     */
    inheritsFrom?: (source: PropertySchema, target: PropertySchema) => boolean;
    /**
     * Function that checks if we have a template matching a typeid.
     */
    hasSchema?: (schema: PropertySchema, typeid: string) => boolean;
    /**
     * Function that checks if a template inherits from another asynchronously.
     */
    inheritsFromAsync?: (source: PropertySchema, target: PropertySchema) => Promise<boolean>;
    /**
     * Function that checks if we have a template matching a typeid asynchronously.
     */
    hasSchemaAsync?: (schema: PropertySchema, typeid: string) => Promise<boolean>;

}

const Utils = {
    psetDeepEquals(in_source: PropertySchema, in_target: PropertySchema) {
        return _psetDeepEquals.call(this, in_source, in_target).isEqual;
    },
};

/**
 * Instantiates a new TemplateValidator. Must be provided with a set of inheritsFrom and hasSchema
 * function or inheritsFromAsync and hasSchemaAsync, but not both.
 */
export class TemplateValidator {
    static Utils = Utils;
    private _resultBuilder: ValidationResultBuilder;
    public _inheritsFrom: (source: PropertySchema, target: PropertySchema) => boolean;
    public _hasSchema: (schema: PropertySchema, typeid: string) => boolean;
    public _inheritsFromAsync: (source: PropertySchema, target: PropertySchema) => Promise<boolean>;
    public _hasSchemaAsync: (schema: PropertySchema, typeid: string) => Promise<boolean>;
    private readonly _allowDraft: boolean;
    private readonly _skipSemver: boolean;
    constructor(in_params: TemplateValidatorOptions = { skipSemver: false, allowDraft: false }) {
        this._skipSemver = in_params ? !!in_params.skipSemver : false;
        this._allowDraft = in_params ? !!in_params.allowDraft : false;
        // Used by validate()
        if (in_params && in_params.inheritsFrom !== undefined && in_params.hasSchema !== undefined) {
            this._inheritsFrom = in_params.inheritsFrom;
            this._hasSchema = in_params.hasSchema;
        } else if (in_params && in_params.inheritsFromAsync !== undefined && in_params.hasSchemaAsync !== undefined) {
            this._inheritsFromAsync = in_params.inheritsFromAsync;
            this._hasSchemaAsync = in_params.hasSchemaAsync;
        } else {
            throw new Error(MSG.MISSING_INHERITSFROM_OR_HASSCHEMA);
        }
    }

/**
 * Validates that all templates conform to the following mandatory rules:
 *
 * 1. Must have a typeid attribute.
 *
 * 2. typeid must end in a valid semver string.
 *
 * 3. When both in_template (B) and in_templatePrevious (A) are supplied:
 *
 * - 3a. Semver is identical only if content is identical.
 *
 * - 3b. B's semver >= A's semver
 *
 * Additionally, the following soft rules will produce warnings when violated:
 *
 * 3.5. Elements of sets must eventually inherit from 'NamedProperty'
 *
 * 4. PATCH revision should be increased when _only_ the template description changes.
 *
 * 5. Adding one or more template attributes is a MINOR change.
 *
 * 6. Removing one or more template attributes is a MAJOR change.
 *
 * @param in_template - The latest template version, as a JSON object.
 * @param in_templatePrevious - The previous template version, as a JSON object. Optional.
 * @returns The validation results. Example:
 *
 * ```json
 * {
 *   isValid: false,
 *   errors: ['Something went wrong. Validation failed.'],
 *   warnings: ['A non-fatal warning'],
 *   typeid: 'SomeNamespace:PointID-1.0.0'
 * }
 * ```
 *
 * It's possible for 'isValid' to be true while 'warnings' contains one or more messages.
 */
    validate(in_template: PropertySchema, in_templatePrevious?: PropertySchema): SchemaValidationResult {
        this._resultBuilder = new ValidationResultBuilder(in_template ? in_template.typeid : "");

        let isDraft = false;
        if (in_template && in_template.typeid &&
            TypeIdHelper.extractVersion(in_template.typeid).version === "draft") {
            if (this._allowDraft) {
                    isDraft = true;
            } else {
                this._resultBuilder.addError(
                    new Error(MSG.DRAFT_AS_VERSION_TYPEID),
                );
            }
        }

        _validateBasic.call(this, in_template);
        if (in_templatePrevious) {
            _validateBasic.call(this, in_templatePrevious);
        }

        // Basic validation (such as input params) must pass before the real validation can begin.
        if (!this._resultBuilder.isValid()) {
            return this._resultBuilder.result;
        }

        _validateSemanticAndSyntax.call(this, in_template);
        if (!this._resultBuilder.isValid() || isDraft) {
            return this._resultBuilder.result;
        }

        if (in_templatePrevious) {
            _validateSemanticAndSyntax.call(this, in_templatePrevious);
            if (!this._resultBuilder.isValid()) {
                // Here the previous template is not valid. Make sure the typeid in the returned info is
                // the root of the template that failed validation.
                this._resultBuilder.result.typeid = in_templatePrevious.typeid;
                return this._resultBuilder.result;
            }
        }

        if (this._skipSemver && in_templatePrevious) {
            _validateSkipSemver.call(this, in_template, in_templatePrevious);
            return this._resultBuilder.result;
        }

        // semver format validation
        const version = _validateSemverFormat.call(this, in_template);
        const versionPrevious =
            in_templatePrevious ? _validateSemverFormat.call(this, in_templatePrevious) : null;

        // semver format validation must pass.
        if (!this._resultBuilder.isValid()) {
            return this._resultBuilder.result;
        }

        if (in_templatePrevious) {
            // Validate that the semver change is valid.
            switch (compare(version, versionPrevious)) {
                case 0:
                    _validateSameVersion.call(this, in_template, in_templatePrevious);
                    break;
                case 1:
                    // newVersion is greater
                    _validatePositiveIncrement.call(this, in_template, in_templatePrevious, version, versionPrevious);
                    break;
                default:
                case -1:
                    // previousVersion is greater. Violates rule 3b.
                    this._resultBuilder.addError(
                        new Error(MSG.VERSION_REGRESSION_1 + JSON.stringify({
                            current: version,
                            previous: versionPrevious,
                        })),
                    );
                    break;
            }
        }

        return this._resultBuilder.result;
    }

    /**
     * Validates that all templates conform to the following mandatory rules:
     *
     * 1. Must have a typeid attribute.
     *
     * 2. typeid must end in a valid semver string.
     *
     * 3. When both in_template (B) and in_templatePrevious (A) are supplied:
     *
     * - 3a. Semver is identical only if content is identical.
     *
     * - 3b. B's semver >= A's semver
     *
     * Additionally, the following soft rules will produce warnings when violated:
     *
     * 3.5. Elements of sets must eventually inherit from 'NamedProperty'
     *
     * 4. PATCH revision should be increased when _only_ the template description changes.
     *
     * 5. Adding one or more template attributes is a MINOR change.
     *
     * 6. Removing one or more template attributes is a MAJOR change.
     *
     * @param in_template - The latest template version, as a JSON object.
     * @param in_templatePrevious - The previous template version, as a JSON object. Optional.
     * @returns A promise that resolves to the validation results as an object. Example:
     *
     * ```json
     * {
     *   isValid: false,
     *   errors: ['Something went wrong. Validation failed.'],
     *   warnings: ['A non-fatal warning'],
     *   typeid: 'SomeNamespace:PointID-1.0.0'
     * }
     * ```
     *
     * It's possible for 'isValid' to be true while 'warnings' contains one or more messages.
     */
    async validateAsync(in_template: PropertySchema, in_templatePrevious?: PropertySchema): Promise<SchemaValidationResult> {
        this._resultBuilder = new ValidationResultBuilder(in_template ? in_template.typeid : "");
        _validateBasic.call(this, in_template);
        if (in_templatePrevious) {
            _validateBasic.call(this, in_templatePrevious);
        }
        if (!this._resultBuilder.isValid()) {
            return Promise.resolve(this._resultBuilder.result);
        }
        return (in_templatePrevious) ?
            this._validateAsyncWithPreviousSchema(in_template, in_templatePrevious) :
            _validateSemanticAndSyntaxAsync.call(this, in_template);
    }

    /**
     * Called by validateAsync if a previous schema is passed in argument
     *
     * @param in_template - The latest template version, as a JSON object.
     * @param in_templatePrevious - The previous template version, as a JSON object. Optional.
     *
     * @returns promise that resolves to the validation results as an objet. See validateAsync
     * @ignore
     */
    private async _validateAsyncWithPreviousSchema(in_template: PropertySchema, in_templatePrevious: PropertySchema): Promise<SchemaValidationResult> {
        const that = this;
        return _validateSemanticAndSyntaxAsync.call(that, in_template).then(() => _validateSemanticAndSyntaxAsync.call(that, in_templatePrevious)).then(function() {
            if (!that._resultBuilder.isValid()) {
                // Here the previous template is not valid. Make sure the typeid in the returned info is
                // the root of the template that failed validation.
                that._resultBuilder.result.typeid = in_templatePrevious.typeid;
            }

            if (that._skipSemver && in_templatePrevious) {
                _validateSkipSemver.call(that, in_template, in_templatePrevious);
            }

            const version = _validateSemverFormat.call(that, in_template);
            const versionPrevious = in_templatePrevious ? _validateSemverFormat.call(that, in_templatePrevious) : null;

            // Validate that the semver change is valid.
            switch (compare(version, versionPrevious)) {
                case 0:
                    _validateSameVersion.call(that, in_template, in_templatePrevious);
                    break;
                case 1:
                    // newVersion is greater
                    _validatePositiveIncrement.call(that, in_template, in_templatePrevious, version, versionPrevious);
                    break;
                default:
                case -1:
                    // previousVersion is greater. Violates rule 3b.
                    that._resultBuilder.addError(
                        new Error(MSG.VERSION_REGRESSION_1 + JSON.stringify({
                            current: version,
                            previous: versionPrevious,
                        })),
                    );
                    break;
            }

            return that._resultBuilder.result;
        });
    }
}
