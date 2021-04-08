/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals assert */
/* eslint-disable no-unused-expressions*/
/**
 * @fileoverview In this file, we will test the map property
 *    object described in /src/properties/named_node_property.js
 */

describe('NamedNodeProperty', function() {
  var PropertyFactory, NamedNodeProperty, isGUID;

  before(function() {
    // Get all the objects we need in this test here.
    PropertyFactory = require('../..').PropertyFactory;
    NamedNodeProperty = require('../../src/properties/named_node_property');
    isGUID = require('@fluid-experimental/property-common').GuidUtils.isGUID;

    // Register a templates
    var InheritingDirectlyTemplate = {
      typeid: 'autodesk.tests:InheritingDirectly-1.0.0',
      inherits: ['NamedNodeProperty']
    };
    var InheritingSeparatelyTemplate = {
      typeid: 'autodesk.tests:InheritingSeparately-1.0.0',
      inherits: ['NamedProperty', 'NodeProperty']
    };

    PropertyFactory._reregister(InheritingDirectlyTemplate);
    PropertyFactory._reregister(InheritingSeparatelyTemplate);
  });

  describe('Creation and ID', function() {
    it('should be possible to create a NamedNodeProperty directly', function() {
      var property = PropertyFactory.create('NamedNodeProperty');
      expect(property).to.be.an.instanceof(NamedNodeProperty);
    });
    it('should be possible to create it via a template that inherits from NamedNodeProperty', function() {
      var property = PropertyFactory.create('autodesk.tests:InheritingDirectly-1.0.0');
      expect(property).to.be.an.instanceof(NamedNodeProperty);
    });
    it('should be possible to create a NamedNodeProperty by inheriting from Named and NodeProperty', function() {
      var property = PropertyFactory.create('autodesk.tests:InheritingSeparately-1.0.0');
      expect(property).to.be.an.instanceof(NamedNodeProperty);
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
