/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Declaration of the PropertyFactory class.
 * Responsible for creating property sets and registering property templates
 */

const _ = require("lodash");
const fastestJSONCopy = require("fastest-json-copy");
const deepCopy = fastestJSONCopy.copy;

const {
	Collection,
	ConsoleUtils,
	EventEmitter,
	SortedCollection,
	constants,
	GuidUtils,
} = require("@fluid-experimental/property-common");
const { MSG } = constants;

const {
	TypeIdHelper,
	TemplateValidator,
	PathHelper,
	ChangeSet,
} = require("@fluid-experimental/property-changeset");

const semver = require("semver");
const async = require("async");
const { PropertyTemplate } = require("./propertyTemplate");
const { PropertyTemplateWrapper } = require("./propertyTemplateWrapper");

// Include the property classes
const { BaseProperty } = require("./properties/baseProperty");
const { NamedProperty } = require("./properties/namedProperty");
const { NodeProperty } = require("./properties/nodeProperty");
const { NamedNodeProperty } = require("./properties/namedNodeProperty");
const { ContainerProperty } = require("./properties/containerProperty");
const { ValueProperty } = require("./properties/valueProperty");

// Include all primitive properties –- will register at the end.
const { Uint8Property, Uint16Property, Uint32Property } = require("./properties/uintProperties");

const { Float32Property, Float64Property } = require("./properties/floatProperties");

const {
	Int8Property,
	Int16Property,
	Int32Property,
	Int64Property,
	Uint64Property,
} = require("./properties/intProperties");

const { StringProperty } = require("./properties/stringProperty");
const { BoolProperty } = require("./properties/boolProperty");
const { ReferenceProperty } = require("./properties/referenceProperty");
const { EnumProperty } = require("./properties/enumProperty");

// Include collection properties
const { ArrayProperty } = require("./properties/arrayProperty");
const { SetProperty } = require("./properties/setProperty");
const { MapProperty } = require("./properties/mapProperty");
const { ValueMapProperty } = require("./properties/valueMapProperty");
const { IndexedCollectionBaseProperty } = require("./properties/indexedCollectionBaseProperty");
const {
	AbstractStaticCollectionProperty,
} = require("./properties/abstractStaticCollectionProperty");

const {
	Float32ArrayProperty,
	Float64ArrayProperty,
	Uint32ArrayProperty,
	Int32ArrayProperty,
	Uint64ArrayProperty,
	Int64ArrayProperty,
	Uint16ArrayProperty,
	Int16ArrayProperty,
	Uint8ArrayProperty,
	Int8ArrayProperty,
	StringArrayProperty,
	BoolArrayProperty,
} = require("./properties/valueArrayProperty");

const { ReferenceMapProperty } = require("./properties/referenceMapProperty");
const { ReferenceArrayProperty } = require("./properties/referenceArrayProperty");
const { EnumArrayProperty } = require("./properties/enumArrayProperty");

const {
	Float64MapProperty,
	Float32MapProperty,
	Uint32MapProperty,
	Uint64MapProperty,
	Uint16MapProperty,
	Uint8MapProperty,
	Int32MapProperty,
	Int64MapProperty,
	Int16MapProperty,
	Int8MapProperty,
	StringMapProperty,
	BoolMapProperty,
} = require("./properties/valueMapProperty");

const { LazyLoadedProperties } = require("./properties/lazyLoadedProperties");

/**
 * Creates an instance of the TemplateValidator
 *
 * @constructor
 * @protected
 *
 * @param {bool} skipSemver - Flag passed to the constructor of the TemplateValidator. Skips semver validation.
 *
 * @ignore
 */
var _createTemplateValidator = function (skipSemver) {
	var hasSchema = function (typeid) {
		return this._localVersionedTemplates.has(typeid);
	};
	var params = {
		inheritsFrom: this.inheritsFrom.bind(this),
		hasSchema: hasSchema.bind(this),
	};

	if (skipSemver) {
		params.skipSemver = skipSemver;
	}

	return new TemplateValidator(params);
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
var registerLocal = function (in_template) {
	var typeid = in_template.typeid;
	var remoteTemplates = this._getRemoteTemplates(typeid);

	if (!this._isNativePropertyConstructor(in_template)) {
		if (!(in_template instanceof PropertyTemplate)) {
			in_template = new PropertyTemplate(in_template);
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

			var localValidationResults = { isValid: true };
			if (this._localPrimitivePropertiesAndTemplates.has(typeid)) {
				var localRegisteredTemplate = this._localPrimitivePropertiesAndTemplates
					.item(typeid)
					.getPropertyTemplate();

				localValidationResults = templateValidator.validate(
					localRegisteredTemplate.serializeCanonical(),
					serializedInTemplate,
				);
			}

			if (localValidationResults.isValid) {
				var remoteValidationResults = { isValid: true };
				if (remoteTemplates.length) {
					_.every(remoteTemplates, function (template) {
						remoteValidationResults = templateValidator.validate(
							template.serializeCanonical(),
							serializedInTemplate,
						);

						return remoteValidationResults.isValid;
					});
				}
			}

			if (!localValidationResults.isValid) {
				throw new Error(
					MSG.TEMPLATE_MISMATCH +
						typeid +
						"\n  errors = " +
						JSON.stringify(_extractErrorMessage(localValidationResults.errors), 0, 2),
				);
			} else if (!remoteValidationResults.isValid) {
				throw new Error(
					MSG.REMOTE_TEMPLATE_MISMATCH +
						typeid +
						"\n  errors = " +
						JSON.stringify(_extractErrorMessage(remoteValidationResults.errors), 0, 2),
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
					this._localVersionedTemplates
						.item(typeidWithoutVersion)
						.add(version, in_template);
				} else {
					var collection = _createVersionedSortedCollection();
					this._localVersionedTemplates.add(typeidWithoutVersion, collection);
					collection.add(version, in_template);
				}
			} else {
				throw new Error(
					MSG.FAILED_TO_REGISTER +
						typeid +
						"\n  errors = " +
						JSON.stringify(_extractErrorMessage(validationResult.errors), 0, 2),
				);
			}
		} else {
			throw new Error(
				MSG.UNVERSIONED_TEMPLATE +
					" Template with typeid = " +
					typeid +
					" is not versioned.",
			);
		}
		// Forward to the internal function
		this._registerTypeId(typeid, in_template);
	} else {
		throw new Error(MSG.CANNOT_REGISTER_PRIMITIVE + typeid);
	}
};

/**
 * Helper function used to extract the error messages from a list of Error objects
 * @param {Array.<Error>} in_errors - List of error objects
 * @private
 * @returns {Array.<string>} List of error messages
 */
var _extractErrorMessage = function (in_errors) {
	return _.map(in_errors, function (error) {
		return error.message;
	});
};

/**
 * Helper function used to create a sorted collection
 * @returns {property-common.Datastructures.SortedCollection} Empty sorted collection
 * @private
 */
var _createVersionedSortedCollection = function () {
	var collection = new SortedCollection();
	collection.setComparisonFunction(function (versionA, versionB) {
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
 * Extracts typeids directly referred to in a template and that are not locally known
 *
 * @public
 * @param {property-properties.PropertyTemplate|object} in_template - from which to extract dependencies
 *
 * @returns {Array} list of unknown typeids
 */
var _extractUnknownDependencies = function (in_template) {
	var self = this;
	var dependencies = PropertyTemplate.extractDependencies(in_template);

	dependencies = dependencies.filter(function (typeid) {
		return !self._localPrimitivePropertiesAndTemplates.has(typeid);
	});

	return dependencies;
};

/**
 * Pushes a template request task onto the template requests queue
 *
 * @public
 * @param {String} in_typeid - typeid of the template to retrieve
 */
var _pushTemplateRequestTask = function (in_typeid) {
	var that = this;

	if (that.missingDependencies[in_typeid].requested === true) {
		return;
	}
	that.missingDependencies[in_typeid].requested = true;

	this.templateRequestsQueue.push(
		{ typeid: in_typeid, context: that._templateStore },
		function (response) {
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
						that.missingDependencies[typeid] = { requested: false };
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
		},
	);
};

/**
 * Creates a new collection of property templates used later on
 * to instantiate property sets based on the typeid (Type identifier).
 */
class PropertyFactory {
	/**
	 * @constructor
	 * @protected
	 * @alias property-properties.PropertyFactory
	 */
	constructor() {
		// Unfortunately, PropertyFactory can't inherit from EventEmitter class as
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
		this._templateStore = undefined;

		// Async queue of schema retrieval tasks
		this.templateRequestsQueue = undefined;

		// List of missing dependencies
		this.missingDependencies = undefined;

		// Structure containing results the process of retrieving property set schemas from store
		this.templateRequestsResults = {
			errors: {},
			schemas: {},
		};

		// Cache of inheritsFrom() request results
		this._inheritanceCache = {};

		/** Cache of constructor function that are auto-generated for typeids */
		this._typedPropertyConstructorCache = {};

		/** A cache of functions that create the properties */
		this._cachedCreationFunctions = new Map();

		/**
		 * Usually we will  use the precompiled creation functions, but those all share the same constant properties.
		 * Since it is allowed to overwrite constants via default values, we have to explicitly instantiate new
		 * property instances for constants. Since the constants themselves may contain nested property instances,
		 * we use this flag to indicate that for all nested properties, we do not want to use the precompiled
		 * instantiation functions.
		 */
		this._forceInstantion = false;

		this._init();
	}

	/**
	 * Add a listener for a given type of event.
	 *
	 * @param {string} eventName - A string representing the type of event upon which the
	 * listener will be notified.
	 * @param {function} eventListener - The function to call when the "type" of event
	 * is emitted.
	 */
	addListener(eventName, eventListener) {
		this._eventEmitter.addListener(eventName, eventListener);
	}

	/**
	 * Remove a listener for a given type of event. Iff a listener was removed,
	 * an event 'removeListener' will be emitted.
	 *
	 * @param {string} eventName - A string representing the type of event on which the
	 * listener was attached.
	 * @param {function} eventListener - The function to remove from the list of functions
	 */
	removeListener(eventName, eventListener) {
		this._eventEmitter.removeListener(eventName, eventListener);
	}

	/**
	 * Initialize the PropertyFactory by registering primitive types
	 */
	_init() {
		// Register all primitive properties
		this._registerTypeId("BaseProperty", BaseProperty, "all");
		this._registerTypeId("NodeProperty", NodeProperty, "all");
		this._registerTypeId("ContainerProperty", ContainerProperty, "all");

		// Register the primitive types for the context single
		this._registerTypeId("Int8", Int8Property);
		this._registerTypeId("Uint8", Uint8Property);
		this._registerTypeId("Int16", Int16Property);
		this._registerTypeId("Uint16", Uint16Property);
		this._registerTypeId("Int32", Int32Property);
		this._registerTypeId("Int64", Int64Property);
		this._registerTypeId("Uint64", Uint64Property);
		this._registerTypeId("Uint32", Uint32Property);
		this._registerTypeId("Float32", Float32Property);
		this._registerTypeId("Float64", Float64Property);
		this._registerTypeId("Bool", BoolProperty);
		this._registerTypeId("String", StringProperty);
		this._registerTypeId("Reference", ReferenceProperty);
		this._registerTypeId("Enum", EnumProperty);

		// Register the primitive types for the context array
		this._registerTypeId("Int8", Int8ArrayProperty, "array");
		this._registerTypeId("Uint8", Uint8ArrayProperty, "array");
		this._registerTypeId("Int16", Int16ArrayProperty, "array");
		this._registerTypeId("Uint16", Uint16ArrayProperty, "array");
		this._registerTypeId("Int32", Int32ArrayProperty, "array");
		this._registerTypeId("Uint32", Uint32ArrayProperty, "array");
		this._registerTypeId("Int64", Int64ArrayProperty, "array");
		this._registerTypeId("Uint64", Uint64ArrayProperty, "array");
		this._registerTypeId("Float32", Float32ArrayProperty, "array");
		this._registerTypeId("Float64", Float64ArrayProperty, "array");
		this._registerTypeId("String", StringArrayProperty, "array");
		this._registerTypeId("Bool", BoolArrayProperty, "array");
		this._registerTypeId("Reference", ReferenceArrayProperty, "array");
		this._registerTypeId("Enum", EnumArrayProperty, "array");

		// Register the primitive types for the context map
		this._registerTypeId("Int8", Int8MapProperty, "map");
		this._registerTypeId("Uint8", Uint8MapProperty, "map");
		this._registerTypeId("Int16", Int16MapProperty, "map");
		this._registerTypeId("Uint16", Uint16MapProperty, "map");
		this._registerTypeId("Int32", Int32MapProperty, "map");
		this._registerTypeId("Uint32", Uint32MapProperty, "map");
		this._registerTypeId("Int64", Int64MapProperty, "map");
		this._registerTypeId("Uint64", Uint64MapProperty, "map");
		this._registerTypeId("Float32", Float32MapProperty, "map");
		this._registerTypeId("Float64", Float64MapProperty, "map");
		this._registerTypeId("Bool", BoolMapProperty, "map");
		this._registerTypeId("String", StringMapProperty, "map");
		this._registerTypeId("Reference", ReferenceMapProperty, "map");

		// Register the default templates
		var NamedPropertyTemplate = {
			typeid: "NamedProperty",
			properties: [{ id: "guid", typeid: "String" }],
		};

		var NamedNodePropertyTemplate = {
			typeid: "NamedNodeProperty",
			inherits: ["NodeProperty", "NamedProperty"],
		};

		var RelationshipPropertyTemplate = {
			typeid: "RelationshipProperty",
			inherits: ["NodeProperty", "NamedProperty"],
			properties: [{ id: "to", typeid: "Reference" }],
		};

		this._registerTypeId(NamedPropertyTemplate.typeid, NamedPropertyTemplate);
		this._registerTypeId(NamedNodePropertyTemplate.typeid, NamedNodePropertyTemplate);
		this._registerTypeId(RelationshipPropertyTemplate.typeid, RelationshipPropertyTemplate);
	}

	/**
	 * Register a template which are used to instantiate properties. To find out more about templates,
	 * see https://docs.google.com/document/d/1-7kXkKTu3AZLjKyKl7XK2VuAJRSbUxo3ZuPA8bzWocs/edit
	 *
	 * In addition to json structures
	 * it also accepts typeids, as well as arrays of jsons ans arrays of typeids
	 * as arguments. IN the case of jsons, the behavior is similar to the behavior of registerLocal.
	 * In the case of typeids, it adds it to a list of unknown dependencies if the corresponding template
	 * is not known locally. The case of arrays is a a repetitive application of the scalar type.
	 *
	 * @param {property-properties.PropertyTemplate|object|String|Array} in_input - a template, a typeid or an array of either
	 */
	register(in_input) {
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

		var validateArray = function (array) {
			var isInvalid = _.some(array, function (value) {
				return !PropertyTemplate.isTemplate(value) && !TypeIdHelper.isTemplateTypeid(value);
			});

			return !isInvalid;
		};

		var input_array = undefined;
		if (PropertyTemplate.isTemplate(in_input) || typeof in_input === "string") {
			input_array = [in_input];
		} else if (_.isArray(in_input)) {
			input_array = in_input;
		} else {
			throw new TypeError(MSG.ATTEMPT_TO_REGISTER_WITH_BAD_ARGUMENT);
		}

		if (!validateArray(input_array)) {
			throw new Error(MSG.ATTEMPT_TO_REGISTER_WITH_BAD_ARGUMENT);
		}

		for (var i = 0; i < input_array.length; i++) {
			var elem = input_array[i];
			if (typeof elem === "string") {
				if (!this._localPrimitivePropertiesAndTemplates.has(elem)) {
					if (this.missingDependencies[elem] === undefined) {
						this.missingDependencies[elem] = { requested: false };
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
	}

	/**
	 * @returns {Array.<string>} Array of the names of the registered types.
	 */
	listRegisteredTypes() {
		return Array.from(this._localPrimitivePropertiesAndTemplates.keys);
	}

	/**
	 * Recursively parses the object of the specified type and returns the created
	 * array of PropertySets Templates. It does the same thing as the registerFrom()
	 * function, but it returns the array of templates instead of registering them.
	 * Throws an error if any conversion error occurs.
	 *
	 * @param {String} in_fromType - The type of the object to convert.
	 * The only type supported so far is 'JSONSchema'.
	 * @param {Object} in_toConvert - The object to convert
	 * @throws if in_fromType is not valid.
	 * @throws if the in_toConvert object is not a valid template.
	 * @returns {Array.<object>} Array of Property Sets Templates
	 */
	convertToTemplates(in_fromType, in_toConvert) {
		switch (in_fromType) {
			default:
				throw new Error(MSG.UNKNOWN_TYPE + in_fromType);
		}
	}

	/**
	 * Recursively parses the object of the specified type and registers the created
	 * Property Sets Templates. It does the same work as the convertToTemplates()
	 * function, but it registers the templates for you instead of returning them.
	 * Throws an error if any conversion error occurs.
	 *
	 * @param {String} in_fromType - The type of the object to convert.
	 * The only type supported so far is 'JSONSchema'.
	 * @param {Object} in_toConvert - The object to convert
	 * @throws if in_toConvert is not valid.
	 * @throws if in_fromType is not a valid object type.
	 */
	registerFrom(in_fromType, in_toConvert) {
		var psetsTemplates = this.convertToTemplates(in_fromType, in_toConvert);
		for (var i = 0; i < psetsTemplates.length; i++) {
			this.register(psetsTemplates[i]);
		}
	}

	/**
	 * Validate semver.
	 * Here we compare the incoming template with its previous/next version in the
	 * local and remote registry with the intent of detecting semver violations.
	 * The semver rules for templates are as follows:
	 *
	 * - If the template structure has been altered (delete/modify existing field) then the MAJOR version should be
	 * bumped.
	 *
	 * - If the template structure has been extended (add new fields) then the MINOR version should be bumped.
	 *
	 * - If the annotation field has been updated then the PATCH version should be bumped.
	 *
	 * If any of these rules have been broken then a warning message is printed onto the console.
	 *
	 * @param {object|property-properties.PropertyTemplate} in_template - The template to compare against
	 * its previous or next versions.
	 * @param {boolean} in_compareRemote - Flag indicating whether we want to compare the given
	 * template against the remote registry.
	 *
	 * @private
	 */
	_validateSemver(in_template, in_compareRemote) {
		var typeidWithoutVersion = in_template.getTypeidWithoutVersion();
		var version = in_template.getVersion();
		var typeid = in_template.typeid;
		var validationResults;

		var warnings = [];

		if (this._localVersionedTemplates.has(typeidWithoutVersion)) {
			var previousLocalVersion = this._localVersionedTemplates
				.item(typeidWithoutVersion)
				.getNearestPreviousItem(version);

			if (previousLocalVersion) {
				validationResults = this._templateValidator.validate(
					in_template.serializeCanonical(),
					previousLocalVersion.serializeCanonical(),
				);
				warnings.push.apply(warnings, validationResults.warnings);
			} else {
				var nextLocalVersion = this._localVersionedTemplates
					.item(typeidWithoutVersion)
					.getNearestNextItem(version);
				if (nextLocalVersion) {
					validationResults = this._templateValidator.validate(
						nextLocalVersion.serializeCanonical(),
						in_template.serializeCanonical(),
					);
					warnings.push.apply(warnings, validationResults.warnings);
				}
			}
		}

		if (in_compareRemote) {
			var that = this;
			this._remoteScopedAndVersionedTemplates.iterate(
				function (scope, remoteVersionedTemplates) {
					if (remoteVersionedTemplates.has(typeidWithoutVersion)) {
						var previousRemoteVersion = remoteVersionedTemplates
							.item(typeidWithoutVersion)
							.getNearestPreviousItem(version);

						if (previousRemoteVersion) {
							validationResults = that._templateValidator.validate(
								in_template.serializeCanonical(),
								previousRemoteVersion.getPropertyTemplate().serializeCanonical(),
							);
							warnings.push.apply(warnings, validationResults.warnings);
						} else {
							var nextRemoteVersion = remoteVersionedTemplates
								.item(typeidWithoutVersion)
								.getNearestNextItem(version);
							if (nextRemoteVersion) {
								validationResults = that._templateValidator.validate(
									nextRemoteVersion.getPropertyTemplate().serializeCanonical(),
									in_template.serializeCanonical(),
								);
								warnings.push.apply(warnings, validationResults.warnings);
							}
						}
					}
				},
			);
		}

		if (!_.isEmpty(warnings)) {
			console.warn(
				"Template with typeid = " +
					typeid +
					" is valid but with the following warnings = " +
					JSON.stringify(warnings, 0, 2),
			);
		}
	}

	/**
	 * Internal method used to register remote templates coming over the wire.
	 * @param {property-properties.PropertyTemplate|object} in_remoteTemplate - The remote template to register
	 * @param {string} in_scope - The scope in which the template will be stored in. The scope is usually determined by
	 * the currently checked out workspaces. Each workspace can have their own set of versioned templates
	 * that may be different from other workspaces.
	 * @protected
	 */
	_registerRemoteTemplate(in_remoteTemplate, in_scope) {
		if (!(in_remoteTemplate instanceof PropertyTemplate)) {
			in_remoteTemplate = new PropertyTemplate(in_remoteTemplate);
		}

		var typeidWithoutVersion = in_remoteTemplate.getTypeidWithoutVersion();
		var version = in_remoteTemplate.getVersion();
		var typeid = in_remoteTemplate.typeid;

		if (this._localPrimitivePropertiesAndTemplates.has(typeid)) {
			// Template already exists. The incoming template MUST match what is registered.
			// If they do not match, throw an error letting the user know that the templates are incompatible.
			// This is likely due to the fact that the developer did not bump its version.
			var registeredTemplate = this._localPrimitivePropertiesAndTemplates
				.item(typeid)
				.getPropertyTemplate();

			var templateValidator = _createTemplateValidator.call(this);
			var validationResults = templateValidator.validate(
				registeredTemplate.serializeCanonical(),
				in_remoteTemplate.serializeCanonical(),
			);
			if (!validationResults.isValid) {
				throw new Error(
					MSG.TEMPLATE_MISMATCH +
						typeid +
						"\n  errors = " +
						JSON.stringify(_extractErrorMessage(validationResults.errors), 0, 2),
				);
			}
		} else if (in_remoteTemplate._isVersioned()) {
			this._validateSemver(in_remoteTemplate);
			var wrappedTemplate = new PropertyTemplateWrapper(in_remoteTemplate, in_scope);

			if (this._remoteScopedAndVersionedTemplates.has(in_scope)) {
				if (
					this._remoteScopedAndVersionedTemplates.item(in_scope).has(typeidWithoutVersion)
				) {
					if (
						!this._remoteScopedAndVersionedTemplates
							.item(in_scope)
							.item(typeidWithoutVersion)
							.has(version)
					) {
						this._remoteScopedAndVersionedTemplates
							.item(in_scope)
							.item(typeidWithoutVersion)
							.add(version, wrappedTemplate);
					}
				} else {
					var versionCollection = _createVersionedSortedCollection();
					versionCollection.add(version, wrappedTemplate);
					this._remoteScopedAndVersionedTemplates
						.item(in_scope)
						.add(typeidWithoutVersion, versionCollection);
				}
			} else {
				var namespaceCollection = new Collection();
				var versionCollection = _createVersionedSortedCollection();
				namespaceCollection.add(typeidWithoutVersion, versionCollection);
				versionCollection.add(version, wrappedTemplate);
				this._remoteScopedAndVersionedTemplates.add(in_scope, namespaceCollection);
			}
		} else {
			throw new Error(
				MSG.UNVERSIONED_REMOTE_TEMPLATE + " \n" + JSON.stringify(in_remoteTemplate, 0, 2),
			);
		}
	}

	/**
	 * Remove the scope from the remote templates collection
	 * @param {string} in_scope - The scope to remove
	 * @protected
	 */
	_removeScope(in_scope) {
		var that = this;

		if (this._remoteScopedAndVersionedTemplates.has(in_scope)) {
			// remove the schemas in this scope from the inheritance cache.
			this._remoteScopedAndVersionedTemplates.item(in_scope).iterate(function (nt, schemas) {
				schemas.iterate(function (k, schema) {
					delete that._inheritanceCache[schema.getPropertyTemplate().typeid];
				});
			});

			this._remoteScopedAndVersionedTemplates.remove(in_scope);
		}
	}

	/**
	 * Triggered when a template is registered.
	 * @event property-properties.PropertyFactory#registered
	 * @param {property-properties.Template} Template - The template being registered.
	 * @memberof property-properties.PropertyFactory
	 *
	 */

	/**
	 * Register a template or a primitive property
	 *
	 * This is the internal function used to register templates and primitive properties.
	 *
	 * @param {property-properties.PropertyTemplate|string} in_typeid - typeid of for the property the given
	 * template/constructor represents
	 * @param {property-properties.PropertyTemplate|object|property-properties.BaseProperty} in_templateOrProperty -
	 * Template/native property class to associate with the typeid
	 * @param {string} [in_context='single'] - The context for which the parameter is added (if it is set to all the
	 * object will be used in all contexts)
	 */
	_registerTypeId(in_typeid, in_templateOrProperty, in_context) {
		// If the input is not yet a BaseProperty derived type or a
		// PropertyTemplate, we create a PropertyTemplate object for it

		if (
			!(
				in_templateOrProperty instanceof PropertyTemplate ||
				this._isNativePropertyConstructor(in_templateOrProperty)
			)
		) {
			in_templateOrProperty = new PropertyTemplate(in_templateOrProperty);
		}

		// If no context is specified we assign one
		if (!in_context) {
			// By default templates are registered for all contexts together, BaseProperties are registered separately
			in_context = in_templateOrProperty instanceof PropertyTemplate ? "all" : "single";
		}

		if (in_context !== "all") {
			if (!this._localPrimitivePropertiesAndTemplates.has(in_typeid)) {
				this._localPrimitivePropertiesAndTemplates.add(in_typeid, new Collection());
			}
			this._localPrimitivePropertiesAndTemplates
				.item(in_typeid)
				.add(in_context, in_templateOrProperty);
		} else if (!this._localPrimitivePropertiesAndTemplates.has(in_typeid)) {
			var wrapper = new PropertyTemplateWrapper(in_templateOrProperty);
			this._localPrimitivePropertiesAndTemplates.add(in_typeid, wrapper);
		}

		this._eventEmitter.emit("registered", in_templateOrProperty);
	}

	/**
	 * Validate a template.
	 * Check that the template is syntactically correct as well as semantically correct.
	 *
	 * @param {object|property-properties.PropertyTemplate} in_template - The template to check against.
	 *
	 * @returns {object|undefined} map of key-value pairs where the path of the invalid property is the key,
	 * and the value is the error message.
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
	 */
	validate(in_template) {
		return this._templateValidator.validate(in_template);
	}

	/**
	 * Get a template or property object based on a typeid and a context
	 *
	 * @param {string} in_typeid - The type unique identifier
	 * @param {string} [in_context] - The context of the property to create
	 * @param {string} [in_scope] - The scope in which the property typeid is defined
	 *
	 * @returns {property-properties.PropertyTemplate|object|property-properties.BaseProperty|undefined}
	 * Template/Property identified by the typeid.
	 */
	_get(in_typeid, in_context, in_scope = undefined) {
		var templateOrProperty = this._getWrapper(in_typeid, in_context, in_scope);
		if (templateOrProperty instanceof PropertyTemplateWrapper) {
			return templateOrProperty.getPropertyTemplate();
		}
		return templateOrProperty;
	}

	/**
	 * Get a template or property object based on a typeid and a context
	 *
	 * @param {string} in_typeid - The type unique identifier
	 * @param {string} [in_context] - The context of the property to create
	 * @param {string} [in_scope] - The scope in which the property typeid is defined
	 *
	 * @returns {property-properties.PropertyTemplateWrapper|property-properties.BaseProperty|undefined}
	 * Template/Property identified by the typeid.
	 */
	_getWrapper(in_typeid, in_context, in_scope) {
		if (this._localPrimitivePropertiesAndTemplates.has(in_typeid)) {
			var typeidItem = this._localPrimitivePropertiesAndTemplates.item(in_typeid);
			if (!(typeidItem instanceof Collection)) {
				return typeidItem;
			} else {
				var context = in_context || "single";
				return this._localPrimitivePropertiesAndTemplates.item(in_typeid).item(context);
			}
		} else if (in_scope && this._remoteScopedAndVersionedTemplates.has(in_scope)) {
			var splitTypeId = TypeIdHelper.extractVersion(in_typeid);
			if (splitTypeId.version) {
				var typeidWithoutVersion = splitTypeId.typeidWithoutVersion;
				var version = splitTypeId.version;

				if (
					this._remoteScopedAndVersionedTemplates
						.item(in_scope)
						.has(typeidWithoutVersion) &&
					this._remoteScopedAndVersionedTemplates
						.item(in_scope)
						.item(typeidWithoutVersion)
						.has(version)
				) {
					return this._remoteScopedAndVersionedTemplates
						.item(in_scope)
						.item(typeidWithoutVersion)
						.item(version);
				}
			}
		}

		return undefined;
	}

	/**
	 * Get template based on typeid
	 *
	 * @param {string} in_typeid - The type unique identifier
	 * @returns {property-properties.PropertyTemplate|undefined} Template identified by the typeid.
	 */
	getTemplate(in_typeid) {
		return this._localPrimitivePropertiesAndTemplates.has(in_typeid) &&
			!TypeIdHelper.isPrimitiveType(in_typeid)
			? this._localPrimitivePropertiesAndTemplates.item(in_typeid).getPropertyTemplate()
			: undefined;
	}

	/**
	 * Get remote templates based on typeid
	 * @private
	 * @param {string} in_typeid - The type unique identifier
	 * @returns {array<property-properties.PropertyTemplate>} Array of templates.
	 */
	_getRemoteTemplates(in_typeid) {
		var templatesFound = [];

		var parsedTypeId = TypeIdHelper.extractVersion(in_typeid);
		var typeidWithoutVersion = parsedTypeId.typeidWithoutVersion;
		var version = parsedTypeId.version;

		this._remoteScopedAndVersionedTemplates.iterate(function (scope, remoteVersionedTemplates) {
			if (
				remoteVersionedTemplates.has(typeidWithoutVersion) &&
				remoteVersionedTemplates.item(typeidWithoutVersion).item(version)
			) {
				templatesFound.push(
					remoteVersionedTemplates
						.item(typeidWithoutVersion)
						.item(version)
						.getPropertyTemplate(),
				);
			}
		});

		return templatesFound;
	}

	/**
	 * Create an instance of the given property typeid if there is a template registered for it.
	 * Otherwise, this method returns undefined. Searches also in scoped templates.
	 *
	 * @param {string} in_typeid - The type unique identifier
	 * @param {string} in_context - The type of collection of values that the property contains.
	 * Accepted values are "single" (default), "array", "map" and "set".
	 * @param {object|undefined} in_initialProperties - A set of initial values for the PropertySet being created
	 * @param {string|undefined} in_scope - The scope in which the property typeid is defined
	 * @returns {property-properties.BaseProperty|undefined} the property instance
	 * @private
	 */
	_createProperty(in_typeid, in_context, in_initialProperties, in_scope) {
		const ifNotSingleOrUndefined = (in_context || "single") !== "single";
		ConsoleUtils.assert(
			ifNotSingleOrUndefined || _.isString(in_typeid),
			MSG.UNKNOWN_TYPEID_SPECIFIED + in_typeid,
		);
		let context = in_context;
		if (!context) {
			// If no context is supplied, we check whether the typeid contains a context
			if (!TypeIdHelper.isReferenceTypeId(in_typeid)) {
				var splitTypeId = TypeIdHelper.extractContext(in_typeid);
				in_typeid = splitTypeId.typeid;
				context = splitTypeId.context;
			}
		}

		let propertyCreationFunction = undefined;

		if (!this._forceInstantion) {
			// Check, whether we already have a property creation function for this property
			// in the cache
			const scopeFunctionEntry = this._cachedCreationFunctions.get(in_typeid);
			const contextFunctionEntry = scopeFunctionEntry && scopeFunctionEntry.get(in_scope);
			propertyCreationFunction = contextFunctionEntry && contextFunctionEntry.get(context);
		}

		// If we don't have a cached function or are requested to explicitly instantiate the property
		// we have to first create a property definition by recursively traversing all templates
		let propertyDef;
		if (!propertyCreationFunction) {
			propertyDef = {};
			this._createDefFromPropertyDeclaration(
				{
					typeid: in_typeid,
					context: context || "single",
				},
				in_scope,
				propertyDef,
			);
		}

		let property;
		if (!this._forceInstantion) {
			// If we don't yet have a creation function, we will create one here
			propertyCreationFunction =
				propertyCreationFunction ||
				this._definePropertyCreationFunction(propertyDef, in_typeid, in_scope, context);

			// Create the property by invoking the precompiled creation function
			property = propertyCreationFunction();

			// If initial properties have been provided, we will assign them to the
			// default initialized property
			if (in_initialProperties !== undefined) {
				this._setInitialValue(
					property,
					{
						value: in_initialProperties,
					},
					false,
				);
			}
		} else {
			// Directly instantiate the property from the definition (without using) a precompield function
			property = this._instantiatePropertyDef(
				propertyDef,
				in_scope,
				in_initialProperties && {
					value: in_initialProperties,
				},
			);
		}

		return property;
	}

	/**
	 * Creates an instance of the property described in the property definition.
	 *
	 * Note: this function won't create any constant children, it is only used to
	 * instantiate nested constant properties and those will be set to constant
	 * after their instantiation.
	 *
	 * @param {Object} propertyDef - The property defintion for the property to create
	 * @param {String} in_scope - The scope for the property to create
	 * @param {String} in_initialProperties - The initial values for the property
	 *
	 * @returns {BaseProperty} An instance of the property
	 */
	_instantiatePropertyDef(propertyDef, in_scope, in_initialProperties) {
		let rootProperty = undefined;

		// This stack is used to recursively iterate over the property definition
		const creationStack = [
			{
				id: undefined,
				entry: propertyDef,
				parent: undefined,
			},
		];

		while (creationStack.length > 0) {
			const currentEntry = creationStack.pop();

			// We have an entry on the stack that is just waiting for its children to finish, but has already
			// been created
			if (currentEntry.signalChildrenFinished) {
				currentEntry.property._signalAllStaticMembersHaveBeenAdded(in_scope);

				if (currentEntry.initialValue) {
					this._setInitialValue(currentEntry.property, currentEntry.initialValue, true);
				}
				continue;
			}

			// Create the property instance
			let property = new currentEntry.entry.constructorFunction(currentEntry.entry.entry);

			// Insert / append the property to the parent
			if (currentEntry.parent) {
				if (currentEntry.entry.optional) {
					currentEntry.parent._insert(property.getId(), property, true);
				} else {
					currentEntry.parent._append(property, currentEntry.entry.allowChildMerges);
				}
			} else {
				// If we are at the root, we store the property object to return it later
				rootProperty = property;
			}

			// For named properties we have to assign a GUID (note: all constant properties in
			// a template will share this GUID)
			if (currentEntry.setGuid) {
				property.value = GuidUtils.generateGUID();
			}

			// Assign optional children
			if (currentEntry.entry.optionalChildren) {
				for (let [id, typeid] of Object.entries(currentEntry.entry.optionalChildren)) {
					property._addOptionalChild(id, typeid);
				}
			}

			// Recursively process all children of this entry
			if (currentEntry.entry.children) {
				// Create an entry on the stack, which is later needed,
				// to signal that all child properties have been added
				const parentStackEntry = {
					signalChildrenFinished: true,
					initialValue: currentEntry.entry.initialValue,
					property,
				};
				creationStack.push(parentStackEntry);

				for (let [id, child] of currentEntry.entry.children) {
					creationStack.push({
						parent: property,
						id: id,
						entry: child,
						setGuid: currentEntry.entry.assignGuid && id === "guid",
					});
				}
			} else {
				// If there are no children, we directly assign the initial value and
				// signal that the property has completely been initialized
				if (currentEntry.entry.initialValue) {
					this._setInitialValue(property, currentEntry.entry.initialValue, true);
				}

				if (currentEntry.entry.signal) {
					property._signalAllStaticMembersHaveBeenAdded(in_scope);
				}
			}
		}

		if (in_initialProperties !== undefined) {
			this._setInitialValue(rootProperty, in_initialProperties, true);
		}

		return rootProperty;
	}

	/**
	 * Creates a javascript function that instantiates the requested property
	 *
	 * @param {Object} propertyDef - The property defintion for the property for which the function is created
	 * @param {String} in_typeid - The typeid for the property for which the function is created
	 * @param {String} in_scope - The scope for the property for which the function is created
	 * @param {String} in_context - The context for the property for which the function is created
	 *
	 * @returns {Function} A function that creates an instance of the property
	 */
	_definePropertyCreationFunction(propertyDef, in_typeid, in_scope, in_context) {
		// This stack is used to recursively iterate over the property definition
		const creationStack = [
			{
				id: null,
				def: propertyDef,
				parent: undefined,
			},
		];

		let creationFunctionSource = "";
		let currentParameterIndex = 0;
		let parameters = [];
		let currentPropertyNumber = 0;
		let currentPropertyVarName = "";
		let resultVarName;

		while (creationStack.length > 0) {
			const currentEntry = creationStack.pop();

			// We have an entry on the stack that is just waiting for its children to finish, but has already
			// been created
			if (currentEntry.signalChildrenFinished) {
				// Add the signalling function
				creationFunctionSource += `${
					currentEntry.propertyVarname
				}._signalAllStaticMembersHaveBeenAdded(${JSON.stringify(in_scope)});\n`;
				continue;
			}

			// Determine the initial value for this property
			let initialValue =
				currentEntry.def.initialValue !== undefined
					? currentEntry.def.initialValue
					: undefined;

			if (currentEntry.def.entry.id) {
				let parentEntry = currentEntry.parentStackEntry;
				let path = [currentEntry.def.entry.id];

				// We have to walk the whole parent chain and extract for
				// each parent the initial values. Entries further up in the
				// chain can overwrite entries further down
				while (parentEntry) {
					if (parentEntry.initialValue) {
						// Extract changes to be applied to this property
						let filteredChangeSet = parentEntry.initialValue.value;
						for (let i = 0; i < path.length; i++) {
							filteredChangeSet = filteredChangeSet && filteredChangeSet[path[i]];
						}

						// Update the initial value with the extract changeset
						if (_.isObject(filteredChangeSet)) {
							if (initialValue === undefined) {
								initialValue = {
									typed: false,
									value: filteredChangeSet,
								};
							} else if (_.isObject(initialValue)) {
								Object.assign(initialValue.value, filteredChangeSet);
							} else {
								throw new TypeError("Invalid default values specified");
							}
						} else if (filteredChangeSet !== undefined) {
							if (initialValue === undefined) {
								initialValue = {
									value: undefined,
									typed: false,
								};
							}
							initialValue.value = filteredChangeSet;
						}
					}
					if (parentEntry.id !== null) {
						path.unshift(parentEntry.id);
					}
					parentEntry = parentEntry.parentStackEntry;
				}
			}

			if (currentEntry.def.constant) {
				// If we have a constant property, we create a concrete property object instance and share it
				// among all instances of the parent property
				let instantiatedChild;
				try {
					// Usually we would use the precompiled creation functions, but those all share
					// the same constant properties. Since it is allowed to overwrite constants via
					// default values, we have to explicitly instantiate new property instances for
					// constants. Since the constants themselves may contain nested property instances,
					// we use this flag to indicate that for all nested properties, we do not want to use
					// the precompiled instantiation functions.
					this._forceInstantion = true;
					instantiatedChild = this._instantiatePropertyDef(
						currentEntry.def,
						in_scope,
						currentEntry.def.initialValue,
					);
				} finally {
					this._forceInstantion = false;
				}
				instantiatedChild._setAsConstant();

				// Add a reference to the newly instantiate constant property to the parameters and add
				// a command to add it into the tree
				parameters.push(instantiatedChild);
				creationFunctionSource += `${currentEntry.parentVarName}._append(
                    parameters[${currentParameterIndex}], ${currentEntry.def.allowChildMerges}
                );\n`;
				currentParameterIndex += 1;
			} else {
				// Put the constructor function and the description of the property into the
				// parameters array
				parameters.push(currentEntry.def.constructorFunction);
				parameters.push(currentEntry.def.entry);

				// and add the instantiation call to the generated function
				currentPropertyNumber++;
				currentPropertyVarName = `property${currentPropertyNumber}`;
				creationFunctionSource += `const ${currentPropertyVarName} =
                    new parameters[${currentParameterIndex}](parameters[${
						currentParameterIndex + 1
					}]);\n`;
				currentParameterIndex += 2;

				// Insert / append the property to the parent
				if (currentEntry.parentVarName !== undefined) {
					creationFunctionSource += currentEntry.def.optional
						? `${currentEntry.parentVarName}._insert(
                            ${JSON.stringify(
								currentEntry.def.entry.id,
							)}, ${currentPropertyVarName}, true
                        );\n`
						: `${currentEntry.parentVarName}._append(
                            ${currentPropertyVarName}, ${currentEntry.def.allowChildMerges}
                        );\n`;
				} else {
					resultVarName = currentPropertyVarName;
				}

				// For named properties we have to add a calll to assign a GUID to the function
				if (currentEntry.setGuid) {
					creationFunctionSource += `${currentPropertyVarName}.value = GuidUtils.generateGUID();\n`;
				}

				// And if there are any optional children, we add them here (should this be further optimized? I
				// propbably would not have to be done on every instantiation, those could be stored in the prototype)
				if (currentEntry.def.optionalChildren) {
					for (let [id, typeid] of Object.entries(currentEntry.def.optionalChildren)) {
						creationFunctionSource += `${currentPropertyVarName}._addOptionalChild(
                            ${JSON.stringify(id)},
                            ${JSON.stringify(typeid)}
                        );\n`;
					}
				}

				// Recursively process all children of this entry
				if (currentEntry.def.children) {
					// Create an entry on the stack, which is later needed,
					// to signal that all child properties have been added
					const parentStackEntry = {
						signalChildrenFinished: true,
						initialValue: currentEntry.def.initialValue,
						propertyVarname: currentPropertyVarName,
						parentStackEntry: currentEntry.parentStackEntry,
						id: currentEntry.id,
					};
					creationStack.push(parentStackEntry);

					// Recursively add all children to the stack
					for (let [id, child] of currentEntry.def.children) {
						creationStack.push({
							parentVarName: currentPropertyVarName,
							id: id,
							def: child,
							signalParent: false,
							setGuid: currentEntry.def.assignGuid && id === "guid",
							parentStackEntry,
						});
					}
				} else {
					// This is a leaf property, so if there is a default value
					// we directly assign it here
					if (initialValue !== undefined) {
						creationFunctionSource += !_.isObject(initialValue.value)
							? // We have a primitive property and thus direclty invoke the setValue function
							  `${currentPropertyVarName}.setValue(${JSON.stringify(
									initialValue.value,
							  )})\n`
							: // For non primitive properties, we currently use the member on the property factory,
							  // probably we could further optimize this to directly call the correct function on the
							  // property
							  `this._setInitialValue(${currentPropertyVarName},
                                                        ${JSON.stringify(initialValue)},
                                                        false);\n`;
					}

					// If this property is constant, we assign the constant flag
					if (currentEntry.def.constant) {
						creationFunctionSource += `${currentPropertyVarName}._setAsConstant();\n`;
					}

					// If necessary, signal that the propert has been fully initialized (is this ever needed?)
					if (currentEntry.def.signal) {
						creationFunctionSource += `${currentPropertyVarName}._signalAllStaticMembersHaveBeenAdded(
                            ${JSON.stringify(in_scope)}
                        );\n`;
					}
				}
			}
		}

		// Add the return statement at the end of the function
		creationFunctionSource += ` return ${resultVarName};`;

		// Finally, create the actual JS function with the source we compiled above
		let creationFunction = new Function(
			"parameters",
			" GuidUtils",
			creationFunctionSource,
		).bind(this, parameters, GuidUtils);

		// Add the created function to the cache
		let scopesFunction = this._cachedCreationFunctions.get(in_typeid);
		if (!scopesFunction) {
			scopesFunction = new Map();
			this._cachedCreationFunctions.set(in_typeid, scopesFunction);
		}
		let contextsFunction = scopesFunction.get(in_scope);
		if (!contextsFunction) {
			contextsFunction = new Map();
			scopesFunction.set(in_scope, contextsFunction);
		}
		contextsFunction.set(in_context, creationFunction);

		return creationFunction;
	}

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
	_setInitialValue(property, valueParsed, unsetConstant) {
		if (unsetConstant) {
			property._unsetAsConstant();
		}
		if (property instanceof ValueProperty || property instanceof StringProperty) {
			property.setValue(valueParsed.value);
		} else if (valueParsed.typed) {
			property._setValues(valueParsed.value, true, true);
		} else if (
			property.getTypeid() !== "ContainerProperty" ||
			property._getChildrenCount() > 0
		) {
			property._setValues(valueParsed.value, false, true);
		} else if (!valueParsed.typeid) {
			throw new Error(MSG.FIELD_TYPEID_IS_REQUIRED + property._id + ".typeid");
		} else {
			property._setValues(valueParsed.value, false, true);
		}
	}

	/**
	 * Create an instance of the given property typeid if there is a template registered for it.
	 * Otherwise, this method returns undefined.
	 *
	 * @param {string} in_typeid - The type unique identifier
	 * @param {string} in_context - The type of collection of values that the property contains.
	 * Accepted values are "single" (default), "array", "map" and "set".
	 * @param {object=} in_initialProperties - A set of initial values for the PropertySet being created
	 * @param {object=} in_options - Additional options
	 *
	 * @returns {property-properties.BaseProperty|undefined} the property instance
	 */
	create(in_typeid, in_context, in_initialProperties) {
		return this._createProperty(in_typeid, in_context, in_initialProperties, null);
	}

	/**
	 * Creates a  constructor function for the given typeid and id. The function will inherit from the
	 * passed base constructor, but have the typeid and id assigned in its constructor. This way, we
	 * avoid the storage overhead of having those members in each instance of the property.
	 *
	 * @param {String} in_context - The context of the property
	 * @param {String} in_typeid - The typeid of the property
	 * @param {Function} in_baseConstructor - The constructor to inherit from
	 * @param {String} in_id - The Id of the property
	 * @param {String} in_scope - The scope of the property
	 *
	 * @returns {Function} The constructor for the property
	 */
	_getConstructorFunctionForTypeidAndID(
		in_context,
		in_typeid,
		in_baseConstructor,
		in_id,
		in_scope,
	) {
		// Create a unique key for this constructor
		let key = in_context === "single" ? in_typeid : in_context + "<" + in_typeid + ">";

		if (in_id !== undefined) {
			key = key + "-" + in_id;
		}

		if (in_scope && !this._localPrimitivePropertiesAndTemplates.has(in_typeid)) {
			key += "-" + in_scope;
		}

		// Check, whether we already have this function in the cache
		if (this._typedPropertyConstructorCache[key]) {
			return this._typedPropertyConstructorCache[key];
		}

		// If it is not in the cache, create the function

		// This creates a class that will have the correct name in the debugger, but I am not
		// sure whether we want to use a dynamic eval for this. It might be flagged by some security scans
		// It should be safe, since we control the name of constructorClasses for properties
		var propertyConstructorFunction = class extends in_baseConstructor {};
		propertyConstructorFunction.prototype._typeid = in_typeid;

		Object.defineProperty(propertyConstructorFunction, "name", {
			value: in_baseConstructor.name,
		});

		if (in_id !== undefined) {
			propertyConstructorFunction.prototype._id = in_id;
		}

		this._typedPropertyConstructorCache[key] = propertyConstructorFunction;

		return propertyConstructorFunction;
	}

	/**
	 * Creates a property definition for a non-collection property with the entry and constructor function assigned
	 * Children will be added later by parseTemplate.
	 *
	 * @param {string} in_typeid - The type unique identifier
	 * @param {string} in_id - The id of the property to create
	 * @param {property-properties.PropertyTemplate|object|property-properties.BaseProperty} in_templateOrConstructor -
	 * the Template/Property for this in_typeid
	 * @param {string|undefined} in_scope - The scope in which the property typeid is defined
	 *
	 * @returns {property-properties.BaseProperty} The property that serves as parent for the properties in the template
	 * @private
	 */
	_createNonCollectionPropertyDef(
		in_typeid,
		in_id,
		in_templateOrConstructor,
		in_scope,
		propertyDef,
	) {
		let ConstructorFunction;
		const params = {
			typeid: in_typeid,
			id: in_id,
		};

		if (this.inheritsFrom(in_typeid, "NamedProperty", { scope: in_scope })) {
			// An id of NULL means that the GUID of the property is used if it is a named property
			params.id = in_id || null;
		}

		const wrapper = this._getWrapper(in_typeid, undefined, in_scope);
		const creationType = wrapper.getCreationType();

		switch (creationType) {
			case "Enum":
				params._enumDictionary = in_templateOrConstructor._enumDictionary;
				ConstructorFunction = EnumProperty;
				break;
			case "NodeProperty":
				ConstructorFunction = NodeProperty;
				params.typeid = params.typeid || "NodeProperty";
				break;
			case "NamedProperty":
				ConstructorFunction = NamedProperty;
				params.typeid = params.typeid || "NamedProperty";
				break;
			default:
				ConstructorFunction = ContainerProperty;
				params.typeid = params.typeid || "ContainerProperty";
		}

		ConstructorFunction = this._getConstructorFunctionForTypeidAndID(
			"single",
			in_typeid,
			ConstructorFunction,
			in_id,
			in_scope,
		);

		propertyDef.constructorFunction = ConstructorFunction;
		propertyDef.signal = true;
		propertyDef.entry = params;
		propertyDef.context = "single";
		propertyDef.typeid = in_typeid;
	}

	/**
	 * Check whether a typeid is registered
	 * @param {string} in_typeid - The type unique identifier
	 * @param {string|undefined} in_scope - The scope in which the property typeid is defined
	 * @returns {boolean} Returns true if the typeid is registered. False otherwise.
	 * @private
	 */
	_isRegisteredTypeid(in_typeid, in_scope) {
		return !!this._get(in_typeid, undefined, in_scope);
	}

	/**
	 * Checks if there exists a registered template with a corresponding typeid
	 * example:example would match to example:example-1.0.0
	 * example:example-1.0.0 would not match to example:example only to example:example-1.0.0
	 * @param {string} in_typeid - The type unique identifier with or without a version
	 * @param {string|undefined} in_scope - The scope in which the property typeid is defined
	 * @returns {boolean} Returns true if a match is found. False otherwise.
	 * @private
	 */
	_hasCorrespondingRegisteredTypeid(in_typeid, in_scope) {
		if (in_typeid.includes("-")) {
			return this._isRegisteredTypeid(in_typeid, in_scope);
		}

		var registered =
			this._localVersionedTemplates.has(in_typeid) ||
			this._localPrimitivePropertiesAndTemplates.has(in_typeid);

		if (!registered && in_scope && this._remoteScopedAndVersionedTemplates.has(in_scope)) {
			registered = this._remoteScopedAndVersionedTemplates.item(in_scope).has(in_typeid);
		}

		return registered;
	}

	/**
	 * Check whether the given typeid is a specialized constructor
	 * Specialized constructors are of Array or Map types
	 * @param {string} in_typeid - The type unique identifier
	 * @returns {boolean} Returns true if the typeid is a specialized constructor
	 * @private
	 */
	_isSpecializedConstructor(in_typeid) {
		return this._localPrimitivePropertiesAndTemplates.item(in_typeid) instanceof Collection;
	}

	/**
	 * Generate the typeid according to multiple settings
	 *
	 * @param {Object} in_propertiesEntry - Describes the property object to create
	 * @param {string=} [in_propertiesEntry.id] - The name of the property
	 * @param {string=} [in_propertiesEntry.typeid] - The type identifier
	 * @param {string=} [in_propertiesEntry.context] - Context in which the property is created
	 * @param {Object=} [in_propertiesEntry.properties] - Context in which the property is created
	 * @param {number} [in_propertiesEntry.length] - The length of an array property
	 * @param {string} in_scope - The scope in which the property typeid is defined
	 * @param {string} context - The context of the property
	 *
	 * @returns {string} The typeid.
	 */
	_computeTypeid(in_propertiesEntry, in_scope, context) {
		var typeid = in_propertiesEntry.typeid;
		if (context === "single") {
			var valueParsed = this._parseTypedValue(in_propertiesEntry, in_scope, context);
			if (valueParsed.typed && valueParsed.typeid) {
				typeid = in_propertiesEntry.typedValue.typeid;
			}
		}
		// We create a polymorphic collection (one inheriting from BaseProperty), if no typeid is specified
		// but a context is given
		if (!typeid && context !== "single") {
			typeid = context !== "set" ? "ContainerProperty" : "NamedProperty";
		}
		if (
			in_propertiesEntry.typeid &&
			TypeIdHelper.isReferenceTypeId(in_propertiesEntry.typeid)
		) {
			typeid = "Reference";
		}
		return typeid;
	}

	/**
	 * Creates a propertyDef for the given properties entry
	 *
	 * @param {Object} in_propertiesEntry - Describes the property object to create
	 * @param {string=} [in_propertiesEntry.id] - The name of the property
	 * @param {string=} [in_propertiesEntry.typeid] - The type identifier
	 * @param {string=} [in_propertiesEntry.context] - Context in which the property is created
	 * @param {Object=} [in_propertiesEntry.properties] - Context in which the property is created
	 * @param {number} [in_propertiesEntry.length] - The length of an array property
	 * @param {string} in_scope - The scope in which the property typeid is defined
	 * @param {Object} out_propertyDef - The created property definition
	 */
	_createDefFromPropertyDeclaration(in_propertiesEntry, in_scope, out_propertyDef) {
		var context =
			in_propertiesEntry.context !== undefined ? in_propertiesEntry.context : "single";
		var typeid = this._computeTypeid(in_propertiesEntry, in_scope, context);
		var referenceTarget =
			typeid === "Reference"
				? TypeIdHelper.extractReferenceTargetTypeIdFromReference(in_propertiesEntry.typeid)
				: undefined;

		if (typeid) {
			if (
				this._isRegisteredTypeid(typeid, in_scope) &&
				(!referenceTarget ||
					this._hasCorrespondingRegisteredTypeid(referenceTarget, in_scope))
			) {
				var templateOrConstructor = this._get(typeid, context, in_scope);
				var isSpecializedConstructor = this._isSpecializedConstructor(typeid);

				if (
					this._isNativePropertyConstructor(templateOrConstructor) &&
					(isSpecializedConstructor || context === "single")
				) {
					if (
						TypeIdHelper.isReferenceTypeId(typeid) ||
						in_propertiesEntry.id !== undefined
					) {
						templateOrConstructor = this._getConstructorFunctionForTypeidAndID(
							in_propertiesEntry.context,
							in_propertiesEntry.typeid,
							templateOrConstructor,
							in_propertiesEntry.id,
							in_scope,
						);
					}

					out_propertyDef.constructorFunction = templateOrConstructor;
					out_propertyDef.signal = false;
					out_propertyDef.entry = in_propertiesEntry;
					out_propertyDef.context = in_propertiesEntry.context;
					out_propertyDef.typeid = in_propertiesEntry.typeid;

					// If this is a primitive type, we create it via the registered constructor
					var result = new templateOrConstructor(in_propertiesEntry);
					return result;
				} else {
					const templateWrapper = this._getWrapper(typeid, context, in_scope);
					templateOrConstructor = templateWrapper.getCompiledTemplate(this);
					if (context === "single") {
						// If we have a template in a single context, we create it directly here

						// Create the base object
						this._createNonCollectionPropertyDef(
							typeid,
							in_propertiesEntry.id,
							templateOrConstructor,
							in_scope,
							out_propertyDef,
						);

						this._parseTemplate(
							templateOrConstructor,
							in_scope,
							!!templateOrConstructor.inherits,
							out_propertyDef,
						);
					} else {
						// If we have other contexts, we have to create the corresponding property object for that context

						// check if a specialized collection is needed
						var isEnum = this.inheritsFrom(typeid, "Enum", { scope: in_scope });

						var constructorFunction;
						switch (context) {
							case "array":
								if (isEnum) {
									var enumPropertyEntry = deepCopy(in_propertiesEntry);
									enumPropertyEntry._enumDictionary =
										templateOrConstructor._enumDictionary;
									in_propertiesEntry = enumPropertyEntry;

									constructorFunction = EnumArrayProperty;
								} else {
									constructorFunction = ArrayProperty;
								}
								break;
							case "set":
								// Validate that a set inherit from a NamedProperty
								var typeid = in_propertiesEntry.typeid;
								if (
									!this.inheritsFrom(typeid, "NamedProperty", { scope: in_scope })
								) {
									throw new Error(MSG.SET_ONLY_NAMED_PROPS + typeid);
								}

								constructorFunction = SetProperty;
								break;
							case "map":
								constructorFunction = MapProperty;
								break;
							default:
								throw new Error(MSG.UNKNOWN_CONTEXT_SPECIFIED + context);
						}

						out_propertyDef.constructorFunction = constructorFunction;
						out_propertyDef.signal = false;
						out_propertyDef.entry = in_propertiesEntry;
						out_propertyDef.typeid = typeid;
						out_propertyDef.context = context;
					}
				}
			} else {
				// We tried to create a property with an unknown typeid
				// that means we have no template and don't know what to instantiate
				// TODO: look for and use the missing template somehow at this point
				typeid = referenceTarget || typeid;
				throw new Error(MSG.UNKNOWN_TYPEID_SPECIFIED + typeid);
			}
		} else {
			if (!in_propertiesEntry.properties) {
				in_propertiesEntry.properties = [];
			}

			// If this is a declaration which contains a properties list, we have to create a new container property for it
			let copiedPropertyEntry = Object.assign(
				{ typeid: "ContainerProperty" },
				in_propertiesEntry,
			);
			out_propertyDef.constructorFunction = ContainerProperty;
			out_propertyDef.entry = copiedPropertyEntry;
			out_propertyDef.signal = false;
			out_propertyDef.typeid = copiedPropertyEntry.typeid;
			out_propertyDef.context = "single";

			// And then parse the entry like a template
			this._parseTemplate(in_propertiesEntry, in_scope, false, out_propertyDef);
		}

		// If this property inherits from NamedProperty we assign a random GUID
		if (typeid && this.inheritsFrom(typeid, "NamedProperty", { scope: in_scope })) {
			out_propertyDef.assignGuid = true;
		}
	}

	/**
	 * Method used to determine whether the given object is a property constructor
	 *
	 * @param {Object} in_obj - Object to check.
	 * @returns {boolean} True if the object is a BaseProperty.
	 * @private
	 */
	_isNativePropertyConstructor(in_obj) {
		// TODO: This tests seems dangerous. I think it is based on the assumption that constructor is not
		//       overwritten in the derived classes (which it probably should be)
		return in_obj.constructor && in_obj.constructor === ContainerProperty.constructor;
	}

	/**
	 * Checks whether the property has a typedValue and replaces the value and the typeid
	 * with the ones in the typedValue.
	 * @param {Object} in_property - The property top parse.
	 * @param {string} in_scope - The scope in which in_template is defined in
	 * @param {string} in_context - The context of the in_property
	 * @returns {Boolean} - True if the property has a typedValue.
	 * @throws {TYPED_VALUES_MUST_DERIVE_FROM_BASE_TYPE} - Thrown when setting a typed value for a primitive.
	 * @private
	 */
	_parseTypedValue(in_property, in_scope, in_context) {
		var res = {
			typed: false,
			value: in_property.value,
			typeid: in_property.typeid,
		};

		if (in_property.typedValue) {
			var typeid = in_property.typeid || "ContainerProperty";

			// Setting typedValue to a primitive is not supported
			if (TypeIdHelper.isPrimitiveType(typeid)) {
				throw new Error(MSG.TYPED_VALUES_FOR_PRIMITIVES_NOT_SUPPORTED + in_property.id);
			}

			res.typed = true;
			if (in_context === "single") {
				if (!in_property.typedValue.typeid) {
					throw new Error(MSG.FIELD_TYPEID_IS_REQUIRED + "typedValue " + typeid);
				}

				if (
					!this.inheritsFrom(in_property.typedValue.typeid, typeid, { scope: in_scope })
				) {
					throw new Error(
						MSG.TYPED_VALUES_MUST_DERIVE_FROM_BASE_TYPE +
							in_property.typedValue.typeid +
							" must be a subclass of " +
							typeid,
					);
				}

				res.value = in_property.typedValue.value;
				res.typeid = in_property.typedValue.typeid;
			} else {
				res.value = in_property.typedValue;
			}
		}

		return res;
	}

	/**
	 * Parse a given property template appending its property and constant objects to the given propertyDef
	 *
	 * @param {property-properties.PropertyTemplate} in_template - template for the property
	 * @param {string} in_scope - The scope in which in_template is defined in
	 * @param {boolean} in_allowChildMerges - Whether merging of children (nested properties) is allowed.
	 * This is used for extending inherited properties.
	 * @param {Object} out_propertyDef - The created property definition
	 * @private
	 */
	_parseTemplate(in_template, in_scope, in_allowChildMerges, propertyDef) {
		// Check if there are nested property arrays
		if (!(in_template.inherits && in_template.inherits.indexOf("Enum") !== -1)) {
			if (in_template.properties) {
				const properties = in_template.properties;

				for (let i = 0; i < properties.length; i++) {
					const id = properties[i].id;
					const typeid = properties[i].typeid || "ContainerProperty";
					const context = properties[i].context || "single";
					const optional = properties[i].optional || false;

					const valueParsed = this._parseTypedValue(properties[i], in_scope, context);

					if (optional) {
						propertyDef.optionalChildren = propertyDef.optionalChildren || {};
						propertyDef.entry.optionalChildren = true;
						propertyDef.optionalChildren[id] = typeid;
					}

					if (valueParsed.value) {
						const newChildEntry = {
							initialValue: valueParsed,
							optional,
							allowChildMerges: in_allowChildMerges,
						};
						propertyDef.children = propertyDef.children || [];
						propertyDef.children.unshift([properties[i].id, newChildEntry]);
						this._createDefFromPropertyDeclaration(
							properties[i],
							in_scope,
							newChildEntry,
						);
					} else if (!optional) {
						const newChildEntry = {
							initialValue: undefined,
						};
						propertyDef.children = propertyDef.children || [];
						propertyDef.children.unshift([properties[i].id, newChildEntry]);
						this._createDefFromPropertyDeclaration(
							properties[i],
							in_scope,
							newChildEntry,
						);
					}
				}
			}

			if (in_template.constants) {
				const constants = in_template.constants;
				for (let i = 0; i < constants.length; i++) {
					const context = constants[i].context || "single";
					const valueParsed = this._parseTypedValue(constants[i], in_scope, context);

					const newChildEntry = {
						initialValue: undefined,
						constant: true,
					};
					propertyDef.children = propertyDef.children || [];
					propertyDef.children.unshift([constants[i].id, newChildEntry]);

					this._createDefFromPropertyDeclaration(constants[i], in_scope, newChildEntry);

					if (valueParsed.value) {
						newChildEntry.initialValue = valueParsed;
					}
				}
			}
		}
	}

	// private params:
	// @param {string} [in_options.scope]    - The scope in which the property typeid is defined
	/**
	 * Checks whether the template with typeid in_templateTypeid inherits from the template in in_baseTypeid
	 *
	 * Note: By default, this also returns true if in_templateTypeid === in_baseTypeid, since in most use cases
	 * the user wants to check whether a given template has all members as another template and so this is
	 * true for the template itself
	 *
	 * @param {string} in_templateTypeid - Template for which we want to check, whether in_baseTypeid is a parent
	 * @param {string} in_baseTypeid - The base template to check for
	 * @param {object} [in_options] - Additional options
	 * @param {boolean} [in_options.includeSelf=true] - Also return true if in_templateTypeid === in_baseTypeid
	 * @param {property-properties.Workspace} [in_options.workspace] - A checked out workspace to check against. If supplied,
	 * the function will check against the schemas that have been registered within the workspace
	 * @throws if no template is found for in_templateTypeid
	 * @returns {boolean} True if in_baseTypeid is a parent of in_templateTypeid or
	 * if (in_includeSelf == true and in_templateTypeid == in_baseTypeid)
	 */
	inheritsFrom(in_templateTypeid, in_baseTypeid, in_options) {
		const cachedInheritance = this._inheritanceCache[in_templateTypeid];

		in_options = in_options || {};

		if (
			in_templateTypeid === in_baseTypeid &&
			(!!in_options.includeSelf || in_options.includeSelf === undefined)
		) {
			return true;
		}

		// check the inheritance of primitive typeid
		if (
			(TypeIdHelper.isPrimitiveType(in_templateTypeid) ||
				TypeIdHelper.isReservedType(in_templateTypeid)) &&
			(TypeIdHelper.isPrimitiveType(in_baseTypeid) ||
				TypeIdHelper.isReservedType(in_baseTypeid))
		) {
			return TypeIdHelper.nativeInheritsFrom(in_templateTypeid, in_baseTypeid);
		}

		// look in the cache first
		if (cachedInheritance && cachedInheritance[in_baseTypeid]) {
			return true;
		} else {
			var parents = {};
			this._getAllParentsForTemplateInternal(
				in_templateTypeid,
				parents,
				true,
				in_options.scope,
			);

			// update the cache
			this._inheritanceCache[in_templateTypeid] = parents;

			return parents[in_baseTypeid] !== undefined;
		}
	}

	// private params:
	// @param {string|undefined}  [in_options.scope] - The scope in which the template was stored.
	/**
	 * Returns all the typeids the template inherits from (including all possible paths through multiple inheritance).
	 * The order of the elements in the array is unspecified.
	 *
	 * @param {string} in_typeid - typeid of the template
	 * @param {object} [in_options] - Additional options
	 * @param {boolean} [in_options.includeBaseProperty=false] - Include BaseProperty as parent.
	 * Everything implicitly inherits from BaseProperty, but it is not explicitly listed in the template,
	 * so it is only included if explicitly requested.
	 * @param {property-properties.Workspace} [in_options.workspace] - A checked out workspace to check against.
	 * If supplied, the function will check against the schemas that have been registered within the workspace.
	 * @throws if no template found for in_typeid. Make sure it is registered first.
	 * @returns {Array.<string>} typeids of all inherited types (in unspecified order)
	 */
	getAllParentsForTemplate(in_typeid, in_options) {
		in_options = in_options || {};
		// We just forward the request to the internal function
		var parents = {};
		var scope = in_options.workspace
			? in_options.workspace.getRoot()._getCheckedOutRepositoryInfo().getScope()
			: in_options.scope;
		this._getAllParentsForTemplateInternal(
			in_typeid,
			parents,
			!!in_options.includeBaseProperty,
			scope,
		);

		return _.keys(parents);
	}

	/**
	 * Returns all the typeids the template inherits from (including all possible paths through multiple inheritance).
	 *
	 * @param {string} in_typeid - typeid of the template
	 * @param {Object} out_parents - Map containing the parents
	 * @param {Boolean} in_includeBaseProperty - Include BaseProperty as parent. Everything implicitly inherits from
	 * BaseProperty, but it is not explicitly listed in the template, so it is only be included if explicitly requested.
	 * @param {string} [in_scope] - The scope in which the property typeid is defined.
	 */
	_getAllParentsForTemplateInternal(in_typeid, out_parents, in_includeBaseProperty, in_scope) {
		if (TypeIdHelper.isPrimitiveType(in_typeid)) {
			// Everything inherits from BaseProperty.
			if (in_includeBaseProperty) {
				out_parents["AbstractStaticCollectionProperty"] = true;
				out_parents["BaseProperty"] = true;
			}
			return;
		}

		var template = this._get(in_typeid, undefined, in_scope);
		if (!template) {
			throw new Error(MSG.NON_EXISTING_TYPEID + in_typeid);
		}

		// Everything inherits from BaseProperty.
		if (in_includeBaseProperty) {
			out_parents["AbstractStaticCollectionProperty"] = true;
			out_parents["BaseProperty"] = true;
		}

		// Run over all parents and insert them into the parents array
		if (template.inherits) {
			// We have to distinguish the cases where the parents are either specified as a single string or an array
			var parents = _.isArray(template.inherits) ? template.inherits : [template.inherits];

			for (var i = 0; i < parents.length; i++) {
				// Mark it as parent
				out_parents[parents[i]] = true;

				// Continue recursively
				this._getAllParentsForTemplateInternal(
					parents[i],
					out_parents,
					undefined,
					in_scope,
				);
			}
		}
	}

	/**
	 * Internal function used to clear and reinitialize the PropertyFactory
	 * @private
	 */
	_clear() {
		this._localPrimitivePropertiesAndTemplates = new Collection();
		this._localVersionedTemplates = new Collection();
		this._remoteScopedAndVersionedTemplates = new Collection();
		this._inheritanceCache = {};
		this._typedPropertyConstructorCache = {};

		this._init();
	}

	/**
	 * Reregisters a template (by overwriting the existing template).
	 *
	 * This should NEVER be necessary in the final application, but it might be helpful during interactive debugging
	 * sessions, when trying out different templates.
	 *
	 * @protected
	 * @param {property-properties.PropertyTemplate|object|property-properties.BaseProperty} in_template -
	 * The template to reregister
	 */
	_reregister(in_template) {
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

		// Clear this schema from the inheritance cache
		delete this._inheritanceCache[typeid];

		// Remove the typeid from the constructor cache
		var registeredConstructors = _.keys(this._typedPropertyConstructorCache);
		for (var i = 0; i < registeredConstructors.length; i++) {
			if (registeredConstructors[i].substr(0, typeid.length) === typeid) {
				delete this._typedPropertyConstructorCache[registeredConstructors[i]];
			}
		}

		// Remove from typeid creation cache
		this._cachedCreationFunctions.delete(typeid);

		// And repeat the registration
		registerLocal.call(this, in_template);
	}

	/**
	 * Initializes the schema store.
	 * @param {Object} in_options - the store settings.
	 * @param {getBearerTokenFn} in_options.getBearerToken - Function that accepts a callback.
	 * Function that should be called with an error or the OAuth2 bearer token representing the user.
	 * @param {string} in_options.url - The root of the url used in the request to retrieve PropertySet schemas.
	 *
	 * @returns {Promise} Return an empty promise when checkout resolve or reject with error.
	 */
	async initializeSchemaStore(in_options) {
		// https://regex101.com/r/TlgGJp/2
		var regexBaseUrl =
			// eslint-disable-next-line unicorn/no-unsafe-regex
			/^(https?:)?\/\/((.[-a-zA-Z0-9@:%_+~#=.]{2,256}){1,2}\.[a-z]{2,6}|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d{1,5})?(\/[-a-zA-Z0-9@:%_+.~#?&/=]*)*$/;

		if (
			!in_options ||
			!in_options.getBearerToken ||
			!_.isFunction(in_options.getBearerToken) ||
			!in_options.url
		) {
			return Promise.reject(new Error(MSG.MISSING_FSS_INIT_OPTIONS));
		}

		if (!regexBaseUrl.test(in_options.url)) {
			return Promise.reject(new Error(MSG.FSS_BASEURL_WRONG));
		}

		if (!in_options.url.endsWith("/")) {
			in_options.url = in_options.url + "/";
		}

		this._templateStore = new ForgeSchemaStore(in_options);

		return Promise.resolve();
	}

	/**
	 * Pushes a template request task onto the template requests queue
	 *
	 * @param {String} in_task - schema retrieval task
	 * @param {String} in_callback - callback of the task
	 *
	 * @private
	 */
	_retrieveTemplateRequestWorker(in_task, in_callback) {
		var store = in_task.context;
		if (store) {
			store
				.retrieveTemplate(in_task.typeid)
				.then(function (response) {
					in_callback(response);
				})
				.catch(function (error) {
					in_callback({ error: error });
				});
		} else {
			throw new Error(MSG.INVALID_TEMPLATE_STORE);
		}
	}

	/**
	 * Tries to resolve dependencies after some calls to register() have been made
	 *
	 *
	 * @returns {Promise} A promise that resolves to an object with the following structure:
	 *
	 * ```json
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
	 * ```
	 */
	async resolveSchemas() {
		// Only one queue at a time can be processed.
		if (this.templateRequestsQueue !== undefined) {
			return Promise.reject(new Error(MSG.DEPENDENCIES_RESOLUTION_IN_PROGRESS));
		}

		this.templateRequestsQueue = async.queue(this._retrieveTemplateRequestWorker, 5);

		var that = this;

		// 0. Inspect locally registered templates for unknown dependencies
		this._localPrimitivePropertiesAndTemplates.iterate(function (key, type) {
			if (
				!that._isSpecializedConstructor(key) &&
				PropertyTemplate.isTemplate(type.getPropertyTemplate())
			) {
				var unknownDeps = _extractUnknownDependencies.call(
					that,
					type.getPropertyTemplate(),
				);
				for (var d = 0; d < unknownDeps.length; d++) {
					var dep = unknownDeps[d];
					if (that.missingDependencies[dep] === undefined) {
						that.missingDependencies[dep] = { requested: false };
					}
				}
			}
		});

		var typeids = Object.keys(this.missingDependencies);

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

		return new Promise(function (resolve, reject) {
			if (that.templateRequestsQueue.length() === 0) {
				resolve({ errors: {}, schemas: {} });
				that.templateRequestsQueue = undefined;
			} else {
				that.templateRequestsQueue.drain = function () {
					var errors = _.compact(_.pluck(that.templateRequestsResults.errors, "typeid"));
					var results = that.templateRequestsResults;
					var resultsKeys = Object.keys(that.templateRequestsResults.schemas);
					var tempMissingDependencies = [];
					let tempConstant;
					// create missing dependencies for contextKeyType
					for (var j = 0; j < resultsKeys.length; j++) {
						var templateWrapper = that._getWrapper(
							results.schemas[resultsKeys[j]].typeid,
							undefined,
							undefined,
						);
						if (templateWrapper) {
							var compiledTemplate = templateWrapper.getCompiledTemplate(that);
							if (compiledTemplate.constants) {
								for (var s = 0; s < compiledTemplate.constants.length; s++) {
									tempConstant = compiledTemplate.constants[s];
									if (
										tempConstant.contextKeyType === "typeid" &&
										tempConstant.context === "map" &&
										tempConstant.value
									) {
										var valueKeys = Object.keys(tempConstant.value);
										for (var z = 0; z < valueKeys.length; z++) {
											if (
												TypeIdHelper.isTemplateTypeid(valueKeys[z]) &&
												!(
													valueKeys[z] in
													that.templateRequestsResults.schemas
												) &&
												!tempMissingDependencies.includes(valueKeys[z])
											) {
												tempMissingDependencies.push(valueKeys[z]);
											}
										}
									}
								}
							}
						}
					}
					if (tempMissingDependencies.length !== 0) {
						for (var j = 0; j < tempMissingDependencies.length; j++) {
							var missingTypeid = tempMissingDependencies[j];
							if (that.missingDependencies[missingTypeid] === undefined) {
								that.missingDependencies[missingTypeid] = { requested: false };
								if (
									that.templateRequestsResults.errors[missingTypeid] === undefined
								) {
									that.templateRequestsResults.errors[missingTypeid] = {};
								}
								if (
									that.templateRequestsResults.schemas[missingTypeid] ===
									undefined
								) {
									that.templateRequestsResults.schemas[missingTypeid] = {};
								}
							}
							_pushTemplateRequestTask.call(that, missingTypeid);
						}
					}

					if (that.templateRequestsQueue.length() === 0) {
						that.templateRequestsResults = { errors: {}, schemas: {} };
						if (errors.length && errors.length > 0) {
							reject(new Error("Some errors occured"));
						} else {
							that.missingDependencies = {};
							resolve(results);
						}
						that.templateRequestsQueue = undefined;
					}
				};
			}
		});
	}

	/**
	 * Determines whether the given property is an instance of the property type corresponding to the given native
	 * property typeid and context.
	 *
	 * @param {property-properties.BaseProperty} in_property - The property to test
	 * @param {String} in_primitiveTypeid - Native property typeid
	 * @param {String} in_context - Context of the property
	 * @returns {boolean} True, if the property is an instance of the corresponding type
	 */
	instanceOf(in_property, in_primitiveTypeid, in_context) {
		var templateConstructor = this._get(in_primitiveTypeid, in_context);
		var result = false;
		if (templateConstructor && this._isNativePropertyConstructor(templateConstructor)) {
			result = in_property instanceof templateConstructor;
		}
		return result;
	}
}

/**
 * @internal
 */
const PropertyFactorySingleton = new PropertyFactory();
export { PropertyFactorySingleton as PropertyFactory };

LazyLoadedProperties.AbstractStaticCollectionProperty = AbstractStaticCollectionProperty;
LazyLoadedProperties.IndexedCollectionBaseProperty = IndexedCollectionBaseProperty;
LazyLoadedProperties.ContainerProperty = ContainerProperty;
LazyLoadedProperties.ArrayProperty = ArrayProperty;
LazyLoadedProperties.EnumArrayProperty = EnumArrayProperty;
LazyLoadedProperties.ReferenceProperty = ReferenceProperty;
LazyLoadedProperties.StringProperty = StringProperty;
LazyLoadedProperties.ValueProperty = ValueProperty;
LazyLoadedProperties.ValueMapProperty = ValueMapProperty;
LazyLoadedProperties.ReferenceMapProperty = ReferenceMapProperty;
LazyLoadedProperties.NodeProperty = NodeProperty;
LazyLoadedProperties.PropertyFactory = PropertyFactorySingleton;
