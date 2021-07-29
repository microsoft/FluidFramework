/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Helper functions to work with typeid strings
 */

import {constants } from "@fluid-experimental/property-common";
import { nativeTypes, templateSchema as templateSchemaJson } from "../templateSchema";

/**
 * Helper for Type IDs
 * @public
 * @class
 * @alias property-changeset.TypeIdHelper
 * @description Helper functions to work with typeid strings
 */
const TypeIdHelper = {};

/**
 * Checks whether the given type is a primitive type.
 *
 * @param {string} in_typeid - The typeid we want to check
 * @return {boolean} Is this a base type?
 */
TypeIdHelper.isPrimitiveType = function(in_typeid) {
    const primitiveTypes = templateSchemaJson.$defs["primitive-typeid"].enum;

    if (in_typeid === undefined || in_typeid === "") {
        return false;
    }

    return in_typeid.substr(0, 5) === "enum<" ||
        in_typeid.substr(0, 10) === "Reference<" ||
        primitiveTypes.indexOf(in_typeid) >= 0;
};

/**
 * Checks whether the given type is a template typeid.
 *
 * @param {string} in_param - The typeid we want to check
 * @return {boolean} Is this a base template typeid?
 */
TypeIdHelper.isTemplateTypeid = (in_param) => typeof in_param === "string" && (in_param.indexOf(":") !== -1);

/**
 * Checks whether the given type is a reserved type.
 *
 * @param {string} in_typeid - The typeid we want to check
 * @return {boolean} Is this a reserved type?
 */
TypeIdHelper.isReservedType = function(in_typeid) {
    const reservedTypes = templateSchemaJson.$defs["reserved-typeid"].enum;
    return reservedTypes.indexOf(in_typeid) >= 0;
};

/**
 * Extract the version number from the given typeid
 * @param {string} in_typeid The typeid to check against
 * @return {Array} Array of size two
 */
TypeIdHelper.extractVersion = function(in_typeid) {
    if (!in_typeid) {
        throw new Error(MSG.TYPEID_NOT_DEFINED);
    }
    const splitTypeId = in_typeid.split("-");

    return {
        version: splitTypeId[1],
        typeidWithoutVersion: splitTypeId[0],
    };
};

/**
 * Extracts the context from a typeid
 *
 * @param {string} in_typeid - The typeid to process
 * @return {{typeid: string, context:string, isEnum:boolean}} Returns the typeid without context, the context and
 *     if we have an enum type
 */
TypeIdHelper.extractContext = function(in_typeid) {
    const bracketIndex = in_typeid.indexOf("<");
    if (bracketIndex !== -1 &&
        in_typeid[in_typeid.length - 1] === ">") {
        let typeid = in_typeid.substr(bracketIndex + 1, in_typeid.length - bracketIndex - 2);
        let context = in_typeid.substr(0, bracketIndex);

        // Special case to handle collections without a typeid (e.g. "map<>", which should
        // be able to support all property types
        if (typeid === "") {
            typeid = context !== "set" ? "BaseProperty" : "NamedProperty";
        }

        // Special case to handle enums (e.g. array<enum<myType>>)
        let isEnum = false;
        if (context === "enum" || typeid.substr(0, 5) === "enum<") {
            isEnum = true;
            if (context === "enum") {
                context = "single";
            } else {
                // remove the `enum<...>` tag to get the raw typeid
                typeid = typeid.substr(5, typeid.length - 6);
            }
        }
        if (context === "Reference") {
            typeid = `Reference<${  typeid  }>`;
            context = "single";
        }

        return {
            typeid,
            context,
            isEnum,
        };
    } else {
        return {
            typeid: in_typeid,
            context: "single",
            isEnum: false,
        };
    }
};

/**
 * Creates a collection typeid string from the
 * typeid and the context.
 *
 * @param {string} in_typeid  - the typeid in the collection
 * @param {string} in_context - the context
 * @param {bool}  in_enum    - set to true, if the type should get an enum tag
 *
 * @return {string} The combined typeid string
 */
TypeIdHelper.createSerializationTypeId = function(in_typeid, in_context, in_enum) { // in_enum
    if (in_typeid === "BaseProperty") {
        // Special case for BaseProperties. These get represented as a collection
        // typeid without a child typeid. E.g. map<> instead of map<BaseProperty>
        return `${in_context  }<>`;
    } else {
        if (in_enum) {
            if (in_context === "" || in_context === "single") {
                return `enum<${  in_typeid  }>`;
            } else {
                return `${in_context  }<enum<${  in_typeid  }>>`;
            }
        } else {
            return `${in_context  }<${  in_typeid  }>`;
        }
    }
};

/**
 * Checks, whether the supplied typeid is a reference property type id
 *
 * @param {string} in_typeid - The typeid to check
 * @return {boolean} Is this a reference property typeid?
 */
TypeIdHelper.isReferenceTypeId = (in_typeid) => // in_enum
    in_typeid === "Reference" ||
        (in_typeid.substr(0, 10) === "Reference<" && in_typeid.substr(-1) === ">");

/**
 * Returns the type of the properties a reference points to
 *
 * @param {string} in_typeid - The typeid to process
 * @return {string} The type of the referenced property
 */
TypeIdHelper.extractReferenceTargetTypeIdFromReference = function(in_typeid) { // in_enum
    if (in_typeid.substr(0, 10) === "Reference<") {
        // Extract the type from the TypeID
        return in_typeid.substr(10, in_typeid.length - 11);
    } else {
        // This is a typeless reference, we allow all types
        return "BaseProperty";
    }
};

/**
 * Checks whether the given type is a template typeid.
 *
 * @param {string} in_param - The typeid we want to check
 * @return {boolean} Is this a base template typeid?
 */
TypeIdHelper.isSchemaTypeid = (in_param) => typeof in_param === "string" && (in_param.indexOf(":") !== -1);

/**
 * Extracts referenced typeid from input typeid
 *
 * @public
 * @param {String} in_param typeid
 *
 * @return {String} referenced typeid or in_param if it is not a reference
 */
TypeIdHelper.extractTypeId = function(in_param) {
    var matches = in_param.match(/\<(.*?)\>/); // eslint-disable-line
    if (matches !== null && matches.length > 0) {
        return matches[0].replace(/[\<\>]/gi, ''); // eslint-disable-line
    } else {
        return in_param;
    }
};

/**
 * Check wether the in_typeid inherits from the in_baseTypeid
 *
 *  Note: By default, this also returns true if in_typeid === in_baseTypeid.
 *
 * @public
 * @param {String} in_typeid     - Typeid for which we want to check, whethwe in_baseTypeid is a parent
 * @param {String} in_baseTypeid - The base typeId to check for
 * @throws if in_typeid or in_baseTypeid are not native typeid
 * @return {boolean} True if in_baseTypeid is a parent of in_typeid
 */
TypeIdHelper.nativeInheritsFrom = function(in_typeid, in_baseTypeid) {
    if (!in_typeid || !in_baseTypeid) {
        throw new Error(MSG.TYPEID_NOT_DEFINED);
    }

    if (in_typeid.substr(0, 10) === "Reference<") {
        in_typeid = "Reference";
    }

    if (in_baseTypeid.substr(0, 10) === "Reference<") {
        in_baseTypeid = "Reference";
    }

    if (!nativeTypes[in_typeid]) {
        throw new Error(MSG.TYPEID_NOT_NATIVE + in_typeid);
    }

    if (!nativeTypes[in_baseTypeid]) {
        throw new Error(MSG.TYPEID_NOT_NATIVE + in_baseTypeid);
    }

    if (in_baseTypeid === "BaseProperty" || in_typeid === in_baseTypeid) {
        return true;
    }

    if (in_typeid === "BaseProperty") {
        return false;
    }

    const parents = nativeTypes[in_typeid].inherits;

    // recursively call the function for the parent of the typeid
    for (let i = 0; i < parents.length; i++) {
        if (this.nativeInheritsFrom(parents[i], in_baseTypeid)) {
            return true;
        }
    }
    return false;
};

/**
 * return all primitive typeIds
 *
 * @public
 * @return {Array<string>} return a list of primitiveTypeIds
 */
TypeIdHelper.getPrimitiveTypeIds = () => templateSchemaJson.$defs["primitive-typeid"].enum;

/**
 * return all reserved typeIds
 *
 * @public
 * @return {Array<string>} return a list of reservedTypeIds
 */
TypeIdHelper.getReservedTypeIds = () => templateSchemaJson.$defs["reserved-typeid"].enum;

export default TypeIdHelper;
