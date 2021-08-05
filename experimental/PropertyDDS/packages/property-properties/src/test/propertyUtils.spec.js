/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* globals assert */
/* eslint-disable no-unused-expressions*/
/* eslint-disable max-nested-callbacks */
/* eslint-disable max-len */

/**
 * @fileoverview In this file, we will test the utils
 *    described in /src/utils.js
 */

describe('PropertyUtils', function () {
    var PropertyFactory, PropertyUtils, _;

    before(function () {
        // Get all the objects we need in this test here.
        PropertyFactory = require('..').PropertyFactory;
        PropertyUtils = require('..').PropertyUtils;
        _ = require('lodash');
    });

    describe('PropertyUtils.gatherProperties', function () {
        it('should return a list of properties that match the predicate', function () {
            var testTemplate = {
                typeid: 'autodesk.test:testProp-1.0.0',
                properties: [
                    { id: 'a', typeid: 'Float64' },
                    { id: 'b', typeid: 'String' },
                    {
                        id: 'nested', properties: [
                            { id: 'c', typeid: 'Float64' },
                            { id: 'd', typeid: 'String' }
                        ]
                    }
                ]
            };
            PropertyFactory.register(testTemplate);
            var myProperty = PropertyFactory.create('autodesk.test:testProp-1.0.0');
            myProperty.get('a').setValue(3);
            myProperty.get('b').setValue('Hello');
            myProperty.get('nested').get('c').setValue(42);
            myProperty.get('nested').get('d').setValue('Hello again!');

            var result = PropertyUtils.gatherProperties(myProperty, function (property) {
                return _.isNumber(property.value);
            });
            expect(result['a']).to.exist;
            expect(result['b']).to.not.exist;
            expect(result['nested.c']).to.exist;
            expect(result['nested.d']).to.not.exist;
        });
    });

});
