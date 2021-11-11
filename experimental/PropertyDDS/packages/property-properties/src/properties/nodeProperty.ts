/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview This file contains the implementation of the NodeProperty class
 */
import { BaseProperty } from '..';
import { ContainerProperty } from './containerProperty';

/**
 * A property object that allows to add child properties dynamically.
 */
export class NodeProperty extends ContainerProperty {

    constructor(in_params) {
        super({ typeid: 'NodeProperty', ...in_params });
    };

    /**
     * @inheritdoc
     */
    isDynamic(): boolean { return true; };

    /**
     * @inheritdoc
     */
    _validateInsert(in_id: string, in_property: BaseProperty) { };

}
