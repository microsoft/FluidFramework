/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-unused-expressions */
/**
 * @fileoverview In this file, we will test the map property
 *    object described in /src/properties/mapProperty.js
 */

describe('MapProperty', function() {
  var PropertyFactory, BaseProperty, ChangeSet, generateGuid, PATH_TOKENS;
  var changeSetWithTwoMapEntries, _, changeSetWithTwoMapEntries_full, removalChangeSet;
  var myNode, mapNode1, mapNode2, map;

  before(function() {
    // Get all the objects we need in this test here.
    PropertyFactory = require('../..').PropertyFactory;
    BaseProperty = require('../..').BaseProperty;
    ChangeSet = require('@fluid-experimental/property-changeset').ChangeSet;
    _ = require('lodash');
    generateGuid = require('@fluid-experimental/property-common').GuidUtils.generateGUID;
    PATH_TOKENS = require('../..').BaseProperty.PATH_TOKENS;

    // Register a template with a set property for the tests
    var TestPropertyTemplate = {
      typeid: 'autodesk.tests:MapTestPropertyID-1.0.0',
      inherits: ['NamedProperty'],
      properties: [
        { id: 'stringProperty', typeid: 'String' },
        { id: 'stringProperty2', typeid: 'String' },
        { id: 'map', context: 'map', typeid: 'NamedProperty' },
      ],
    };
    var AnonymousTestPropertyTemplate = {
      typeid: 'autodesk.tests:AnonymousMapTestPropertyID-1.0.0',
      properties: [
        { id: 'stringProperty', typeid: 'String' },
      ],
    };

    var PrimitiveMapPropertyTemplate = {
      typeid: 'autodesk.tests:PrimitiveMap-1.0.0',
      properties: [
        { id: 'map', context: 'map', typeid: 'Int32' },
      ],
    };

    var NonPrimitiveMapPropertyTemplate = {
      typeid: 'autodesk.tests:NonPrimitiveMap-1.0.0',
      properties: [
        { typeid: 'autodesk.tests:StringProperty-1.0.0', id: 'map', context: 'map' },
      ],
    };

    var StringPropertyTemplate = {
      typeid: 'autodesk.tests:StringProperty-1.0.0',
      properties: [
        { id: 'stringValue', typeid: 'String' },
      ],
    };

    var ComplexProperty = {
      typeid: 'autodesk.tests:ComplexProperty-1.0.0',
      properties: [
        {
          id: 'nested', properties: [
            { id: 'data', typeid: 'Int32' },
          ],
        },
      ],
    };

    var ComplexMap = {
      typeid: 'autodesk.tests:ComplexMap-1.0.0',
      properties: [
        {
          id: 'path', properties: [
            { id: 'map', typeid: 'autodesk.tests:ComplexProperty-1.0.0', context: 'map' },
          ],
        },
      ],
    };

    PropertyFactory._reregister(TestPropertyTemplate);
    PropertyFactory._reregister(AnonymousTestPropertyTemplate);
    PropertyFactory._reregister(PrimitiveMapPropertyTemplate);
    PropertyFactory._reregister(NonPrimitiveMapPropertyTemplate);
    PropertyFactory._reregister(StringPropertyTemplate);
    PropertyFactory._reregister(ComplexMap);
    PropertyFactory._reregister(ComplexProperty);
    myNode = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
    mapNode1 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
    mapNode2 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');

    map = myNode._properties.map;
  });

  // Helper functions for the test cases
  var keyCounter = 0;
  var resetKeyCounter = function() {
    keyCounter = 0;
  };

  // Inserts a node with the given guid (a new one is generated when undefined)
  var insertNodeInRootWithKeyAndGuid = function(key, guid, root) {
    var node = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
    if (key === undefined) {
      key = 'node' + keyCounter++;
    }
    if (guid !== undefined) {
      node._properties.guid.value = guid;
    }
    root._properties.map.insert(key, node);
  };

  // Inserts a new node in the root
  var insertNodeInRoot = function(root) {
    insertNodeInRootWithKeyAndGuid(undefined, undefined, root);
  };

  // Returns a function that will insert a node with a constant GUID
  var insertUniqueNodeInRoot = function() {
    var key = 'node' + keyCounter++;
    return insertNodeInRootWithKeyAndGuid.bind(undefined, key, generateGuid());
  };

  // Inserts a new node as leaf
  var insertNodeAsLeaf = function(root) {
    var leaf = root;
    while (leaf._properties.map.getAsArray().length > 0) {
      leaf = leaf._properties.map.getAsArray()[0];
    }
    var node = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
    var key = 'node' + keyCounter++;
    leaf._properties.map.insert(key, node);
  };

  // Removes the first node from the root
  var removeFirstNodeInRoot = function(root) {
    var firstKey = root._properties.map.getIds()[0];
    root._properties.map.remove(firstKey);
  };

  // Modifies the leaf node
  var modifyLeaf = function(root) {
    var leaf = root;
    while (leaf._properties.map.getAsArray().length > 0) {
      leaf = leaf._properties.map.getAsArray()[0];
    }
    leaf._properties.stringProperty.value = leaf._properties.stringProperty.value + '+';
  };

  describe('API methods', function() {
    var myMap, stringProp1, stringProp2;
    before(function() {
      myMap = PropertyFactory.create('autodesk.tests:NonPrimitiveMap-1.0.0')._properties.map;
      stringProp1 = PropertyFactory.create('autodesk.tests:StringProperty-1.0.0');
      stringProp2 = PropertyFactory.create('autodesk.tests:StringProperty-1.0.0');
    });
    it('.clear should work', function() {
      myMap.insert('one', stringProp1);
      myMap.insert('two', stringProp2);
      expect(myMap.getEntriesReadOnly()).to.deep.equal({ 'one': stringProp1, 'two': stringProp2 });
      myMap.clear();
      expect(myMap.getEntriesReadOnly()).to.be.empty;
    });

    it('.getAsArray should return an array of map values', function() {
      myMap.insert('one', stringProp1);
      myMap.insert('two', stringProp2);
      expect(myMap.getAsArray()).to.deep.equal([stringProp1, stringProp2]);
    });

    it('.getFullTypeid should return a string of the typeid with or without collection', function() {
      expect(myMap.getFullTypeid()).to.equal('map<autodesk.tests:StringProperty-1.0.0>');
      // hideCollection: true
      expect(myMap.getFullTypeid(true)).to.equal('autodesk.tests:StringProperty-1.0.0');
    });

    it('.getTypeid should return a string of the typeid', function() {
      expect(myMap.getTypeid()).to.equal('autodesk.tests:StringProperty-1.0.0');
    });

    it('.getIds should return an array of map keys', function() {
      myMap.insert('one', stringProp1);
      myMap.insert('two', stringProp2);
      expect(myMap.getIds()).to.deep.equal(['one', 'two']);
    });

    it('.remove should remove an item from a map and return the removed item', function() {
      myMap.insert('one', stringProp1);
      myMap.insert('two', stringProp2);
      myMap.remove('one');
      expect(myMap.getEntriesReadOnly()).to.deep.equal({ 'two': stringProp2 });
      expect(myMap.remove('two')).to.equal(stringProp2);
    });

    it('.getContext should return map', function() {
      expect(myMap.getContext()).to.equal('map');
    });

    it('getId should return the id', function() {
      expect(myMap.getId()).to.equal('map');
    });

    afterEach(function() {
      myMap.clear();
    });
  });

  describe('get and resolvePath', function() {
    var complexMap, complexProperty1, complexProperty2;
    before(function() {
      complexMap = PropertyFactory.create('autodesk.tests:ComplexMap-1.0.0')._properties.path.map;
      complexProperty1 = PropertyFactory.create('autodesk.tests:ComplexProperty-1.0.0');
      complexProperty2 = PropertyFactory.create('autodesk.tests:ComplexProperty-1.0.0');
      complexProperty1.get('nested').get('data').setValue(123);
      complexProperty2.get('nested').get('data').setValue(456);
      complexMap.insert('one', complexProperty1);
      complexMap.insert('two', complexProperty2);
    });

    it('should resolve a simple path', function() {
      expect(complexMap.resolvePath('one.nested.data').getValue()).to.equal(123);
      expect(complexMap.get('one').get('nested').get('data').getValue()).to.equal(123);
      expect(complexMap.get(['one', 'nested', 'data']).getValue()).to.equal(123);
    });

    it('should work with raise path tokens', function() {
      expect(complexMap.resolvePath('../../path.map.one')).to.deep.equal(complexProperty1);
      expect(complexMap.get(PATH_TOKENS.UP).get(PATH_TOKENS.UP).get('path')
        .get('map').get('two')).to.deep.equal(complexProperty2);
      expect(complexMap.get([PATH_TOKENS.UP, 'map', 'two', PATH_TOKENS.UP, 'two']))
        .to.deep.equal(complexProperty2);
    });

    it('should work with root tokens', function() {
      expect(complexMap.resolvePath('/path.map.two')).to.deep.equal(complexProperty2);
      expect(complexMap.get(PATH_TOKENS.ROOT).get('path').get('map').get('two').get('nested')
        .get('data').getValue()).to.equal(456);
      expect(complexMap.get([PATH_TOKENS.ROOT, 'path', 'map', 'one'])).to.deep.equal(complexProperty1);
    });
  });

  describe('Testing creation, assignment and serialization', function() {
    it('should be empty at the beginning', function() {
      expect(map.getEntriesReadOnly()).to.be.empty;
      expect(map.serialize({ 'dirtyOnly': true })).to.be.empty;
    });

    it('should be possible to insert into the map', function() {
      // Test insertion of the first node
      map.insert('node1', mapNode1);
      expect(map.has('node1')).to.be.ok;
      expect(map.has('node2')).to.be.not.ok;
      expect(map.get('node2')).to.equal(undefined);
      expect(mapNode1.getParent()).to.equal(map);

      var CS = map.serialize({ 'dirtyOnly': true });
      expect(CS.insert &&
        CS.insert['autodesk.tests:MapTestPropertyID-1.0.0'] &&
        _.keys(CS.insert['autodesk.tests:MapTestPropertyID-1.0.0']).length === 1 &&
        _.keys(CS.insert['autodesk.tests:MapTestPropertyID-1.0.0'])[0] === 'node1').to.be.ok;

      // Test insertion of the second node
      map.insert('node2', mapNode2);
      expect(map.has('node2')).to.be.ok;
      expect(map.get('node2')).to.equal(mapNode2);
      changeSetWithTwoMapEntries = map.serialize({ 'dirtyOnly': true });
      expect(changeSetWithTwoMapEntries.insert &&
        changeSetWithTwoMapEntries.insert['autodesk.tests:MapTestPropertyID-1.0.0'] &&
        _.keys(changeSetWithTwoMapEntries.insert['autodesk.tests:MapTestPropertyID-1.0.0']).length === 2 &&
        _.includes(_.keys(changeSetWithTwoMapEntries.insert['autodesk.tests:MapTestPropertyID-1.0.0']), 'node1') &&
        _.includes(
          _.keys(changeSetWithTwoMapEntries.insert['autodesk.tests:MapTestPropertyID-1.0.0']), 'node2')).to.be.ok;

      changeSetWithTwoMapEntries_full = map.serialize({ 'dirtyOnly': false });
      expect(changeSetWithTwoMapEntries).to.deep.equal(changeSetWithTwoMapEntries_full);
    });

    it('Should track dirtiness', function() {
      map.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY);
      expect(map.serialize({
        'dirtyOnly': true,
        'includeRootTypeid': false,
        'dirtinessType': BaseProperty.MODIFIED_STATE_FLAGS.DIRTY,
      })).to.be.empty;
      expect(map.serialize({
        'dirtyOnly': true,
        'includeRootTypeid': false,
        'dirtinessType': BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
      })).deep.equal(changeSetWithTwoMapEntries_full);
      expect(map.serialize({ 'dirtyOnly': false })).deep.equal(changeSetWithTwoMapEntries_full);
    });

    it('Should handle removals correctly', function() {
      map.remove('node1');
      expect(mapNode1.getParent()).to.be.undefined;
      map.remove('node2');
      expect(map.serialize({
        'dirtyOnly': true,
        'includeRootTypeid': false,
        'dirtinessType': BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
      })).to.be.empty;
      expect(map.serialize({ 'dirtyOnly': false })).to.be.empty;
      removalChangeSet = map.serialize({
        'dirtyOnly': true,
        'includeRootTypeid': false,
        'dirtinessType': BaseProperty.MODIFIED_STATE_FLAGS.DIRTY,
      });
      expect(removalChangeSet).to.have.all.keys(['remove']);
      expect(removalChangeSet.remove).to.have.length(2);
      expect(removalChangeSet.remove).to.contain('node1');
      expect(removalChangeSet.remove).to.contain('node2');
    });

    it('Should support deserialization', function() {
      // Deserialization should return an identical property
      var deserializedNode = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      var deserializedChanges1 = deserializedNode._properties.map.deserialize(changeSetWithTwoMapEntries);
      var CS4 = deserializedNode._properties.map.serialize({ 'dirtyOnly': false });
      expect(CS4).to.deep.equal(changeSetWithTwoMapEntries);
      expect(deserializedChanges1).to.deep.equal(changeSetWithTwoMapEntries);
      expect(deserializedNode._properties.map.serialize({ 'dirtyOnly': true })).to.deep.equal(changeSetWithTwoMapEntries);
      expect(deserializedNode._properties.map.serialize({ 'dirtyOnly': true })).to.deep.equal(changeSetWithTwoMapEntries);
      expect(deserializedNode._properties.map.serialize({ 'dirtyOnly': true })).to.deep.equal(changeSetWithTwoMapEntries);

      // Deserializing the same ChangeSet twice should return an empty ChangeSet
      deserializedNode._properties.map.cleanDirty();
      var deserializedChanges2 = deserializedNode._properties.map.deserialize(changeSetWithTwoMapEntries);
      expect(deserializedChanges2).to.be.empty;
      expect(deserializedNode._properties.map.serialize({ 'dirtyOnly': true })).to.be.empty;

      // Deserialization of a modification should return the correct modification
      var modifiedProperty = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      modifiedProperty._properties.map.deserialize(changeSetWithTwoMapEntries);
      modifiedProperty._properties.map.get('node2')._properties.stringProperty.value = 'newValue';
      deserializedNode._properties.map.cleanDirty();
      var deserializedChanges3 = deserializedNode._properties.map.deserialize(
        modifiedProperty._properties.map.serialize({ 'dirtyOnly': false }));
      var expectedChanges = {
        'modify': {
          'autodesk.tests:MapTestPropertyID-1.0.0': {
            'node2': {
              'String': {
                'stringProperty': 'newValue',
              },
            },
          },
        },
      };
      expect(deserializedChanges3).to.deep.equal(expectedChanges);
      expect(deserializedNode._properties.map.serialize({ 'dirtyOnly': true })).to.deep.equal(expectedChanges);

      deserializedNode._properties.map.cleanDirty();
      var deserializedChanges4 = deserializedNode._properties.map.deserialize({});
      expect(deserializedChanges4).to.deep.equal(removalChangeSet);
      expect(deserializedNode._properties.map.serialize({ 'dirtyOnly': true })).to.deep.equal(removalChangeSet);
    });

    it('Should support deserialization of falsy primitive types', function() {
      var testProp1 = PropertyFactory.create('map<Bool>');
      testProp1.set('entry', false);
      var changes = testProp1.deserialize(testProp1.serialize({ 'dirtyOnly': false }));
      expect(changes).to.be.empty;
    });

    it('Should track modifies', function() {
      var modifyNode1 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      var modifyNode2 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');

      modifyNode1._properties.map.deserialize(changeSetWithTwoMapEntries);
      modifyNode2._properties.map.deserialize(changeSetWithTwoMapEntries);

      modifyNode1._properties.map.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
        BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
      var child1 = modifyNode1._properties.map.get('node1');
      child1._properties.stringProperty.value = 'modify test';
      var modifyChangeSet = modifyNode1._properties.map.serialize({ 'dirtyOnly': true });
      modifyNode2._properties.map.applyChangeSet(modifyChangeSet);
      expect(modifyNode2._properties.map.serialize({ 'dirtyOnly': false }))
        .to.deep.equal(modifyNode1._properties.map.serialize({ 'dirtyOnly': false }));
    });

    it('Should support hierarchical properties', function() {
      var node1 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      var node2 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      var node3 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');

      // Create a hierarchy of three nodes
      node1._properties.map.insert('node', node2);
      node2._properties.map.insert('node', node3);
      node3._properties.stringProperty.value = 'test';

      // Check that deserializing and serializing works with a hierarchy
      var hierarchicalChangeSet = node1.serialize({ 'dirtyOnly': true });
      var deserializedNode = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      deserializedNode.deserialize(hierarchicalChangeSet);
      var child1 = deserializedNode._properties.map.getAsArray()[0];
      expect(child1).to.not.equal(undefined);
      var child2 = child1._properties.map.getAsArray()[0];
      expect(child2).to.not.equal(undefined);
      expect(child2._properties.stringProperty.value).to.equal('test');

      // Test that hierarchical modifies work
      node1.cleanDirty();
      node3._properties.stringProperty.value = 'test2';
      var hierarchicalModifyChangeSet = node1.serialize({ 'dirtyOnly': true });

      deserializedNode.applyChangeSet(hierarchicalModifyChangeSet);
      child1 = deserializedNode._properties.map.getAsArray()[0];
      expect(child1).to.not.equal(undefined);
      child2 = child1._properties.map.getAsArray()[0];
      expect(child2).to.not.equal(undefined);
      expect(child2._properties.stringProperty.value).to.equal('test2');
    });

    it('should be possible to use anonymous properties', function() {
      var rootNode = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      var rootNode2 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      var node1 = PropertyFactory.create('autodesk.tests:AnonymousMapTestPropertyID-1.0.0');
      var node2 = PropertyFactory.create('autodesk.tests:AnonymousMapTestPropertyID-1.0.0');
      rootNode._properties.map.insert('node1', node1);
      rootNode._properties.map.insert('node2', node2);
      var testChangeSet = rootNode.serialize({ 'dirtyOnly': false });

      expect(rootNode._properties.map.get('node1')).to.be.equal(node1);
      expect(rootNode._properties.map.get('node2')).to.be.equal(node2);
      rootNode.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
        BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);

      node1._properties.stringProperty.value = '1';
      node2._properties.stringProperty.value = '2';

      rootNode2.deserialize(testChangeSet);
      rootNode2.applyChangeSet(rootNode.serialize({ 'dirtyOnly': true }));
      expect(rootNode2.serialize({ 'dirtyOnly': false })).to.be.deep.equal(rootNode.serialize({ 'dirtyOnly': false }));
    });

    it('inserting the same key twice should throw an exception', function() {
      var rootNode = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      var node1 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      var node2 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      rootNode._properties.map.insert('node1', node1);
      expect(function() {
        rootNode._properties.map.insert('node1', node2);
      }).to.throw();
    });

    it('set should overwrite existing entry', function() {
      var rootNode = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      var node1 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      var node2 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      var node3 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');

      rootNode._properties.map.set('node1', node1);
      rootNode._properties.map.set('node1', node2);
      // the set should overwrite the insert
      expect(rootNode.serialize({ 'dirtyOnly': true })['map<NamedProperty>'].map).to.have.all.keys('insert');

      // Overwriting with the same property shouldn't dirty the node
      rootNode.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
        BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
      rootNode._properties.map.set('node1', node2);
      expect(ChangeSet.isEmptyChangeSet(rootNode.serialize({ 'dirtyOnly': true }))).to.be.ok;
      expect(rootNode.isDirty()).to.be.false;

      // Overwriting with a different value should result in an remove and insert
      rootNode._properties.map.set('node1', node1);
      expect(rootNode.serialize({ 'dirtyOnly': true })['map<NamedProperty>'].map).to.have.all.keys('insert', 'remove');

      rootNode._properties.map.set('node1', node3);
      expect(rootNode.serialize({ 'dirtyOnly': true })['map<NamedProperty>'].map).to.have.all.keys('insert', 'remove');
      expect(rootNode.serialize({ 'dirtyOnly': true })['map<NamedProperty>'].map.remove).to.have.length(1);
    });

    it('set should throw if the value inserted is not a property', function() {
      var rootNode = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0')._properties.map;
      var node1 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      rootNode.insert('node', node1);
      var incorrectFn = function() {
        rootNode.set('node', 8);
      };
      expect(incorrectFn).to.throw();
    });

    it('insert should work when inserting a primitive value', function() {
      var rootNode = PropertyFactory.create('autodesk.tests:PrimitiveMap-1.0.0')._properties.map;
      rootNode.insert('node0', 1);
      var correctFn = function() {
        rootNode.insert('node1', 4);
      };
      expect(correctFn).to.not.throw();
    });

    it('inserting the same node twice should be a bug', function() {
      var rootNode = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      var node = PropertyFactory.create('autodesk.tests:AnonymousMapTestPropertyID-1.0.0');

      // Try to insert the same node object under two keys
      rootNode._properties.map.insert('node', node);
      expect(function() {
        rootNode._properties.map.insert('node2', node);
      }).to.throw();

      // After removing it, adding it under a new key should be possible
      rootNode._properties.map.remove('node');
      rootNode._properties.map.insert('node2', node);
    });

    it('setValues should work for primitive maps', function() {
      var node = PropertyFactory.create('autodesk.tests:AnonymousMapTestPropertyID-1.0.0');

      node.setValues({
        'stringProperty': 'newString!!',
      });
      expect(node.get('stringProperty').getValue()).to.equal('newString!!');
    });

    it('setValues should replace values for primitive types ', function() {
      var PrimitiveInt32MapTemplate = {
        typeid: 'autodesk.tests:PrimitiveInt32Map-1.0.0',
        properties: [
          { typeid: 'Int32', id: 'map', context: 'map' },
        ],
      };

      PropertyFactory.register(PrimitiveInt32MapTemplate);

      var node = PropertyFactory.create('autodesk.tests:PrimitiveInt32Map-1.0.0');

      node.get('map').insert('firstKey', 111);
      node.get('map').insert('secondKey', 222);

      expect(node.get('map').getEntriesReadOnly().firstKey).to.equal(111);
      expect(node.get('map').getEntriesReadOnly().secondKey).to.equal(222);

      node.setValues({
        'map': {
          'firstKey': 333,
        },
      });

      expect(node.get('map').getEntriesReadOnly().firstKey).to.equal(333);
      expect(node.get('map').getEntriesReadOnly().secondKey).to.equal(222);
    });

    it('getValues should work for primitive maps', function() {
      var rootNode = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      var node = PropertyFactory.create('autodesk.tests:AnonymousMapTestPropertyID-1.0.0');

      rootNode._properties.map.insert('node', node);

      rootNode._properties.map.setValues({
        'node': {
          'stringProperty': 'newString!!',
        },
      });

      var expectedResult = {
        node: {
          'stringProperty': 'newString!!',
        },
      };
      expect(rootNode._properties.map.getValues()).to.deep.equal(expectedResult);
    });

    it('setValues should work for custom maps', function() {
      var mapProp = PropertyFactory.create('autodesk.tests:NonPrimitiveMap-1.0.0');
      var string1 = PropertyFactory.create('autodesk.tests:StringProperty-1.0.0');
      var string2 = PropertyFactory.create('autodesk.tests:StringProperty-1.0.0');

      mapProp.get('map').insert('firstString', string1);
      mapProp.get('map').insert('secondString', string2);
      mapProp.setValues({
        'map': {
          'firstString': {
            'stringValue': 'test1',
          },
          'secondString': {
            'stringValue': 'test2',
          },
        },
      });

      expect(mapProp.get(['map', 'firstString', 'stringValue']).getValue()).to.equal('test1');
      expect(mapProp.get(['map', 'secondString', 'stringValue']).getValue()).to.equal('test2');

      mapProp.get('map').setValues({ 'firstString': { 'stringValue': 'test1_updated' } });

      expect(mapProp.get(['map', 'firstString', 'stringValue']).getValue()).to.equal('test1_updated');
      expect(mapProp.get(['map', 'secondString', 'stringValue']).getValue()).to.equal('test2');
    });

    it('setValues should update values for existing keys and create new ones for non-existing keys', function() {
      var mapProp = PropertyFactory.create('autodesk.tests:NonPrimitiveMap-1.0.0');

      mapProp.setValues({
        'map': {
          'firstString': {
            'stringValue': 'test1',
          },
          'secondString': {
            'stringValue': 'test2',
          },
        },
      });

      expect(mapProp.get(['map', 'firstString', 'stringValue']).getValue()).to.equal('test1');
      expect(mapProp.get(['map', 'secondString', 'stringValue']).getValue()).to.equal('test2');

      mapProp.setValues({
        'map': {
          'secondString': {
            'stringValue': 'test2-upd',
          },
          'thirdString': {
            'stringValue': 'test3',
          },
        },
      });

      expect(mapProp.get(['map', 'firstString', 'stringValue']).getValue()).to.equal('test1');
      expect(mapProp.get(['map', 'secondString', 'stringValue']).getValue()).to.equal('test2-upd');
      expect(mapProp.get(['map', 'thirdString', 'stringValue']).getValue()).to.equal('test3');

      mapProp.setValues({
        'map': {
          'fourthString': {
            'stringValue': 'test4',
          },
          'thirdString': {
            'stringValue': 'test3-upd',
          },
        },
      });

      expect(mapProp.get(['map', 'firstString', 'stringValue']).getValue()).to.equal('test1');
      expect(mapProp.get(['map', 'secondString', 'stringValue']).getValue()).to.equal('test2-upd');
      expect(mapProp.get(['map', 'thirdString', 'stringValue']).getValue()).to.equal('test3-upd');
      expect(mapProp.get(['map', 'fourthString', 'stringValue']).getValue()).to.equal('test4');
    });

    it('getValues should work for custom maps', function() {
      var mapProp = PropertyFactory.create('autodesk.tests:NonPrimitiveMap-1.0.0');
      var string1 = PropertyFactory.create('autodesk.tests:StringProperty-1.0.0');
      var string2 = PropertyFactory.create('autodesk.tests:StringProperty-1.0.0');

      mapProp._properties.map.insert('firstString', string1);
      mapProp._properties.map.insert('secondString', string2);

      mapProp.setValues({
        'map': {
          'firstString': {
            'stringValue': 'test1',
          },
          'secondString': {
            'stringValue': 'test2',
          },
        },
      });

      var expectedResult = {
        'map': {
          'firstString': {
            'stringValue': 'test1',
          },
          'secondString': {
            'stringValue': 'test2',
          },
        },
      };
      expect(mapProp.getValues()).to.deep.equal(expectedResult);
    });

    it('setValues should create new items from typed properties if key does not exist', function() {
      var mapProp = PropertyFactory.create('autodesk.tests:NonPrimitiveMap-1.0.0');
      var string1 = PropertyFactory.create('autodesk.tests:StringProperty-1.0.0', null, { stringValue: 'test1' });
      var string2 = PropertyFactory.create('autodesk.tests:StringProperty-1.0.0', null, { stringValue: 'test2' });

      mapProp.setValues({
        'map': {
          'firstString': string1,
          'secondString': string2,
        },
      });

      expect(mapProp.get(['map', 'firstString', 'stringValue']).getValue()).to.equal('test1');
      expect(mapProp.get(['map', 'secondString', 'stringValue']).getValue()).to.equal('test2');
    });

    it('setValues should create new items from untyped inputs if key does not exist', function() {
      var mapProp = PropertyFactory.create('autodesk.tests:NonPrimitiveMap-1.0.0');

      mapProp.setValues({
        'map': {
          'firstString': {
            'stringValue': 'test1',
          },
          'secondString': {
            'stringValue': 'test2',
          },
        },
      });

      expect(mapProp.get(['map', 'firstString', 'stringValue']).getValue()).to.equal('test1');
      expect(mapProp.get(['map', 'secondString', 'stringValue']).getValue()).to.equal('test2');
    });

    it('getRelativePath should work', function() {
      var rootNode = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      var mapProp = PropertyFactory.create('autodesk.tests:NonPrimitiveMap-1.0.0');
      mapProp.setValues({
        'map': {
          'firstString': {
            'stringValue': 'test1',
          },
          'secondString': {
            'stringValue': 'test2',
          },
        },
      });
      rootNode._properties.map.insert('nestedMap', mapProp);
      expect(mapProp.get(['map', 'firstString']).getRelativePath(rootNode))
        .to.equal('map[nestedMap].map[firstString]');
      expect(mapProp.get(['map', 'firstString']).getRelativePath(mapProp.get(['map', 'secondString', 'stringValue'])))
        .to.equal('../../[firstString]');
      expect(mapProp.get(['map', 'firstString', 'stringValue'])
        .getRelativePath(mapProp.get(['map', 'secondString', 'stringValue'])))
        .to.equal('../../[firstString].stringValue');
    });

    it('path creation and resolution should work for entries of the map', function() {
      var rootNode = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      var node = PropertyFactory.create('autodesk.tests:AnonymousMapTestPropertyID-1.0.0');
      rootNode._properties.map.insert('node', node);

      // Test whether the returned paths are correct
      expect(node.getAbsolutePath()).to.equal('/map[node]');
      expect(node.getRelativePath(node)).to.equal('');
      expect(node.getRelativePath(rootNode.resolvePath('map'))).to.equal('[node]');
      expect(node.getRelativePath(rootNode)).to.equal('map[node]');
      expect(rootNode.getRelativePath(node)).to.equal('../../');

      expect(rootNode.resolvePath('map[node]')).to.equal(node);
      expect(rootNode.resolvePath('map').resolvePath('[node]')).to.equal(node);

      // Test whether they are updated correctly
      rootNode._properties.map.remove('node', node);

      // After removal the old paths should be undefined
      expect(rootNode.resolvePath('map[node]')).to.be.undefined;
      expect(rootNode.resolvePath('map').resolvePath('[node]')).to.be.undefined;

      // And the node should have an empty absolute path
      expect(node.getAbsolutePath()).to.equal('/');

      // Now we try reinserting it under a different id (one containing a quotable character)
      rootNode._properties.map.insert('node"2', node);

      // Make sure the paths have been updated correctly
      expect(node.getAbsolutePath()).to.equal('/map["node\\"2"]');
      expect(node.getRelativePath(node)).to.equal('');
      expect(node.getRelativePath(rootNode.resolvePath('map'))).to.equal('["node\\"2"]');

      // And the path resolution works with the new name
      expect(rootNode.resolvePath('map["node\\"2"]')).to.equal(node);
      expect(rootNode.resolvePath('map').resolvePath('["node\\"2"]')).to.equal(node);

      // Try an empty string as key
      rootNode._properties.map.remove('node"2', node);
      rootNode._properties.map.insert('', node);

      // Make sure the paths have been updated correctly
      expect(node.getAbsolutePath()).to.equal('/map[""]');

      // And the path resolution works with the new name
      expect(rootNode.resolvePath('map[""]')).to.equal(node);
      expect(rootNode.resolvePath('map').resolvePath('[""]')).to.equal(node);

      // Try multiple levels
      var leaf = PropertyFactory.create('NodeProperty');
      expect(leaf.resolvePath('/')).to.equal(leaf);
      var map1 = PropertyFactory.create('NodeProperty', 'map');
      map1.insert('entry', leaf);
      expect(leaf.resolvePath('/')).to.equal(map1);

      var map2 = PropertyFactory.create(undefined, 'map');
      map2.insert('entry', map1);
      expect(leaf.resolvePath('/')).to.equal(map2);

      var map3 = PropertyFactory.create(undefined, 'map');
      map3.insert('entry', map2);
      expect(leaf.resolvePath('/')).to.equal(map3);

      // Pretty printing
      var expectedPrettyStr =
        'undefined (Map of BaseProperty):\n' +
        '  entry (Map of BaseProperty):\n' +
        '    entry (Map of NodeProperty):\n' +
        '      entry (NodeProperty):\n';
      var prettyStr = '';
      map3.prettyPrint(function(str) {
        prettyStr += str + '\n';
      });
      expect(prettyStr).to.equal(expectedPrettyStr);
      map3.prettyPrint();
    });
  });

  describe('squashing', function() {
    //
    // Helper function which takes a sequence of callbacks that are successfully executed
    // and the changes applied by the callbacks are separately tracked and squashed in a
    // a ChangeSet. This ChangeSet is then compared to the state in the property object
    //
    // Optionally, a a callback which controls the initial state before the squashing can
    // be given as first parameter
    //
    var testChangeSetSquashing = function(in_options) {
      resetKeyCounter();
      var testProperty = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');

      var callbacks = in_options.callbacks;
      if (in_options.pre) {
        in_options.pre(testProperty);
      }

      var initialChangeset = new ChangeSet(testProperty.serialize({ 'dirtyOnly': false }));
      initialChangeset.setIsNormalized(true);

      var squashedChangeset = new ChangeSet();
      testProperty.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
        BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
      for (var i = 0; i < callbacks.length; i++) {
        callbacks[i](testProperty);
        var changes = testProperty.serialize({ 'dirtyOnly': true });
        testProperty.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
          BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);

        squashedChangeset.applyChangeSet(changes);
      }

      if (in_options.post) {
        in_options.post(squashedChangeset.getSerializedChangeSet());
      }

      initialChangeset.applyChangeSet(squashedChangeset.getSerializedChangeSet());
      expect(initialChangeset.getSerializedChangeSet()).to.deep.equal(testProperty.serialize({ 'dirtyOnly': false }));
    };

    it('should work for multiple independent inserts', function() {
      testChangeSetSquashing({ callbacks: [insertNodeInRoot, insertNodeInRoot, insertNodeInRoot] });
    });
    it('should work for multiple hierarchical inserts', function() {
      testChangeSetSquashing({ callbacks: [insertNodeAsLeaf, insertNodeAsLeaf, insertNodeAsLeaf] });
    });
    it('should work for inserts followed by removes', function() {
      testChangeSetSquashing({
        callbacks: [insertNodeInRoot, insertNodeInRoot, removeFirstNodeInRoot, removeFirstNodeInRoot],
        post: function(changeset) {
          expect(changeset).to.be.empty;
        },
      });
    });
    it('should work for a tree removal', function() {
      testChangeSetSquashing({
        callbacks: [insertNodeAsLeaf, insertNodeAsLeaf, insertNodeAsLeaf, removeFirstNodeInRoot],
        post: function(changeset) {
          expect(changeset).to.be.empty;
        },
      });
    });

    it('should work for modifies in a tree', function() {
      testChangeSetSquashing({
        callbacks: [insertNodeAsLeaf, insertNodeAsLeaf, insertNodeAsLeaf, modifyLeaf, modifyLeaf],
      });
    });
    it('an insert, modify and a remove should give an empty changeset', function() {
      testChangeSetSquashing({
        callbacks: [insertNodeAsLeaf, insertNodeAsLeaf, modifyLeaf, modifyLeaf, removeFirstNodeInRoot],
        post: function(changeset) {
          expect(changeset).to.be.empty;
        },
      });
    });
    it('work for modifies after an already existing insert', function() {
      testChangeSetSquashing({
        pre: insertNodeInRoot,
        callbacks: [modifyLeaf, modifyLeaf],
      });
    });
    it('of modify and remove after an already existing insert should work', function() {
      testChangeSetSquashing({
        pre: insertNodeInRoot,
        callbacks: [modifyLeaf, removeFirstNodeInRoot],
        post: function(changeset) {
          expect(changeset['map<NamedProperty>'].map).to.have.all.keys('remove');
        },
      });
    });
    it('of a replace operation should be possible', function() {
      // Create two nodes with the same GUID
      var node1 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      var node2 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      node2._properties.guid.value = node1._properties.guid.value;
      node2._properties.stringProperty.value = 'testString2';

      testChangeSetSquashing({
        pre: function(root) {
          root._properties.map.insert('node1', node1);
        },
        callbacks: [
          removeFirstNodeInRoot,
          function(root) {
            root._properties.map.insert('node2', node2);
          },
        ],
        post: function(changeset) {
          expect(changeset['map<NamedProperty>'].map).to.have.all.keys('remove', 'insert');
        },
      });
    });
    it('should work for nested collections', function() {
      var node = PropertyFactory.create('NodeProperty');
      var testMap = PropertyFactory.create('map<Bool>');

      testMap.set('test', true);
      node.insert('map', testMap);
      var CS1 = node.serialize({ 'dirtyOnly': false });
      node.cleanDirty();
      testMap.set('test', false);
      var CS2 = node.serialize({ 'dirtyOnly': true });

      var CS = new ChangeSet(CS1);
      CS.applyChangeSet(new ChangeSet(CS2));
      expect(CS.getSerializedChangeSet().insert['map<Bool>'].map).to.have.all.keys('insert');
      expect(CS.getSerializedChangeSet().insert['map<Bool>'].map.insert['test']).to.equal(false);
    });
    it('should work for a remove in a primitive map that contains another item', function() {
      var cs1 = {
        modify: {
          'map<String>': {
            testMap: {
              insert: {
                test1: 'Hello',
              },
            },
          },
        },
      };
      var cs2 = {
        modify: {
          'map<String>': {
            testMap: {
              remove: {
                test2: 'Goodbye',
              },
            },
          },
        },
      };
      var combined = new ChangeSet();
      combined.applyChangeSet(cs1);
      combined.applyChangeSet(cs2);
      expect(combined.getSerializedChangeSet()).to.eql({
        modify: {
          'map<String>': {
            testMap: {
              insert: {
                test1: 'Hello',
              },
              remove: {
                test2: 'Goodbye',
              },
            },
          },
        },
      });
    });
    it('should work for maps in arrays', function() {
      testChangeSetSquashing({
        callbacks: [
          function(root) {
            var arrayNode = PropertyFactory.create('array<NodeProperty>');
            arrayNode.push(PropertyFactory.create('NodeProperty'));

            var boolMap = PropertyFactory.create('map<Bool>');
            boolMap.set('test', false);
            arrayNode.get(0).insert('boolMap', boolMap);

            root._properties.map.insert('array', arrayNode);
          },
          function(root) {
            root.resolvePath('map[array][0].boolMap').set('test', true);
          }],
        post: function(changeset) {
          expect(changeset['map<NamedProperty>'].map.insert['array<NodeProperty>'].array.insert['0'][1]['0']
            .insert['map<Bool>'].boolMap).to.have.all.keys('insert');
        },
      });
    });
  });
  describe('Rebasing', function() {
    var testRebasing = function(in_options) {
      // Prepare the initial state
      var baseProperty1 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      if (in_options.prepare) {
        in_options.prepare(baseProperty1);
      }
      // Create two copies of this state
      var baseProperty2 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      baseProperty2.deserialize(baseProperty1.serialize({ 'dirtyOnly': false }));
      var baseProperty3 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      baseProperty3.deserialize(baseProperty1.serialize({ 'dirtyOnly': false }));

      // Make sure the states are clear
      baseProperty1.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
        BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
      baseProperty2.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
        BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
      baseProperty3.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
        BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);

      var initialChangeSet = baseProperty1.serialize({ 'dirtyOnly': false });

      // Apply the operations to the two properties in parallel
      if (in_options.op1) {
        in_options.op1(baseProperty1);
      }
      if (in_options.op2) {
        in_options.op2(baseProperty2);
      }

      // Get the ChangeSets
      var changeSet1 = new ChangeSet(baseProperty1.serialize({ 'dirtyOnly': true }));
      var changeSet2 = baseProperty2.serialize({ 'dirtyOnly': true });

      // Perform the actual rebase
      var conflicts = [];
      changeSet1._rebaseChangeSet(changeSet2, conflicts);

      var combinedChangeSet = new ChangeSet(initialChangeSet).clone();
      combinedChangeSet.setIsNormalized(true);
      combinedChangeSet.applyChangeSet(changeSet1);
      combinedChangeSet.applyChangeSet(changeSet2);

      if (in_options.compareToSequential) {
        if (in_options.op1) {
          in_options.op1(baseProperty3);
        }
        if (in_options.op2) {
          in_options.op2(baseProperty3);
        }
        var finalChangeSet = baseProperty3.serialize({ 'dirtyOnly': false });
        expect(finalChangeSet).to.be.deep.equal(combinedChangeSet.getSerializedChangeSet());
      }

      if (in_options.checkResult) {
        in_options.checkResult(conflicts, changeSet2, combinedChangeSet);
      }
    };

    it('with a NOP should be possible', function() {
      testRebasing({
        op2: insertUniqueNodeInRoot(),
        compareToSequential: true,
      });
    });

    it('with independent inserts should be possible', function() {
      testRebasing({
        op1: insertUniqueNodeInRoot(),
        op2: insertUniqueNodeInRoot(),
        compareToSequential: true,
      });
    });

    it('with independent removes should be possible', function() {
      var node1 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
      var node2 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');

      testRebasing({
        prepare: function(root) {
          root._properties.map.insert('node1', node1);
          root._properties.map.insert('node2', node2);
        },
        op1: function(root) {
          root._properties.map.remove('node1');
        },
        op2: function(root) {
          root._properties.map.remove('node2');
        },
        compareToSequential: true,
      });
    });

    it('with a modify and a remove should possible', function() {
      var node1 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');

      testRebasing({
        prepare: function(root) {
          root._properties.map.insert('node1', node1);
        },
        op1: modifyLeaf,
        op2: removeFirstNodeInRoot,
        compareToSequential: true,
      });
    });

    it('with a remove and a modify should possible', function() {
      var node1 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');

      testRebasing({
        prepare: function(root) {
          root._properties.map.insert('node1', node1);
        },
        op1: removeFirstNodeInRoot,
        op2: modifyLeaf,
        compareToSequential: false,
        checkResult: function(conflicts, changeSet) {
          expect(conflicts).to.have.length(1);
          expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.ENTRY_MODIFIED_AFTER_REMOVE);
          expect(conflicts[0].path).to.be.equal('map[node1]');
          expect(ChangeSet.isEmptyChangeSet(changeSet)).to.be.ok;
        },
      });
    });

    it('reported conflicts should be escaped', function() {
      var node1 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');

      testRebasing({
        prepare: function(root) {
          root._properties.map.insert('"node"', node1);
        },
        op1: removeFirstNodeInRoot,
        op2: modifyLeaf,
        compareToSequential: false,
        checkResult: function(conflicts, changeSet) {
          expect(conflicts).to.have.length(1);
          expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.ENTRY_MODIFIED_AFTER_REMOVE);
          expect(conflicts[0].path).to.be.equal('map["\\"node\\""]');
          expect(ChangeSet.isEmptyChangeSet(changeSet)).to.be.ok;
        },
      });
    });

    it('with two compatible removes should be possible', function() {
      var node1 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');

      testRebasing({
        prepare: function(root) {
          root._properties.map.insert('node1', node1);
        },
        op1: function(root) {
          root._properties.map.remove('node1');
        },
        op2: function(root) {
          root._properties.map.remove('node1');
        },
        compareToSequential: false,
        checkResult: function(conflicts, changeSet) {
          expect(ChangeSet.isEmptyChangeSet(changeSet)).to.be.ok;
        },
      });
    });

    it('with two indendent recursive modifies should be possible', function() {
      var node1 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');

      testRebasing({
        prepare: function(root) {
          root._properties.map.insert('node1', node1);
        },
        op1: function(root) {
          root._properties.map.getAsArray()[0]._properties.stringProperty.value = 'a';
        },
        op2: function(root) {
          root._properties.map.getAsArray()[0]._properties.stringProperty2.value = 'a';
        },
        compareToSequential: true,
        checkResult: function(conflicts, changeSet) {
          expect(conflicts).to.be.empty;
        },
      });
    });

    it('with two conflicting recursive modifies should be possible and report a conflict', function() {
      var node1 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');

      testRebasing({
        prepare: function(root) {
          root._properties.map.insert('node1', node1);
        },
        op1: function(root) {
          root._properties.map.getAsArray()[0]._properties.stringProperty.value = 'a';
        },
        op2: function(root) {
          root._properties.map.getAsArray()[0]._properties.stringProperty.value = 'a';
        },
        compareToSequential: true,
        checkResult: function(conflicts, changeSet) {
          expect(conflicts).to.have.length(1);
          expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
          expect(conflicts[0].path).to.be.equal('map[node1].stringProperty');
        },
      });
    });

    it('with modify followed by remove+insert should work', function() {
      var node1 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');

      testRebasing({
        prepare: function(root) {
          root._properties.map.insert('node1', node1);
        },
        op1: modifyLeaf,
        op2: function(root) {
          root._properties.map.remove('node1');

          var node2 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
          node2._properties.guid.value = node1._properties.guid.value;
          root._properties.map.insert('node1', node2);
        },
        compareToSequential: true,
        checkResult: function(conflicts, changeSet) {
          expect(conflicts).to.have.length(1);
          expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.REMOVE_AFTER_MODIFY);
          expect(conflicts[0].path).to.be.equal('map[node1]');
          expect(changeSet['map<NamedProperty>'].map).to.have.all.keys('remove', 'insert');
        },
      });
    });

    it('with remove+insert followed by modify should report conflict', function() {
      var node1 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');

      testRebasing({
        prepare: function(root) {
          root._properties.map.insert('node1', node1);
        },
        op1: function(root) {
          root._properties.map.remove('node1');

          var node2 = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
          node2._properties.guid.value = node1._properties.guid.value;
          root._properties.map.insert('node1', node2);
        },
        op2: modifyLeaf,
        compareToSequential: false,
        checkResult: function(conflicts, changeSet) {
          expect(conflicts).to.have.length(1);
          expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.ENTRY_MODIFICATION_AFTER_REMOVE_INSERT);
          expect(conflicts[0].path).to.be.equal('map[node1]');
        },
      });
    });

    it('with remove+insert followed by remove+insert should report conflict', function() {
      testRebasing({
        prepare: function(root) {
          root._properties.map.insert('node', PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0'));
        },
        op1: function(root) {
          root._properties.map.set('node', PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0'));
        },
        op2: function(root) {
          root._properties.map.set('node', PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0'));
        },
        compareToSequential: false,
        checkResult: function(conflicts, changeSet) {
          expect(conflicts).to.have.length(1);
          expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
          expect(conflicts[0].path).to.be.equal('map[node]');
        },
      });
    });

    it('with conflicting inserts should report conflict', function() {
      testRebasing({
        prepare: function(root) {
        },
        op1: function(root) {
          var node = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
          root._properties.map.insert('node', node);
        },
        op2: function(root) {
          var node = PropertyFactory.create('autodesk.tests:MapTestPropertyID-1.0.0');
          root._properties.map.insert('node', node);
        },
        compareToSequential: false,
        checkResult: function(conflicts, changeSet) {
          expect(ChangeSet.isEmptyChangeSet(changeSet)).to.be.ok;
          expect(conflicts).to.have.length(1);
          expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.INSERTED_ENTRY_WITH_SAME_KEY);
          expect(conflicts[0].path).to.be.equal('map[node]');
        },
      });
    });

    it('should report conflicts for nested collections', function() {
      testRebasing({
        prepare: function(root) {
          var node = PropertyFactory.create('NodeProperty');
          var testMap = PropertyFactory.create('map<Bool>');
          testMap.set('test', false);
          node.insert('boolMap', testMap);

          root._properties.map.insert('node', node);
        },
        op1: function(root) {
          root._properties.map.get('node')._properties.boolMap.set('test', true);
        },
        op2: function(root) {
          root._properties.map.get('node')._properties.boolMap.set('test', true);
        },
        compareToSequential: false,
        checkResult: function(conflicts, changeSet) {
          expect(conflicts).to.have.length(1);
          expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
          expect(conflicts[0].path).to.be.equal('map[node].boolMap[test]');
        },
      });
    });
  });
});
