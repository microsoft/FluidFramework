/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Helper functions to work with path strings
 */

// @ts-ignore
import { constants } from '@fluid-experimental/property-common';

const { PROPERTY_PATH_DELIMITER, MSG } = constants;

export type PathTree = Map<String, PathTree>;

/**
 * Helper functions for string processing
 */
export namespace PathHelper {

    const RE_ALL_OPEN_SQUARE_BRACKETS = new RegExp("[[]", "g");

    /**
     * Token Types
     * Type of the token in the path string
     */
    export enum TOKEN_TYPES {
        /** A normal path segment, separated via . */
        PATH_SEGMENT_TOKEN,
        /** An array path segment, separated via [ ] */
        ARRAY_TOKEN,
        /** A / at the beginning of the path */
        PATH_ROOT_TOKEN,
        /** A * that indicates a dereferencing operation */ // note: reversed!
        DEREFERENCE_TOKEN,
        /** A ../ that indicates one step above the current path */
        RAISE_LEVEL_TOKEN,
    }

    /**
     * Tokenizes a path string
     *
     * @param in_path     - The path string to divide into tokens
     * @param out_types - The types of the tokens
     *
     * @returns the tokens from the path string
     */
    export const tokenizePathString = function(in_path: string, out_types?: TOKEN_TYPES[]): string[] { // eslint-disable-line complexity
        const tokens = [];
        let currentToken = "";

        if (out_types) {
            // Make sure out_types is empty
            out_types.splice(0, out_types.length);
        }

        // Handle a / at the beginning of the path by adding a special token for it
        let path_start = 0;
        if (in_path[0] === "/") {
            tokens.push("/");
            if (out_types) {
                out_types.push(TOKEN_TYPES.PATH_ROOT_TOKEN);
            }
            path_start = 1;
        } else if (in_path.substr(0, 3) === "../") {
            // Handle relative paths by extracting the number steps above
            var extractLevel = function(current_path) {
                if (current_path.substr(0, 3) === "../") {
                    if (out_types) {
                        out_types.push(TOKEN_TYPES.RAISE_LEVEL_TOKEN);
                    }
                    tokens.push("../");
                    extractLevel(current_path.substr(3));
                    path_start = path_start + 3;
                }
            };
            extractLevel(in_path);
        }

        // Let's see if the path is simple enough to use a fast-track algorithm.
        let hackedPath = in_path.substr(path_start);
        if (in_path.indexOf("\\") === -1 && in_path.indexOf('"') === -1 && in_path.indexOf("*") === -1) {
            // Yes, we can do something faster than parsing each character one by one.
            let additionalTokens: string[] = [];
            const additionalTypes = [];
            let token: string | string[];
            let i: number;
            // Hack for simplicity, let's first replace all occurences of '[' by '.['
            hackedPath = hackedPath.replace(RE_ALL_OPEN_SQUARE_BRACKETS, ".[");
            // Then split on '.'
            additionalTokens = hackedPath.split(".");
            // And validate each token.
            for (i = 0; i < additionalTokens.length; ++i) {
                token = additionalTokens[i];
                // Empty tokens are considered errors... but shouldn't '' be a valid name?
                if (token.length === 0) {
                    // There's an error somewhere. Let's abort the fast-track.
                    break;
                } else if (token[0] === "[") {
                    if (token.length > 2 && token[token.length - 1] === "]") {
                        additionalTypes.push(TOKEN_TYPES.ARRAY_TOKEN);
                        additionalTokens[i] = token.substr(1, token.length - 2);
                    } else {
                        // There's an error somewhere. Let's abort the fast-track.
                        break;
                    }
                } else {
                    if (token.indexOf("]") !== -1) {
                        // There's an error somewhere. Let's abort the fast-track.
                        break;
                    } else {
                        // It was a simple property name.
                        additionalTypes.push(TOKEN_TYPES.PATH_SEGMENT_TOKEN);
                    }
                }
            }
            if (i === additionalTokens.length) {
                // Parsed everything successfully so end function here.
                if (out_types) {
                    for (i = 0; i < additionalTypes.length; i++) {
                        out_types.push(additionalTypes[i]);
                    }
                }
                return tokens.concat(additionalTokens);
            }
        }

        let inSquareBrackets = false;
        let tokenStarted = false;
        let lastTokenWasQuoted = false;

        // We are in a context where an empty token is valid
        let atStartToken = false;
        let allowSegmentStart = true;

        const storeNextToken = function(tokenType) {
            // Make sure, this is not an empty token (E.g. a .. or a [] )
            if (!tokenStarted) {
                if (!atStartToken) {
                    throw new Error(MSG.EMPTY_TOKEN + in_path);
                } else {
                    return;
                }
            }

            // Store the token
            tokens.push(currentToken);
            currentToken = "";
            tokenStarted = false;
            atStartToken = false;
            lastTokenWasQuoted = false;
            allowSegmentStart = false;

            if (out_types) {
                out_types.push(tokenType);
            }
        };

        for (var i = path_start; i < in_path.length; i++) {
            const character = in_path[i];

            if (character === '"') {
                // If we encounter a quotation mark, we start parsing the
                // quoted section
                if (!tokenStarted) {
                    let endFound = false;

                    // Read the quoted token
                    for (i++; i < in_path.length; i++) {
                        if (in_path[i] === '"') {
                            // We have found the end of the quoted token
                            endFound = true;
                            break;
                        } else if (in_path[i] === "\\") {
                            // Read an escaped symbol
                            if (in_path.length > i + 1) {
                                if (in_path[i + 1] === "\\") {
                                    currentToken += "\\";
                                    i++;
                                } else if (in_path[i + 1] === '"') {
                                    currentToken += '"';
                                    i++;
                                } else {
                                    throw new Error(MSG.INVALID_ESCAPE_SEQUENCE + in_path);
                                }
                            } else {
                                throw new Error(MSG.INVALID_ESCAPE_SEQUENCE + in_path);
                            }
                        } else {
                            // Everything else is just added to the token
                            currentToken += in_path[i];
                        }
                    }

                    if (!endFound) {
                        throw new Error(MSG.UNCLOSED_QUOTATION_MARKS + in_path);
                    }
                    lastTokenWasQuoted = true;
                    tokenStarted = true;
                } else {
                    throw new Error(MSG.QUOTES_WITHIN_TOKEN + in_path);
                }
            } else if (!inSquareBrackets) {
                if (character === PROPERTY_PATH_DELIMITER) {
                    // A dot symbols starts a new token
                    storeNextToken(TOKEN_TYPES.PATH_SEGMENT_TOKEN);

                    allowSegmentStart = true;
                } else if (character === "[") {
                    // An opening square bracket starts a new token
                    if (tokenStarted) {
                        storeNextToken(TOKEN_TYPES.PATH_SEGMENT_TOKEN);
                    }

                    // And sets the state to inSquareBrackets
                    inSquareBrackets = true;
                } else if (character === "]") {
                    throw new Error(MSG.CLOSING_BRACKET_WITHOUT_OPENING + in_path);
                } else if (character === "*") {
                    // Store the last token
                    if (tokenStarted) {
                        storeNextToken(TOKEN_TYPES.PATH_SEGMENT_TOKEN);
                    }

                    // Create a new dereference token
                    tokens.push("*");
                    if (out_types) {
                        out_types.push(TOKEN_TYPES.DEREFERENCE_TOKEN);
                    }

                    // Reset the token started flag
                    tokenStarted = false;
                    atStartToken = true;
                    allowSegmentStart = false;
                } else {
                    if (!tokenStarted &&
                        !allowSegmentStart &&
                        !inSquareBrackets) {
                        throw new Error(MSG.MISSING_DOT_AT_SEGMENT_START + in_path);
                    }

                    currentToken += character;

                    // We have started parsing the token
                    tokenStarted = true;

                    // When a symbols appears after a closing quotation mark, we have an error
                    if (lastTokenWasQuoted) {
                        throw new Error(MSG.QUOTES_WITHIN_TOKEN + in_path);
                    }
                }
            } else {
                if (character === "]") {
                    // A closing square bracket starts a new token
                    storeNextToken(TOKEN_TYPES.ARRAY_TOKEN);

                    // We now have to check the next character,
                    // as only the combinations '][' and '].' are
                    // valid
                    if (in_path.length > i + 1) { // We only have to check this at the end of the string
                        if (in_path[i + 1] === PROPERTY_PATH_DELIMITER) {
                            // We are no longer in square brackets
                            inSquareBrackets = false;
                            allowSegmentStart = true;
                            i++;
                        } else if (in_path[i + 1] === "[") {
                            // We remain in square brackets
                            // so inSquareBrackets remains true;
                            i++;
                        } else if (in_path[i + 1] === "*") {
                            // We leave the square brackets
                            inSquareBrackets = false;
                        } else {
                            throw new Error(MSG.INVALID_END_OF_SQUARE_BRACKETS + in_path);
                        }
                    } else {
                        inSquareBrackets = false;
                        tokenStarted = false;
                    }
                } else if (character === PROPERTY_PATH_DELIMITER) {
                    throw new Error(MSG.DOTS_IN_SQUARE_BRACKETS + in_path);
                } else {
                    currentToken += character;

                    // We have started parsing the token
                    tokenStarted = true;

                    // When a symbols appears after a closing quotation mark, we have an error
                    if (lastTokenWasQuoted) {
                        throw new Error(MSG.QUOTES_WITHIN_TOKEN + in_path);
                    }
                }
            }
        }

        // At the end of the path we have to distinguish a few error cases
        if (inSquareBrackets) {
            // There was a un-closed bracket at the end
            throw new Error(MSG.UNCLOSED_BRACKETS + in_path);
        } else if (in_path[in_path.length - 1] === PROPERTY_PATH_DELIMITER) {
            // A path ended with a PROPERTY_PATH_DELIMITER
            throw new Error(MSG.DOT_AT_END + in_path);
        } else if (tokenStarted) {
            // There was a valid, not yet ended token
            storeNextToken(TOKEN_TYPES.PATH_SEGMENT_TOKEN);
        }

        return tokens;
    };

    /**
     * Creates a quoted string for a path seqment to make sure it parses correctly
     *
     * @param in_pathSegment   - The path string to put in quotes
     *
     * @returns quoted path string
     */
    export const quotePathSegment = function(in_pathSegment: string): string {
        // WARNING: I use RegExps here, as the normal replace
        //          function only replaces the first occurrence

        // First we escape escape symbols
        in_pathSegment = in_pathSegment.replace(/\\/g, "\\\\");

        // Then we escape quotes
        in_pathSegment = in_pathSegment.replace(/"/g, '\\"');

        // And finally, we put the string into quotation marks
        return `"${in_pathSegment}"`;
    };

    /**
     * Reverse a quoted/escaped string for a path seqment
     *
     * @param in_quotedPathSegment   - The quoted/escaped path string to put in quotes
     *
     * @return unquoted path string
     */
    export const unquotePathSegment = function(in_quotedPathSegment: string): string {
        if (typeof in_quotedPathSegment !== "string") {
            throw new Error(`Expecting a string as a path: ${in_quotedPathSegment}`);
        }

        if (in_quotedPathSegment[0] === '"' && in_quotedPathSegment[in_quotedPathSegment.length - 1] === '"') {
            // We remove double quotes
            in_quotedPathSegment = in_quotedPathSegment.substr(1, in_quotedPathSegment.length - 2);

            // Then we unescape escape symbols
            in_quotedPathSegment = in_quotedPathSegment.replace(/\\\\/g, "\\");

            // Then we unescape quotes
            in_quotedPathSegment = in_quotedPathSegment.replace(/\\"/g, '"');
        }

        return in_quotedPathSegment;
    };

    /**
     * Adds quotation marks to a path string if they are needed
     *
     * @param in_pathSegment   - The path string to put in quotes
     *
     * @returns quoted path string
     */
    export const quotePathSegmentIfNeeded = function(in_pathSegment: string): string {
        if (in_pathSegment.indexOf(PROPERTY_PATH_DELIMITER) !== -1 ||
            in_pathSegment.indexOf('"') !== -1 ||
            in_pathSegment.indexOf("\\") !== -1 ||
            in_pathSegment.indexOf("/") !== -1 ||
            in_pathSegment.indexOf("*") !== -1 ||
            in_pathSegment.indexOf("[") !== -1 ||
            in_pathSegment.indexOf("]") !== -1 ||
            in_pathSegment.length === 0) {
            return quotePathSegment(in_pathSegment);
        } else {
            return in_pathSegment;
        }
    };

    /**
     * This function checks, whether the supplied path is a valid repository absolute path.
     *
     * It has to be either an empty string, or a path starting with a /
     *
     * @param in_path - The path to check
     */
    export const checkValidRepositoryAbsolutePath = function(in_path: string) {
        if (in_path !== "" && // either an empty reference
            in_path[0] !== "/") { // or an absolute path starting with /
            throw new Error(MSG.INVALID_PATH_IN_REFERENCE);
        }
    };

    /**
     * This utility function provides a canonical representation of an absolute property path.
     * It is useful to compare partial checkout paths and property paths.
     * The canonical form of paths is not suitable for ChangeSets.
     *
     * @param in_absolutePath - The absolute path to make canonical
     * @return Absolute path in canonical form
     */
    export const convertAbsolutePathToCanonical = function(in_absolutePath: string): string {
        const tokenTypes = [];
        const tokens = tokenizePathString(in_absolutePath, tokenTypes);
        let path = "";
        for (let i = 0; i < tokenTypes.length; i++) {
            const tokenType = tokenTypes[i];
            switch (tokenType) {
                case TOKEN_TYPES.PATH_ROOT_TOKEN:
                    // Skip the leading '/'
                    break;
                case TOKEN_TYPES.RAISE_LEVEL_TOKEN:
                    throw new Error(`No level up ("../") is expected in an absolute path: ${in_absolutePath}`);
                case TOKEN_TYPES.DEREFERENCE_TOKEN:
                    throw new Error(`Dereference ("*") is not supported in canonical paths: ${in_absolutePath}`);
                case TOKEN_TYPES.ARRAY_TOKEN:
                case TOKEN_TYPES.PATH_SEGMENT_TOKEN:
                    path += (PROPERTY_PATH_DELIMITER + quotePathSegmentIfNeeded(tokens[i]));
                    break;
                default:
                    break;
            }
        }
        // Removes the leading PROPERTY_PATH_DELIMITER.
        if (path) {
            path = path.substring(1);
        }
        return path;
    };

    /**
     * This utility function provides a canonical representation of a child property path.
     * It is useful to compare partial checkout paths and property paths.
     * The canonical form of paths is not suitable for ChangeSets.
     *
     * @param in_parentAbsolutePathCanonical - The absolute path of the parent property in canonical form
     * @param in_childId - The name of the child property in its parent
     * @returns Absolute path of the child property in canonical form
     */
    export const getChildAbsolutePathCanonical = function(in_parentAbsolutePathCanonical: string, in_childId: string): string {
        const childPath = quotePathSegmentIfNeeded(String(in_childId));
        if (in_parentAbsolutePathCanonical) {
            return (in_parentAbsolutePathCanonical + PROPERTY_PATH_DELIMITER + childPath);
        } else {
            return childPath;
        }
    };

    export enum CoverageExtent {
        // The base path is not covered by any path from a given list of paths.
        // This means a property with this path and all its children would not be covered.
        UNCOVERED,
        // The base path is partially covered by at least one path from a given list of paths.
        // This means a property with this path would be covered, but some of its children could be uncovered.
        PARTLY_COVERED,
        // The base path is fully covered by at least one path from a given list of paths.
        // This means a property with this path would be covered and all of its children would be covered also.
        FULLY_COVERED,
    }

    interface BasePathCoverage {
        coverageExtent: CoverageExtent,
        pathList: string[],
    }

    /**
     * Determines if the base path is covered by the given list of paths. From that you can deduce if a
     * property with that path and all its children are covered by the given list of paths.
     *
     * This function uses the canonical representation of the property paths.
     *
     * @param in_basePath - The property's absolute path in canonical form
     * @param in_paths - The array of paths that must cover the property and its children
     * @returns The coverage of the property and its children. For a coverage of
     *    'FULLY_COVERED', only the first matching path is returned.
     */
    export const getPathCoverage = function(in_basePath: string, in_paths: string[]): BasePathCoverage {
        // First, check if the base path is entirely included in one of the paths
        for (let i = 0; i < in_paths.length; i++) {
            if (in_basePath.startsWith(in_paths[i])) {
                return {
                    coverageExtent: CoverageExtent.FULLY_COVERED,
                    pathList: [in_paths[i]],
                };
            }
        }
        // We did not find a path including all the children of this insertion
        // Let's check if there are paths going through it.
        const paths = [];
        for (let i = 0; i < in_paths.length; i++) {
            if (in_paths[i].startsWith(in_basePath)) {
                paths.push(in_paths[i]);
            }
        }
        if (paths.length) {
            // We found at least one path including parts of the base path.
            return {
                coverageExtent: CoverageExtent.PARTLY_COVERED,
                pathList: paths,
            };
        }

        // We did not find any path covering the given base path.
        return {
            coverageExtent: CoverageExtent.UNCOVERED,
            pathList: paths,
        };
    };
}
