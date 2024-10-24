/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { PathHelper, ChangeSet } = require("@fluid-experimental/property-changeset");
const { ConsoleUtils, constants } = require("@fluid-experimental/property-common");
const _ = require("lodash");

const { BaseProperty } = require("./baseProperty");
const { LazyLoadedProperties: Property } = require("./lazyLoadedProperties");

const { MSG, PROPERTY_PATH_DELIMITER } = constants;
const { BREAK_TRAVERSAL, PATH_TOKENS } = BaseProperty;

/**
 * This class serves as a view to read, write and listen to changes in an
 * object's value field. To do this we simply keep a pointer to the object and
 * its associated data field that we are interested in. If no data field is
 * present this property will fail constructing.
 */
export class AbstractStaticCollectionProperty extends BaseProperty {
	/**
	 * @param {Object=} in_params - The parameters
	 * @protected
	 */
	constructor(in_params) {
		super(in_params);

		// internal management
		if (!this._staticChildren) {
			this._staticChildren = {};
		}
		this._constantChildren = {};
	}

	/**
	 * Returns the sub-property having the given name, or following the given paths, in this property.
	 *
	 * @param {string | number | Array<string | number>} in_ids - The ID or IDs of the property or an array of IDs if an array
	 * is passed, the .get function will be performed on each id in sequence for example .get(['position','x']) is
	 * equivalent to .get('position').get('x'). If `.get` resolves to a ReferenceProperty, it will, by default, return
	 * the property that the ReferenceProperty refers to.
	 * @param {Object} in_options - parameter object
	 * @param {property-properties.BaseProperty.REFERENCE_RESOLUTION} [in_options.referenceResolutionMode=ALWAYS] - How
	 * should this function behave during reference resolution?
	 *
	 * @throws If an in_id is neither a string or an array of strings and numbers.
	 * @return {BaseProperty | undefined} The property you seek or undefined if none is found.
	 */
	get(in_ids, in_options) {
		in_options = _.isObject(in_options) ? in_options : {};
		in_options.referenceResolutionMode =
			in_options.referenceResolutionMode === undefined
				? BaseProperty.REFERENCE_RESOLUTION.ALWAYS
				: in_options.referenceResolutionMode;

		var prop = this;
		if (typeof in_ids === "string" || typeof in_ids === "number") {
			prop = this._get(in_ids);
			if (in_options.referenceResolutionMode === BaseProperty.REFERENCE_RESOLUTION.ALWAYS) {
				if (prop instanceof Property.ReferenceProperty) {
					prop = prop.ref;
				}
			}
		} else if (_.isArray(in_ids)) {
			for (var i = 0; i < in_ids.length && prop; i++) {
				var mode = in_options.referenceResolutionMode;
				// do not do anything with token itself, only changes behavior of path preceding the token;
				if (in_ids[i] === PATH_TOKENS.REF) {
					continue;
				}
				if (mode === BaseProperty.REFERENCE_RESOLUTION.NO_LEAFS) {
					mode =
						i !== in_ids.length - 1
							? BaseProperty.REFERENCE_RESOLUTION.ALWAYS
							: BaseProperty.REFERENCE_RESOLUTION.NEVER;
				}
				if (in_ids[i - 1] === PATH_TOKENS.REF || in_ids[i + 1] === PATH_TOKENS.REF) {
					mode = BaseProperty.REFERENCE_RESOLUTION.NEVER;
				}
				prop = prop.get(in_ids[i], { referenceResolutionMode: mode });
				if (prop === undefined && i < in_ids.length - 1) {
					return undefined;
				}
			}
		} else {
			switch (in_ids) {
				case PATH_TOKENS.ROOT: {
					prop = prop.getRoot();
					break;
				}
				case PATH_TOKENS.UP: {
					prop = prop.getParent();
					break;
				}
				case PATH_TOKENS.REF: {
					throw new Error(MSG.NO_GET_DEREFERENCE_ONLY);
				}
				default: {
					throw new Error(MSG.STRING_OR_ARRAY_STRINGS + in_ids);
				}
			}
		}

		return prop;
	}

	/**
	 * Returns the sub-property having the given name in this property.
	 *
	 * @param {string|number} in_id - The id of the prop you wish to retrieve.
	 *
	 * @return {property-properties.BaseProperty | undefined} The property you seek or undefined if none is found.
	 */
	_get(in_id) {
		return this._staticChildren[in_id] || this._constantChildren[in_id];
	}

	/**
	 * Returns a string identifying the property
	 *
	 * If an id has been explicitly set on this property we return that one, otherwise the GUID is used.
	 *
	 * @return {string} String identifying the property
	 */
	getId() {
		return this._id !== null ? this._id : this.getGuid();
	}

	/**
	 * Returns the GUID of this named property
	 * A Guid is a unique identifier for a branch, commit or repository,
	 * similar to a URN. Most functions in the API will us a URN but the
	 * Guid is used to traverse the commit graph.
	 * @return {string} The GUID
	 */
	getGuid() {
		var guid = this.get("guid", {
			referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER,
		});
		return guid ? guid.value : undefined;
	}

	/**
	 * Returns the value of a sub-property This is a shortcut for .get(in_ids, in_options).getValue().
	 *
	 * @param {string|number|Array<string|number>} in_ids - The ID or IDs of the property or an array of IDs if an array
	 * is passed, the .get function will be performed on each id in sequence for example .getValue(['position','x'])
	 * is equivalent to .get('position').get('x').getValue(). If at any point .get resolves to a ReferenceProperty,
	 * it will, by default, return the property that the ReferenceProperty refers to.
	 * @param {Object} in_options - Parameter object
	 * @param {property-properties.BaseProperty.REFERENCE_RESOLUTION} [in_options.referenceResolutionMode=ALWAYS] - How
	 * should this function behave during reference resolution?
	 *
	 * @throws If the in_ids does not resolve to a ValueProperty or StringProperty
	 * @throws If in_ids is not a string or an array of strings or numbers.
	 *
	 * @return {*} The value of the given sub-property
	 */
	getValue(in_ids, in_options) {
		var property = this.get(in_ids, in_options);
		ConsoleUtils.assert(
			property instanceof Property.ValueProperty ||
				property instanceof Property.StringProperty,
			MSG.GET_VALUE_NOT_A_VALUE + in_ids,
		);
		return property.getValue();
	}

	/**
	 * Get all sub-properties of the current property.
	 * Caller MUST NOT modify the properties.
	 * If entries include References, it will return the reference (will not automatically resolve the reference)
	 * @return {Object.<property-properties.BaseProperty>} An object containing all the properties
	 */
	getEntriesReadOnly() {
		/* Note that the implementation is voluntarily generic so that derived classes
            should not have to redefine this function. */
		var res = {};
		var ids = this.getIds();
		for (var i = 0; i < ids.length; i++) {
			res[ids[i]] = this.get(ids[i], {
				referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER,
			});
		}
		return res;
	}

	/**
	 * Returns the name of all the sub-properties of this property.
	 *
	 * @return {Array.<string>} An array of all the property ids
	 */
	getIds() {
		return this._getIds();
	}

	/**
	 * Returns the name of all the sub-properties of this property.
	 *
	 * @return {Array.<string>} An array of all the property ids
	 */
	_getIds() {
		return Object.keys(this._staticChildren).concat(Object.keys(this._constantChildren));
	}

	/**
	 * Returns an object with all the nested values contained in this property.
	 *
	 * @example
	 *
	 * ```javascript
	 * {
	 *   position: {
	 *     x: 2,
	 *     y: 5
	 *   }
	 * }
	 * ```
	 */
	getValues() {
		var ids = this._getIds();
		var result = {};
		for (var i = 0; i < ids.length; i++) {
			var child = this.get(ids[i]);
			if (_.isUndefined(child)) {
				result[ids[i]] = undefined;
			} else if (child._context === "single" && child.isPrimitiveType()) {
				result[ids[i]] = child.getValue();
			} else {
				result[ids[i]] = child.getValues();
			}
		}
		return result;
	}

	/**
	 * Checks whether a property with the given name exists
	 *
	 * @param {string} in_id - Name of the property
	 * @return {boolean} True if the property exists. Otherwise false.
	 */
	has(in_id) {
		return this._get(in_id) !== undefined;
	}

	/**
	 * Expand a path returning the property or value at the end.
	 *
	 * @param {string} in_path - The path
	 * @param {Object} in_options - Parameter object
	 * @param {property-properties.BaseProperty.REFERENCE_RESOLUTION} [in_options.referenceResolutionMode=ALWAYS] - How
	 * should this function behave during reference resolution?
	 * @throws If in_path is not a valid path
	 * @return {BaseProperty | undefined} Resolved path
	 */
	resolvePath(in_path, in_options) {
		in_options = in_options || {};
		in_options.referenceResolutionMode =
			in_options.referenceResolutionMode === undefined
				? BaseProperty.REFERENCE_RESOLUTION.ALWAYS
				: in_options.referenceResolutionMode;

		var node = this;

		// Tokenize the path string
		var tokenTypes = [];
		var pathArr = PathHelper.tokenizePathString(in_path, tokenTypes);

		// Return to the repository root, if the path starts with a root token (a / )
		var iterationStart = 0;
		if (pathArr.length > 0) {
			if (tokenTypes[0] === PathHelper.TOKEN_TYPES.PATH_ROOT_TOKEN) {
				node = this.getRoot();
				iterationStart = 1;
			} else if (tokenTypes[0] === PathHelper.TOKEN_TYPES.RAISE_LEVEL_TOKEN) {
				for (var j = 0; j < pathArr.length; j++) {
					if (tokenTypes[j] === PathHelper.TOKEN_TYPES.RAISE_LEVEL_TOKEN) {
						var parent = node.getParent();
						if (parent) {
							node = parent;
						} else {
							return undefined;
						}
						iterationStart++;
					}
				}
			}
		}

		for (var i = iterationStart; i < pathArr.length && node; i++) {
			if (tokenTypes[i] !== PathHelper.TOKEN_TYPES.DEREFERENCE_TOKEN) {
				node = node._resolvePathSegment(pathArr[i], tokenTypes[i]);
				if (
					in_options.referenceResolutionMode === BaseProperty.REFERENCE_RESOLUTION.ALWAYS ||
					(in_options.referenceResolutionMode === BaseProperty.REFERENCE_RESOLUTION.NO_LEAFS &&
						i !== pathArr.length - 1)
				) {
					if (node instanceof Property.ReferenceProperty) {
						if (tokenTypes[i + 1] !== PathHelper.TOKEN_TYPES.DEREFERENCE_TOKEN) {
							// recursive function to resolve nested reference properties
							node = node.ref;
						}
					}
				}
			}
		}
		return node;
	}

	/**
	 * Returns the path segment for a child
	 *
	 * @param {property-properties.BaseProperty} in_childNode - The child for which the path is returned
	 *
	 * @return {string} The path segment to resolve the child property under this property
	 * @protected
	 */
	_getPathSegmentForChildNode(in_childNode) {
		return PROPERTY_PATH_DELIMITER + PathHelper.quotePathSegmentIfNeeded(in_childNode.getId());
	}

	/**
	 * Resolves a direct child node based on the given path segment
	 *
	 * @param {String} in_segment - The path segment to resolve
	 * @param {property-properties.PathHelper.TOKEN_TYPES} in_segmentType - The type of segment in the tokenized path
	 *
	 * @return {BaseProperty | undefined} The child property that has been resolved
	 *
	 * @protected
	 */
	_resolvePathSegment(in_segment, in_segmentType) {
		// Base Properties only support paths separated via dots
		if (in_segmentType !== PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN) {
			throw new Error(MSG.INVALID_PATH_TOKEN + in_segment);
		}

		return this.has(in_segment)
			? this.get(in_segment, {
					referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER,
				})
			: undefined;
	}

	/**
	 * Given an object that mirrors a PSet Template, assigns the properties to the values
	 * found in that object.
	 * See {@link setValues}
	 * @param {object | Array | string} in_values - The object containing the nested values to assign
	 * @param {boolean} in_typed - Whether the values are typed/polymorphic.
	 * @param {boolean} in_initial - Whether we are setting default/initial values
	 * or if the function is called directly with the values to set.
	 * @protected
	 */
	_setValues(in_values, in_typed, in_initial) {
		ConsoleUtils.assert(_.isObject(in_values), MSG.SET_VALUES_PARAM_NOT_OBJECT);

		var that = this;
		var keys = Object.keys(in_values);

		for (var i = 0; i < keys.length; i++) {
			var propertyKey = keys[i];
			var propertyValue = in_values[propertyKey];
			var property = that.get(propertyKey, {
				referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER,
			});

			if (
				property instanceof Property.ValueProperty ||
				property instanceof Property.StringProperty
			) {
				property.setValue(propertyValue);
			} else if (property instanceof BaseProperty && _.isObject(propertyValue)) {
				property._setValues(propertyValue, in_typed, in_initial);
			} else if (property instanceof BaseProperty) {
				const typeid = property.getTypeid();
				throw new Error(MSG.SET_VALUES_PATH_PROPERTY + propertyKey + ", of type: " + typeid);
			} else if (property === undefined) {
				throw new Error(MSG.SET_VALUES_PATH_INVALID + propertyKey);
			}
		}
	}

	/**
	 * Given an object that mirrors a PSet Template, assigns the properties to the values
	 * found in that object.
	 * E.g.
	 *
	 * ```
	 * <pre>
	 * Templates = {
	 *   properties: [
	 *     { id: 'foo', typeid: 'String' },
	 *     { id: 'bar', properties: [{id: 'baz', typeid: 'Uint32'}] }
	 *   ]
	 * }
	 * </pre>
	 * ```
	 *
	 * @param {object | Array | string} in_values - The object containing the nested values to assign
	 * @throws If in_values is not an object (or in the case of ArrayProperty, an array)
	 * @throws If one of the path in in_values does not correspond to a path in that property
	 * @throws If one of the path to a value in in_values leads to a property in this property.
	 */
	setValues(in_values) {
		var checkoutView = this._getCheckoutView();
		if (checkoutView !== undefined) {
			checkoutView.pushNotificationDelayScope();
			AbstractStaticCollectionProperty.prototype._setValues.call(
				this,
				in_values,
				false,
				false,
			);
			checkoutView.popNotificationDelayScope();
		} else {
			AbstractStaticCollectionProperty.prototype._setValues.call(
				this,
				in_values,
				false,
				false,
			);
		}
	}

	/**
	 * Append a child property
	 *
	 * This is an internal function, called by the PropertyFactory when instantiating a template and internally by the
	 * NodeProperty. Adding children dynamically by the user is only allowed in the NodeProperty.
	 *
	 * @param {property-properties.BaseProperty} in_property - The property to append
	 * @param {boolean} in_allowChildMerges - Whether merging of children (nested properties) is allowed.
	 * This is used for extending inherited properties.
	 *
	 * @throws {OVERWRITING_ID} - Thrown when adding a property with an existing id.
	 * @throws {OVERRIDDING_INHERITED_TYPES} - Thrown when overriding inherited typed properties.
	 *
	 * @protected
	 */
	_append(in_property, in_allowChildMerges) {
		var id = in_property.getId();
		if (this._staticChildren[id] === undefined) {
			this._staticChildren[id] = in_property;
			in_property._setParent(this);
		} else {
			if (!in_allowChildMerges) {
				throw new Error(MSG.OVERWRITING_ID + id);
			}

			// if child is untyped then merge its properties
			if (
				this._staticChildren[id].getTypeid() === "AbstractStaticCollectionProperty" &&
				this._staticChildren[id].getContext() === "single"
			) {
				// if the property's type is different than the child type, throw error.
				if (this._staticChildren[id].getTypeid() !== in_property.getTypeid()) {
					throw new Error(MSG.OVERRIDDING_INHERITED_TYPES + id);
				}

				this._staticChildren[id]._merge(in_property);
			} else {
				throw new Error(MSG.OVERRIDDING_INHERITED_TYPES + id);
			}
		}
	}

	/**
	 * Merge child properties
	 *
	 * This is an internal function that merges children of two properties. This is used for extending inherited
	 * properties.
	 *
	 * @param {property-properties.BaseProperty} in_property - The property to merge its children (nested properties)
	 * with.
	 *
	 * @protected
	 */
	_merge(in_property) {
		var keys = Object.keys(in_property._staticChildren);

		for (var i = 0; i < keys.length; i++) {
			this._append(in_property._staticChildren[keys[i]], true);
		}
	}

	/**
	 * @inheritdoc
	 */
	_getDirtyChildren(in_flags) {
		var flags = in_flags === undefined ? ~BaseProperty.MODIFIED_STATE_FLAGS.CLEAN : in_flags;
		var rtn = [];
		var childKeys = _.keys(this._staticChildren);
		for (var i = 0; i < childKeys.length; i++) {
			if (this._get(childKeys[i])._isDirty(flags) !== 0) {
				rtn.push(childKeys[i]);
			}
		}

		return rtn;
	}

	/**
	 * Traverses the property hierarchy downwards until all child properties are reached
	 *
	 * @param {Function} in_callback - Callback to invoke for each property. The traversal can be stopped by returning
	 * BaseProperty.BREAK_TRAVERSAL
	 *
	 * @throws If in_callback is not a function.
	 *
	 * @return {string|undefined} Returns BaseProperty.BREAK_TRAVERSAL if the traversal has been interrupted, otherwise
	 * undefined
	 */
	traverseDown(in_callback) {
		ConsoleUtils.assert(_.isFunction(in_callback), MSG.CALLBACK_NOT_FCT);
		return this._traverse(in_callback, "");
	}

	/**
	 * Traverses all children in the child hierarchy
	 * TODO: How should this behave for collections?
	 *
	 * @param {function} in_callback - Callback to invoke for every child
	 * @param {string} in_pathFromTraversalStart - Path from the root of the traversal to this node
	 * @return {string|undefined} Returns BaseProperty.BREAK_TRAVERSAL if the traversal has been interrupted,
	 * otherwise undefined
	 * @private
	 */
	_traverse(in_callback, in_pathFromTraversalStart) {
		if (in_pathFromTraversalStart) {
			in_pathFromTraversalStart += PROPERTY_PATH_DELIMITER;
		}

		var childKeys, child, childPath, result, i;

		childKeys = this._getIds();
		for (i = 0; i < childKeys.length; i++) {
			child = this._get(childKeys[i]);
			childPath =
				in_pathFromTraversalStart + PathHelper.quotePathSegmentIfNeeded(child.getId());

			result = in_callback(child, childPath);
			if (result !== BREAK_TRAVERSAL) {
				result = child._traverse(in_callback, childPath);
				if (result !== BREAK_TRAVERSAL) {
					continue;
				}
			}
			return BREAK_TRAVERSAL;
		}

		return undefined;
	}

	/**
	 * Traverses all static properties (properties declared in the template and not added dynamically) in the
	 * hierarchy below this node
	 *
	 * @param {function} in_callback - Callback to invoke for every property
	 * @param {string?} in_pathFromTraversalStart - Path from the root of the traversal to this node
	 *
	 * @protected
	 */
	_traverseStaticProperties(in_callback, in_pathFromTraversalStart) {
		in_pathFromTraversalStart = in_pathFromTraversalStart || "";
		var propertyKeys = _.keys(this._staticChildren);
		for (var i = 0; i < propertyKeys.length; i++) {
			var property = this._staticChildren[propertyKeys[i]];
			var childPath =
				in_pathFromTraversalStart +
				(in_pathFromTraversalStart.length !== 0 ? PROPERTY_PATH_DELIMITER : "") +
				PathHelper.quotePathSegmentIfNeeded(property.getId());

			// We only recursively traverse ContainerProperties, since these are used to define the hierarchy within
			// one template
			if (
				(property.getTypeid() === "AbstractStaticCollectionProperty" ||
					property.getTypeid() === "ContainerProperty") &&
				property.getContext() === "single"
			) {
				property._traverseStaticProperties(in_callback, childPath);
			}
			in_callback(property, childPath);
		}
	}

	/**
	 * Serialize the property into a changeSet
	 *
	 * @param {boolean} in_dirtyOnly - Only include dirty entries in the serialization
	 * @param {boolean} in_includeRootTypeid - Include the typeid of the root of the hierarchy
	 * @param {property-properties.BaseProperty.MODIFIED_STATE_FLAGS} [in_dirtinessType] - The type of dirtiness to
	 * use when reporting dirty changes. By default this is `PENDING_CHANGE`.
	 * @param {boolean} [in_includeReferencedRepositories=false] - If this is set to true, the serialize
	 * function will descend into referenced repositories.
	 * WARNING: if there are loops in the references this can result in an infinite loop.
	 *
	 * @return {Object} The serialized representation of this property
	 * @protected
	 */
	_serialize(
		in_dirtyOnly,
		in_includeRootTypeid,
		in_dirtinessType,
		in_includeReferencedRepositories,
	) {
		var serializedChildren = {};
		var childrenType;

		in_dirtyOnly = in_dirtyOnly || false;
		in_dirtinessType =
			in_dirtinessType === undefined
				? BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE
				: in_dirtinessType;

		this._traverseStaticProperties(function (in_node, in_pathFromTraversalStart) {
			if (in_dirtyOnly && !in_node._isDirty(in_dirtinessType)) {
				return;
			}

			childrenType = in_node.getFullTypeid();

			if (
				childrenType !== "AbstractStaticCollectionProperty" &&
				childrenType !== "ContainerProperty"
			) {
				// we don't want to keep BaseProperties
				// as they mostly behave as 'paths' to
				// a ValueProperty.
				var serialized = in_node._serialize(
					in_dirtyOnly,
					false,
					in_dirtinessType,
					in_includeReferencedRepositories,
				);

				// Add the root typeid if requested
				if (!ChangeSet.isEmptyChangeSet(serialized) || !in_dirtyOnly) {
					if (!serializedChildren[childrenType]) {
						serializedChildren[childrenType] = {};
					}
					serializedChildren[childrenType][in_pathFromTraversalStart] = serialized;
				}
			}
		});

		if (in_includeRootTypeid) {
			serializedChildren["typeid"] = this.getFullTypeid();
		}

		return serializedChildren;
	}

	/**
	 * Sets the property to the state in the given normalized changeset
	 *
	 * @param { property-changeset.SerializedChangeSet} in_serializedObj - The serialized changeset to apply to this
	 * node. This has to be an normalized change-set (only containing additions and property assignments.
	 * Deletes and Modify must not appear)
	 * @param {boolean} [in_reportToView = true] - By default, the dirtying will always be reported to the checkout
	 * view and trigger a modified event there. When batching updates, this can be prevented via this flag.
	 * @return {property-changeset.SerializedChangeSet} ChangeSet with the changes that actually were performed during
	 * the deserialization.
	 */
	_deserialize(in_serializedObj, in_reportToView) {
		var changeSet = {};

		// Traverse all properties of this template
		this._traverseStaticProperties(function (in_node, in_pathFromTraversalStart) {
			// We do not deserialize base properties, since the traverseStatic function
			// already traverses recursively
			if (in_node.getTypeid() === "ContainerProperty" && in_node.getContext() === "single") {
				return;
			}

			var typeid = in_node.getFullTypeid();

			// Get the ChangeSet
			// If there is a ChangeSet in the serialized object, we use that as the
			// target ChangeSet, otherwise we use an empty ChangeSet (since properties with
			// empty Sub-ChangeSets are removed from the parent ChangeSet, we have to
			// explicitly use an empty ChangeSet for those)
			var propertyChangeSet = {};
			if (
				in_serializedObj[typeid] !== undefined &&
				in_serializedObj[typeid][in_pathFromTraversalStart] !== undefined
			) {
				propertyChangeSet = in_serializedObj[typeid][in_pathFromTraversalStart];
			}

			// Deserialize the ChangeSet into the property
			var changes = in_node._deserialize(propertyChangeSet, false);

			// And track the performed modification in the result
			if (!ChangeSet.isEmptyChangeSet(changes)) {
				changeSet[typeid] = changeSet[typeid] || {};
				changeSet[typeid][in_pathFromTraversalStart] = changes;
			}
		});

		// Finally report the dirtiness to the view (we postponed this above)
		if (in_reportToView) {
			this._reportDirtinessToView();
		}
		return changeSet;
	}

	/**
	 * Get a flattened, tree like representation of this object and all of it's
	 * descendants. The flattening will stop at primitive properties and collections.
	 *
	 * For non-leaf nodes, it is possible to access the corresponding node object itself via the
	 * propertyNode member of the flattened representation (warning, this will overwrite a
	 * property of this name).
	 * TODO: Do we want to have this feature or is it to dangerous?
	 *
	 * @return {Object} the flat representation
	 * @protected
	 */
	_flatten() {
		var flattenedRepresentation = {};
		var keys = this._getIds();
		for (var i = 0; i < keys.length; i++) {
			var key = keys[i];
			var child = this._get(key);
			flattenedRepresentation[key] = child._isFlattenLeaf() ? child : child._flatten();
		}

		flattenedRepresentation.propertyNode = this;

		return flattenedRepresentation;
	}

	/**
	 * Returns the number of children this node has
	 * @return {number} The number of children
	 * @private
	 */
	_getChildrenCount() {
		return this._getIds().length;
	}

	/**
	 * Sets constants
	 * @param {Object} in_constants - The list of typed values.
	 */
	_setConstants(in_constants) {
		ConsoleUtils.assert(
			_.isObject(in_constants),
			MSG.ASSERTION_FAILED + " setConstants parameter: in_constants must be an object.",
		);
		this._constantChildren = in_constants;
	}
}
