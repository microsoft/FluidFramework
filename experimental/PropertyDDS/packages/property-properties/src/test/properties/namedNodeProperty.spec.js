/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals assert */
/* eslint-disable no-unused-expressions */
/**
 * @fileoverview In this file, we will test the map property
 *    object described in /src/properties/namedNodeProperty.js
 */

const { isGUID } = require('@fluid-experimental/property-common').GuidUtils;
const { PropertyFactory } = require('../..');
const { ContainerProperty } = require('../..');
const { NamedNodeProperty } = require('../../properties/namedNodeProperty');

describe('NamedNodeProperty', function() {
    before(function() {
        // Register a templates
        var InheritingDirectlyTemplate = {
            typeid: 'autodesk.tests:InheritingDirectly-1.0.0',
            inherits: ['NamedNodeProperty'],
        };
        var InheritingSeparatelyTemplate = {
            typeid: 'autodesk.tests:InheritingSeparately-1.0.0',
            inherits: ['NamedProperty', 'NodeProperty'],
        };

        PropertyFactory._reregister(InheritingDirectlyTemplate);
        PropertyFactory._reregister(InheritingSeparatelyTemplate);
    });

    describe('Creation and ID', function() {
        it('should be possible to create a NamedNodeProperty directly', function() {
            const typeid = 'NamedNodeProperty';
            var property = PropertyFactory.create(typeid);
            expect(property).to.be.an.instanceof(ContainerProperty);

            expect(PropertyFactory.inheritsFrom(typeid, 'NamedNodeProperty')).to.be.true;
            expect(PropertyFactory.inheritsFrom(typeid, 'NamedProperty')).to.be.true;
            expect(PropertyFactory.inheritsFrom(typeid, 'NodeProperty')).to.be.true;
        });

        it('should be possible to create it via a template that inherits from NamedNodeProperty', function() {
            const typeid = 'autodesk.tests:InheritingDirectly-1.0.0';
            var property = PropertyFactory.create(typeid);
            expect(property).to.be.an.instanceof(ContainerProperty);

            expect(PropertyFactory.inheritsFrom(typeid, 'NamedNodeProperty')).to.be.true;
            expect(PropertyFactory.inheritsFrom(typeid, 'NamedProperty')).to.be.true;
            expect(PropertyFactory.inheritsFrom(typeid, 'NodeProperty')).to.be.true;
        });

        it('should be possible to create a NamedNodeProperty by inheriting from Named and NodeProperty', function() {
            const typeid = 'autodesk.tests:InheritingSeparately-1.0.0';
            const property = PropertyFactory.create(typeid);
            expect(property).to.be.an.instanceof(ContainerProperty);

            expect(PropertyFactory.inheritsFrom(typeid, 'NamedNodeProperty')).to.be.false;
            expect(PropertyFactory.inheritsFrom(typeid, 'NamedProperty')).to.be.true;
            expect(PropertyFactory.inheritsFrom(typeid, 'NodeProperty')).to.be.true;
        });

        it('a GUID should be assigned on creation', function() {
            var property = PropertyFactory.create('autodesk.tests:InheritingDirectly-1.0.0');
            expect(property.getGuid()).not.to.be.not.empty;
            assert(isGUID(property.getGuid()));

            expect(property.getGuid()).to.equal(property.getId());
        });

        it('the ID sould be overwritable', function() {
            var property = PropertyFactory.create('autodesk.tests:InheritingDirectly-1.0.0');
            property._setId('test');
            expect(property.getId()).to.equal('test');
        });
    });
});
