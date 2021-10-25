/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import _ from 'lodash';
import { BaseProperty, IBasePropertyParams } from './baseProperty';
import { ConsoleUtils, constants } from '@fluid-experimental/property-common';
import { PathHelper, ChangeSet, SerializedChangeSet } from '@fluid-experimental/property-changeset';
import { LazyLoadedProperties as Property } from './lazyLoadedProperties';
import { ReferenceProperty, ValueProperty } from '..';

const { MSG, PROPERTY_PATH_DELIMITER } = constants;
const { BREAK_TRAVERSAL, PATH_TOKENS } = BaseProperty;
/**
 * This class serves as a view to read, write and listen to changes in an
 * object's value field. To do this we simply keep a pointer to the object and
 * its associated data field that we are interested in. If no data field is
 * present this property will fail constructing.
 */

export class AbstractStaticCollectionProperty extends BaseProperty {
    _staticChildren: any;
    _constantChildren: {};
    value: any;

    constructor(in_params: IBasePropertyParams) {
        super(in_params);

        // internal management
        if (!this._staticChildren) {
            this._staticChildren = {};
        }
        this._constantChildren = {};
    };

    /**
     * Returns the sub-property having the given name, or following the given paths, in this property.
     *
     * @param in_ids - the ID or IDs of the property or an array of IDs
     *     if an array is passed, the .get function will be performed on each id in sequence
     *     for example .get(['position','x']) is equivalent to .get('position').get('x').
     *     If .get resolves to a ReferenceProperty, it will, by default, return the property that the
     *     ReferenceProperty refers to.
     * @param in_options - parameter object
     *
     * @throws if an in_id is neither a string or an array of strings and numbers.
     * @returns The property you seek or undefined if none is found.
     */
    get(
        in_ids: string | number | Array<string | number | BaseProperty.PATH_TOKENS> | BaseProperty.PATH_TOKENS,
        in_options: { referenceResolutionMode?: BaseProperty.REFERENCE_RESOLUTION } = {}
    ): BaseProperty | undefined {

        in_options = _.isObject(in_options) ? in_options : {};
        in_options.referenceResolutionMode =
            in_options.referenceResolutionMode === undefined ? BaseProperty.REFERENCE_RESOLUTION.ALWAYS :
                in_options.referenceResolutionMode;

        let prop: any = this;
        if (typeof in_ids === 'string' || typeof in_ids === 'number') {
            prop = this._get(in_ids);
            if (in_options.referenceResolutionMode === BaseProperty.REFERENCE_RESOLUTION.ALWAYS) {
                if (prop instanceof Property.ReferenceProperty) {
                    prop = prop.ref;
                }
            }
        } else if (_.isArray(in_ids)) {
            for (let i = 0; i < in_ids.length && prop; i++) {
                let mode = in_options.referenceResolutionMode;
                // do not do anything with token itself, only changes behavior of path preceding the token;
                if (in_ids[i] === PATH_TOKENS.REF) {
                    continue;
                }
                if (mode === BaseProperty.REFERENCE_RESOLUTION.NO_LEAFS) {
                    mode = i !== in_ids.length - 1 ? BaseProperty.REFERENCE_RESOLUTION.ALWAYS :
                        BaseProperty.REFERENCE_RESOLUTION.NEVER;
                }
                if (in_ids[i - 1] === PATH_TOKENS.REF || in_ids[i + 1] === PATH_TOKENS.REF) {
                    mode = BaseProperty.REFERENCE_RESOLUTION.NEVER;
                }
                prop = prop.get(in_ids[i], { referenceResolutionMode: mode });
                if (prop === undefined && i < in_ids.length - 1) {
                    return undefined;
                }
            }
        } else if (in_ids === PATH_TOKENS.ROOT) {
            prop = prop.getRoot();
        } else if (in_ids === PATH_TOKENS.UP) {
            prop = prop.getParent();
        } else if (in_ids === PATH_TOKENS.REF) {
            throw new Error(MSG.NO_GET_DEREFERENCE_ONLY);
        } else {
            throw new Error(MSG.STRING_OR_ARRAY_STRINGS + in_ids);
        }

        return prop;
    };

    /**
     * Returns the sub-property having the given name in this property.
     *
     * @param in_id - the id of the prop you wish to retrieve.
     *
     * @returns The property you seek or undefined if none is found.
     */
    _get(in_id: string | number): BaseProperty | undefined {
        return this._staticChildren[in_id] || this._constantChildren[in_id];
    };

    /**
     * Returns a string identifying the property
     *
     * If an id has been explicitly set on this property we return that one, otherwise the GUID is used.
     *
     * @return {string} String identifying the property
     */
    getId() {
        if (this._id !== null) {
            return this._id;
        } else {
            return this.getGuid();
        }
    };

    /**
     * Returns the GUID of this named property
     * A Guid is a unique identifier for a branch, commit or repository,
     * similar to a URN. Most functions in the API will us a URN but the
     * Guid is used to traverse the commit graph.
     * @returns The GUID
     */
    getGuid(): string {
        const guid = this.get('guid', { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER });
        return guid ? (guid as any).value : undefined;
    };

    /**
     * returns the value of a sub-property
     * This is a shortcut for .get(in_ids, in_options).getValue()
     * @param in_ids - the ID or IDs of the property or an array of IDs
     *     if an array is passed, the .get function will be performed on each id in sequence
     *     for example .getValue(['position','x']) is equivalent to .get('position').get('x').getValue().
     *     If at any point .get resolves to a ReferenceProperty, it will, by default, return the property that the
     *     ReferenceProperty refers to.
     * @param in_options - parameter object
     * @param in_options.referenceResolutionMode - How should this function behave during reference resolution?
     * @throws if the in_ids does not resolve to a ValueProperty or StringProperty
     * @throws if in_ids is not a string or an array of strings or numbers.
     * @returns The value of the given sub-property
     */
    getValue(
        in_ids: string | number | Array<string | number>,
        in_options: { referenceResolutionMode?: BaseProperty.REFERENCE_RESOLUTION } = {}
    ): any {
        const property = this.get(in_ids, in_options);
        ConsoleUtils.assert((property instanceof Property.ValueProperty || property instanceof Property.StringProperty),
            MSG.GET_VALUE_NOT_A_VALUE + in_ids);
        return (property as ValueProperty).getValue();
    };


    /**
     * Get all sub-properties of the current property.
     * Caller MUST NOT modify the properties.
     * If entries include References, it will return the reference (will not automatically resolve the reference)
     * @returns An object containing all the properties
     */
    getEntriesReadOnly(): { [key: string]: BaseProperty } {
        /* Note that the implementation is voluntarily generic so that derived classes
            should not have to redefine this function. */
        const res = {};
        const ids = this.getIds();
        for (let i = 0; i < ids.length; i++) {
            res[ids[i]] = this.get(ids[i], { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER });
        }
        return res;
    };


    /**
     * Returns the name of all the sub-properties of this property.
     *
     * @returns An array of all the property ids
     */
    getIds(): string[] {
        return this._getIds();
    };

    /**
     * Returns the name of all the sub-properties of this property.
     *
     * @returns An array of all the property ids
     */
    _getIds(): string[] {
        return Object.keys(this._staticChildren).concat(Object.keys(this._constantChildren));
    };



    /**
     * Returns an object with all the nested values contained in this property
     * @returns an object representing the values of your property
     * for example: {
     *   position: {
     *    x: 2,
     *    y: 5
     *   }
     * }
     */
    getValues(): object {
        const ids = this._getIds();
        const result = {};
        for (let i = 0; i < ids.length; i++) {
            const child = this.get(ids[i]);
            if (_.isUndefined(child)) {
                result[ids[i]] = undefined;
            } else if (child._context === 'single' && child.isPrimitiveType()) {
                result[ids[i]] = (child as ValueProperty).getValue();
            } else {
                result[ids[i]] = (child as AbstractStaticCollectionProperty).getValues();
            }
        }
        return result;
    };

    /**
     * Checks whether a property with the given name exists
     *
     * @param in_id - Name of the property
     * @returns True if the property exists. Otherwise false.
     */
    has(in_id: string | number): boolean {
        return this._get(in_id) !== undefined;
    };

    /**
     * Expand a path returning the property or value at the end.
     *
     * @param in_path the path
     * @param in_options - parameter object
     * @param in_options.referenceResolutionMode - How should this function behave during reference resolution?
     * @throws if in_path is not a valid path
     * @returns resolved path
     */
    resolvePath(
        in_path: string,
        in_options: { referenceResolutionMode?: BaseProperty.REFERENCE_RESOLUTION } = {}
    ): BaseProperty | undefined {
        in_options.referenceResolutionMode = in_options.referenceResolutionMode ?? BaseProperty.REFERENCE_RESOLUTION.ALWAYS;

        let node: BaseProperty = this;

        // Tokenize the path string
        const tokenTypes = [];
        const pathArr = PathHelper.tokenizePathString(in_path, tokenTypes);

        // Return to the repository root, if the path starts with a root token (a / )
        let iterationStart = 0;
        if (pathArr.length > 0) {
            if (tokenTypes[0] === PathHelper.TOKEN_TYPES.PATH_ROOT_TOKEN) {
                node = this.getRoot();
                iterationStart = 1;
            } else if (tokenTypes[0] === PathHelper.TOKEN_TYPES.RAISE_LEVEL_TOKEN) {
                for (let j = 0; j < pathArr.length; j++) {
                    if (tokenTypes[j] === PathHelper.TOKEN_TYPES.RAISE_LEVEL_TOKEN) {
                        const parent = node.getParent();
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

        for (let i = iterationStart; i < pathArr.length && node; i++) {
            if (tokenTypes[i] !== PathHelper.TOKEN_TYPES.DEREFERENCE_TOKEN) {
                node = node._resolvePathSegment(pathArr[i], tokenTypes[i]);
                if (in_options.referenceResolutionMode === BaseProperty.REFERENCE_RESOLUTION.ALWAYS ||
                    (in_options.referenceResolutionMode === BaseProperty.REFERENCE_RESOLUTION.NO_LEAFS &&
                        i !== pathArr.length - 1)) {
                    if (node instanceof Property.ReferenceProperty) {
                        if (tokenTypes[i + 1] !== PathHelper.TOKEN_TYPES.DEREFERENCE_TOKEN) {
                            // recursive function to resolve nested reference properties
                            node = (node as ReferenceProperty).ref;
                        }
                    }
                }
            }
        }
        return node;

    };

    /**
     * Returns the path segment for a child
     *
     * @param in_childNode - The child for which the path is returned
     *
     * @returns The path segment to resolve the child property under this property
     * @protected
     */
    _getPathSegmentForChildNode(in_childNode: BaseProperty): string {
        return PROPERTY_PATH_DELIMITER + PathHelper.quotePathSegmentIfNeeded(in_childNode.getId());
    };

    /**
     * Resolves a direct child node based on the given path segment
     *
     * @param in_segment - The path segment to resolve
     * @param in_segmentType - The type of segment in the tokenized path
     *
     * @returns The child property that has been resolved
     * @protected
     */
    _resolvePathSegment(in_segment: string, in_segmentType: PathHelper.TOKEN_TYPES): BaseProperty | undefined {
        // Base Properties only support paths separated via dots
        if (in_segmentType !== PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN) {
            throw new Error(MSG.INVALID_PATH_TOKEN + in_segment);
        }

        if (this.has(in_segment)) {
            return this.get(in_segment, { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER });
        } else {
            return undefined;
        }
    };

    /**
     * Given an object that mirrors a PSet Template, assigns the properties to the values
     * found in that object.
     * @param in_values - The object containing the nested values to assign
     * @param in_typed - Whether the values are typed/polymorphic.
     * @param in_initial  - Whether we are setting default/initial values
        or if the function is called directly with the values to set.
     */
    _setValues(in_values: object, in_typed: boolean, in_initial: boolean) {
        ConsoleUtils.assert(_.isObject(in_values), MSG.SET_VALUES_PARAM_NOT_OBJECT);

        const that = this;
        const keys = Object.keys(in_values);

        for (let i = 0; i < keys.length; i++) {
            const propertyKey = keys[i];
            const propertyValue = in_values[propertyKey];
            const property = that.get(propertyKey, { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER });

            if (property instanceof Property.ValueProperty || property instanceof Property.StringProperty) {
                (property as ValueProperty).setValue(propertyValue);
            } else if (property instanceof BaseProperty && _.isObject(propertyValue)) {
                (property as AbstractStaticCollectionProperty)._setValues(propertyValue, in_typed, in_initial);
            } else if (property instanceof BaseProperty) {
                const typeid = property.getTypeid();
                throw new Error(MSG.SET_VALUES_PATH_PROPERTY + propertyKey + ', of type: ' + typeid);
            } else if (property === undefined) {
                throw new Error(MSG.SET_VALUES_PATH_INVALID + propertyKey);
            }
        }
    };

    /**
     * Given an object that mirrors a PSet Template, assigns the properties to the values
     * found in that object.
     * eg.
     * <pre>
     * Templates = {
     *   properties: [
     *     { id: 'foo', typeid: 'String' },
     *     { id: 'bar', properties: [{id: 'baz', typeid: 'Uint32'}] }
     *   ]
     * }
     * </pre>
     *
     * @param in_values - The object containing the nested values to assign
     * @throws if in_values is not an object (or in the case of ArrayProperty, an array)
     * @throws if one of the path in in_values does not correspond to a path in that property
     * @throws if one of the path to a value in in_values leads to a property in this property.
     */
    setValues(in_values: object) {
        const checkoutView = this._getCheckoutView();
        if (checkoutView !== undefined) {
            checkoutView.pushNotificationDelayScope();
            AbstractStaticCollectionProperty.prototype._setValues.call(this, in_values, false, false);
            checkoutView.popNotificationDelayScope();
        } else {
            AbstractStaticCollectionProperty.prototype._setValues.call(this, in_values, false, false);
        }
    };

    /**
     * Append a child property
     *
     * This is an internal function, called by the PropertyFactory when instantiating a template and internally by the
     * NodeProperty. Adding children dynamically by the user is only allowed in the NodeProperty.
     *
     * @param in_property - the property to append
     * @param in_allowChildMerges - Whether merging of children (nested properties) is allowed.
     *                                        This is used for extending inherited properties.
     * @protected
     * @throws {OVERWRITING_ID} - Thrown when adding a property with an existing id.
     * @throws {OVERRIDDING_INHERITED_TYPES} - Thrown when overriding inherited typed properties.
     */
    _append(in_property: BaseProperty, in_allowChildMerges: boolean) {
        const id = in_property.getId();
        if (this._staticChildren[id] === undefined) {
            this._staticChildren[id] = in_property;
            in_property._setParent(this);
        } else {
            if (!in_allowChildMerges) {
                throw new Error(MSG.OVERWRITING_ID + id);
            }

            // if child is untyped then merge its properties
            if (this._staticChildren[id].getTypeid() === 'AbstractStaticCollectionProperty' &&
                this._staticChildren[id].getContext() === 'single') {
                // if the property's type is different than the child type, throw error.
                if (this._staticChildren[id].getTypeid() !== in_property.getTypeid()) {
                    throw new Error(MSG.OVERRIDDING_INHERITED_TYPES + id);
                }

                this._staticChildren[id]._merge(in_property);
            } else {
                throw new Error(MSG.OVERRIDDING_INHERITED_TYPES + id);
            }
        }
    };

    /**
    * Merge child properties
    *
    * This is an internal function that merges children of two properties.
    * This is used for extending inherited properties.
    *
    * @param in_property the property to merge its children (nested properties) with.
    * @protected
    */
    _merge(in_property: AbstractStaticCollectionProperty) {
        const keys = Object.keys(in_property._staticChildren);

        for (let i = 0; i < keys.length; i++) {
            this._append(in_property._staticChildren[keys[i]], true);
        }
    };

    /**
     * @inheritdoc
     */
    _getDirtyChildren(in_flags) {
        const flags = in_flags === undefined ? ~BaseProperty.MODIFIED_STATE_FLAGS.CLEAN : in_flags;
        const rtn = [];
        const childKeys = _.keys(this._staticChildren);
        for (let i = 0; i < childKeys.length; i++) {
            if (this._get(childKeys[i])._isDirty(flags)) {
                rtn.push(childKeys[i]);
            }
        }

        return rtn;
    };

    /**
     * Traverses the property hierarchy downwards until all child properties are reached
     *
     * @param in_callback - Callback to invoke for each property. The traversal can be stopped
     *                                 by returning BaseProperty.BREAK_TRAVERSAL
     * @throws if in_callback is not a function.
     * @returns Returns BaseProperty.BREAK_TRAVERSAL if the traversal has been interrupted,
     *                            otherwise undefined
     */
    traverseDown(in_callback: (node: BaseProperty, pathFromTraversalStart: string) => void): string | undefined {
        ConsoleUtils.assert(_.isFunction(in_callback), MSG.CALLBACK_NOT_FCT);
        return this._traverse(in_callback, '');
    };

    /**
     * Traverses all children in the child hierarchy
     * TODO: How should this behave for collections?
     *
     * @param in_callback - Callback to invoke for every child
     * @param in_pathFromTraversalStart - Path from the root of the traversal to this node
     * @return Returns BaseProperty.BREAK_TRAVERSAL if the traversal has been interrupted,
     *                            otherwise undefined
     * @private
     */
    _traverse(
        in_callback: (node: BaseProperty, pathFromTraversalStart: string) => void,
        in_pathFromTraversalStart: string
    ): string | undefined {
        if (in_pathFromTraversalStart) {
            in_pathFromTraversalStart += PROPERTY_PATH_DELIMITER;
        }

        let childKeys, child, childPath, result, i;

        childKeys = this._getIds();
        for (i = 0; i < childKeys.length; i++) {
            child = this._get(childKeys[i]);
            childPath = in_pathFromTraversalStart + PathHelper.quotePathSegmentIfNeeded(child.getId());

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
    };

    /**
     * Traverses all static properties (properties declared in the template and not added dynamically) in the
     * hierarchy below this node
     *
     * @param  in_callback - Callback to invoke for every property
     * @param in_pathFromTraversalStart - Path from the root of the traversal to this node
     * @protected
     */
    _traverseStaticProperties(
        in_callback: (node: BaseProperty, pathFromTraversalStart: string) => void,
        in_pathFromTraversalStart = ""
    ) {
        const propertyKeys = _.keys(this._staticChildren);
        for (let i = 0; i < propertyKeys.length; i++) {
            const property = this._staticChildren[propertyKeys[i]];
            const childPath = in_pathFromTraversalStart +
                (in_pathFromTraversalStart.length !== 0 ? PROPERTY_PATH_DELIMITER : '') +
                PathHelper.quotePathSegmentIfNeeded(property.getId());

            // We only recursively traverse ContainerProperties, since these are used to define the hierarchy within
            // one template
            if ((property.getTypeid() === 'AbstractStaticCollectionProperty' ||
                property.getTypeid() === 'ContainerProperty') &&
                property.getContext() === 'single') {
                property._traverseStaticProperties(in_callback, childPath);
            }
            in_callback(property, childPath);
        }
    };

    /**
     * Serialize the property into a changeSet
     *
     * @param in_dirtyOnly - Only include dirty entries in the serialization
     * @param in_includeRootTypeid- Include the typeid of the root of the hierarchy
     * @param in_dirtinessType - The type of dirtiness to use when reporting dirty changes.
     * @param in_includeReferencedRepositories - If this is set to true, the serialize
     *     function will descend into referenced repositories. WARNING: if there are loops in the references
     *     this can result in an infinite loop
     *
     * @returns The serialized representation of this property
     * @private
     */
    _serialize(
        in_dirtyOnly: boolean,
        in_includeRootTypeid: boolean,
        in_dirtinessType = BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
        in_includeReferencedRepositories = false
    ): object {

        const serializedChildren = {};
        let childrenType;

        in_dirtyOnly = in_dirtyOnly || false;
        in_dirtinessType = in_dirtinessType === undefined ?
            BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE : in_dirtinessType;

        this._traverseStaticProperties(function(in_node, in_pathFromTraversalStart) {

            if (in_dirtyOnly && !in_node._isDirty(in_dirtinessType)) {
                return;
            }

            childrenType = in_node.getFullTypeid();

            if (childrenType !== 'AbstractStaticCollectionProperty' &&
                childrenType !== 'ContainerProperty') { // we don't want to keep BaseProperties
                // as they mostly behave as 'paths' to
                // a ValueProperty.
                const serialized = in_node._serialize(in_dirtyOnly,
                    false,
                    in_dirtinessType,
                    in_includeReferencedRepositories);

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
            serializedChildren['typeid'] = this.getFullTypeid();
        }

        return serializedChildren;
    };

    /**
     * Sets the property to the state in the given normalized changeset
     *
     * @param in_serializedObj - The serialized changeset to apply to this node. This
     *     has to be an normalized change-set (only containing additions and property assignments. Deletes and Modify
     *     must not appear)
     * @param in_reportToView - By default, the dirtying will always be reported to the checkout view
     *                                             and trigger a modified event there. When batching updates, this
     *                                             can be prevented via this flag.
     * @returns ChangeSet with the changes that actually were performed during the
     *     deserialization
     */
    _deserialize(in_serializedObj: SerializedChangeSet, in_reportToView = true): SerializedChangeSet {

        const changeSet = {};

        // Traverse all properties of this template
        this._traverseStaticProperties(function(in_node, in_pathFromTraversalStart) {
            // We do not deserialize base properties, since the traverseStatic function
            // already traverses recursively
            if (in_node.getTypeid() === 'ContainerProperty' && in_node.getContext() === 'single') {
                return;
            }

            const typeid = in_node.getFullTypeid();

            // Get the ChangeSet
            // If there is a ChangeSet in the serialized object, we use that as the
            // target ChangeSet, otherwise we use an empty ChangeSet (since properties with
            // empty Sub-ChangeSets are removed from the parent ChangeSet, we have to
            // explicitly use an empty ChangeSet for those)
            let propertyChangeSet = {};
            if (in_serializedObj[typeid] !== undefined &&
                in_serializedObj[typeid][in_pathFromTraversalStart] !== undefined) {
                propertyChangeSet = in_serializedObj[typeid][in_pathFromTraversalStart];
            }

            // Deserialize the ChangeSet into the property
            const changes = in_node._deserialize(propertyChangeSet, false);

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
    };

    /**
     * Get a flattened, tree like representation of this object and all of it's
     * descendants. The flattening will stop at primitive properties and collections.
     *
     * For non-leaf nodes, it is possible to access the corresponding node object itself via the
     * propertyNode member of the flattened representation (warning, this will overwrite a
     * property of this name).
     * TODO: Do we want to have this feature or is it to dangerous?
     *
     * @returns the flat representation
     * @private
     */
    _flatten(this: AbstractStaticCollectionProperty): object {
        const flattenedRepresentation = {
            propertyNode: this
        };
        const keys = this._getIds();
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const child = this._get(key);
            if (!child._isFlattenLeaf()) {
                flattenedRepresentation[key] = child._flatten();
            } else {
                flattenedRepresentation[key] = child;
            }
        }

        return flattenedRepresentation;
    };

    /**
     * Returns the number of children this node has
     * @returns The number of children
     * @private
     */
    _getChildrenCount(): number {
        return this._getIds().length;
    };

    /**
     * Sets constants
     * @param {Object} in_constants - The list of typed values.
     */
    _setConstants(in_constants) {
        ConsoleUtils.assert(_.isObject(in_constants), MSG.ASSERTION_FAILED +
            ' setConstants parameter: in_constants must be an object.');
        this._constantChildren = in_constants;
    };

}
