/**
 * @fileoverview This file contains the implementation of the NodeProperty class
 */
const { ContainerProperty } = require('./containerProperty');

/**
 * A property object that allows to add child properties dynamically.
 */
export class NodeProperty extends ContainerProperty {

    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ContainerProperty
     * @alias property-properties.NodeProperty
     * @category Other Collections
     */
    constructor(in_params) {
        super(in_params);
    };


    _typeid = 'NodeProperty';

    /**
     * @inheritdoc
     */
    isDynamic() { return true; };

    /**
     * @inheritdoc
     */
    _validateInsert(in_id, in_property) { };

}
