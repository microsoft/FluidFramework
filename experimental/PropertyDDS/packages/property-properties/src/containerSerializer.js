/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @namespace property-properties
 */

const { PathHelper } = require('@fluid-experimental/property-changeset');
const { LazyLoadedProperties: Property } = require('./properties/lazyLoadedProperties');
const { AbstractStaticCollectionProperty } = require('./properties/abstractStaticCollectionProperty');

var MSG = {
    NOTHING_TO_DESERIALIZE: 'Repository deserialize(), no input given',
};

/**
 * Dummy property used to return the scope to the underlying properties
 */
class ScopeProperty extends AbstractStaticCollectionProperty {
    /**
     * @param {object} in_params - BaseProperty parameters
     * @param {string} in_params.scope - The scope to keep track of
     * @constructor
     */
    constructor(in_params) {
        // HACK: Normally, we would inherit from NodeProperty however, NodeProperty seems to not be available
        // at this point. There may be a bug with MR.
        super(in_params);
        this._scope = in_params.scope;
    }

    /**
     * @override
     */
    _getScope() {
        return this._scope;
    }

    /**
     * Remove a child property
     * This is an internal function, called internally by NodeProperty. Removing children dynamically by the user is
     * only allowed in the NodeProperty.
     *
     * @param {String} in_id - the id of the property to remove
     * @protected
     */
    _remove(in_id) {
        if (this._staticChildren[in_id] !== undefined) {
            this._staticChildren[in_id]._setParent(undefined);
            delete this._staticChildren[in_id];
        } else {
            throw new Error(MSG.REMOVING_NON_EXISTING_ID + in_id);
        }
    }
}

/**
 * Serialize the input document.
 * @param {Array<BaseProperty>} in_psets - Property set
 * @param {bool} in_dirtyOnly - Serialize dirty properties only
 * @return {{}} JSON data of the document
 * @alias property-properties.serialize
 */
export function serialize(in_psets, in_dirtyOnly) {
    in_dirtyOnly = in_dirtyOnly || false;

    var documentData = {};
    var rootTypeid;

    var keys = Object.keys(in_psets);
    for (var i = 0; i < keys.length; i++) {
        rootTypeid = in_psets[keys[i]].getTypeid();
        if (!documentData[rootTypeid]) {
            documentData[rootTypeid] = {};
        }
        documentData[rootTypeid][keys[i]] = in_psets[keys[i]].serialize(in_dirtyOnly);
    }

    return documentData;
}

/**
 * Deserialize the input document
 * @param {{}} in_data - The input JSON document data
 * @param {string|undefined} in_scope - The scope to construct the properties from
 * @param {property-properties.BaseProperty.PathFilteringOptions} [in_filteringOptions] - The options to selectively
 * create only a subset of a property. Creates all properties if undefined.
 * @return {{}} an object of guid : pset
 * @alias property-properties.deserialize
 */
export function deserialize(in_data, in_scope, in_filteringOptions) {
    if (!in_data) {
        console.warn(MSG.NOTHING_TO_DESERIALIZE);
        return {};
    }

    // From the given filtering options, keep only what is relevant for this property.
    let baseFilteringOptions;
    if (in_filteringOptions) {
        let pathCoverage = PathHelper.getPathCoverage(in_filteringOptions.basePath, in_filteringOptions.paths);
        switch (pathCoverage.coverageExtent) {
            case PathHelper.CoverageExtent.FULLY_COVERED:
                // No need for filtering options anymore, keep them undefined.
                break;
            case PathHelper.CoverageExtent.PARTLY_COVERED:
                baseFilteringOptions = {
                    basePath: in_filteringOptions.basePath,
                    paths: pathCoverage.pathList,
                };
                break;
            case PathHelper.CoverageExtent.UNCOVERED:
                // No need to create anything, it is outside the paths.
                return {};
            default:
                break;
        }
    }

    var deserializedProperties = {};
    var typeid, entity, classed;

    var dataKeys = Object.keys(in_data);
    for (var iData = 0; iData < dataKeys.length; iData++) {
        typeid = dataKeys[iData];
        classed = in_data[typeid];
        var classKeys = Object.keys(classed);
        for (var iClass = 0; iClass < classKeys.length; iClass++) {
            // reconstruct entity
            let filteringOptions = baseFilteringOptions && {
                basePath: PathHelper.getChildAbsolutePathCanonical(baseFilteringOptions.basePath, classKeys[iClass]),
                paths: baseFilteringOptions.paths,
            };
            // TODO: In theory this could throw when the entity can not be created because it is not included
            //       in the paths. Make sure to handle this case when we'll add that validation.
            entity = Property.PropertyFactory._createProperty(typeid, null, undefined, in_scope, filteringOptions);

            // Store the id prior to calling entity.deserialize() since it is subject to change afterwards
            var id = entity.getId();

            // Create a scope property which captures the scope that was passed in as arguments
            // so that it can be picked up downstream by the respective deserialize functions
            var scopeProperty = new ScopeProperty({ scope: in_scope });

            scopeProperty._append(entity, false);

            entity.deserialize(classed[classKeys[iClass]], filteringOptions, false);

            scopeProperty._remove(id);

            entity._id = classKeys[iClass];

            // keep track of the reconstructed entities
            deserializedProperties[classKeys[iClass]] = entity;
        }
    }

    return deserializedProperties;
}
/**
 * Deserialize the input document assuming it contains elements of a non-primitive array.
 * @param {array<object>} in_data - The input JSON document data
 * @param {string|undefined} in_scope - The scope to construct the properties from
 * @return {array<BaseProperty>} An array of psets
 * @alias property-properties.deserializeNonPrimitiveArrayElements
 */
export function deserializeNonPrimitiveArrayElements(in_data, in_scope) {
    if (!in_data) {
        console.warn(MSG.NOTHING_TO_DESERIALIZE);
        return [];
    }

    var insertedPropertyInstances = [];
    for (var i = 0; i < in_data.length; ++i) {
        // reconstruct entity
        var createdProperty = Property.PropertyFactory._createProperty(
            in_data[i]['typeid'], null, undefined, in_scope);

        var id = createdProperty.getId();

        // Create a scope property which captures the scope that was passed in as argument
        // so that it can be picked up downstream by the respective deserialize functions
        var scopeProperty = new ScopeProperty({ scope: in_scope });

        scopeProperty._append(createdProperty, false);

        createdProperty._deserialize(in_data[i], false, undefined, false);

        scopeProperty._remove(id);

        // keep track of the reconstructed entities
        insertedPropertyInstances.push(createdProperty);
    }

    return insertedPropertyInstances;
}
