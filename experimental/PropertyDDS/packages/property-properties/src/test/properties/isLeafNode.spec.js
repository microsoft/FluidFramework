/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals */
/* eslint-disable no-unused-expressions, max-len */

let _;
let PropertyFactory;
let PsetUtils;
let DeferredPromise;
let ChangeSet;
let deepCopy;
const AllProperties = {
    typeid: 'mysample:all-1.0.0',
    inherits: 'NamedProperty',
    constants: [
        { id: 'const_int8', typeid: 'Int8', value: 111 },
        { id: 'const_int16', typeid: 'Int16', value: 111 },
        { id: 'const_int32', typeid: 'Int32', value: 111 },
        { id: 'const_bool', typeid: 'Bool', value: true },
        { id: 'const_string', typeid: 'String', value: 'This is a string' },
    ],
    properties: [
        { id: 'int8', typeid: 'Int8' },
        { id: 'int16', typeid: 'Int16' },
        { id: 'int32', typeid: 'Int32' },
        { id: 'int64', typeid: 'Int64' },
        { id: 'uint32', typeid: 'Uint32' },
        { id: 'uint64', typeid: 'Uint64' },
        { id: 'float32', typeid: 'Float32' },
        { id: 'float64', typeid: 'Float64' },
        { id: 'bool', typeid: 'Bool' },
        { id: 'string', typeid: 'String' },
        { id: 'nodeProp', typeid: 'NodeProperty' },
        {
            id: 'nestedProps',
            properties: [
                { id: 'string', typeid: 'String' },
                { id: 'bool', typeid: 'Bool' },
            ],
        },
    ],
};

var createPropertyInsertAndCommit = function(workspace, typeid, context, propId) {
    const prop = PropertyFactory.create(typeid, context);
    workspace.insert(propId, prop);
};

describe('property-properties.Utils isLeafNode', function() {
    let root;

    /**
     * Get all the objects we need in this test here.
     */
    before(function() {
        PropertyFactory = require('../..').PropertyFactory;
        ChangeSet = require('@fluid-experimental/property-changeset').ChangeSet;
        _ = require('lodash');
        deepCopy = _.cloneDeep;

        PropertyFactory.register(AllProperties);
        PropertyFactory.register({
            typeid: 'autodesk.tests:entry-1.0.0',
            properties: [
                { id: 'string', typeid: 'String' },
            ],
        });
        PropertyFactory.register({
            typeid: 'autodesk.tests:namedEntry-1.0.0',
            inherits: ['NamedProperty'],
            properties: [
                { id: 'string', typeid: 'String' },
            ],
        });
        PropertyFactory.register({
            typeid: 'autodesk.tests:array-1.0.0',
            properties: [
                {
                    id: 'array', typeid: 'autodesk.tests:entry-1.0.0', context: 'array', value: [
                        { string: 'I am a string 1' },
                        { string: 'I am a string 2' },
                    ],
                },
            ],
        });
        PropertyFactory.register({
            typeid: 'autodesk.tests:set-1.0.0',
            properties: [
                {
                    id: 'set', typeid: 'autodesk.tests:namedEntry-1.0.0', context: 'set', value: [
                        { string: 'I am a string 1' },
                        { string: 'I am a string 2' },
                    ],
                },
            ],
        });
        PropertyFactory.register({
            typeid: 'autodesk.tests:map-1.0.0',
            properties: [
                {
                    id: 'map', typeid: 'autodesk.tests:entry-1.0.0', context: 'map', value: {
                        key1: { string: 'I am a string 1' },
                        key2: { string: 'I am a string 2' },
                    },
                },
            ],
        });

        PsetUtils = require('@fluid-experimental/property-changeset').Utils;
        DeferredPromise = require('@fluid-experimental/property-common').DeferredPromise;
    });

    beforeEach(async function() {
        root = PropertyFactory.create('NodeProperty');
    });

    it.skip('should match leaf for primitives properties', async function() {
        let leafNodesCount = 0;
        createPropertyInsertAndCommit(root, 'mysample:all-1.0.0', 'single', 'singleProp');

        const changeSet = root.getRoot().serialize();

        const propertyCb = (node, cb) => {
            if (node.isLeafNode()) {
                leafNodesCount++;
            }
            return process.nextTick(cb);
        };

        const dp = new DeferredPromise();
        PsetUtils.traverseChangeSetRecursivelyAsync(changeSet, { preCallback: propertyCb }, dp.getCb());
        await dp;

        expect(leafNodesCount).to.eql(19);
    });

    it('should see an empty array as a leaf', async function() {
        let leafNodesCount = 0;
        createPropertyInsertAndCommit(root, 'mysample:all-1.0.0', 'array', 'arrayProp');

        const changeSet = root.getRoot().serialize();

        const propertyCb = (node, cb) => {
            if (node.isLeafNode()) {
                leafNodesCount++;
            }
            return process.nextTick(cb);
        };

        const dp = new DeferredPromise();
        PsetUtils.traverseChangeSetRecursivelyAsync(changeSet, { preCallback: propertyCb }, dp.getCb());
        await dp;

        expect(leafNodesCount).to.eql(1);
    });

    it('should see an empty map as a leaf', async function() {
        let leafNodesCount = 0;
        createPropertyInsertAndCommit(root, 'mysample:all-1.0.0', 'map', 'mapProp');

        const changeSet = root.getRoot().serialize();

        const propertyCb = (node, cb) => {
            if (node.isLeafNode()) {
                leafNodesCount++;
            }
            return process.nextTick(cb);
        };

        const dp = new DeferredPromise();
        PsetUtils.traverseChangeSetRecursivelyAsync(changeSet, { preCallback: propertyCb }, dp.getCb());
        await dp;

        expect(leafNodesCount).to.eql(1);
    });

    it('should see an empty set as a leaf', async function() {
        let leafNodesCount = 0;
        createPropertyInsertAndCommit(root, 'mysample:all-1.0.0', 'set', 'setProp');

        const changeSet = root.getRoot().serialize();

        const propertyCb = (node, cb) => {
            if (node.isLeafNode()) {
                leafNodesCount++;
            }
            return process.nextTick(cb);
        };

        const dp = new DeferredPromise();
        PsetUtils.traverseChangeSetRecursivelyAsync(changeSet, { preCallback: propertyCb }, dp.getCb());
        await dp;

        expect(leafNodesCount).to.eql(1);
    });

    it('should count primitives in an array as leafs', async function() {
        let leafNodesCount = 0;
        const array = PropertyFactory.create('autodesk.tests:array-1.0.0');
        root.insert('arrayProp', array);

        const changeSet = root.serialize();

        const propertyCb = (node, cb) => {
            if (node.isLeafNode()) {
                leafNodesCount++;
            }
            return process.nextTick(cb);
        };
        const dp = new DeferredPromise();
        PsetUtils.traverseChangeSetRecursivelyAsync(changeSet, { preCallback: propertyCb }, dp.getCb());
        await dp;

        expect(leafNodesCount).to.eql(2);
    });

    it('should count primitives in an set as leafs', async function() {
        let leafNodesCount = 0;
        const set = PropertyFactory.create('autodesk.tests:set-1.0.0');
        root.insert('setProp', set);

        const changeSet = root.serialize();

        const propertyCb = (node, cb) => {
            if (node.isLeafNode()) {
                leafNodesCount++;
            }
            return process.nextTick(cb);
        };
        const dp = new DeferredPromise();
        PsetUtils.traverseChangeSetRecursivelyAsync(changeSet, { preCallback: propertyCb }, dp.getCb());
        await dp;

        expect(leafNodesCount).to.eql(4);
    });

    it('should count primitives in an map as leafs', async function() {
        let leafNodesCount = 0;
        const map = PropertyFactory.create('autodesk.tests:map-1.0.0');
        root.insert('mapProp', map);

        const changeSet = root.serialize();

        const propertyCb = (node, cb) => {
            if (node.isLeafNode()) {
                leafNodesCount++;
            }
            return process.nextTick(cb);
        };
        const dp = new DeferredPromise();
        PsetUtils.traverseChangeSetRecursivelyAsync(changeSet, { preCallback: propertyCb }, dp.getCb());
        await dp;

        expect(leafNodesCount).to.eql(2);
    });

    it('should count remove as leafs in reversible changeset', async function() {
        let leafNodesCount = 0;
        const map = PropertyFactory.create('autodesk.tests:map-1.0.0');
        root.insert('mapProp', map);

        root.cleanDirty();
        map.get('map').remove('key1');
        const changeSet = root.getPendingChanges().getSerializedChangeSet();

        const propertyCb = (node, cb) => {
            if (node.isLeafNode()) {
                leafNodesCount++;
            }
            return process.nextTick(cb);
        };
        const dp = new DeferredPromise();
        PsetUtils.traverseChangeSetRecursivelyAsync(changeSet, { preCallback: propertyCb }, dp.getCb());
        await dp;

        expect(leafNodesCount).to.eql(1);
    });

    it('should count remove as leafs', async function() {
        let leafNodesCount = 0;
        const map = PropertyFactory.create('autodesk.tests:map-1.0.0');
        root.insert('mapProp', map);
        root.cleanDirty();

        map.get('map').remove('key1');

        const changeSet = root.getPendingChanges();
        changeSet._stripReversibleChangeSet();
        const nonReversibleChangesetSerialized = changeSet.getSerializedChangeSet();

        const propertyCb = (node, cb) => {
            if (node.isLeafNode()) {
                leafNodesCount++;
            }
            return process.nextTick(cb);
        };
        const dp = new DeferredPromise();
        PsetUtils.traverseChangeSetRecursivelyAsync(nonReversibleChangesetSerialized, { preCallback: propertyCb }, dp.getCb());
        await dp;

        expect(leafNodesCount).to.eql(1);
    });
});
