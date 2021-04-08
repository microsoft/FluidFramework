/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Basic implementation of part of the PropertyFactory needed to run test on validation.
 */

const TemplateValidator = require('..').TemplateValidator;
const typeIdHelper = require('..').TypeIdHelper;

var SchemaValidator = function(in_params) {
  this.schemaMap = {};
};

SchemaValidator.prototype.inheritsFrom = function(in_templateTypeid, in_baseTypeid, in_options) {
  in_options = in_options || {};

  if (in_templateTypeid === in_baseTypeid &&
    (!!in_options.includeSelf || in_options.includeSelf === undefined)) {
    return true;
  }

  var parents = {};
  this.getAllParentsForTemplate(in_templateTypeid, parents, true);

  return parents[in_baseTypeid] !== undefined;
};

SchemaValidator.prototype.hasSchema = function(typeid) {
  return this.schemaMap[typeid] !== undefined;
};

SchemaValidator.prototype.register = function(schema) {
  this.schemaMap[schema.typeid] = schema;
};

SchemaValidator.prototype.inheritsFromAsync = function(child, ancestor) {
  return new Promise(function(resolve, reject) {
    setTimeout(function() {
      try {
        resolve(this.inheritsFrom(child, ancestor));
      } catch (error) {
        console.error('Error in inheritsFrom: ', error);
        reject(error);
      }
    }, 5);
  });
};

SchemaValidator.prototype.hasSchemaAsync = function(typeid) {
  return new Promise(function(resolve, reject) {
    setTimeout(function() {
      resolve(this.schemaMap[typeid] !== undefined);
    }, 5);
  });
};

SchemaValidator.prototype.getAllParentsForTemplate = function(in_typeid, out_parents, in_includeBaseProperty) {
  if (typeIdHelper.isPrimitiveType(in_typeid)) {
    // Everything inherits from BaseProperty.
    if (in_includeBaseProperty) {
      out_parents['ContainerProperty'] = true;
    }

    return;
  }

  var template = this.schemaMap[in_typeid];
  if (!template) {
    throw new Error('Missing typeid: ' + in_typeid);
  }

  // Everything inherits from BaseProperty.
  if (in_includeBaseProperty) {
    out_parents['ContainerProperty'] = true;
  }

  // Run over all parents and insert them into the parents array
  if (template.inherits) {
    // We have to distinguish the cases where the parents are either specified as a single string or an array
    var parents = Array.isArray(template.inherits) ? template.inherits : [template.inherits];

    for (var i = 0; i < parents.length; i++) {
      // Mark it as parent
      out_parents[parents[i]] = true;

      // Continue recursively
      this.getAllParentsForTemplate(parents[i], out_parents, undefined);
    }
  }
};

SchemaValidator.prototype.validate = function(in_schema, in_previousSchema, in_async, in_skipSemver, in_allowDraft) {
  var in_skipSemver = in_skipSemver || false;

  if (in_async) {
    var options = {
      inheritsFromAsync: this.inheritsFromAsync,
      hasSchemaAsync: this.hasSchemaAsync,
      skipSemver: in_skipSemver,
      allowDraft: in_allowDraft
    };
    var templateValidator = new TemplateValidator(options);

    return templateValidator.validateAsync(in_schema, in_previousSchema);
  } else {
    var options = {
      inheritsFrom: this.inheritsFrom,
      hasSchema: this.hasSchema,
      skipSemver: in_skipSemver,
      allowDraft: in_allowDraft
    };
    var templateValidator = new TemplateValidator(options);

    return templateValidator.validate(in_schema, in_previousSchema);
  }
};

module.exports = SchemaValidator;
