/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Helper functions to work with path strings
 */

const PROPERTY_PATH_DELIMITER = require('@fluid-experimental/property-common').constants.PROPERTY_PATH_DELIMITER;
const MSG = require('@fluid-experimental/property-common').constants.MSG;

/**
 * Helper functions for string processing
 *
 * @namespace
 * @alias     property-changeset.PathHelper
 * @class
 * @public
 * @category PropertyUtils
 */
var PathHelper = {};

var RE_ALL_OPEN_SQUARE_BRACKETS = new RegExp('[[]', 'g');

/**
 * Token Types
 * @enum Object
 * Type of the token in the path string
 */
PathHelper.TOKEN_TYPES = {
  /** A normal path segment, separated via . */
  PATH_SEGMENT_TOKEN: 0,
  /** An array path segment, separated via [ ] */
  ARRAY_TOKEN: 1,
  /** A / at the beginning of the path */
  PATH_ROOT_TOKEN: 2,
  /** A * that indicates a dereferencing operation */ // note: reversed!
  DEREFERENCE_TOKEN: 3,
  /** A ../ that indicates one step above the current path */
  RAISE_LEVEL_TOKEN: 4
};

/**
 * Tokenizes a path string
 *
 * @param {string}                               in_path     - The path string to divide into tokens
 * @param {property-changeset.PathHelper.TOKEN_TYPES} [out_types] - The types of the tokens
 *
 * @return {Array.<string>} the tokens from the path string
 */
PathHelper.tokenizePathString = function(in_path, out_types) { // eslint-disable-line complexity
  var tokens = [];
  var currentToken = '';

  if (out_types) {
    // Make sure out_types is empty
    out_types.splice(0, out_types.length);
  }

  // Handle a / at the beginning of the path by adding a special token for it
  var path_start = 0;
  if (in_path[0] === '/') {
    tokens.push('/');
    if (out_types) {
      out_types.push(PathHelper.TOKEN_TYPES.PATH_ROOT_TOKEN);
    }
    path_start = 1;
  } else if (in_path.substr(0, 3) === '../') {
    // Handle relative paths by extracting the number steps above
    var extractLevel = function(current_path) {
      if (current_path.substr(0, 3) === '../') {
        if (out_types) {
          out_types.push(PathHelper.TOKEN_TYPES.RAISE_LEVEL_TOKEN);
        }
        tokens.push('../');
        extractLevel(current_path.substr(3));
        path_start = path_start + 3;
      }
    };
    extractLevel(in_path);
  }

  // Let's see if the path is simple enough to use a fast-track algorithm.
  var hackedPath = in_path.substr(path_start);
  if (in_path.indexOf('\\') === -1 && in_path.indexOf('"') === -1 && in_path.indexOf('*') === -1) {
    // Yes, we can do something faster than parsing each character one by one.
    var additionalTokens,
        additionalTypes = [],
        token,
        i;
    // Hack for simplicity, let's first replace all occurences of '[' by '.['
    hackedPath = hackedPath.replace(RE_ALL_OPEN_SQUARE_BRACKETS, '.[');
    // Then split on '.'
    additionalTokens = hackedPath.split('.');
    // And validate each token.
    for (i = 0; i < additionalTokens.length; ++i) {
      token = additionalTokens[i];
      // Empty tokens are considered errors... but shouldn't '' be a valid name?
      if (token.length === 0) {
        // There's an error somewhere. Let's abort the fast-track.
        break;
      } else if (token[0] === '[') {
        if (token.length > 2 && token[token.length - 1] === ']') {
          additionalTypes.push(PathHelper.TOKEN_TYPES.ARRAY_TOKEN);
          additionalTokens[i] = token.substr(1, token.length - 2);
        } else {
          // There's an error somewhere. Let's abort the fast-track.
          break;
        }
      } else {
        if (token.indexOf(']') !== -1) {
          // There's an error somewhere. Let's abort the fast-track.
          break;
        } else {
          // It was a simple property name.
          additionalTypes.push(PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN);
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

  var inSquareBrackets = false;
  var tokenStarted = false;
  var lastTokenWasQuoted = false;

  // We are in a context where an empty token is valid
  var atStartToken = false;
  var allowSegmentStart = true;

  var storeNextToken = function(tokenType) {
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
    currentToken = '';
    tokenStarted  = false;
    atStartToken = false;
    lastTokenWasQuoted = false;
    allowSegmentStart  = false;

    if (out_types) {
      out_types.push(tokenType);
    }
  };

  for (var i = path_start; i < in_path.length; i++ ) {
    var character = in_path[i];

    if (character === '"') {
      // If we encounter a quotation mark, we start parsing the
      // quoted section
      if (!tokenStarted) {
        var endFound = false;

        // Read the quoted token
        for (i++; i < in_path.length; i++) {
          if (in_path[i] === '"') {
            // We have found the end of the quoted token
            endFound = true;
            break;
          } else if (in_path[i] === '\\') {
            // Read an escaped symbol
            if (in_path.length > i + 1) {
              if (in_path[i + 1] === '\\') {
                currentToken += '\\';
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
        storeNextToken(PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN);

        allowSegmentStart = true;
      } else if (character === '[') {
        // An opening square bracket starts a new token
        if (tokenStarted) {
          storeNextToken(PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN);
        }

        // And sets the state to inSquareBrackets
        inSquareBrackets = true;
      } else if (character === ']') {
        throw new Error(MSG.CLOSING_BRACKET_WITHOUT_OPENING + in_path);
      } else if (character === '*') {
        // Store the last token
        if (tokenStarted) {
          storeNextToken(PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN);
        }

        // Create a new dereference token
        tokens.push('*');
        if (out_types) {
          out_types.push(PathHelper.TOKEN_TYPES.DEREFERENCE_TOKEN);
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
      if (character === ']') {
        // A closing square bracket starts a new token
        storeNextToken(PathHelper.TOKEN_TYPES.ARRAY_TOKEN);

        // We now have to check the next character,
        // as only the combinations '][' and '].' are
        // valid
        if (in_path.length > i + 1) { // We only have to check this at the end of the string
          if (in_path[i + 1] === PROPERTY_PATH_DELIMITER) {
            // We are no longer in square brackets
            inSquareBrackets = false;
            allowSegmentStart = true;
            i++;
          } else if (in_path[i + 1] === '[') {
            // We remain in square brackets
            // so inSquareBrackets remains true;
            i++;
          } else if (in_path[i + 1] === '*') {
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
    storeNextToken(PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN);
  }

  return tokens;
};

/**
 * Creates a quoted string for a path seqment to make sure it parses correctly
 *
 * @param {string} in_pathSegment   - The path string to put in quotes
 *
 * @return {string} quoted path string
 */
PathHelper.quotePathSegment = function(in_pathSegment) {
  // WARNING: I use RegExps here, as the normal replace
  //          function only replaces the first occurrence

  // First we escape escape symbols
  in_pathSegment = in_pathSegment.replace(/\\/g, '\\\\');

  // Then we escape quotes
  in_pathSegment = in_pathSegment.replace(/"/g, '\\"');

  // And finally, we put the string into quotation marks
  return '"' + in_pathSegment + '"';
};

/**
 * Adds quotation marks to a path string if they are needed
 *
 * @param {string} in_pathSegment   - The path string to put in quotes
 *
 * @return {string} quoted path string
 */
PathHelper.quotePathSegmentIfNeeded = function(in_pathSegment) {
  if (in_pathSegment.indexOf(PROPERTY_PATH_DELIMITER) !== -1 ||
      in_pathSegment.indexOf('"') !== -1 ||
      in_pathSegment.indexOf('\\') !== -1 ||
      in_pathSegment.indexOf('/') !== -1 ||
      in_pathSegment.indexOf('*') !== -1 ||
      in_pathSegment.indexOf('[') !== -1 ||
      in_pathSegment.indexOf(']') !== -1 ||
      in_pathSegment.length === 0) {
    return PathHelper.quotePathSegment(in_pathSegment);
  } else {
    return in_pathSegment;
  }
};

/**
 * This function checks, whether the supplied path is a valid repository absolute path.
 *
 * It has to be either an empty string, or a path starting with a /
 *
 * @param {String} in_path - The path to check
 */
PathHelper.checkValidRepositoryAbsolutePath = function(in_path) {
  if (in_path !== '' &&     // either an empty reference
      in_path[0] !== '/') { // or an absolute path starting with /
    throw new Error(MSG.INVALID_PATH_IN_REFERENCE);
  }
};

/**
 * This utility function provides a canonical representation of an absolute property path.
 * It is useful to compare partial checkout paths and property paths.
 * The canonical form of paths is not suitable for ChangeSets.
 *
 * @param {string} in_absolutePath - The absolute path to make canonical
 * @return {string} Absolute path in canonical form
 */
PathHelper.convertAbsolutePathToCanonical = function(in_absolutePath) {
  const tokenTypes = [];
  const tokens = PathHelper.tokenizePathString(in_absolutePath, tokenTypes);
  let path = '';
  for (let i = 0; i < tokenTypes.length; i++) {
    let tokenType = tokenTypes[i];
    switch (tokenType) {
      case PathHelper.TOKEN_TYPES.PATH_ROOT_TOKEN:
        // Skip the leading '/'
        break;
      case PathHelper.TOKEN_TYPES.RAISE_LEVEL_TOKEN:
        throw new Error('No level up ("../") is expected in an absolute path: ' + in_absolutePath);
      case PathHelper.TOKEN_TYPES.DEREFERENCE_TOKEN:
        throw new Error('Dereference ("*") is not supported in canonical paths: ' + in_absolutePath);
      case PathHelper.TOKEN_TYPES.ARRAY_TOKEN:
      case PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN:
        path += (PROPERTY_PATH_DELIMITER + PathHelper.quotePathSegmentIfNeeded(tokens[i]));
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
 * @param {string} in_parentAbsolutePathCanonical - The absolute path of the parent property in canonical form
 * @param {string} in_childId - The name of the child property in its parent
 * @return {string} Absolute path of the child property in canonical form
 */
PathHelper.getChildAbsolutePathCanonical = function(in_parentAbsolutePathCanonical, in_childId) {
  const childPath = PathHelper.quotePathSegmentIfNeeded(String(in_childId));
  if (in_parentAbsolutePathCanonical) {
    return (in_parentAbsolutePathCanonical + PROPERTY_PATH_DELIMITER + childPath);
  } else {
    return childPath;
  }
};


/**
 * @enum {number}
 */
PathHelper.CoverageExtent = {
  // The base path is not covered by any path from a given list of paths.
  // This means a property with this path and all its children would not be covered.
  UNCOVERED: 0,
  // The base path is partially covered by at least one path from a given list of paths.
  // This means a property with this path would be covered, but some of its children could be uncovered.
  PARTLY_COVERED: 1,
  // The base path is fully covered by at least one path from a given list of paths.
  // This means a property with this path would be covered and all of its children would be covered also.
  FULLY_COVERED: 2
};

/**
 * @typedef {Object} PathHelper.BasePathCoverage
 * @property {PathHelper.CoverageExtent} coverageExtent - The extent of the coverage
 * @property {array<string>} pathList - The list of paths participating in the coverage
 */

/**
 * Determines if the base path is covered by the given list of paths. From that you can deduce if a
 * property with that path and all its children are covered by the given list of paths.
 *
 * This function uses the canonical representation of the property paths.
 *
 * @param {string} in_basePath - The property's absolute path in canonical form
 * @param {array<string>} in_paths - The array of paths that must cover the property and its children
 * @return {PathHelper.BasePathCoverage} The coverage of the property and its children. For a coverage of
 *    'FULLY_COVERED', only the first matching path is returned.
 * @private
 */
PathHelper.getPathCoverage = function(in_basePath, in_paths) {
  // First, check if the base path is entirely included in one of the paths
  for (let i = 0; i < in_paths.length; i++) {
    if (in_basePath.startsWith(in_paths[i])) {
      return {
        coverageExtent: PathHelper.CoverageExtent.FULLY_COVERED,
        pathList: [in_paths[i]]
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
      coverageExtent: PathHelper.CoverageExtent.PARTLY_COVERED,
      pathList: paths
    };
  }

  // We did not find any path covering the given base path.
  return {
    coverageExtent: PathHelper.CoverageExtent.UNCOVERED,
    pathList: paths
  };
};


module.exports = PathHelper;
