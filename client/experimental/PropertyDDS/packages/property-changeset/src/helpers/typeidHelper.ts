/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Helper functions to work with typeid strings
 */

// @ts-ignore
import { constants } from "@fluid-experimental/property-common";
import { TemplateSchema as templateSchemaJson, NativeTypes } from "../templateSchema";

const { MSG } = constants;

export declare interface ExtractedVersion {
    version: string;
    typeidWithoutVersion: string;
}

export declare interface ExtractedContext {
    typeid: string;
    context: string;
    isEnum: boolean;
}

/**
 * Helper for Type IDs
 * @public
 * @description Helper functions to work with typeid strings
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace TypeIdHelper {
    /**
     * Checks whether the given type is a primitive type.
     *
     * @param in_typeid - The typeid we want to check
     * @returns Is this a base type?
     */
    export function isPrimitiveType(in_typeid: string): boolean {
        const primitiveTypes = templateSchemaJson["$defs"]["primitive-typeid"]["enum"];

        if (in_typeid === undefined || in_typeid === "") {
            return false;
        }

        return in_typeid.substr(0, 5) === "enum<" ||
            in_typeid.substr(0, 10) === "Reference<" ||
            primitiveTypes.indexOf(in_typeid) >= 0;
    }

    /**
    * Checks whether the given type is a template typeid.
    *
    * @param in_typeid - The typeid we want to check
    * @returns Is this a base template typeid?
    */
    export function isTemplateTypeid(in_typeid: string): boolean {
        return in_typeid.indexOf(":") !== -1;
    }

    /**
     * Checks whether the given type is a reserved type.
     *
     * @param in_typeid - The typeid we want to check
     * @returns Is this a reserved type?
     */
    export function isReservedType(in_typeid: string): boolean {
        const reservedTypes = templateSchemaJson["$defs"]["reserved-typeid"]["enum"];
        return reservedTypes.indexOf(in_typeid) >= 0;
    }

    /**
     * Extract the version number from the given typeid
     * @param in_typeid - The typeid to check against
     * @returns Extracted version
     */
    export function extractVersion(in_typeid): ExtractedVersion {
        if (!in_typeid) {
            throw new Error(MSG.TYPEID_NOT_DEFINED);
        }
        const splitTypeId = in_typeid.split("-");

        return {
            version: splitTypeId[1],
            typeidWithoutVersion: splitTypeId[0],
        };
    }

    /**
 * Extracts the context from a typeid
 *
 * @param in_typeid - The typeid to process
 * @returns The typeid without context, the context and if we have an enum type
 */
    export function extractContext(in_typeid: string | undefined): ExtractedContext {
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
                typeid = `Reference<${typeid}>`;
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
    }

    /**
     * Creates a collection typeid string from the
     * typeid and the context.
     *
     * @param in_typeid - The typeid in the collection
     * @param in_context - The context
     * @param in_enum - Set to true if the type should get an enum tag
     *
     * @returns The combined typeid string
     */
    export function createSerializationTypeId(in_typeid: string, in_context: string, in_enum: boolean): string { // in_enum
        if (in_typeid === "BaseProperty") {
            // Special case for BaseProperties. These get represented as a collection
            // typeid without a child typeid. E.g. map<> instead of map<BaseProperty>
            return `${in_context}<>`;
        } else {
            if (in_enum) {
                return in_context === "" || in_context === "single"
                    ? `enum<${in_typeid}>`
                    : `${in_context}<enum<${in_typeid}>>`;
            } else {
                return `${in_context}<${in_typeid}>`;
            }
        }
    }

    /**
     * Checks, whether the supplied typeid is a reference property type id
     *
     * @param in_typeid - The typeid to check
     * @returns Is this a reference property typeid?
     */
    export function isReferenceTypeId(in_typeid: string | undefined): boolean { // in_enum
        return in_typeid === "Reference" ||
            (in_typeid.substr(0, 10) === "Reference<" && in_typeid.substr(-1) === ">");
    }

    /**
     * Returns the type of the properties a reference points to
     *
     * @param in_typeid - The typeid to process
     * @return The type of the referenced property
     */
    export function extractReferenceTargetTypeIdFromReference(in_typeid: string): string { // in_enum
        return in_typeid.substr(0, 10) === "Reference<"
            ? in_typeid.substr(10, in_typeid.length - 11)
            : "BaseProperty";
    }

    /**
     * Checks whether the given type is a template typeid.
     *
     * @param in_typeid - The typeid we want to check
     * @returns Is this a base template typeid?
     */
    export function isSchemaTypeid(in_typeid: string): boolean {
        return typeof in_typeid === "string" && (in_typeid.indexOf(":") !== -1);
    }

    /**
     * Extracts referenced typeid from input typeid
     *
     * @param in_typeid - typeid
     *
     * @return referenced typeid or in_param if it is not a reference
     */
    export function extractTypeId(in_typeid): string {
        const matches = in_typeid.match(/\<(.*?)\>/);
        return matches !== null && matches.length > 0
            ? matches[0].replace(/[\<\>]/gi, "")
            : in_typeid;
    }

    /**
     * Check wether the in_typeid inherits from the in_baseTypeid.
     *
     * @remarks Note: By default, this also returns true if in_typeid === in_baseTypeid.
     *
     * @param in_typeid - Typeid for which we want to check, whethwe in_baseTypeid is a parent.
     * @param in_baseTypeid - The base typeId to check for.
     * @throws If in_typeid or in_baseTypeid are not native typeid.
     * @returns True if in_baseTypeid is a parent of in_typeid.
     */
    export function nativeInheritsFrom(in_typeid: string, in_baseTypeid: string): boolean {
        if (!in_typeid || !in_baseTypeid) {
            throw new Error(MSG.TYPEID_NOT_DEFINED);
        }

        if (in_typeid.substr(0, 10) === "Reference<") {
            in_typeid = "Reference";
        }

        if (in_baseTypeid.substr(0, 10) === "Reference<") {
            in_baseTypeid = "Reference";
        }

        if (!NativeTypes[in_typeid]) {
            throw new Error(MSG.TYPEID_NOT_NATIVE + in_typeid);
        }

        if (!NativeTypes[in_baseTypeid]) {
            throw new Error(MSG.TYPEID_NOT_NATIVE + in_baseTypeid);
        }

        if (in_baseTypeid === "BaseProperty" || in_typeid === in_baseTypeid) {
            return true;
        }

        if (in_typeid === "BaseProperty") {
            return false;
        }

        let parents = NativeTypes[in_typeid]["inherits"];

        // recursively call the function for the parent of the typeid
        for (let i = 0; i < parents.length; i++) {
            if (this.nativeInheritsFrom(parents[i], in_baseTypeid)) {
                return true;
            }
        }
        return false;
    }

    /**
     * return all primitive typeIds
     *
     * @returns return a list of primitiveTypeIds
     */
    export function getPrimitiveTypeIds(): string[] {
        return templateSchemaJson["$defs"]["primitive-typeid"]["enum"];
    }

    /**
     * return all reserved typeIds
     *
     * @returns return a list of reservedTypeIds
     */
    export function getReservedTypeIds(): string[] {
        return templateSchemaJson["$defs"]["reserved-typeid"]["enum"];
    }
}
