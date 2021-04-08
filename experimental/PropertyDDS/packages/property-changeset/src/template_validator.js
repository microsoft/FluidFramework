/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview
 * @description The TemplateValidator can examine consecutive versions of a given template to detect semantic
 * versioning (semver) errors and warn about incorrect versioning practices.
 */
/* eslint-disable no-unused-vars */
/* eslint-disable no-use-before-define */

const Ajv = require('ajv').default;
const _ = require('lodash');
const deepCopy = _.cloneDeep;
const semver = require('semver');
const traverse = require('traverse');
const async = require('async');

const TemplateSchema = require('./template_schema').templateSchema;
const TypeIdHelper = require('./helpers/typeid_helper');
const ValidationResultBuilder = require('./validation_result_builder');
const ConsoleUtils = require('@fluid-experimental/property-common').ConsoleUtils;
const MSG = require('@fluid-experimental/property-common').constants.MSG;

const ajvFactory = new Ajv({
  allErrors: true,
  v5: true,
  verbose: true,
  keywords: [
      require("ajv-keywords/dist/definitions/prohibited")(),
      require("ajv-keywords/dist/definitions/typeof")()
  ]
});
const _syntaxValidator = ajvFactory.compile(TemplateSchema);


/**
 * A weighted enumeration of semver change types. Higher values are more important.
 * PATCH: Annotation and comment changes.
 * MINOR: Added properties.
 * MAJOR: Everything else, including deleting properties.
 * @ignore
 */
const CHANGE_LEVEL = {
  'patch': 0, // '1.0.0' -> '1.0.1'
  'minor': 1, // '1.0.0' -> '1.1.0'
  'major': 2, // '1.5.2' -> '2.0.0'

  'prerelease': 0, // '1.0.0-alpha.1' -> '1.0.0'
  'prepatch':   0, // '1.0.0-alpha.1' -> '1.0.1'
  'preminor':   1, // '1.0.0-alpha.1' -> '1.1.0'
  'premajor':   2  // '1.0.0-alpha.1' -> '2.0.0'
};

const VALID_CONTEXTS = ['single', 'array', 'map', 'set', 'enum'];

var _extractTypeid = function(typeidOrReference) {
  // Take Reference<strong-type-id> and return strong-type-id
  if (!_.isString(typeidOrReference)) {
    throw new Error(MSG.TYPEID_MUST_BE_STRING + typeidOrReference);
  }
  var reference = 'Reference<';
  var result = typeidOrReference || '';
  var isReference = result.indexOf(reference) === 0;
  if (isReference) {
    result = typeidOrReference.substring(reference.length, typeidOrReference.length - 1);
  }
  return result;
};

/**
 * Given a typeid string, fetches the semver 'x.y.z' version string.
 * @param {string} in_typeid A PropertySet typeid. For example: 'TeamLeoValidation2:ColorID-1.0.0'.
 * @return {string|null} The semver 'x.y.z' version string, or null if in_typeid is not a valid
 *   PropertySet typeid.
 * @private
 * @this TemplateValidator
 */
var _getSemverFromTypeId = function(in_typeid) {
  var semverRegex = /.*-(.*)$/g;
  var match = semverRegex.exec(in_typeid);
  return match ? match[1] : null;
};

/**
 * Fetches the type name of a javascript entity.
 * @param {*} in_obj A javascript entity.
 * @return {string} The type name for in_obj.
 * @private
 * @this TemplateValidator
 */
var _getType = function(in_obj) {
  return Object.prototype.toString.call(in_obj).slice(8, -1);
};

/**
 * An object deep compare with special handling for pset property arrays.
 * pset property arrays are allowed to be out of order as long as elements can be matched with
 * their id.
 * @param {*} in_source The source entity to test for deep equality.
 * @param {*} in_target The target entity to test for deep equality.
 * @return {Object} {isEqual: false, path: 'foo.properties[1].x'}
 *   isEqual: true if in_source and in_target property sets are equal, even if the individual
 *     property arrays differ but contain the same out of order elements.
 *   path: path to the property that is not equal.
 * @private
 * @this TemplateValidator
 */
var _psetDeepEquals = function(in_source, in_target) {
  var idPath = [];
  if (in_source && in_source.typeid) {
    idPath.push('<' + in_source.typeid + '>');
  }

  /**
   * Create the _psetDeepEquals result.
   * @param {boolean} isEqual Whether or not a PropertySet result is being constructed for
   *   PropertySets that are deeply equal.
   * @return {{isEqual: boolean, path: string}} An object that indicates whether or not the source
   *   and target PropertySets are deeply equal. If they're not, it also contains a path to the
   *   property that is not equal.
   * @private
   */
  var _getPSetDeepEqualsResult = function(isEqual) {
    return {
      isEqual: isEqual,
      path: isEqual ? undefined : idPath.join('')
    };
  };

  /**
   * Performs a recursive, depth first deep equal test against two PropertySets.
   * @param {*} source The source entity to test for deep equality.
   * @param {*} target The target entity to test for deep equality.
   * @param {?string} id The current path element being compared.
   * @return {Object} The result of _getPSetDeepEqualsResult
   * @private
   * @this TemplateValidator
   */
  var _depthFirstDeepEquals = function(source, target, id) {
    var result = _getPSetDeepEqualsResult(true);

    if (id) {
      if (typeof id === 'number') {
        idPath.push('[' + id + ']');
      } else {
        idPath.push('.' + id);
      }
    }

    if (_.isArray(source)) {
      if (!_.isArray(target)) {
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
      var isPropertyArray = _.every(source, function(entry) {
        return _.isObject(entry) && !_.isUndefined(entry.id);
      });
      if (isPropertyArray) {
        var targetMap = {};
        _.each(target, function(element) {
          targetMap[element.id] = element;
        });

        for (var i = 0; i < source.length && result.isEqual; i++) {
          var sourceId = source[i].id;
          result = _depthFirstDeepEquals.call(this, source[i], targetMap[sourceId], sourceId);
          idPath.pop();
        }
      } else {
        // Element order matters
        for (var i = 0; i < source.length && result.isEqual; i++) {
          result = _depthFirstDeepEquals.call(this, source[i], target[i], i);
          idPath.pop();
        }
      }
    } else if (_.isObject(source)) {
      if (!_.isObject(target)) {
        return _getPSetDeepEqualsResult(false);
      }

      var keysSource = _.keys(source);
      var keysTarget = _.keys(target);
      if (keysSource.length !== keysTarget.length) {
        // A template with abstract properties must equal one with an empty properties array
        // We check the difference in keys between the source and target and if the only difference is the
        // properties array we check if it's empty. Then we reverse the condition so it work both ways.
        if (
          (_.isEqual(_.difference(keysTarget, keysSource), ['properties']) && !target.properties.length) ||
          (_.isEqual(_.difference(keysSource, keysTarget), ['properties']) && !source.properties.length)
        ) {
          return _getPSetDeepEqualsResult(true);
        }

        return _getPSetDeepEqualsResult(false);
      }

      for (var i = 0; i < keysSource.length && result.isEqual; i++) {
        var keyName = keysSource[i];
        var id = keyName === 'properties' ? undefined : keyName;
        result = _depthFirstDeepEquals.call(this, source[keyName], target[keyName], id);
        if (id) {
          idPath.pop();
        }
      }
    } else {
      result = _getPSetDeepEqualsResult(
        _getType.call(this, source) === _getType.call(this, target) && source === target
      );
    }

    return result;
  };

  return _depthFirstDeepEquals.call(this, in_source, in_target);
};

/**
 * Fetches the non semver part of a typeid string.
 * @param {string} in_typeid A PropertySet typeid. For example: 'TeamLeoValidation2:ColorID-1.0.0'.
 * @return {string|null} The typeid, without a semver.
 * @private
 * @this TemplateValidator
 */
var _stripSemverFromTypeId = function(in_typeid) {
  var semverRegex = /(.*)-.*$/g;
  var match = semverRegex.exec(in_typeid);
  return match ? match[1] : null;
};

var _unresolvedTypes = function(in_template) {
  var first = true;
  var that = this;
  var accSet = traverse(in_template).reduce(function(acc, x) {
    if (first) {
      acc = {};
      first = false;
    }
    if (_.isObject(x) && _.has(x, 'typeid')) {
      var extractedTypeid = _extractTypeid.call(that, x.typeid);

      if (!TypeIdHelper.isPrimitiveType(extractedTypeid)) {
        acc[extractedTypeid] = '';
      }
    }
    return acc;
  });

  return _.keys(accSet);
};

/**
 * Performs basic template validation.
 * @param {Object} in_template The template object to validate.
 * @private
 * @this TemplateValidator
 */
var _validateBasic = function(in_template) {
  if (!in_template) {
    this._resultBuilder.addError(new Error(MSG.NO_TEMPLATE));
  } else if (!in_template.typeid) {
    this._resultBuilder.addError(new Error(MSG.MISSING_TYPE_ID + JSON.stringify(in_template)));
  }
};

/**
 * Validations performed when the version increases between consecutive HFDM templates.
 * For example: 1.1.3 -> 2.0.0
 * This function checks the change level (PATCH, MINOR, MAJOR) and analyses the template content
 * to emit warnings if the change level should be higher, given the content that changed.
 * This function assumes that: in_versionPrevious < in_version
 * @param {Object} in_template The latest template object.
 * @param {Object} in_templatePrevious The previous template object.
 * @param {string} in_version The latest template version. Ex.: '2.0.0'.
 * @param {string} in_versionPrevious The previous template version. Ex.: '1.1.3'.
 * @private
 * @this TemplateValidator
 */
var _validatePositiveIncrement = function(in_template, in_templatePrevious, in_version, in_versionPrevious) {
  ConsoleUtils.assert(
    semver.gt(in_version, in_versionPrevious),
    'property-changeset.TemplateValidator._validatePositiveIncrement called on non incremental ' +
    'template versions'
  );

  var versionDiff = semver.diff(in_version, in_versionPrevious);

  if (CHANGE_LEVEL[versionDiff] >= CHANGE_LEVEL['major']) {
    // No need to warn about change levels since they're already declared to be major.
    return;
  }

  if (semver.major(in_version) === 0) {
    // Unstable version doesn't produce any warning.
    return;
  }

  var idPath = ['<' + in_template.typeid + '>'];

  var _depthFirstCompare = function(id, sourceObj, targetObj) {
    if (id === 'annotation') {
      // Here, we know that the version has increased (patch, prepatch or prerelease), so
      // there's no need to check inside comments for changes.
      return;
    }

    if (id) {
      idPath.push(id);
    }

    if (_.isUndefined(sourceObj) !== _.isUndefined(targetObj)) {
      var minimumLevel;
      var mutation;

      if (_.isUndefined(targetObj)) {
        // An element has been deleted.
        minimumLevel = 'major';
        mutation = 'delete';
      } else {
        // An element has been added
        minimumLevel = 'minor';
        mutation = 'add';
      }

      if (CHANGE_LEVEL[versionDiff] < CHANGE_LEVEL[minimumLevel]) {
        // Violates rule 6 (warning).
        this._resultBuilder.addWarning(
          MSG.CHANGE_LEVEL_TOO_LOW_1 + JSON.stringify({
            mutation: mutation,
            id: idPath.join('.'),
            level: {
              expected: minimumLevel,
              actual: versionDiff
            },
            version: {
              current: in_version,
              previous: in_versionPrevious
            }
          })
        );
      }
    } else {
      var sourceObjType = _getType.call(this, sourceObj);
      var targetObjType = _getType.call(this, targetObj);
      if (sourceObjType !== targetObjType) {
        this._resultBuilder.addWarning(
          MSG.CHANGE_LEVEL_TOO_LOW_1 + JSON.stringify({
            mutation: 'change',
            id: idPath.join('.'),
            type: {
              current: targetObjType,
              previous: sourceObjType
            },
            level: {
              expected: 'major',
              actual: versionDiff
            },
            version: {
              current: in_version,
              previous: in_versionPrevious
            }
          })
        );
      }

      if (_.isArray(sourceObj)) {
        var targetMap = {};
        _.each(targetObj, function(element) {
          targetMap[element.id] = element;
        });

        for (var i = 0; i < sourceObj.length; i++) {
          var element = sourceObj[i];
          _depthFirstCompare.call(this, element.id, element, targetMap[element.id]);
          delete targetMap[element.id];
        }

        if (!_.isEmpty(targetMap)) {
          // Added array element.
          var minimumLevel = 'minor';
          if (CHANGE_LEVEL[versionDiff] < CHANGE_LEVEL[minimumLevel]) {
            // Violates rule 5 (warning)
            idPath.push(_.keys(targetMap)[0]);
            this._resultBuilder.addWarning(
              MSG.CHANGE_LEVEL_TOO_LOW_1 + JSON.stringify({
                mutation: 'add',
                id: idPath.join('.'),
                level: {
                  expected: minimumLevel,
                  actual: versionDiff
                },
                version: {
                  current: in_version,
                  previous: in_versionPrevious
                }
              })
            );
            idPath.pop();
          }
        }
      } else if (_.isObject(sourceObj)) {
        var keysSource = _.keys(sourceObj);
        var targetMap = {};
        _.mapValues(targetObj, function(val, key) {
          targetMap[key] = val;
        });

        for (var i = 0; i < keysSource.length; i++) {
          var valueSource = sourceObj[keysSource[i]];
          var valueTarget = targetObj[keysSource[i]];
          _depthFirstCompare.call(
            this,
            keysSource[i] === 'properties' ? undefined : keysSource[i],
            valueSource,
            valueTarget
          );
          delete targetMap[keysSource[i]];
        }

        var remainingKeys = Object.keys(targetMap);
        if (!_.isEmpty(remainingKeys)) {
          // Added new keys to the target. This is a MINOR change, unless they new key is a
          // comment, in which case this is a PATCH level change.
          var minimumLevel = remainingKeys.length === 1 && remainingKeys[0] === 'annotation' ? 'patch' : 'minor';
          if (CHANGE_LEVEL[versionDiff] < CHANGE_LEVEL[minimumLevel]) {
            // Violates rule 5 (warning)
            idPath.push(remainingKeys[0]);
            this._resultBuilder.addWarning(
              MSG.CHANGE_LEVEL_TOO_LOW_1 + JSON.stringify({
                mutation: 'add',
                id: idPath.join('.'),
                level: {
                  expected: minimumLevel,
                  actual: versionDiff
                },
                version: {
                  current: in_version,
                  previous: in_versionPrevious
                }
              })
            );
            idPath.pop();
          }
        }
      } else {
        if (idPath.length === 2 && id === 'typeid') {
          // This is the root property typeid. Ignore the version component.
          sourceObj = _stripSemverFromTypeId.call(this, valueSource);
          targetObj = _stripSemverFromTypeId.call(this, valueTarget);
        }

        if (sourceObj !== targetObj) {
          var minimumLevel = id === 'value' ? 'minor' : 'major';
          if (CHANGE_LEVEL[versionDiff] < CHANGE_LEVEL[minimumLevel]) {
            this._resultBuilder.addWarning(
              MSG.CHANGE_LEVEL_TOO_LOW_1 + JSON.stringify({
                mutation: 'change',
                id: idPath.join('.'),
                level: {
                  expected: minimumLevel,
                  actual: versionDiff
                },
                value: {
                  current: targetObj,
                  previous: sourceObj
                },
                version: {
                  current: in_version,
                  previous: in_versionPrevious
                }
              })
            );
          }
        }
      }
    }

    if (id) {
      idPath.pop();
    }
  };

  _depthFirstCompare.call(this, in_templatePrevious.id, in_templatePrevious, in_template);
};


/**
 * Validations performed when the version between consecutive HFDM templates doesn't change.
 * For example: 1.1.3 -> 1.1.3.
 * Templates whose version didn't change should have identical content.
 * @param {Object} in_template The latest template object.
 * @param {Object} in_templatePrevious The previous template object.
 * @private
 * @this TemplateValidator
 */
var _validateSameVersion = function(in_template, in_templatePrevious) {
  var result = _psetDeepEquals.call(this, in_templatePrevious, in_template);
  if (!result.isEqual) {
    // Violates rule 3a.
    this._resultBuilder.addError(new Error(MSG.MODIFIED_TEMPLATE_SAME_VERSION_1 + result.path));
  }
};

/**
 * Validate a template
 * Check that the template is syntactically correct as well as semantically correct.
 * @param {object} in_template The template to check against
 * Produces an {object|undefined} map of key-value pairs
 *  where the path of the invalid property is the key and the value is the error message
 *  i.e.
 *  <pre>
 *    {
 *      'isValid': true or false,
 *      'typeid': 'The typeid of the object being parsed',
 *      'unresolvedTypes': [ 'An array', 'of strong typeids', 'that were found',
 *        'in the document', 'but not resolved from the local cache' ],
 *      'resolvedTypes': [ 'Array of', 'strong types resolved', 'during template parsing'],
 *      'errors': [ 'Array of', 'objects describing', 'syntax errors in the template' ]
 *      ...
 *    }
 *  </pre>
 * @throws if context validation fails
 * @ignore
 */
var _validateSemanticAndSyntax = function(in_template) {
  _validateSyntax.call(this, in_template);
  _validateConstants.call(this, in_template);
  // TODO: _validateSemantic
};

/**
 * Validate a template
 * Check that the template is syntactically correct as well as semantically correct.
 * @param {object} in_template The template to check against
 * @return {Promise} a promise that resolved to nothing
 * @ignore
 */
var _validateSemanticAndSyntaxAsync = function(in_template) {
  return _validateSyntaxAsync.call(this, in_template);
};

/**
 * Validates that the semver part of a template's typeid is valid.
 * @param {Object} in_template The template object to validate.
 * @return {string} The semver string. For example: '1.0.0'.
 * @private
 * @this TemplateValidator
 * @ignore
 */
var _validateSemverFormat = function(in_template) {
  var templateVersion = _getSemverFromTypeId.call(this, in_template.typeid);
  if (!templateVersion) {
    this._resultBuilder.addError(new Error(MSG.MISSING_VERSION + in_template.typeid));
  } else if (semver.valid(templateVersion) !== templateVersion) {
    this._resultBuilder.addError(new Error(MSG.INVALID_VERSION_1 + templateVersion));
  }

  return templateVersion;
};

/**
 * Skip semver validation. Verify that the content is the same for both templates, while ignoring
 * the root 'typeid' property.
 * @param {Object} in_template The latest template object.
 * @param {Object} in_templatePrevious The previous template object.
 * @private
 * @this TemplateValidator
 */
var _validateSkipSemver = function(in_template, in_templatePrevious) {
  // Skipping the semver validation. Ignore the root typeid field.
  var result = _psetDeepEquals.call(this, in_template, in_templatePrevious);
  if (!result.isEqual) {
    // Violates rule 3a.
    this._resultBuilder.addError(new Error(MSG.MODIFIED_TEMPLATE_1 + result.path));
  }
};

/**
 * Checks if an invalid context error should be signified

 * @param {String} in_context The latest template object.
 * @return {Error|undefined} If exists returns the InvalidContext error
 * @private
 * @this TemplateValidator
 */
var getInvalidContextError = function(in_context) {
  if (in_context && !_.includes(VALID_CONTEXTS, in_context)) {
    return new Error(MSG.NOT_A_VALID_CONTEXT + ' ' + in_context);
  }

  return undefined;
};

/**
 * Validate that the context is valid
 * Validate that only Named Properties are in sets
 * @param {object} in_template The template to check against
 * @ignore
 * @throws if the context is invalid.
 */
var _validateContext = function(in_template) {
  var that = this;
  var context = in_template.context;

  let error = getInvalidContextError(context);
  if (error) {
    throw error;
  }
  if (context === 'map' && in_template.contextKeyType === 'typeid') {
    throw new Error(MSG.INVALID_OPTION_NONE_CONSTANTS);
  }
};

/**
 * Validate just the syntax of a template
 * Check that the template is well-formed, according to the schema.
 * @param {object} in_template The template to check against
 *
 * Context validation makes sure that elements of sets eventually inherit from NamedProperty.
 * If this is not the case, a promise rejection will occur with the appropriate error.
 * @return {Promise} promise that returns without any value and rejects in case of validation error
 * @ignore
 */
var _validateContextAsync = function(in_template) {
  var that = this;
  var context = in_template.context;
  var result = false;

  let error = getInvalidContextError(context);
  if (error) {
    return Promise.reject(error);
  }
  if (context === 'map' && in_template.contextKeyType === 'typeid') {
    return Promise.reject(new Error(MSG.INVALID_OPTION_NONE_CONSTANTS));
  }
  // If context is not 'set' validation doesn't apply
  if (context !== 'set') {
    return Promise.resolve();
  }

  var typedValuePromises = [Promise.resolve()];
  if (in_template.typedValue) {
    typedValuePromises = _.map(in_template.typedValue, function(tv) {
      return that.inheritsFrom(tv.typeid, 'NamedProperty');
    });
  } else {
    // Since context is 'set' the template must eventually inherit from NamedProperty
    if (in_template.inherits === undefined) {
      return Promise.reject(new Error(MSG.SET_ONLY_NAMED_PROPS));
    }

    // Since context is 'set' the template must eventually inherit from NamedProperty (same as above)
    if (_.includes(in_template.inherits, 'NamedProperty') || in_template.inherits === 'NamedProperty') {
      return Promise.resolve();
    }
  }
  var typedValuePromise = Promise.all(typedValuePromises);

  var parents = {};
  if (in_template.inherits) {
    parents = _.isArray(in_template.inherits) ? in_template.inherits : [in_template.inherits];
  }
  var inheritsPromises = parents.map(typeid => this._inheritsFromAsync(typeid, 'NamedProperty'));

  // Combine results from inheritsPromises and typedValuePromise
  inheritsPromises.push(typedValuePromise);
  return Promise.all(inheritsPromises).then(function(results) {

    var foundNamedPropertyDescendant = _.find(results, res => res);
    if (!foundNamedPropertyDescendant) {
      return Promise.reject(Error(MSG.SET_ONLY_NAMED_PROPS));
    }

    return that._hasSchemaAsync(in_template.typeid);
  }).then(function(hasIt) {
    if (!hasIt) {
      return Promise.reject(new Error(MSG.SET_ONLY_NAMED_PROPS));
    }

    return that._inheritsFromAsync(in_template.typeid, 'NamedProperty');
  }).then(function(res) {
    if (res) {
      return undefined;
    }

    return Promise.reject(new Error(MSG.SET_ONLY_NAMED_PROPS));
  });
};

/**
 * Validate that the context is valid
 * Validate that only Named Properties are in sets
 * @param {object} in_template The template to check against
 * @ignore
 * @throws if the context is invalid.
 */
var _validateConstants = function(in_template) {
  var that = this;
  if (in_template.constants && _.isArray(in_template.constants)) {
    for (var i = 0; i < in_template.constants.length; i++) {
      var constant = in_template.constants[i];
      var context = constant.context;

      if (context === 'map' && constant.contextKeyType === 'typeid') {
        _.each(constant.value, function(value, key) {
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
* @param {object} in_template The template that was analyzed
* @ignore
*/
var _processValidationResults = function(in_template) {
  var that = this;
  var result = this._resultBuilder.result;
  var result = that._resultBuilder.result;

  var that = this;
  var result = this._resultBuilder.result;

  result.isValid = _syntaxValidator(in_template);
  if (!result.isValid) {
    ConsoleUtils.assert(!_.isEmpty(_syntaxValidator.errors), 'template validation failed but produced no error');
  }

  if (_syntaxValidator.errors) {
    _.each(_syntaxValidator.errors, function(error) {
      var regexTypeId = /typeid/;
      switch (error.keyword) {
        case 'pattern':
          if (error.dataPath === '.typeid') {
            error.message = 'typeid should have a pattern like: my.example:point-1.0.0 ' + error.data +
              ' does not match that pattern';
          } else if ('pattern' && regexTypeId.test(error.dataPath)) {
            if (error.schemaPath === '#/definitions/typed-reference-typeid/pattern') {
              error.message = '';
            } else {
              error.message = error.dataPath + ' should follow this pattern: <namespace>:<typeid>-<version> ' +
                '(for example: Sample:Rectangle-1.0.0) or match one of the Primitive Types (Float32, Float64, ' +
                'Int8, Uint8, Int16, Uint16, Int32, Uint32, Bool, String, Reference, Enum, Int64, Uint64) or ' +
                'Reserved Types (BaseProperty, NamedProperty, NodeProperty, NamedNodeProperty, ' +
                'RelationshipProperty). \'' + error.data +
                '\' is not valid';
            }
          }
          break;

        case 'enum':
          if (regexTypeId.test(error.dataPath)) {
            error.message = '';
          } else {
            error.message = error.dataPath + ' should match one of the following: ' + error.schema;
          }
          break;

        case 'type':
          error.message = error.dataPath + ' should be a ' + error.schema;
          break;

        case 'not':
          if (error.schemaPath === '#/switch/1/then/anyOf/0/properties/typeid/not') {
            // remove .typeid at the end of the dataPath
            error.message = 'For ' + error.dataPath.slice(0, -7) +
              ': Properties should have either a typeid or an array of child properties, but not both.';
          } else if (error.schemaPath === '#/switch/1/then/anyOf/1/properties/properties/not') {
            // remove .properties at the end of the dataPath
            error.message = 'For ' + error.dataPath.slice(0, -11) +
              ': Properties should have either a typeid or an array of child properties, but not both.';
          }
          break;

        // these errors do not add any information. All necessary information is in the 'enum' errors
        // empty errors will be filtered out before logging.
        case 'oneOf':
        case 'anyOf':
          error.message = '';
          break;

        // for minItems, required and any other error - add dataPath to indicate which part of the
        // template the error refers to.
        default:
          error.message = error.dataPath + ' ' + error.message;
          break;
      }
      // Deep-copy for thread-safety.
      that._resultBuilder.addError(deepCopy(error));
    });
  }

  result.unresolvedTypes = _unresolvedTypes.call(this, in_template);
};

/**
 * Validate just the syntax of a template
 * Check that the template is well-formed, according to the schema.
 * @param {object} in_template The template to check against
 * @throws if a property with context set is not an instance of NamedProperties
 * @ignore
 */
var _validateSyntax = function(in_template) {
  var that = this;
  // recursively test all properties for context
  var recursiveContextCheck = function(template) {
    _validateContext.call(that, template);
    if (template.properties) {
      template.properties.forEach(function(property) {
        recursiveContextCheck(property);
      });
    }
  };

  recursiveContextCheck(in_template);

  _processValidationResults.call(this, in_template);

  var result = this._resultBuilder.result;
  result.unresolvedTypes = _unresolvedTypes.call(this, in_template);
};

var createContextCheckAsyncQueue = function() {
  var that = this;
  var contextCheckWorker = function(in_task, in_callback) {
    var property = in_task.property;
    _validateContextAsync.call(that, property).then(function(response) {
      in_callback();
    }).catch(function(error) {
      in_callback({ error: error });
    });
  };
  // Async queue for schema context check tasks
  return async.queue(contextCheckWorker, 5);
};

/**
 * Validate just the syntax of a template
 * Check that the template is well-formed, according to the schema.
 *
 * @param {object} in_template The template to check against
 * Mainly checks context. See _validateContextAsync
 * @return {Promise} Promise that resolves without any result
 * @ignore
 */
var _validateSyntaxAsync = function(in_template) {
  var that = this;

  return new Promise(function(resolve, reject) {

    if (that.asyncValidationInProgress === true) {
      reject(new Error(MSG.CONTEXT_VALIDATION_IN_PROGRESS));
      return;
    }

    that.asyncValidationInProgress = true;

    var contextCheckAsyncQueue = createContextCheckAsyncQueue.call(that);

    // recursively test all properties for context
    var recursiveContextCheck = function(template) {
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

    contextCheckAsyncQueue.drain = function() {
      var result = that._resultBuilder.result;
      _processValidationResults.call(that, in_template);
      result.unresolvedTypes = _unresolvedTypes.call(that, in_template);

      that.asyncValidationInProgress = false;
      resolve(result);
    }
  });

};

/**
 * @description Instantiates a new TemplateValidator. Must be provided with a set of inheritsFrom and hasSchema
 * function or inheritsFromAsync and hasSchemaAsync, but not both.
 * @param {?Object} in_params Input parameters.
 * @param {?boolean=} in_params.skipSemver When set to true, {@link #validate} only checks the
 *   supplied templates' content and fails the validation if they're not identical. Defaults to
 *   false.
 * @param {?boolean=} in_params.allowDraft When set to true, the typeid of any schema can have
 *   '-draft' as a version. Defaults to false.
 * @param {?function=} in_params.inheritsFrom a function that checks if a template inherits from another.
 * @param {?function=} in_params.hasSchema a function that checks if we have a template matching a typeid.
 * @param {?function=} in_params.inheritsFromAsync a function that checks if a template inherits from
 * another asynchronously.
 * @param {?function=} in_params.hasSchemaAsync a function that checks if we have a template matching
 * a typeid asynchronously.
 * @constructor
 * @alias TemplateValidator
 */
var TemplateValidator = function(in_params) {

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
};

TemplateValidator.Utils = {};
TemplateValidator.Utils.psetDeepEquals = function(in_source, in_target) {
  return _psetDeepEquals.call(this, in_source, in_target).isEqual;
};

/**
 * Validates that all templates conform to the following mandatory rules:
 * 1. Must have a typeid attribute.
 * 2. typeid must end in a valid semver string.
 * 3. When both in_template (B) and in_templatePrevious (A) are supplied:
 *    3a. Semver is identical only if content is identical.
 *    3b. B's semver >= A's semver
 * Additionally, the following soft rules will produce warnings when violated:
 * 3.5 Elements of sets must eventually inherit from 'NamedProperty'
 * 4. PATCH revision should be increased when _only_ the template description changes.
 * 5. Adding one or more template attributes is a MINOR change.
 * 6. Removing one or more template attributes is a MAJOR change.
 * @param {Object} in_template The latest template version, as a JSON object.
 * @param {?Object} in_templatePrevious The previous template version, as a JSON object. Optional.
 * @return {Object} The validation results. Example: {
 *   isValid: false,
 *   errors: ['Something went wrong. Validation failed.'],
 *   warnings: ['A non-fatal warning'],
 *   typeid: 'SomeNamespace:PointID-1.0.0'
 * }
 * It's possible for 'isValid' to be true while 'warnings' contains one or more messages.
 */
TemplateValidator.prototype.validate = function(in_template, in_templatePrevious) {
  this._resultBuilder = new ValidationResultBuilder(in_template ? in_template.typeid : '');

  let isDraft = false;
  if (in_template && in_template.typeid &&
      TypeIdHelper.extractVersion(in_template.typeid).version === 'draft') {
    if (this._allowDraft) {
      isDraft = true;
    } else {
      this._resultBuilder.addError(
        new Error(MSG.DRAFT_AS_VERSION_TYPEID)
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
  var version = _validateSemverFormat.call(this, in_template);
  var versionPrevious =
    in_templatePrevious ? _validateSemverFormat.call(this, in_templatePrevious) : null;

  // semver format validation must pass.
  if (!this._resultBuilder.isValid()) {
    return this._resultBuilder.result;
  }

  if (in_templatePrevious) {
    // Validate that the semver change is valid.
    switch (semver.compare(version, versionPrevious)) {
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
            current: version, previous: versionPrevious
          }))
        );
        break;
    }
  }

  return this._resultBuilder.result;
};

/**
 * Validates that all templates conform to the following mandatory rules:
 * 1. Must have a typeid attribute.
 * 2. typeid must end in a valid semver string.
 * 3. When both in_template (B) and in_templatePrevious (A) are supplied:
 *    3a. Semver is identical only if content is identical.
 *    3b. B's semver >= A's semver
 * Additionally, the following soft rules will produce warnings when violated:
 * 3.5 Elements of sets must eventually inherit from 'NamedProperty'
 * 4. PATCH revision should be increased when _only_ the template description changes.
 * 5. Adding one or more template attributes is a MINOR change.
 * 6. Removing one or more template attributes is a MAJOR change.
 * @param {Object} in_template The latest template version, as a JSON object.
 * @param {?Object} in_templatePrevious The previous template version, as a JSON object. Optional.
 * @return {Promise} A promise that resolves to the validation results as an object. Example: {
 *   isValid: false,
 *   errors: ['Something went wrong. Validation failed.'],
 *   warnings: ['A non-fatal warning'],
 *   typeid: 'SomeNamespace:PointID-1.0.0'
 * }
 * It's possible for 'isValid' to be true while 'warnings' contains one or more messages.
 */
TemplateValidator.prototype.validateAsync = function(in_template, in_templatePrevious) {
  this._resultBuilder = new ValidationResultBuilder(in_template ? in_template.typeid : '');
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
};

/**
 * Called by validateAsync if a previous schema is passed in argument
 *
 * @param {Object} in_template The latest template version, as a JSON object.
 * @param {Object} in_templatePrevious The previous template version, as a JSON object. Optional.
 *
 * @return {Promise} A promise that resolves to the validation results as an objet. See validateAsync
 * @ignore
 */
TemplateValidator.prototype._validateAsyncWithPreviousSchema = function(in_template, in_templatePrevious) {
  var that = this;
  return _validateSemanticAndSyntaxAsync.call(that, in_template).then(function() {
    return _validateSemanticAndSyntaxAsync.call(that, in_templatePrevious);
  }).then(function() {
    if (!that._resultBuilder.isValid()) {
      // Here the previous template is not valid. Make sure the typeid in the returned info is
      // the root of the template that failed validation.
      that._resultBuilder.result.typeid = in_templatePrevious.typeid;
    }

    if (that._skipSemver && in_templatePrevious) {
      _validateSkipSemver.call(that, in_template, in_templatePrevious);
    }

    var version = _validateSemverFormat.call(that, in_template);
    var versionPrevious = in_templatePrevious ? _validateSemverFormat.call(that, in_templatePrevious) : null;

    // Validate that the semver change is valid.
    switch (semver.compare(version, versionPrevious)) {
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
            current: version, previous: versionPrevious
          }))
        );
        break;
    }

    return that._resultBuilder.result;
  });
};

module.exports = TemplateValidator;
