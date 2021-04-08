/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview
 * Declaration of the PropertyFactory class
 * Responsible for creating property sets and registering property templates
 */
const _ = require('lodash');
const deepCopy = _.cloneDeep;

const Collection = require('@fluid-experimental/property-common').Datastructures.Collection;
const SortedCollection = require('@fluid-experimental/property-common').Datastructures.SortedCollection;
const EventEmitter = require('@fluid-experimental/property-common').Events.EventEmitter;
const generateGUID = require('@fluid-experimental/property-common').GuidUtils.generateGUID;
const MSG = require('@fluid-experimental/property-common').constants.MSG;
const ConsoleUtils = require('@fluid-experimental/property-common').ConsoleUtils;

const TypeIdHelper = require('@fluid-experimental/property-changeset').TypeIdHelper;
const TemplateValidator = require('@fluid-experimental/property-changeset').TemplateValidator;
const PathHelper = require('@fluid-experimental/property-changeset').PathHelper;

const PropertyTemplate = require('./property_template');

// Include the property classes
const BaseProperty = require('./properties/base_property');
const NamedProperty = require('./properties/named_property');
const NodeProperty = require('./properties/node_property');
const NamedNodeProperty = require('./properties/named_node_property');
const ContainerProperty = require('./properties/container_property');

// Include all primitive properties –- will register at the end.
const ValueProperty = require('./properties/value_property');
const Uint32Property = require('./properties/uint_properties').Uint32Property;
const StringProperty = require('./properties/string_property');
const Float32Property = require('./properties/float_properties').Float32Property;
const Int32Property = require('./properties/int_properties').Int32Property;
const Int64Property = require('./properties/int_properties').Int64Property;
const Uint64Property = require('./properties/int_properties').Uint64Property;
const BoolProperty = require('./properties/bool_property');
const ReferenceProperty = require('./properties/reference_property');
const Float64Property = require('./properties/float_properties').Float64Property;
const Uint16Property = require('./properties/uint_properties').Uint16Property;
const Uint8Property = require('./properties/uint_properties').Uint8Property;
const Int16Property = require('./properties/int_properties').Int16Property;
const Int8Property = require('./properties/int_properties').Int8Property;
const EnumProperty = require('./properties/enum_property');

// Include collection properties
const ArrayProperty = require('./properties/array_property');
const SetProperty = require('./properties/set_property');
const MapProperty = require('./properties/map_property');
const ValueMapProperty = require('./properties/value_map_property').ValueMapProperty;
const IndexedCollectionBaseProperty = require('./properties/indexed_collection_base_property');

const Float32ArrayProperty = require('./properties/value_array_property').Float32ArrayProperty;
const Float64ArrayProperty = require('./properties/value_array_property').Float64ArrayProperty;
const Uint32ArrayProperty = require('./properties/value_array_property').Uint32ArrayProperty;
const Int32ArrayProperty = require('./properties/value_array_property').Int32ArrayProperty;
const Uint64ArrayProperty = require('./properties/value_array_property').Uint64ArrayProperty;
const Int64ArrayProperty = require('./properties/value_array_property').Int64ArrayProperty;
const Uint16ArrayProperty = require('./properties/value_array_property').Uint16ArrayProperty;
const Int16ArrayProperty = require('./properties/value_array_property').Int16ArrayProperty;
const Uint8ArrayProperty = require('./properties/value_array_property').Uint8ArrayProperty;
const Int8ArrayProperty = require('./properties/value_array_property').Int8ArrayProperty;
const StringArrayProperty = require('./properties/value_array_property').StringArrayProperty;
const BoolArrayProperty = require('./properties/value_array_property').BoolArrayProperty;
const ReferenceArrayProperty = require('./properties/reference_array_property');
const EnumArrayProperty = require('./properties/enum_array_property');

const Float64MapProperty = require('./properties/value_map_property').Float64MapProperty;
const Float32MapProperty = require('./properties/value_map_property').Float32MapProperty;
const Uint32MapProperty = require('./properties/value_map_property').Uint32MapProperty;
const Uint64MapProperty = require('./properties/value_map_property').Uint64MapProperty;
const Uint16MapProperty = require('./properties/value_map_property').Uint16MapProperty;
const Uint8MapProperty = require('./properties/value_map_property').Uint8MapProperty;
const Int32MapProperty = require('./properties/value_map_property').Int32MapProperty;
const Int64MapProperty = require('./properties/value_map_property').Int64MapProperty;
const Int16MapProperty = require('./properties/value_map_property').Int16MapProperty;
const Int8MapProperty = require('./properties/value_map_property').Int8MapProperty;
const StringMapProperty = require('./properties/value_map_property').StringMapProperty;
const ReferenceMapProperty = require('./properties/reference_map_property');
const BoolMapProperty = require('./properties/value_map_property').BoolMapProperty;

const semver = require('semver');

//const ForgeSchemaStore = require('./schema_stores/forge_schema_store');
const async = require('async');

const LazyLoadedProperties = require('./properties/lazy_loaded_properties');


/**
 * Creates an instance of the TemplateValidator
 *
 * @constructor
 * @protected
 *
 * @param {bool} skipSemver flag passed to the constructor of the
 * TemplateValidator. Skips semver validation
 *
 * @category HFDM
 * @ignore
 */
var _createTemplateValidator = function(skipSemver) {
  var hasSchema = function(typeid) {
    return this._localVersionedTemplates.has(typeid);
  };
  var params = {
    inheritsFrom: this.inheritsFrom.bind(this),
    hasSchema: hasSchema.bind(this)
  };

  if (skipSemver) {
    params.skipSemver = skipSemver;
  }

  return new TemplateValidator(params);
};

/**
 * Creates a new collection of property templates used later on
 * to instantiate property sets based on the typeid (Type identifier).
 *
 * @constructor
 * @protected
 * @alias property-properties.PropertyFactory
 * @category HFDM
 */
var PropertyFactory = function() {
  // Unfortunately, PropertyFactory can't inherit from HfdmEventEmitter class as
  // it shares the same member methods names `register` and `unregister`.
  this._eventEmitter = new EventEmitter();

  this._templateValidator = _createTemplateValidator.call(this);

  // Collection containing both local templates and primitive properties
  this._localPrimitivePropertiesAndTemplates = new Collection();

  // Collection containing the local templates sorted by their version number in an ascending order
  this._localVersionedTemplates = new Collection();

  // Collection containing the remote templates sorted by their version number in an ascending order
  // within a specified scope.
  this._remoteScopedAndVersionedTemplates = new Collection();

  // To hold the template store the PropertyFactory interacts with.
  // Currently we don't have a template store
  this._templateStore = undefined;

  // Async queue of schema retrieval tasks
  this.templateRequestsQueue = undefined;

  // List of missing dependencies
  this.missingDependencies = undefined;

  // Structure containing results the process of retrieving property set schemas from store
  this.templateRequestsResults = {
    errors: {},
    schemas: {}
  };

  // Cache of inheritsFrom() request results
  this._inheritanceCache = {};

  /** Cache of constructor function that are auto-generated for typeids */
  this._typedPropertyConstructorCache = {};

  this._init();
};

 /**
 * Add a listener for a given type of event.
 *
 * @param  {string} eventName A string representing the type of event upon which the
 *   listener will be notified.
 * @param  {function} eventListener The function to call when the "type" of event
 *   is emitted.
 * @public
 */
PropertyFactory.prototype.addListener = function(eventName, eventListener) {
  this._eventEmitter.addListener(eventName, eventListener);
};

 /**
 * Remove a listener for a given type of event. Iff a listener was removed,
 * an event 'removeListener' will be emitted.
 *
 * @param  {string} eventName A string representing the type of event on which the
 *   listener was attached.
 * @param  {function} eventListener The function to remove from the list of functions
 * @public
 **/
PropertyFactory.prototype.removeListener = function(eventName, eventListener) {
  this._eventEmitter.removeListener(eventName, eventListener);
};

/**
 * Initialize the PropertyFactory by registering primitive types
 */
PropertyFactory.prototype._init = function() {
  // Register all primitive properties
  this._registerTypeId( 'BaseProperty', BaseProperty, 'all');
  this._registerTypeId( 'NodeProperty', NodeProperty, 'all');
  this._registerTypeId( 'ContainerProperty', ContainerProperty, 'all');

  // Register the primitive types for the context single
  this._registerTypeId( 'Int8',      Int8Property);
  this._registerTypeId( 'Uint8',     Uint8Property);
  this._registerTypeId( 'Int16',     Int16Property);
  this._registerTypeId( 'Uint16',    Uint16Property);
  this._registerTypeId( 'Int32',     Int32Property);
  this._registerTypeId( 'Int64',     Int64Property);
  this._registerTypeId( 'Uint64',    Uint64Property);
  this._registerTypeId( 'Uint32',    Uint32Property);
  this._registerTypeId( 'Float32',   Float32Property);
  this._registerTypeId( 'Float64',   Float64Property);
  this._registerTypeId( 'Bool',      BoolProperty);
  this._registerTypeId( 'String',    StringProperty);
  this._registerTypeId( 'Reference', ReferenceProperty);
  this._registerTypeId( 'Enum',      EnumProperty);

  // Register the primitive types for the context array
  this._registerTypeId( 'Int8',       Int8ArrayProperty,      'array');
  this._registerTypeId( 'Uint8',      Uint8ArrayProperty,     'array');
  this._registerTypeId( 'Int16',      Int16ArrayProperty,     'array');
  this._registerTypeId( 'Uint16',     Uint16ArrayProperty,    'array');
  this._registerTypeId( 'Int32',      Int32ArrayProperty,     'array');
  this._registerTypeId( 'Uint32',     Uint32ArrayProperty,    'array');
  this._registerTypeId( 'Int64',      Int64ArrayProperty,     'array');
  this._registerTypeId( 'Uint64',     Uint64ArrayProperty,    'array');
  this._registerTypeId( 'Float32',    Float32ArrayProperty,   'array');
  this._registerTypeId( 'Float64',    Float64ArrayProperty,   'array');
  this._registerTypeId( 'String',     StringArrayProperty,    'array');
  this._registerTypeId( 'Bool',       BoolArrayProperty,      'array');
  this._registerTypeId( 'Reference',  ReferenceArrayProperty, 'array');
  this._registerTypeId( 'Enum',       EnumArrayProperty,      'array');

  // Register the primitive types for the context map
  this._registerTypeId( 'Int8',      Int8MapProperty,        'map');
  this._registerTypeId( 'Uint8',     Uint8MapProperty,       'map');
  this._registerTypeId( 'Int16',     Int16MapProperty,       'map');
  this._registerTypeId( 'Uint16',    Uint16MapProperty,      'map');
  this._registerTypeId( 'Int32',     Int32MapProperty,       'map');
  this._registerTypeId( 'Uint32',    Uint32MapProperty,      'map');
  this._registerTypeId( 'Int64',     Int64MapProperty,       'map');
  this._registerTypeId( 'Uint64',    Uint64MapProperty,      'map');
  this._registerTypeId( 'Float32',   Float32MapProperty,     'map');
  this._registerTypeId( 'Float64',   Float64MapProperty,     'map');
  this._registerTypeId( 'Bool',      BoolMapProperty,        'map');
  this._registerTypeId( 'String',    StringMapProperty,      'map');
  this._registerTypeId( 'Reference', ReferenceMapProperty,   'map');

  // Register the default templates
  var NamedPropertyTemplate = {
    typeid: 'NamedProperty',
    properties: [
      { id: 'guid', typeid: 'String' }
    ]
  };

  var NamedNodePropertyTemplate = {
    typeid: 'NamedNodeProperty',
    inherits: ['NodeProperty', 'NamedProperty']
  };

  var RelationshipPropertyTemplate = {
    typeid: 'RelationshipProperty',
    inherits: [ 'NodeProperty', 'NamedProperty' ],
    properties: [
      { id: 'to', typeid: 'Reference' }
    ]
  };

  this._registerTypeId(NamedPropertyTemplate.typeid, NamedPropertyTemplate);
  this._registerTypeId(NamedNodePropertyTemplate.typeid, NamedNodePropertyTemplate);
  this._registerTypeId(RelationshipPropertyTemplate.typeid, RelationshipPropertyTemplate);
};

/**
 * Helper function used to extract the error messages from a list of Error objects
 * @param {Array.<Error>} in_errors List of error objects
 * @private
 * @return {Array.<string>} List of error messages
 */
var _extractErrorMessage = function(in_errors) {
  return _.map(in_errors, function(error) {
    return error.message;
  });
};

/**
 * Helper function used to create a sorted collection
 * @return {property-common.Datastructures.SortedCollection} Empty sorted collection
 * @private
 */
var _createVersionedSortedCollection = function() {
  var collection = new SortedCollection();
  collection.setComparisonFunction(function(versionA, versionB) {
    if (semver.gt(versionA, versionB)) {
      return 1;
    } else if (semver.lt(versionA, versionB)) {
      return -1;
    }

    return 0;
  });
  return collection;
};

/**
 * Register a template
 *
 * @private
 *
 * @throws if in_template is invalid.
 * @throws if trying to register a primitive property.
 * @throws if updating an existing template without property changing the version number.
 * @throws if no in_template is passed.
 * @param {property-properties.PropertyTemplate|object} in_template - the template to register.
 */
var registerLocal = function(in_template) {
  var typeid = in_template.typeid;
  var remoteTemplates = this._getRemoteTemplates(typeid);

  if (!this._isNativePropertyConstructor(in_template)) {
    if (!(in_template instanceof PropertyTemplate)) {
      in_template =  new PropertyTemplate( in_template );
    }

    // Here we are registering a user defined template. We need to check whether it is already registered
    // as a remote template.
    if (this._localPrimitivePropertiesAndTemplates.has(typeid) || remoteTemplates.length) {
      // Template already exists. The incoming template MUST match what is currently registered.
      // If they do not match, throw an error letting the user know that the templates are incompatible.

      if (!remoteTemplates.length) {
        console.warn(MSG.REGISTERING_EXISTING_TYPEID + typeid);
      }

      var templateValidator = _createTemplateValidator.call(this, true);

      var serializedInTemplate = in_template.serializeCanonical();

      var localValidationResults = {isValid: true};
      if (this._localPrimitivePropertiesAndTemplates.has(typeid)) {
        var localRegisteredTemplate = this._localPrimitivePropertiesAndTemplates.item(typeid);

        localValidationResults = templateValidator.validate(
          localRegisteredTemplate.serializeCanonical(),
          serializedInTemplate
        );
      }

      if (localValidationResults.isValid) {
        var remoteValidationResults = {isValid: true};
        if (remoteTemplates.length) {
          _.every(remoteTemplates, function(template) {
            remoteValidationResults = templateValidator.validate(
              template.serializeCanonical(),
              serializedInTemplate
            );

            return remoteValidationResults.isValid;
          });
        }
      }

      if (!localValidationResults.isValid) {
        throw new Error(
          MSG.TEMPLATE_MISMATCH + typeid +
          '\n  errors = ' + JSON.stringify(_extractErrorMessage(localValidationResults.errors), 0, 2)
        );
      } else if (!remoteValidationResults.isValid) {
        throw new Error(
          MSG.REMOTE_TEMPLATE_MISMATCH + typeid +
          '\n  errors = ' + JSON.stringify(_extractErrorMessage(remoteValidationResults.errors), 0, 2)
        );
      } else if (this._localPrimitivePropertiesAndTemplates.has(typeid)) {
        // Template is already registered. Do nothing.
        return;
      }
    }

    if (in_template._isVersioned()) {
      var validationResult = this.validate(in_template.serializeCanonical());

      if (validationResult.isValid) {
        var typeidWithoutVersion = in_template.getTypeidWithoutVersion();
        var version = in_template.getVersion();
        this._validateSemver(in_template, true);

        // Semver validation passed. Add the template to the local versioned templates collection
        if (this._localVersionedTemplates.has(typeidWithoutVersion)) {
          this._localVersionedTemplates.item(typeidWithoutVersion).add(version, in_template);
        } else {
          var collection = _createVersionedSortedCollection();
          this._localVersionedTemplates.add(typeidWithoutVersion, collection);
          collection.add(version, in_template);
        }
      } else {
        throw new Error(
          MSG.FAILED_TO_REGISTER + typeid +
          '\n  errors = ' + JSON.stringify(_extractErrorMessage(validationResult.errors), 0, 2)
        );
      }
    } else {
      throw new Error(MSG.UNVERSIONED_TEMPLATE + ' Template with typeid = ' + typeid + ' is not versioned.');
    }
    // Forward to the internal function
    this._registerTypeId(typeid, in_template);
  } else {
    throw new Error(
      MSG.CANNOT_REGISTER_PRIMITIVE + typeid
    );
  }
};

/**
 * Register HFDM template which are used to instantiate properties. To find out more about templates,
 * see https://github.com/hfdm/hfdm/blob/master/documentation/guide/propertysets/schemas.rst
 *
 * In addition to json structures
 * it also accepts typeids, as well as arrays of jsons ans arrays of typeids
 * as arguments. IN the case of jsons, the behavior is similar to the behavior of registerLocal.
 * In the case of typeids, it adds it to a list of unknown dependencies if the corresponding template
 * is not known locally. The case of arrays is a a repetitive application of the scalar type.
 *
 * @param {property-properties.PropertyTemplate|object|String|Array} in_input - a template, a typeid or an array of either
 */
PropertyFactory.prototype.register = function(in_input) {

  if (this.missingDependencies === undefined) {
    this.missingDependencies = {};
  }

  // 3 cases to consider:

  // 1. in_input is an object
  // Determine the list of dependencies and if at least one is not available locally.
  // If this is the case, add it to the list of pending dependencies.
  // If no missing dependency, call registerLocal on the object (Classical case)

  // 2. in_input is a string (typeid)
  // If in_input is a type id that cannot be resolved locally, add it to the list of missing dependencies.
  // Otherwise, nothing to do. The corresponding template is already registered locally.

  // 3. in_input is an array of strings (typeids) or jsons
  // apply step 1. or 2. for all elements of array

  var validateArray = function(array) {
    var isInvalid = _.some(array, function(value) {
      return !PropertyTemplate.isTemplate(value) && !TypeIdHelper.isTemplateTypeid(value);
    });

    return !isInvalid;
  };

  var input_array = undefined;
  if (PropertyTemplate.isTemplate(in_input) || typeof in_input === 'string') {
    input_array = [in_input];
  } else if (_.isArray(in_input)) {
    input_array = in_input;
  } else {
    throw (new Error(MSG.ATTEMPT_TO_REGISTER_WITH_BAD_ARGUMENT));
  }

  if ( !validateArray(input_array)) {
    throw (new Error(MSG.ATTEMPT_TO_REGISTER_WITH_BAD_ARGUMENT));
  }

  for (var i = 0; i < input_array.length; i++) {
    var elem = input_array[i];
    if (typeof elem === 'string') {
      if (!this._localPrimitivePropertiesAndTemplates.has(elem)) {
        if (this.missingDependencies[elem] === undefined) {
          this.missingDependencies[elem] = {requested: false};
        }
      }
    } else if (PropertyTemplate.isTemplate(elem)) {
      if (this.missingDependencies[elem.typeid] !== undefined) {
        delete this.missingDependencies[elem.typeid];
      }
      registerLocal.call(this, elem);
      delete this.missingDependencies[elem];
    }
  }
};

/**
 * Recursively parses the object of the specified type and returns the created
 * array of PropertySets Templates. It does the same thing as the registerFrom()
 * function, but it returns the array of templates instead of registering them.
 * Throws an error if any conversion error occurs.
 *
 * @param {String} in_fromType  The type of the object to convert.
 *                              The only type supported so far is 'JSONSchema'.
 * @param {Object} in_toConvert  The object to convert
 * @throws if in_fromType is not valid.
 * @throws if the in_toConvert object is not a valid template.
 * @return {Array.<object>} Array of Property Sets Templates
 */
PropertyFactory.prototype.convertToTemplates = function(in_fromType, in_toConvert) {
  switch (in_fromType) {
    default:
      throw new Error(MSG.UNKNOWN_TYPE + in_fromType);
  }
};

/**
 * Recursively parses the object of the specified type and registers the created
 * Property Sets Templates. It does the same work as the convertToTemplates()
 * function, but it registers the templates for you instead of returning them.
 * Throws an error if any conversion error occurs.
 *
 * @param {String} in_fromType  The type of the object to convert.
 *                              The only type supported so far is 'JSONSchema'.
 * @param {Object} in_toConvert  The object to convert
 * @throws if in_toConvert is not valid.
 * @throws if in_fromType is not a valid object type.
 */
PropertyFactory.prototype.registerFrom = function(in_fromType, in_toConvert) {
  var psetsTemplates = this.convertToTemplates(in_fromType, in_toConvert);
  for (var i = 0; i < psetsTemplates.length; i++) {
    this.register(psetsTemplates[i]);
  }
};

/**
 * Validate semver.
 * Here we compare the incoming template with its previous/next version in the
 * local and remote registry with the intent of detecting semver violations.
 * The semver rules for templates are as follows:
 * - If the template structure has been altered (delete/modify existing field) then the MAJOR version should be bumped
 * - If the template structure has been extended (add new fields) then the MINOR version should be bumped
 * - If the annotation field has been updated then the PATCH version should be bumped
 * If any of these rules have been broken then a warning message is printed onto the console.
 * @param {object|property-properties.PropertyTemplate} in_template - the template to compare against
 *  its previous or next versions
 * @param {boolean} in_compareRemote - Flag indicating whether we want to compare the given
 *  template against the remote registry
 * @private
 */
PropertyFactory.prototype._validateSemver = function(in_template, in_compareRemote) {
  var typeidWithoutVersion = in_template.getTypeidWithoutVersion();
  var version = in_template.getVersion();
  var typeid = in_template.typeid;
  var validationResults;

  var warnings = [];

  if (this._localVersionedTemplates.has(typeidWithoutVersion)) {
    var previousLocalVersion = this._localVersionedTemplates.item(typeidWithoutVersion)
                                                            .getNearestPreviousItem(version);

    if (previousLocalVersion) {
      validationResults = this._templateValidator
        .validate(in_template.serializeCanonical(), previousLocalVersion.serializeCanonical());
      warnings.push.apply(warnings, validationResults.warnings);
    } else {
      var nextLocalVersion = this._localVersionedTemplates.item(typeidWithoutVersion).getNearestNextItem(version);
      if (nextLocalVersion) {
        validationResults = this._templateValidator
          .validate(nextLocalVersion.serializeCanonical(), in_template.serializeCanonical());
        warnings.push.apply(warnings, validationResults.warnings);
      }
    }
  }

  if (in_compareRemote) {
    var that = this;
    this._remoteScopedAndVersionedTemplates.iterate(function(scope, remoteVersionedTemplates) {
      if (remoteVersionedTemplates.has(typeidWithoutVersion)) {
        var previousRemoteVersion = remoteVersionedTemplates.item(typeidWithoutVersion)
                                                            .getNearestPreviousItem(version);

        if (previousRemoteVersion) {
          validationResults = that._templateValidator.validate(
            in_template.serializeCanonical(),
            previousRemoteVersion.serializeCanonical()
          );
          warnings.push.apply(warnings, validationResults.warnings);
        } else {
          var nextRemoteVersion = remoteVersionedTemplates.item(typeidWithoutVersion).getNearestNextItem(version);
          if (nextRemoteVersion) {
            validationResults = that._templateValidator.validate(
              nextRemoteVersion.serializeCanonical(),
              in_template.serializeCanonical()
            );
            warnings.push.apply(warnings, validationResults.warnings);
          }
        }
      }
    });
  }

  if (!_.isEmpty(warnings)) {
    console.warn(
      'Template with typeid = '  + typeid +
      ' is valid but with the following warnings = ' + JSON.stringify(warnings, 0, 2)
    );
  }
};

/**
 * Internal method used to register remote templates coming over the wire.
 * @param {property-properties.PropertyTemplate|object} in_remoteTemplate - The remote template to register
 * @param {string} in_scope - The scope in which the template will be stored in. The scope is usually determined by
 * the currently checked out workspaces. Each workspace can have their own set of versioned templates
 * that may be different from other workspaces.
 * @protected
 */
PropertyFactory.prototype._registerRemoteTemplate = function(in_remoteTemplate, in_scope) {
  if (!(in_remoteTemplate instanceof PropertyTemplate)) {
    in_remoteTemplate =  new PropertyTemplate( in_remoteTemplate );
  }

  var typeidWithoutVersion = in_remoteTemplate.getTypeidWithoutVersion();
  var version = in_remoteTemplate.getVersion();
  var typeid = in_remoteTemplate.typeid;

  if (this._localPrimitivePropertiesAndTemplates.has(typeid)) {
    // Template already exists. The incoming template MUST match what is registered.
    // If they do not match, throw an error letting the user know that the templates are incompatible.
    // This is likely due to the fact that the developer did not bump its version.
    var registeredTemplate = this._localPrimitivePropertiesAndTemplates.item(typeid);

    var templateValidator = _createTemplateValidator.call(this);
    var validationResults = templateValidator.validate(
      registeredTemplate.serializeCanonical(),
      in_remoteTemplate.serializeCanonical()
    );
    if (!validationResults.isValid) {
      throw new Error(
        MSG.TEMPLATE_MISMATCH + typeid +
        '\n  errors = ' + JSON.stringify(_extractErrorMessage(validationResults.errors), 0, 2)
      );
    }
  } else if (in_remoteTemplate._isVersioned()) {
    this._validateSemver(in_remoteTemplate);

    if (this._remoteScopedAndVersionedTemplates.has(in_scope)) {
      if (this._remoteScopedAndVersionedTemplates.item(in_scope).has(typeidWithoutVersion)) {
        if (!this._remoteScopedAndVersionedTemplates.item(in_scope).item(typeidWithoutVersion).has(version)) {
          this._remoteScopedAndVersionedTemplates.item(in_scope)
                                                 .item(typeidWithoutVersion)
                                                 .add(version, in_remoteTemplate);
        }
      } else {
        var versionCollection = _createVersionedSortedCollection();
        versionCollection.add(version, in_remoteTemplate);
        this._remoteScopedAndVersionedTemplates.item(in_scope).add(typeidWithoutVersion, versionCollection);
      }
    } else {
      var namespaceCollection = new Collection();
      var versionCollection = _createVersionedSortedCollection();
      namespaceCollection.add(typeidWithoutVersion, versionCollection);
      versionCollection.add(version, in_remoteTemplate);
      this._remoteScopedAndVersionedTemplates.add(in_scope, namespaceCollection);
    }
  } else {
    throw new Error(MSG.UNVERSIONED_REMOTE_TEMPLATE + ' \n' + JSON.stringify(in_remoteTemplate, 0, 2));
  }
};

/**
 * Remove the scope from the remote templates collection
 * @param {string} in_scope The scope to remove
 * @protected
 */
PropertyFactory.prototype._removeScope = function(in_scope) {
  var that = this;

  if (this._remoteScopedAndVersionedTemplates.has(in_scope)) {
    // remove the schemas in this scope from the inheritance cache.
    this._remoteScopedAndVersionedTemplates.item(in_scope).iterate(function(nt, schemas) {
      schemas.iterate(function(k, schema) {
        delete that._inheritanceCache[schema.typeid];
      });
    });

    this._remoteScopedAndVersionedTemplates.remove(in_scope);
  }
};

/**
 * Triggered when a template is registered.
 * @event property-properties.PropertyFactory#registered
 * @param {property-properties.Template} Template - The template being registered.
 * @memberof property-properties.PropertyFactory
 *
 **/

/**
 * Register a template or a primitive property
 *
 * This is the internal function used to register templates and primitive properties.
 *
 * @param {property-properties.PropertyTemplate|string}                            in_typeid  -
 *     typeid of for the property the given template/constructor represents
 * @param {property-properties.PropertyTemplate|object|property-properties.BaseProperty} in_templateOrProperty
 *     Template/native property class to associate with the typeid
 * @param {string}                                                          [in_context='single'] -
 *     The context for which the parameter is added (if it is set to all the object will be used in
 *     all contexts)
 */
PropertyFactory.prototype._registerTypeId = function(in_typeid, in_templateOrProperty, in_context) {
  // If the input is not yet a BaseProperty derived type or a
  // PropertyTemplate, we create a PropertyTemplate object for it

  if (!(in_templateOrProperty instanceof PropertyTemplate ||
        this._isNativePropertyConstructor(in_templateOrProperty))) {
    in_templateOrProperty =  new PropertyTemplate( in_templateOrProperty );
  }

  // If no context is specified we assign one
  if (!in_context) {
    // By default templates are registered for all contexts together, BaseProperties are registered separately
    in_context = in_templateOrProperty instanceof PropertyTemplate ? 'all' : 'single';
  }

  if (in_context !== 'all') {
    if (!this._localPrimitivePropertiesAndTemplates.has(in_typeid)) {
      this._localPrimitivePropertiesAndTemplates.add(in_typeid, new Collection());
    }
    this._localPrimitivePropertiesAndTemplates.item(in_typeid).add(in_context, in_templateOrProperty);
  } else if (!this._localPrimitivePropertiesAndTemplates.has(in_typeid)) {
    this._localPrimitivePropertiesAndTemplates.add(in_typeid, in_templateOrProperty);
  }

  this._eventEmitter.trigger('registered', this, in_templateOrProperty);
};

/**
 * Validate a template
 * Check that the template is syntactically correct as well as semantically correct.
 * @param {object|property-properties.PropertyTemplate} in_template The template to check against
 * @return {object|undefined} map of key-value pairs
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
 */
PropertyFactory.prototype.validate = function(in_template) {
  return this._templateValidator.validate(in_template);
};

/**
 * Get a template or property object based on a typeid and a context
 *
 * @param {string} in_typeid    - The type unique identifier
 * @param {string} [in_context]  - The context of the property to create
 * @param {string|undefined} in_scope - The scope in which the property typeid is defined
 *
 * @return {property-properties.PropertyTemplate|object|property-properties.BaseProperty|undefined}
 *     Template/Property identified by the typeid.
 */
PropertyFactory.prototype._get = function(in_typeid, in_context, in_scope) {
  if (this._localPrimitivePropertiesAndTemplates.has(in_typeid)) {
    var typeidItem = this._localPrimitivePropertiesAndTemplates.item(in_typeid);

    if (!(typeidItem instanceof Collection)) {
      return typeidItem;
    } else {
      var context = in_context || 'single';
      return this._localPrimitivePropertiesAndTemplates.item(in_typeid).item(context);
    }
  } else if (in_scope && this._remoteScopedAndVersionedTemplates.has(in_scope)) {
    var splitTypeId = TypeIdHelper.extractVersion(in_typeid);
    if (splitTypeId.version) {
      var typeidWithoutVersion = splitTypeId.typeidWithoutVersion;
      var version = splitTypeId.version;

      if (this._remoteScopedAndVersionedTemplates.item(in_scope).has(typeidWithoutVersion) &&
          this._remoteScopedAndVersionedTemplates.item(in_scope).item(typeidWithoutVersion).has(version)) {
        return this._remoteScopedAndVersionedTemplates.item(in_scope).item(typeidWithoutVersion).item(version);
      }
    }
  }

  return undefined;
};

/**
 * Get template based on typeid
 *
 * @param {string} in_typeid - The type unique identifier
 * @return {property-properties.PropertyTemplate|undefined} Template identified by the typeid.
 */
PropertyFactory.prototype.getTemplate = function(in_typeid) {
  if (this._localPrimitivePropertiesAndTemplates.has(in_typeid)) {
    return this._localPrimitivePropertiesAndTemplates.item(in_typeid);
  } else {
    return undefined;
  }
};

/**
 * Get remote templates based on typeid
 * @private
 * @param {string} in_typeid - The type unique identifier
 * @return {array<property-properties.PropertyTemplate>} Array of templates.
 */
PropertyFactory.prototype._getRemoteTemplates = function(in_typeid) {
  var templatesFound = [];

  var parsedTypeId = TypeIdHelper.extractVersion(in_typeid);
  var typeidWithoutVersion = parsedTypeId.typeidWithoutVersion;
  var version = parsedTypeId.version;

  this._remoteScopedAndVersionedTemplates.iterate(function(scope, remoteVersionedTemplates) {
    if (remoteVersionedTemplates.has(typeidWithoutVersion) &&
        remoteVersionedTemplates.item(typeidWithoutVersion).item(version)) {

      templatesFound.push(remoteVersionedTemplates.item(typeidWithoutVersion).item(version));
    }
  });

  return templatesFound;
};

/**
 * Create an instance of the given property typeid if there is a template registered for it.
 * Otherwise, this method returns undefined. Searches also in scoped templates.
 *
 * @param {string} in_typeid   - The type unique identifier
 * @param {string} in_context  - The type of collection of values that the property contains.
 *                               Accepted values are "single" (default), "array", "map" and "set".
 * @param {object|undefined} in_initialProperties A set of initial values for the PropertySet being created
 * @param {string|undefined} in_scope - The scope in which the property typeid is defined
 * @param {property-properties.BaseProperty.PathFilteringOptions} [in_filteringOptions]
 *    The options to selectively create only a subset of a property. Creates all properties if undefined.
 * @throws if the property does not have a unique id.
 * @throws if the property has a typeid that is not registered.
 * @return {property-properties.BaseProperty|undefined} the property instance
 * @private
 */
PropertyFactory.prototype._createProperty = function(
    in_typeid, in_context, in_initialProperties, in_scope, in_filteringOptions) {

  var ifNotSingleOrUndefined = (in_context || 'single') !== 'single';
  ConsoleUtils.assert(ifNotSingleOrUndefined || _.isString(in_typeid), MSG.UNKNOWN_TYPEID_SPECIFIED + in_typeid);
  var context = in_context;
  if (!context) {
    // If no context is supplied, we check whether the typeid contains a context
    if (!TypeIdHelper.isReferenceTypeId(in_typeid)) {
      var splitTypeId = TypeIdHelper.extractContext(in_typeid);
      in_typeid = splitTypeId.typeid;
      context = splitTypeId.context;
    }
  }

  var property = this._createFromPropertyDeclaration({
    typeid: in_typeid,
    context: context || 'single'
  }, undefined, in_scope, in_filteringOptions);

  if (in_initialProperties !== undefined) {
    this._setInitialValue(property, {
      value: in_initialProperties
    });
  }

  return property;
};

/**
 * Sets a value to a property
 * The value can be passed through a default, initial or constant.
 *
 * @param {string} property - The property to set the value for
 * @param {object} valueParsed - The value to set in the given property
 * @param {string} value - The value to set
 * @param {boolean} typed - Whether the value has a different type than the property (polymorphic).
 * @param {string} typeid - THe typeid of the property.
 */
PropertyFactory.prototype._setInitialValue = function(property, valueParsed) {
  property._unsetAsConstant();
  if (property instanceof ValueProperty || property instanceof StringProperty) {
    property.setValue(valueParsed.value);
  } else if (valueParsed.typed) {
    property._setValues(valueParsed.value, true, true);
  } else if ((property.getTypeid() !== 'ContainerProperty') || (property._getChildrenCount() > 0)) {
    property._setValues(valueParsed.value, false, true);
  } else if (!valueParsed.typeid) {
    throw new Error(MSG.FIELD_TYPEID_IS_REQUIRED + property._id + '.typeid');
  } else {
    property._setValues(valueParsed.value, false, true);
  }
};

/**
 * Create an instance of the given property typeid if there is a template registered for it.
 * Otherwise, this method returns undefined.
 *
 * @param {string} in_typeid   - The type unique identifier
 * @param {string} in_context  - The type of collection of values that the property contains.
 *                               Accepted values are "single" (default), "array", "map" and "set".
 * @param {object=} in_initialProperties A set of initial values for the PropertySet being created
 * @param {object=} in_options Additional options
 * @param {property-properties.Workspace} [in_options.workspace] A checked out workspace to check against. If supplied,
 *  the function will check against the schemas that have been registered within the workspace
 * @throws if the property does not have a unique id.
 * @throws if the property has a typeid that is not registered.
 * @return {property-properties.BaseProperty|undefined} the property instance
 */
PropertyFactory.prototype.create = function(in_typeid, in_context, in_initialProperties, in_options) {
  in_options = in_options || {};
  var scope = in_options.workspace ?
    in_options.workspace.getRoot()._getCheckedOutRepositoryInfo().getScope() :
    null;
  return this._createProperty(in_typeid, in_context, in_initialProperties, scope);
};

/**
 * Creates a  constructor function for the given typeid and id. The function will inherit from the
 * passed base constructor, but have the typeid and id assigned in its constructor. This way, we
 * avoid the storage overhead of having those members in each instance of the property.
 *
 * @param {String} in_context             - The context of the property
 * @param {String} in_typeid              - The typeid of the property
 * @param {Function} in_baseConstructor   - The constructor to inherit from
 * @param {String} in_id                  - The Id of the property
 * @param {String} in_scope               - The scope of the property
 *
 * @return {Function} The constructor for the property
 */
PropertyFactory.prototype._getConstructorFunctionForTypeidAndID = function(in_context,
                                                                           in_typeid,
                                                                           in_baseConstructor,
                                                                           in_id,
                                                                           in_scope) {
  // Create a unique key for this constructor
  let key = in_context === 'single' ?
                in_typeid :
                in_context + '<' + in_typeid + '>';

  if (in_id !== undefined) {
    key = key + '-' + in_id;
  }

  if (in_scope && !this._localPrimitivePropertiesAndTemplates.has(in_typeid)) {
    key += '-' + in_scope;
  }

  // Check, whether we already have this function in the cache
  if (this._typedPropertyConstructorCache[key]) {
    return this._typedPropertyConstructorCache[key];
  }

  // If it is not in the cache, create the function

  // This creates a class that will have the correct name in the debugger, but I am not
  // sure whether we want to use a dynamic eval for this. It might be flagged by some security scans
  // It should be safe, since we control the name of constructorClasses for properties
  // eslint-disable-next-line no-new-func
  var propertyConstructorFunction = Function('in_baseConstructor',
    'return function ' + in_baseConstructor.name +
      '(in_params) {in_baseConstructor.call(this, in_params);' +
    '};')(in_baseConstructor);

  // alternative code that does not need eval, but with this code all classes would be called
  // propertyConstructorFunction

  // var propertyConstructorFunction = function(in_params) {
  //   in_baseConstructor.call(this, in_params);
  // };

  propertyConstructorFunction.prototype = Object.create(in_baseConstructor.prototype);
  propertyConstructorFunction.prototype.constructor = propertyConstructorFunction;
  propertyConstructorFunction.prototype._typeid = in_typeid;
  if (in_id !== undefined) {
    propertyConstructorFunction.prototype._id = in_id;
  }

  this._typedPropertyConstructorCache[key] = propertyConstructorFunction;

  return propertyConstructorFunction;
};

/**
 * Creates a property object that serves as parent for the template with the given typeid, when none has yet
 * been created,
 *
 * @param {string}                               in_typeid - The type unique identifier
 * @param {string}                               in_id     - The id of the property to create
 * @param {property-properties.BaseProperty|undefined} in_parent - The parent property object. If
 *                                                           it exists it will be returned
 * @param {property-properties.PropertyTemplate|object|property-properties.BaseProperty} in_templateOrConstructor -
 *        the Template/Property for this in_typeid
 * @param {string|undefined} in_scope - The scope in which the property typeid is defined
 *
 * @return {property-properties.BaseProperty} The property that serves as parent for the properties in the template
 * @private
 */
PropertyFactory.prototype._ensurePropertyParentExists = function(in_typeid, in_id, in_parent,
    in_templateOrConstructor, in_scope) {
  // If we already have a parent, we just return it
  if (in_parent) {
    return in_parent;
  }

  // Otherwise, we check the inheritance hierarchy to determine which internal property object we have to use
  var parents = {};
  this._getAllParentsForTemplateInternal(in_typeid, parents, undefined, in_scope);
  parents[in_typeid] = true;

  var params = {
    typeid: in_typeid,
    id: in_id || null // An id of NULL means that the GUID of the property is used if it is a named property
  };
  var ConstructorFunction;

  if (parents['NodeProperty'] && parents['NamedProperty']) {
    // We have a named node property
    ConstructorFunction =  NamedNodeProperty;
  } else if (parents['NodeProperty']) {
    // We have a node property
    ConstructorFunction = NodeProperty;
  } else if (parents['NamedProperty']) {
    // We have a named property
    ConstructorFunction = NamedProperty;
  } else if (parents['Enum']) {
    params._enumDictionary = in_templateOrConstructor._enumDictionary;
    ConstructorFunction = EnumProperty;
  } else {
    // Otherwise we just use a simple base property
    ConstructorFunction = ContainerProperty;
    // For the normal container we use the verbatim ID and don't
    // initialize it with a null as we do for the named properties above
    params.id = in_id;
  }

  ConstructorFunction = this._getConstructorFunctionForTypeidAndID(
      'single', in_typeid, ConstructorFunction, in_id, in_scope);

  return new ConstructorFunction(params);
};

/**
 * Check whether a typeid is registered
 * @param {string} in_typeid The type unique identifier
 * @param {string|undefined} in_scope - The scope in which the property typeid is defined
 * @return {boolean} Returns true if the typeid is registered. False otherwise.
 * @private
 */
PropertyFactory.prototype._isRegisteredTypeid = function(in_typeid, in_scope) {
  return !!this._get(in_typeid, undefined, in_scope);
};

/**
 * Check whether the given typeid is a specialized constructor
 * Specialized constructors are of Array or Map types
 * @param {string} in_typeid The type unique identifier
 * @return {boolean} Returns true if the typeid is a specialized constructor
 * @private
 */
PropertyFactory.prototype._isSpecializedConstructor = function(in_typeid) {
  return this._localPrimitivePropertiesAndTemplates.item(in_typeid) instanceof Collection;
};

/**
 * Generate the typeid according to multiple settings
 *
 * @param {Object}                       in_propertiesEntry             - Describes the property object to create
 * @param {string=}                     [in_propertiesEntry.id]         - The name of the property
 * @param {string=}                     [in_propertiesEntry.typeid]     - The type identifier
 * @param {string=}                     [in_propertiesEntry.context]    - Context in which the property is created
 * @param {Object=}                     [in_propertiesEntry.properties] - Context in which the property is created
 * @param {number}                      [in_propertiesEntry.length]     - The length of an array property
 * @param {property-properties.BaseProperty=}  in_parent                      - The parent property which will be used as
 *                                                                        the root to construct the property template
 * @param {string|undefined} in_scope - The scope in which the property typeid is defined
 * @param {string} context - The context of the property
 *
 * @return {string} The typeid.
 */
PropertyFactory.prototype._computeTypeid = function(in_propertiesEntry, in_parent, in_scope, context) {
  var typeid = in_propertiesEntry.typeid;
  if (context === 'single') {
    var valueParsed = this._parseTypedValue(in_propertiesEntry, in_scope, context);
    if ((valueParsed.typed) && (valueParsed.typeid)) {
      typeid = in_propertiesEntry.typedValue.typeid;
    }
  }
  // We create a polymorphic collection (one inheriting from BaseProperty), if no typeid is specified
  // but a context is given
  if (!typeid && context !== 'single') {
    typeid = context !== 'set' ? 'ContainerProperty' : 'NamedProperty';
  }
  if (in_propertiesEntry.typeid && TypeIdHelper.isReferenceTypeId(in_propertiesEntry.typeid)) {
    typeid = 'Reference';
  }
  return typeid;
};

/**
 * Create an instance of the given property from an entry in the properties list.
 *
 * @param {Object}                       in_propertiesEntry             - Describes the property object to create
 * @param {string=}                     [in_propertiesEntry.id]         - The name of the property
 * @param {string=}                     [in_propertiesEntry.typeid]     - The type identifier
 * @param {string=}                     [in_propertiesEntry.context]    - Context in which the property is created
 * @param {Object=}                     [in_propertiesEntry.properties] - Context in which the property is created
 * @param {number}                      [in_propertiesEntry.length]     - The length of an array property
 * @param {property-properties.BaseProperty=}  in_parent                      - The parent property which will be used as
 *                                                                        the root to construct the property template
 * @param {string|undefined} in_scope - The scope in which the property typeid is defined
 * @param {property-properties.BaseProperty.PathFilteringOptions} [in_filteringOptions]
 *    The options to selectively create only a subset of a property. Creates all properties if undefined.
 *
 * @return {property-properties.BaseProperty|undefined} the property instance
 */
PropertyFactory.prototype._createFromPropertyDeclaration = function(
    in_propertiesEntry, in_parent, in_scope, in_filteringOptions) {
  var context = in_propertiesEntry.context !== undefined ? in_propertiesEntry.context : 'single';
  var typeid = this._computeTypeid(in_propertiesEntry, in_parent, in_scope, context);
  var parent = undefined;

  if (typeid) {
    if (this._isRegisteredTypeid( typeid, in_scope )) {
      var templateOrConstructor = this._get(typeid, context, in_scope);
      var isSpecializedConstructor = this._isSpecializedConstructor(typeid);

      if (this._isNativePropertyConstructor(templateOrConstructor) &&
          (isSpecializedConstructor || context === 'single')) {
        if (TypeIdHelper.isReferenceTypeId(typeid) || in_propertiesEntry.id !== undefined) {
          templateOrConstructor = this._getConstructorFunctionForTypeidAndID(in_propertiesEntry.context,
                                                                             in_propertiesEntry.typeid,
                                                                             templateOrConstructor,
                                                                             in_propertiesEntry.id,
                                                                             in_scope);
        }

        // If this is a primitive type, we create it via the registered constructor
        var result = new templateOrConstructor(in_propertiesEntry); // eslint-disable-line new-cap
        result._signalAllStaticMembersHaveBeenAdded(in_scope);
        return result;
      } else {
        if (context === 'single') {
          // If we have a template in a single context, we create it directly here

          // Create the base object
          parent = this._ensurePropertyParentExists(
            typeid,
            in_propertiesEntry.id,
            in_parent,
            templateOrConstructor,
            in_scope
          );

          // start from the inherited property
          if (templateOrConstructor.inherits) {
            // deal with [ 'inherits' ] or 'inherits'
            if ( templateOrConstructor.inherits instanceof Array &&
                 templateOrConstructor.inherits.length > 0 ) {
              for (var i = 0; i < templateOrConstructor.inherits.length; i++) {
                if (templateOrConstructor.inherits[i] !== 'Enum') {
                  this._createFromPropertyDeclaration({
                    typeid: templateOrConstructor.inherits[i],
                    context: 'single'
                  }, parent, in_scope, in_filteringOptions);
                }
              }
            } else if ( _.isString(templateOrConstructor.inherits) ) {
              if (templateOrConstructor.inherits !== 'Enum') {
                this._createFromPropertyDeclaration({
                  typeid: templateOrConstructor.inherits,
                  context: 'single'}, parent, in_scope, in_filteringOptions);
              }
            } else {
              console.error(MSG.INHERITS_ARRAY_OR_STRING + templateOrConstructor.inherits);
            }
          }

          this._parseTemplate( templateOrConstructor, parent, in_scope,
              !!(templateOrConstructor.inherits), in_filteringOptions);

        } else {
          // If we have other contexts, we have to create the corresponding property object for that context

          // check if a specialized collection is needed
          var isEnum = this.inheritsFrom(typeid, 'Enum', {scope: in_scope});

          var result;
          switch (context) {
            case 'array':
              if (isEnum) {
                var enumPropertyEntry = deepCopy(in_propertiesEntry);
                enumPropertyEntry._enumDictionary = templateOrConstructor._enumDictionary;
                result = new EnumArrayProperty(enumPropertyEntry);
              } else {
                result =  new ArrayProperty(in_propertiesEntry, in_scope);
              }
              break;
            case 'set':
              // Validate that a set inherit from a NamedProperty
              var typeid = in_propertiesEntry.typeid;
              if (!this.inheritsFrom(typeid, 'NamedProperty', { scope: in_scope })) {
                throw new Error(MSG.SET_ONLY_NAMED_PROPS + typeid);
              }

              result =  new SetProperty(in_propertiesEntry, in_scope);
              break;
            case 'map':
              result =  new MapProperty(in_propertiesEntry, in_scope);
              break;
            /* TODO: Remove this completely.
                     This seemed to be a mistake to consider 'enum' as a context. It is a typeid.
                     Not removing it completely yet in case someone has a strong point to get it back.
            case 'enum':
              var enumPropertyEntry = deepCopy(in_propertiesEntry);
              enumPropertyEntry._enumDictionary = templateOrConstructor._enumDictionary;
              result = new EnumProperty(enumPropertyEntry);
              break;*/
            default:
              throw new Error(MSG.UNKNOWN_CONTEXT_SPECIFIED + context);
          }
          result._signalAllStaticMembersHaveBeenAdded(in_scope);
          return result;
        }
      }
    } else {
      // We tried to create a property with an unknown typeid
      // that means we have no template and don't know what to instantiate
      // TODO: look for and use the missing template somehow at this point
      throw new Error(MSG.UNKNOWN_TYPEID_SPECIFIED + typeid);
    }
  } else {
    if (!in_propertiesEntry.properties) {
      in_propertiesEntry.properties = [];
    }

    if (!parent) {
      // If this is a declaration which contains a properties list, we have to create a new base property for it
      parent = new ContainerProperty( in_propertiesEntry );
    }

    // And then parse the entry like a template
    this._parseTemplate( in_propertiesEntry, parent, in_scope, false, in_filteringOptions);
  }

  // If this property inherits from NamedProperty we assign a random GUID
  if (parent instanceof NamedProperty ||
      parent instanceof NamedNodeProperty) {
    const guid = parent.get('guid', {referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER});
    if (guid) {
      guid.setValue(generateGUID());
    }
  }

  // We only signal that we have finished the processing, once
  // we have processed all templates that this template inherits from
  // Which means, that the function has been called without a parent
  // as parameter
  if (in_parent === undefined) {
    parent._signalAllStaticMembersHaveBeenAdded(in_scope);
  }

  return parent;
};

/**
 * Method used to determine whether the given object is a property constructor
 *
 * @param {Object} in_obj Object to check.
 * @return {boolean} True if the object is a BaseProperty.
 * @private
 */
PropertyFactory.prototype._isNativePropertyConstructor = function(in_obj ) {
  // TODO: This tests seems dangerous. I think it is based on the assumption that constructor is not
  //       overwritten in the derived classes (which it probably should be)
  return (in_obj.constructor && in_obj.constructor === ContainerProperty.constructor );
};

/**
 * Checks whether the property has a typedValue and replaces the value and the typeid
 * with the ones in the typedValue.
 * @param {Object} in_property - The property top parse.
 * @param {string|undefined} in_scope - The scope in which in_template is defined in
 * @param {string} in_context - The context of the in_property
 * @return {Boolean} - True if the property has a typedValue.
 * @throws {TYPED_VALUES_MUST_DERIVE_FROM_BASE_TYPE} - Thrown when setting a typed value for a primitive.
 * @private
 */
PropertyFactory.prototype._parseTypedValue = function(in_property, in_scope, in_context) {
  var res = {
    typed: false,
    value: in_property.value,
    typeid: in_property.typeid
  };

  if (in_property.typedValue) {
    var typeid = in_property.typeid || 'ContainerProperty';

    // Setting typedValue to a primitive is not supported
    if (TypeIdHelper.isPrimitiveType(typeid)) {
      throw new Error(MSG.TYPED_VALUES_FOR_PRIMITIVES_NOT_SUPPORTED + in_property.id);
    }

    res.typed = true;
    if (in_context === 'single') {
      if (!in_property.typedValue.typeid) {
        throw new Error(MSG.FIELD_TYPEID_IS_REQUIRED + 'typedValue ' + typeid);
      }

      if (!this.inheritsFrom(in_property.typedValue.typeid, typeid, { scope: in_scope })) {
        throw new Error(MSG.TYPED_VALUES_MUST_DERIVE_FROM_BASE_TYPE +
          in_property.typedValue.typeid + ' must be a subclass of ' + typeid);
      }

      res.value = in_property.typedValue.value;
      res.typeid = in_property.typedValue.typeid;
    } else {
      res.value = in_property.typedValue;
    }
  }

  return res;
};

/**
 * Parse a given property template appending its property and constant objects to the given property parent object
 *
 * @param {property-properties.PropertyTemplate} in_template - template for the property
 * @param {property-properties.BaseProperty}     in_parent   - the parent
 * @param {string|undefined} in_scope - The scope in which in_template is defined in
 * @param {boolean} in_allowChildMerges - Whether merging of children (nested properties) is allowed.
 *                                        This is used for extending inherited properties.
 * @param {property-properties.BaseProperty.PathFilteringOptions} [in_filteringOptions]
 *    The options to selectively create only a subset of a property. Creates all properties if undefined.
 * @private
 */
// eslint-disable-next-line complexity
PropertyFactory.prototype._parseTemplate = function(
    in_template, in_parent, in_scope, in_allowChildMerges, in_filteringOptions ) {

  // Check if there are nested property arrays
  if (in_template.properties || in_template.constants) {
    var properties = in_template.properties;
    var constants = in_template.constants;

    if (in_template.inherits && in_template.inherits[0] && in_template.inherits[0] === 'Enum') {
      // We don't have to parse enum "properties"
    } else {
      if (properties) {
        for (var i = 0; i < properties.length; i++) {
          var oldChild = in_parent._children[properties[i].id];
          var context = properties[i].context || 'single';
          var typeid = properties[i].typeid || 'ContainerProperty';
          let newChild;

          // Validate that set inherit from a NamedProperty
          if (context === 'set' && !this.inheritsFrom(typeid, 'NamedProperty', { scope: in_scope })) {
            throw new Error(MSG.SET_ONLY_NAMED_PROPS + typeid);
          }

          var valueParsed = this._parseTypedValue(properties[i], in_scope, context);
          // Check if the property id already exists (inherited property) with the same scope and type.
          //   If yes; then update the existing property's value.
          //   If no; set the default value and append the property.

          // 1/3. Create or clear
          if (oldChild !== undefined && oldChild.getTypeid() === typeid &&
              oldChild.getContext() === context && valueParsed.value) {
            // If an inherited set or map, then we need to delete all the entries already created.
            if (context === 'set' || context === 'map') {
              oldChild.clear();
            }
            newChild = oldChild;
          } else {
            // No need to calculate the child path if there is no filtering
            if (in_filteringOptions) {
              let childBasePath = PathHelper.getChildAbsolutePathCanonical(
                  in_filteringOptions.basePath, properties[i].id);
              if (PathHelper.getPathCoverage(childBasePath, in_filteringOptions.paths).coverageExtent) {
                newChild = this._createFromPropertyDeclaration(properties[i], undefined, in_scope,
                    {basePath: childBasePath, paths: in_filteringOptions.paths});
              }
            } else {
              newChild = this._createFromPropertyDeclaration(properties[i], undefined, in_scope);
            }
          }

          if (newChild) {
            // 2/3. Set initial value
            if (valueParsed.value) {
              this._setInitialValue(newChild, valueParsed);
            }

            // 3/3. Insert in parent
            if (newChild !== oldChild) {
              in_parent._append(newChild, in_allowChildMerges);
            }
          }
        }
      }

      if (constants) {
        for (var i = 0; i < constants.length; i++) {
          var child = in_parent._children[constants[i].id];
          var context = constants[i].context || 'single';

          // If constant is missing its context, set it from its child
          if (child && child._isConstant && !constants[i].context) {
            context = child.getContext();
          }

          // Validate that set inherit from a NamedProperty
          if (context === 'set' && !this.inheritsFrom(constants[i].typeid, 'NamedProperty', { scope: in_scope })) {
            throw new Error(MSG.SET_ONLY_NAMED_PROPS + constants[i].typeid);
          }

          var valueParsed = this._parseTypedValue(constants[i], in_scope, context);

          // If constant is missing its typeid
          if (child && child._isConstant && !constants[i].typeid) {
            // if constant is a typedValue and is a single (has a typeid), use the typedValue's typeid
            //   else use the child's
            constants[i].typeid = valueParsed && valueParsed.typed && valueParsed.typeid ?
              valueParsed.typeid : child.getTypeid();
          }

          // Check if the constant id already exists (inherited constant) with the same scope and type
          //   If yes; then only update its default value.
          //   If no; set the default value and append the constant.
          if (child !== undefined && child._isConstant && child.getTypeid() === constants[i].typeid &&
            child.getContext() === context) {
            if (valueParsed.value) {
              child._unsetAsConstant();
              if (context === 'set' || context === 'map') {
                child.clear();
              }

              this._setInitialValue(child, valueParsed);
            }
            child._setAsConstant();
          } else {
            // if we are overriding a constant with a typedValue, delete the child constant and recreate the new one.
            if (child !== undefined && child._isConstant) {
              if (valueParsed.typed && valueParsed.typeid) {
                if (!this.inheritsFrom(valueParsed.typeid, child.getTypeid(), { scope: in_scope })) {
                  throw new Error(MSG.TYPED_VALUES_MUST_DERIVE_FROM_BASE_TYPE +
                    valueParsed.typeid + ' must be a subclass of ' + child.getTypeid());
                }

                in_parent._remove(child.getId());
              } else if (child.getContext() !== context) {
                throw new Error(MSG.OVERRIDEN_PROP_MUST_HAVE_SAME_CONTEXT_AS_BASE_TYPE +
                  child.getId() + ':' + context);
              }
            }

            constants[i].context = context;
            var constant = this._createFromPropertyDeclaration(constants[i], undefined, in_scope);
            if (valueParsed.value) {
              this._setInitialValue(constant, valueParsed);
            }

            constant._setAsConstant();
            in_parent._append(constant, false);
          }
        }
      }
    }
  }
};

// private params:
// @param {string} [in_options.scope]    - The scope in which the property typeid is defined
/**
 * Checks whether the template with typeid in_templateTypeid inherits from the template in in_baseTypeid
 *
 * Note: By default, this also returns true if in_templateTypeid === in_baseTypeid, since in most use cases
 *       the user wants to check whether a given template has all members as another template and so this is
 *       true for the template itself
 *
 * @param {string}  in_templateTypeid     - Template for which we want to check, whether in_baseTypeid is a parent
 * @param {string}  in_baseTypeid         - The base template to check for
 * @param {object} [in_options]          - Additional options
 * @param {boolean} [in_options.includeSelf=true] - Also return true if in_templateTypeid === in_baseTypeid
 * @param {property-properties.Workspace} [in_options.workspace] A checked out workspace to check against. If supplied,
 *  the function will check against the schemas that have been registered within the workspace
 * @throws if no template is found for in_templateTypeid
 * @return {boolean} True if in_baseTypeid is a parent of in_templateTypeid or
 *                   if (in_includeSelf == true and in_templateTypeid == in_baseTypeid)
 */
PropertyFactory.prototype.inheritsFrom = function(in_templateTypeid, in_baseTypeid, in_options) {
  const cachedInheritance = this._inheritanceCache[in_templateTypeid];

  in_options = in_options || {};

  const templateEnumTypeId = this._getEnumTypeid(in_templateTypeid, in_options);
  if (templateEnumTypeId) {
    in_templateTypeid = 'Enum';
  }

  const baseEnumTypeId = this._getEnumTypeid(in_baseTypeid, in_options);
  if (baseEnumTypeId) {
    in_baseTypeid = 'Enum';
  }

  if (in_templateTypeid === 'Enum' && in_baseTypeid === 'Enum') {
    in_options._isTemplateEnum = true;

    return PropertyFactory.inheritsFrom(templateEnumTypeId || in_templateTypeid,
        baseEnumTypeId || in_baseTypeid, in_options);
  }

  if ((in_templateTypeid === in_baseTypeid || templateEnumTypeId === in_baseTypeid) &&
    (!!in_options.includeSelf || in_options.includeSelf === undefined)) {
    return true;
  }

  // check the inheritance of primitive typeid
  const isPrimitiveOrReservedType =
          (templateId) => TypeIdHelper.isPrimitiveType(templateId) || TypeIdHelper.isReservedType(templateId);

  if (isPrimitiveOrReservedType(in_templateTypeid) && isPrimitiveOrReservedType(in_baseTypeid)) {
    return TypeIdHelper.nativeInheritsFrom(in_templateTypeid, in_baseTypeid) ||
      (templateEnumTypeId && PropertyFactory.inheritsFrom(templateEnumTypeId, in_baseTypeid, in_options));
  }

  // look in the cache first
  if (cachedInheritance && cachedInheritance[in_baseTypeid]) {
    return true;
  } else {
    let parents = {};
    const scope = in_options.workspace ?
      in_options.workspace.getRoot()._getCheckedOutRepositoryInfo().getScope() :
      in_options.scope;

    this._getAllParentsForTemplateInternal(in_templateTypeid, parents, true, scope);

    if (in_options._isTemplateEnum && parents['Enum'] === undefined) {
      throw new Error(MSG.TYPEID_IS_NOT_ENUM + in_templateTypeid);
    }

    // update the cache
    this._inheritanceCache[in_templateTypeid] = parents;

    return parents[in_baseTypeid] !== undefined;
  }
};

/**
 * Get the typeid contained in the enum, eg: enum<'a:a-1.0.0'> will return 'a:a-1.0.0'
 *
 * @param {string} in_templateTypeid         - the template typeid
 * @param {object} in_options                - Additional optionsin_options
 * @return {string} the typeid contained in the enum
 * @private
 */
PropertyFactory.prototype._getEnumTypeid = function(in_templateTypeid, in_options) {
  const enumRegex = /enum<(.*)>/;
  let enumTypeId;
  if (in_templateTypeid.substr(0, 5) === 'enum<') {
    enumTypeId = enumRegex.exec(in_templateTypeid)[1];

    this._validateEnumTemplate(enumTypeId, in_options);
  }

  return enumTypeId;
};

/**
 * Validate the typeid inside of an enum<>
 *
 * @param {string} in_templateTypeid     - the template typeid
 * @param {object} [in_options]          - Additional optionsin_options
 * @private
 */
PropertyFactory.prototype._validateEnumTemplate = function(in_templateTypeid, in_options) {
  const scope = in_options.workspace ?
    in_options.workspace.getRoot()._getCheckedOutRepositoryInfo().getScope() :
    in_options.scope;
  const template = this._get(in_templateTypeid, undefined, scope);
  if (!template) {
    throw new Error(MSG.NON_EXISTING_TYPEID + in_templateTypeid);
  }

  if (TypeIdHelper.isReservedType(in_templateTypeid)) {
    throw new Error(MSG.TYPEID_IS_NOT_ENUM);
  }
};

// private params:
// @param {string|undefined}  [in_options.scope] - The scope in which the template was stored.
/**
 * Returns all the typeids the template inherits from (including all possible paths through multiple inheritance).
 * The order of the elements in the array is unspecified.
 *
 * @param {string} in_typeid - typeid of the template
 * @param {object} [in_options] - Additional options
 * @param {boolean} [in_options.includeBaseProperty=false] - Include BaseProperty as parent.
 *                                                   Everything implicitly inherits
 *                                                   from BaseProperty, but it is not explicitly listed in the
 *                                                   template, so it is only included if explicitly requested
 * @param {property-properties.Workspace} [in_options.workspace] - A checked out workspace to check against.
 *                                                   If supplied, the function will check against the
 *                                                   schemas that have been registered within the workspace
 * @throws if no template found for in_typeid. Make sure it is registered first.
 * @return {Array.<string>} typeids of all inherited types (in unspecified order)
 */
PropertyFactory.prototype.getAllParentsForTemplate = function(in_typeid, in_options) {
  in_options = in_options || {};
  // We just forward the request to the internal function
  var parents = {};
  var scope = in_options.workspace ?
    in_options.workspace.getRoot()._getCheckedOutRepositoryInfo().getScope() :
    in_options.scope;
  this._getAllParentsForTemplateInternal(in_typeid, parents, !!in_options.includeBaseProperty, scope);

  return _.keys(parents);
};

/**
 * Returns all the typeids the template inherits from (including all possible paths through multiple inheritance).
 *
 * @param {string}  in_typeid              - typeid of the template
 * @param {Object}  out_parents            - map containing the parents
 * @param {Boolean} in_includeBaseProperty - Include BaseProperty as parent. Everything implicitly inherits
 *                                           from BaseProperty, but it is not explicitly listed in the
 *                                           template, so it is only be included if explicitly requested
 * @param {string|undefined} in_scope - The scope in which the property typeid is defined
 */
PropertyFactory.prototype._getAllParentsForTemplateInternal = function(in_typeid,
                                                                       out_parents,
                                                                       in_includeBaseProperty,
                                                                       in_scope) {
  if (TypeIdHelper.isPrimitiveType(in_typeid)) {
    // Everything inherits from BaseProperty.
    if (in_includeBaseProperty) {
      out_parents['ContainerProperty'] = true;
      out_parents['BaseProperty'] = true;
    }
    return;
  }

  var template = this._get(in_typeid, undefined, in_scope);
  if (!template) {
    throw new Error(MSG.NON_EXISTING_TYPEID + in_typeid);
  }

  // Everything inherits from BaseProperty.
  if (in_includeBaseProperty) {
    out_parents['ContainerProperty'] = true;
    out_parents['BaseProperty'] = true;
  }

  // Run over all parents and insert them into the parents array
  if (template.inherits) {
    // We have to distinguish the cases where the parents are either specified as a single string or an array
    var parents = _.isArray(template.inherits) ? template.inherits : [template.inherits];

    for (var i = 0; i < parents.length; i++) {
      // Mark it as parent
      out_parents[parents[i]] = true;

      // Continue recursively
      this._getAllParentsForTemplateInternal(parents[i], out_parents, undefined, in_scope);
    }
  }
};

/**
 * Internal function used to clear and reinitialize the PropertyFactory
 * @private
 */
PropertyFactory.prototype._clear = function() {
  this._localPrimitivePropertiesAndTemplates = new Collection();
  this._localVersionedTemplates = new Collection();
  this._remoteScopedAndVersionedTemplates = new Collection();
  this._inheritanceCache = {};
  this._typedPropertyConstructorCache = {};

  this._init();
};

/**
 * Reregisters a template (by overwriting the existing template).
 *
 * This should NEVER be necessary in the final application, but it might be helpful during interactive debugging
 * sessions, when trying out different templates.
 *
 * @protected
 * @param {property-properties.PropertyTemplate|object|property-properties.BaseProperty} in_template - The template to reregister
 */
PropertyFactory.prototype._reregister = function(in_template) {
  var typeid = in_template.typeid;

  if (!(in_template instanceof PropertyTemplate)) {
    in_template = new PropertyTemplate(in_template);
  }

  var typeidWithoutVersion = in_template.getTypeidWithoutVersion();
  var version = in_template.getVersion();

  // Remove the existing entry
  this._localPrimitivePropertiesAndTemplates.remove(typeid);

  if (this._localVersionedTemplates.has(typeidWithoutVersion)) {
    if (this._localVersionedTemplates.item(typeidWithoutVersion).has(version)) {
      this._localVersionedTemplates.item(typeidWithoutVersion).remove(version);
    }
  }

  // Invalidate the cache of static children per typeid
  NodeProperty._cleanStaticChildrenCache();

  // Clear this schema from the inheritance cache
  delete this._inheritanceCache[typeid];

  // Remove the typeid from the constructor cache
  var registeredConstructors = _.keys(this._typedPropertyConstructorCache);
  for (var i = 0; i < registeredConstructors.length; i++) {
    if (registeredConstructors[i].substr(0, typeid.length) === typeid) {
      delete this._typedPropertyConstructorCache[registeredConstructors[i]];
    }
  }

  // And repeat the registration
  registerLocal.call(this, in_template);
};

/**
* Initializes the schema store.
* @public
* @param {Object} in_options the store settings.
* @param {getBearerTokenFn} in_options.getBearerToken Function that accepts a callback.
*     Function that should be called with an error or the OAuth2 bearer token representing the user.
* @param {string} in_options.url The root of the url used in the request to retrieve PropertySet schemas.
*
* @return {Promise} Return an empty promise when checkout resolve or reject with error.
*/
PropertyFactory.prototype.initializeSchemaStore = function(in_options) {
  // https://regex101.com/r/TlgGJp/2
  var regexBaseUrl = /^(https?:)?\/\/((.[-a-zA-Z0-9@:%_+~#=.]{2,256}){1,2}\.[a-z]{2,6}|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d{1,5})?(\/[-a-zA-Z0-9@:%_+.~#?&/=]*)*$/; // eslint-disable-line max-len

  if (!in_options || !in_options.getBearerToken || !_.isFunction(in_options.getBearerToken) || !in_options.url) {
    return Promise.reject(new Error(MSG.MISSING_FSS_INIT_OPTIONS));
  }

  if (!regexBaseUrl.test(in_options.url)) {
    return Promise.reject(new Error(MSG.FSS_BASEURL_WRONG));
  }

  if (in_options.url.slice(-1) !== '/') {
    in_options.url = in_options.url + '/';
  }

  return Promise.resolve();
};

/**
* Extracts typeids directly referred to in a template and that are not locally known
*
* @public
* @param {property-properties.PropertyTemplate|object} in_template from which to extract dependencies
*
* @return {Array} list of unknown typeids
* @ignore
*/
var _extractUnknownDependencies = function(in_template) {
  var self = this;
  var dependencies = PropertyTemplate.extractDependencies(in_template);

  dependencies = dependencies.filter(function(typeid) {
    return !self._localPrimitivePropertiesAndTemplates.has(typeid);
  });

  return dependencies;
};

/**
* Pushes a template request task onto the template requests queue
*
* @public
* @param {String} in_typeid typeid of the template to retrieve
* @ignore
*/
var _pushTemplateRequestTask = function(in_typeid) {
  var that = this;

  if (that.missingDependencies[in_typeid].requested === true) {
    return;
  }
  that.missingDependencies[in_typeid].requested = true;

  this.templateRequestsQueue.push({typeid: in_typeid, context: that._templateStore}, function(response) {
    if (response.error) {
      that.templateRequestsResults.errors[in_typeid] = response.error;
    } else {
      var template = response.template;
      that.templateRequestsResults.schemas[in_typeid] = template;
      var unknownDependencies = _extractUnknownDependencies.call(that, template);

      try {
        registerLocal.call(that, template);
      } catch (error) {
        that.templateRequestsResults.errors[in_typeid] = [error];
        return;
      }

      // Launch new requests for those dependencies
      for (var d = 0; d < unknownDependencies.length; d++) {
        var typeid = unknownDependencies[d];

        if (that.missingDependencies[typeid] === undefined) {
          that.missingDependencies[typeid] = {requested: false};
          if (that.templateRequestsResults.errors[typeid] === undefined) {
            that.templateRequestsResults.errors[typeid] = {};
          }
          if (that.templateRequestsResults.schemas[typeid] === undefined) {
            that.templateRequestsResults.schemas[typeid] = {};
          }

          _pushTemplateRequestTask.call(that, typeid);
        }
      }

      delete that.missingDependencies[template.typeid];
    }
  });
};

/**
* Pushes a template request task onto the template requests queue
*
* @private
* @param {String} in_task schema retrieval task
* @param {String} in_callback callback of the task
*
*/
PropertyFactory.prototype._retrieveTemplateRequestWorker = function(in_task, in_callback) {
  var store = in_task.context;
  if (store) {
    store.retrieveTemplate(in_task.typeid).then(function(response) {
      in_callback(response);
    }).catch(function(error) {
      in_callback({error: error});
    });
  } else {
    throw new Error(MSG.INVALID_TEMPLATE_STORE);
  }
};

/**
* Tries to resolve dependencies after some calls to register() have been made
*
* @public
*
* @return {Promise} A promise that resolves to an object with the following structure:
* {
*  errors: {
*    typeid1: errors,
*    ...
*    typeidn: errors
*  },
*  templates: {
*    typeid1: [], array of templates
*    ...
*    typeidn: []  array of templates
*   }
* }
*
*/
PropertyFactory.prototype.resolveSchemas = function() {
  // Only one queue at a time can be processed.
  if (this.templateRequestsQueue !== undefined) {
    return Promise.reject(new Error(MSG.DEPENDENCIES_RESOLUTION_IN_PROGRESS));
  }

  this.templateRequestsQueue = async.queue(this._retrieveTemplateRequestWorker, 5);

  var that = this;

  // 0. Inspect locally registered templates for unknown dependencies
  this._localPrimitivePropertiesAndTemplates.iterate(function(key, type) {
    if (PropertyTemplate.isTemplate(type)) {
      var unknownDeps = _extractUnknownDependencies.call(that, type);
      for (var d = 0; d < unknownDeps.length; d++) {
        var dep = unknownDeps[d];
        if (that.missingDependencies[dep] === undefined) {
          that.missingDependencies[dep] = {requested: false};
        }
      }
    }
  });

  var typeids = _.keys(this.missingDependencies);

  // 1. Iterate over missing dependencies. Create pending request entries. Set status to pending.
  // Push template retrieve task to the queue for unresolved typeids (missing dependencies)
  for (var i = 0; i < typeids.length; i++) {
    var typeid = typeids[i];
    if (that.templateRequestsResults.errors[typeid] === undefined) {
      that.templateRequestsResults.errors[typeid] = {};
    }
    if (that.templateRequestsResults.schemas[typeid] === undefined) {
      that.templateRequestsResults.schemas[typeid] = {};
    }

    _pushTemplateRequestTask.call(that, typeid);
  }

  return new Promise(function(resolve, reject) {
    if (that.templateRequestsQueue.length() === 0) {
      resolve({ errors: {}, schemas: {} });
      that.templateRequestsQueue = undefined;
    } else {
      that.templateRequestsQueue.drain(
        function() {
          var errors = _.compact(_.pluck(that.templateRequestsResults.errors, 'typeid'));
          var results = that.templateRequestsResults;
          that.templateRequestsResults = { errors: {}, schemas: {} };
          if (errors.length && errors.length > 0) {
            reject(new Error('Some errors occurs'));
          } else {
            that.missingDependencies = {};
            resolve(results);
          }
          that.templateRequestsQueue = undefined;
        }
      );
    }
  });
};

/**
 * Determines whether the given property is an instance of the property type corresponding to the given native
 * property typeid and context.
 *
 * @public
 * @param {property-properties.BaseProperty} in_property The property to test
 * @param {String} in_primitiveTypeid - Native property typeid
 * @param {String} in_context - Context of the property
 * @return {boolean} True, if the property is an instance of the corresponding type
 */
PropertyFactory.prototype.instanceOf = function(in_property, in_primitiveTypeid, in_context) {
  var templateConstructor = this._get(in_primitiveTypeid, in_context);
  var result = false;
  if (templateConstructor && this._isNativePropertyConstructor(templateConstructor)) {
    result = in_property instanceof templateConstructor;
  }
  return result;
};

var PropertyFactory = new PropertyFactory();

// after initializing the PropertyFactory, we store it and some of the Property objects
// into the LazyLoadedProperties namespace, so that the Factory can be accessed at
// runtime by the Property objects itself without introducing a cycle during parsing
LazyLoadedProperties.PropertyFactory = PropertyFactory;
LazyLoadedProperties.ContainerProperty = ContainerProperty;
LazyLoadedProperties.ArrayProperty = ArrayProperty;
LazyLoadedProperties.EnumArrayProperty = EnumArrayProperty;
LazyLoadedProperties.ReferenceProperty = ReferenceProperty;
LazyLoadedProperties.StringProperty = StringProperty;
LazyLoadedProperties.ValueProperty = ValueProperty;
LazyLoadedProperties.ValueMapProperty = ValueMapProperty;
LazyLoadedProperties.ReferenceMapProperty = ReferenceMapProperty;
LazyLoadedProperties.NodeProperty = NodeProperty;
LazyLoadedProperties.IndexedCollectionBaseProperty = IndexedCollectionBaseProperty;


module.exports = PropertyFactory;
