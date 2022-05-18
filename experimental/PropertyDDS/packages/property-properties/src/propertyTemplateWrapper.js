/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview
 * Declaration of the PropertyTemplateWrapper module
 * PropertyTemplateWrapper is used to wrap a property template and perform internal optimizations
 */
const { MSG } = require('@fluid-experimental/property-common').constants;
const _ = require('lodash');
const { ContainerProperty } = require('./properties/containerProperty');

const reservedTypesWithoutTemplates = {
    'BaseProperty': true,
    'ContainerProperty': true,
    'NodeProperty': true,
    'Enum': true,
};
/**
 * Utility function that validates if the typeid is a reserved type without a template.
 * @param {string} in_typeid The typeid to validate.
 * @return {boolean} True if the typeid is a reserved type without a template, false otherwise.
 */
const hasAssociatedTemplate = (in_typeid) => {
    return !reservedTypesWithoutTemplates[in_typeid];
};

export class PropertyTemplateWrapper {
    /**
     * Constructor for creating a PropertyTemplateWrapper based on the given template.
     * @param {PropertyTemplate} in_remoteTemplate A property template
     * @param {string} in_scope The scope of the template
     *
     * @constructor
     * @package
     * @alias property-properties.PropertyTemplateWrapper
     * @category Properties
     */
    constructor(in_remoteTemplate, in_scope) {
        /** The property template this object is wrapping */
        this._propertyTemplate = in_remoteTemplate;

        /** A property template created from this.propertyTemplate with the addition of all information
         *  from templates this template inherits from.
         */
        this._compiledPropertyTemplate = undefined;

        /* What type of base object is created for this template */
        this._objectCreationType = undefined;

        /* The scope of this template */
        this._scope = in_scope;
    }

    /**
     * To get the property template that this is wrapping.
     * @return {property-properties.PropertyTemplate} The template this wrapper contains
     * @package
     */
    getPropertyTemplate() {
        return this._propertyTemplate;
    }

    /**
     * Gets the compiled template or creates it then returns it.
     * @param {property-properties.PropertyFactory} in_propertyFactory The assosiated PropertyFactory.
     * @return {property-properties.PropertyTemplate} The compiled template
     * A compiled template is the template which is actually used for creating objects.
     * It has all information from parent Templates, and other changes.
     * @package
     */
    getCompiledTemplate(in_propertyFactory) {
        if (this._compiledPropertyTemplate === undefined) {
            this._compiledPropertyTemplate = this._contructCompiledTemplate(in_propertyFactory);
        }
        return this._compiledPropertyTemplate;
    }

    /**
     * Returns if the compiled template has been created.
     * @return {boolean} if the compiled template has been created
     * @package
     */
    hasCompiledTemplate() {
        return !!this._compiledPropertyTemplate;
    }

    /**
     * To get the creation type of the template this wraps.
     * @return {string} A typeid which represents the creation type of this template
     * @package
     */
    getCreationType() {
        return this._objectCreationType;
    }

    /**
     * If current creation type is undefined, sets it to in_typeid if in_typeid is a creation type.
     * If current creation type is defined, throws if in_typeid is a creation type.
     *
     * @param {string} in_typeid A typeid
     * @package
     */
    setCreationType(in_typeid) {
        // This function could be moved somewhere else, an enum could be made if this information is widely needed.
        const isCreationType = (typeid) => {
            const creationTypes =
                ['ContainerProperty', 'NodeProperty', 'Enum', 'BinaryProperty', 'Binary', 'RepositoryReferenceProperty'];
            return creationTypes.includes(typeid);
        };

        if (isCreationType(in_typeid)) {
            const currentCreationType = this._objectCreationType;
            if (currentCreationType === undefined) {
                this._objectCreationType = in_typeid;
            } else if (currentCreationType !== in_typeid) {
                throw new Error(MSG.ONLY_ONE_CREATION_TYPE + currentCreationType + ', ' + in_typeid);
            }
        }
    }

    /**
     * Contructs the compiled template from the template this wraps
     * @param {property-properties.PropertyFactory} in_propertyFactory The associated PropertyFactory.
     * @return {property-properties.PropertyTemplate} The compiled template
     * A compiled template is the template which is actually used for creating objects.
     * It has all information from parent Templates, and other changes.
     * @package
     */
    _contructCompiledTemplate(in_propertyFactory) {
        const originalTemplate = this.getPropertyTemplate();

        this.setCreationType(originalTemplate.typeid);

        /* Because we treat templates and contructor functions for base types the same way :( */
        if (_.isFunction(originalTemplate)) {
            return originalTemplate;
        }

        let parentTemplateIds = originalTemplate.inherits;

        /* template.inherits can be a string, if so convert it to array of strings */
        if (typeof parentTemplateIds === 'string') {
            parentTemplateIds = [parentTemplateIds];
        }

        /* Cloning the original template to avoid modifying it */
        const template = originalTemplate.clone();

        /* Copy the proccesed list of parents to not modify the original */
        const typeInheritence = parentTemplateIds ? parentTemplateIds.slice() : [];

        /* Look ups to efficiently check what properties/constants parents have */
        const parentsPropertiesById = {};
        const parentsConstantsById = {};

        if (parentTemplateIds !== undefined) {
            for (let i = 0; i < parentTemplateIds.length; ++i) {
                const parentTemplateId = parentTemplateIds[i];
                this.setCreationType(parentTemplateId);

                if (hasAssociatedTemplate(parentTemplateId)) {
                    const parentTemplateWrapper = in_propertyFactory._getWrapper(parentTemplateId, undefined, this._scope);
                    if (parentTemplateWrapper) {
                        const parentTemplate = parentTemplateWrapper.getCompiledTemplate(in_propertyFactory);
                        const parentCreationType = parentTemplateWrapper.getCreationType();

                        if (parentCreationType !== 'ContainerProperty') {
                            this.setCreationType(parentCreationType);
                        }

                        if (parentTemplate.inherits) {
                            typeInheritence.concat(parentTemplateId);
                        }

                        /* Fills parentsPropertiesById and makes sure there are no two properties or constants with the same id */
                        if (parentTemplate.hasNestedProperties()) {
                            const parentProperties = parentTemplate.properties;
                            for (let j = 0; j < parentProperties.length; ++j) {
                                const parentProperty = parentProperties[j];
                                /* Two parents has child property with same id */
                                if (parentsPropertiesById[parentProperty.id] || parentsConstantsById[parentProperty.id]) {
                                    throw new Error(MSG.OVERWRITING_ID + parentProperty.id);
                                }
                                parentsPropertiesById[parentProperty.id] = parentProperty;
                            }
                        }

                        /* Fills parentsConsantsById and makes sure there are no two properties or constants  with the same id */
                        if (parentTemplate.hasNestedConstants()) {
                            const parentConstants = parentTemplate.constants;
                            for (let j = 0; j < parentConstants.length; ++j) {
                                const parentConstant = parentConstants[j];
                                /* Two parents has child property with same id */
                                if (parentsConstantsById[parentConstant.id] || parentsPropertiesById[parentConstant.id]) {
                                    throw new Error(MSG.OVERWRITING_ID + parentConstant.id);
                                }
                                parentsConstantsById[parentConstant.id] = parentConstant;
                            }
                        }
                    }
                }
            }
        }

        if (this._objectCreationType === undefined) {
            this.setCreationType('ContainerProperty');
        }

        /* Merges properties from parents into the properties of the child */
        const constructSubProperties = (in_template, in_parentsPropertiesById, fieldName) => {
            const propertyKeys = Object.keys(in_parentsPropertiesById);

            if (in_template[fieldName] === undefined && propertyKeys.length !== 0) {
                in_template[fieldName] = [];
            }

            const properties = in_template[fieldName] || [];

            for (let i = 0; i < properties.length; ++i) {
                const property = properties[i];
                const id = property.id;
                if (in_parentsPropertiesById[id]) {
                    this._mergeProperty(property, in_parentsPropertiesById[id]);
                    delete in_parentsPropertiesById[id];
                }
            }

            for (let i = 0; i < propertyKeys.length; ++i) {
                const insertProperty = in_parentsPropertiesById[propertyKeys[i]];
                if (insertProperty) {
                    properties.push(insertProperty);
                }
            }

            if (properties.length > 0) {
                template[fieldName] = properties;
            }
        };

        constructSubProperties(template, parentsPropertiesById, 'properties');
        constructSubProperties(template, parentsConstantsById, 'constants');

        if (typeInheritence.length > 0) {
            template.inherits = typeInheritence;
        }

        return template;
    }

    /**
     * A helper function which merges a child and parent property.
     * The changes are applied directly to the in_childProperty.
     * @param {object} in_childProperty The child's property defition.
     * @param {object} in_parentProperty The parent's property defition.
     * @package
     */
    _mergeProperty(in_childProperty, in_parentProperty) {
        const mergeField = (child, parent, fieldName, defaultValue) => {
            if (child[fieldName] === undefined) {
                if (parent[fieldName] !== undefined) {
                    child[fieldName] = parent[fieldName];
                }
            } else if (child[fieldName] !== parent[fieldName] &&
                (child[fieldName] !== defaultValue || parent[fieldName] !== undefined)) {
                throw new Error(MSG.OVERRIDEN_PROP_MUST_HAVE_SAME_FIELD_VALUES_AS_BASE_TYPE + fieldName +
                    ' as the base type: ' + child.id + ': ' + child[fieldName] + ' != ' + parent[fieldName]);
            }
        };

        mergeField(in_childProperty, in_parentProperty, 'context', 'single');
        mergeField(in_childProperty, in_parentProperty, 'contextKeyType', 'string');
        mergeField(in_childProperty, in_parentProperty, 'length', 0);
        mergeField(in_childProperty, in_parentProperty, 'optional', false);
        mergeField(in_childProperty, in_parentProperty, 'typeid', undefined);

        if (in_parentProperty.typedValue !== undefined) {
            if (in_childProperty.typedValue === undefined) {
                in_childProperty.typedValue = in_parentProperty.typedValue;
            }
        }

        if (in_parentProperty.value !== undefined) {
            if (in_childProperty.value === undefined) {
                in_childProperty.value = in_parentProperty.value;
            }
        }

        const mergeSubProperties = (child, parent, fieldName) => {
            const parentPropertiesById = {};
            let parentProperties = parent[fieldName];
            let properties = child[fieldName] || [];
            if (parentProperties) {
                for (let j = 0; j < parentProperties.length; ++j) {
                    const parentProperty = parentProperties[j];
                    parentPropertiesById[parentProperty.id] = parentProperty;
                }

                for (let i = 0; i < properties.length; ++i) {
                    const property = properties[i];
                    const id = property.id;
                    if (parentPropertiesById[id]) {
                        this._mergeProperty(property, parentPropertiesById[id]);
                        delete parentPropertiesById[id];
                    }
                }

                const propertyKeys = Object.keys(parentPropertiesById);
                for (let i = 0; i < propertyKeys.length; ++i) {
                    const insertProperty = parentPropertiesById[propertyKeys[i]];
                    if (insertProperty) {
                        properties.push(insertProperty);
                    }
                }
            }

            if (properties.length > 0) {
                child[fieldName] = properties;
            }
        };

        mergeSubProperties(in_childProperty, in_parentProperty, 'properties');
        mergeSubProperties(in_childProperty, in_parentProperty, 'constants');
    }
}
