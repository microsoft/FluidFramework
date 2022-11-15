/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview In this file, we will test the set property object described in /src/properties/setProperty.js
 */
const { ChangeSet } = require('@fluid-experimental/property-changeset');
const { generateGUID } = require('@fluid-experimental/property-common').GuidUtils;
const _ = require('lodash');
const { PropertyFactory } = require('../..');
const { BaseProperty } = require('../..');

describe('SetProperty', function() {
    var PATH_TOKENS;
    var changeSetWithTwoChildren, changeSetWithTwoChildren_full, removalChangeSet;
    var myNode, childNode1, childNode2, children;

    before(function() {
        PATH_TOKENS = BaseProperty.PATH_TOKENS;

        // Register a template with a set property for the tests
        var TestPropertyTemplate = {
            typeid: 'autodesk.tests:TestPropertyID-1.0.0',
            inherits: ['NamedProperty'],
            properties: [
                { id: 'stringProperty', typeid: 'String' },
                { id: 'stringProperty2', typeid: 'String' },
                { id: 'children', context: 'set', typeid: 'NamedProperty' },
            ],
        };

        PropertyFactory._reregister(TestPropertyTemplate);
        myNode = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
        childNode1 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
        childNode2 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');

        children = myNode._properties.children;
    });

    // Helper functions for the test cases

    // Inserts a node with the given guid (a new one is generated when undefined)
    var insertNodeInRootWithGuid = function(guid, root) {
        var child = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
        if (guid) {
            child._properties.guid.value = guid;
        }
        root._properties.children.insert(child);
    };

    // Inserts a new node in the root
    var insertNodeInRoot = function(root) {
        insertNodeInRootWithGuid(generateGUID(), root);
    };

    // Returns a function that will insert a node with a constant GUID
    var insertUniqueNodeInRoot = function() {
        return insertNodeInRootWithGuid.bind(undefined, generateGUID());
    };

    // Inserts a new node as leaf
    var insertNodeAsLeaf = function(root) {
        var leaf = root;
        while (leaf._properties.children.getAsArray().length > 0) {
            leaf = leaf._properties.children.getAsArray()[0];
        }
        var child = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
        leaf._properties.children.insert(child);
    };

    // Removes the first node from the root
    var removeFirstNodeInRoot = function(root) {
        var firstChild = root._properties.children.getAsArray()[0];
        root._properties.children.remove(firstChild);
    };

    // Modifies the leaf node
    var modifyLeaf = function(root) {
        var leaf = root;
        while (leaf._properties.children.getAsArray().length > 0) {
            leaf = leaf._properties.children.getAsArray()[0];
        }
        leaf._properties.stringProperty.value = leaf._properties.stringProperty.value + '+';
    };

    describe('Testing creation, assignment and serialization', function() {
        it('should be empty at the beginning', function() {
            expect(children.getEntriesReadOnly()).to.be.empty;
            expect(children._serialize(true)).to.be.empty;
        });

        it('should be possible to insert children', function() {
            // Test insertion of the first child
            children.insert(childNode1);
            expect(children.has(childNode1.getGuid())).to.be.ok;
            expect(!children.has(childNode2.getGuid())).to.be.ok;
            expect(children.get(childNode2.getGuid())).to.equal(undefined);
            expect(childNode1.getParent()).to.equal(children);

            var CS = children.serialize({ 'dirtyOnly': true });
            expect(CS.insert &&
                CS.insert['autodesk.tests:TestPropertyID-1.0.0'] &&
                _.keys(CS.insert['autodesk.tests:TestPropertyID-1.0.0']).length === 1 &&
                _.keys(CS.insert['autodesk.tests:TestPropertyID-1.0.0'])[0] === childNode1.getGuid()).to.be.ok;

            // Test insertion of the second child
            children.insert(childNode2);
            expect(children.has(childNode2.getGuid())).to.be.ok;
            expect(children.get(childNode2.getGuid())).to.equal(childNode2);
            changeSetWithTwoChildren = children.serialize({ 'dirtyOnly': true });
            expect(changeSetWithTwoChildren.insert &&
                changeSetWithTwoChildren.insert['autodesk.tests:TestPropertyID-1.0.0'] &&
                _.keys(changeSetWithTwoChildren.insert['autodesk.tests:TestPropertyID-1.0.0']).length === 2 &&
                _.includes(
                    _.keys(changeSetWithTwoChildren.insert['autodesk.tests:TestPropertyID-1.0.0']), childNode1.getGuid()) &&
                _.includes(
                    _.keys(
                        changeSetWithTwoChildren.insert['autodesk.tests:TestPropertyID-1.0.0']),
                    childNode2.getGuid()),
            ).to.be.ok;

            changeSetWithTwoChildren_full = children.serialize({ 'dirtyOnly': false });
            expect(changeSetWithTwoChildren).to.deep.equal(changeSetWithTwoChildren_full);
        });

        it('.get and .resolvePath should work', function() {
            expect(children.get(childNode1.getGuid())).to.equal(childNode1);
            expect(children.resolvePath('/children[' + childNode1.getGuid() + ']')).to.equal(childNode1);
            expect(children.get([PATH_TOKENS.ROOT, 'children', childNode1.getGuid()])).to.equal(childNode1);
            expect(children.resolvePath('../children[' + childNode1.getGuid() + ']')).to.equal(childNode1);
            expect(children.get([PATH_TOKENS.UP, 'children', childNode1.getGuid()])).to.equal(childNode1);
        });

        it('.remove should return the item removed', function() {
            var myNode1 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            var childNode3 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            var childNode4 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            var mySet = myNode1._properties.children;
            mySet.insert(childNode3);
            mySet.insert(childNode4);
            expect(mySet.remove(childNode3)).to.deep.equal(childNode3);
            expect(mySet.remove(childNode4.getGuid())).to.deep.equal(childNode4);
        });

        it('getValues should work', function() {
            var myNode1 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            var childNode3 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            var childNode4 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            var mySet = myNode1._properties.children;
            mySet.insert(childNode3);
            mySet.insert(childNode4);
            var guid = myNode1.getGuid();
            var guidChild3 = childNode3.getGuid();
            var guidChild4 = childNode4.getGuid();
            expect(function() { myNode1.getValues(); }).to.not.throw();
            var expectedStr = '{"stringProperty":"",' +
                '"stringProperty2":"",' +
                '"children":{"' +
                guidChild3 + '":{"stringProperty":"",' +
                '"stringProperty2":"",' +
                '"children":{},' +
                '"guid":"' + guidChild3 + '"},' +
                '"' + guidChild4 + '":{"stringProperty":"",' +
                '"stringProperty2":"",' +
                '"children":{},' +
                '"guid":"' + guidChild4 + '"}},' +
                '"guid":"' + guid + '"}';
            expect(JSON.stringify(myNode1.getValues())).to.equal(expectedStr);
        });

        it('should output a pretty string with prettyPrint()', function() {
            var guid = myNode.getGuid();
            var guidChild1 = childNode1.getGuid();
            var guidChild2 = childNode2.getGuid();

            var expectedPrettyStr =
                guid + ' (autodesk.tests:TestPropertyID-1.0.0):\n' +
                '  stringProperty (String): ""\n' +
                '  stringProperty2 (String): ""\n' +
                '  children (Set of NamedProperty):\n' +
                '    ' + guidChild1 + ' (autodesk.tests:TestPropertyID-1.0.0):\n' +
                '      stringProperty (String): ""\n' +
                '      stringProperty2 (String): ""\n' +
                '      children (Set of NamedProperty):\n' +
                '      guid (String): "' + guidChild1 + '"\n' +
                '    ' + guidChild2 + ' (autodesk.tests:TestPropertyID-1.0.0):\n' +
                '      stringProperty (String): ""\n' +
                '      stringProperty2 (String): ""\n' +
                '      children (Set of NamedProperty):\n' +
                '      guid (String): "' + guidChild2 + '"\n' +
                '  guid (String): "' + guid + '"\n';
            var prettyStr = '';
            myNode.prettyPrint(function(str) {
                prettyStr += str + '\n';
            });
            expect(prettyStr).to.equal(expectedPrettyStr);
        });

        it('Should track dirtiness', function() {
            children.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY);
            expect(children._serialize(true, false, BaseProperty.MODIFIED_STATE_FLAGS.DIRTY)).to.be.empty;
            expect(children._serialize(true, false,
                BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE)).deep.equal(changeSetWithTwoChildren_full);
            expect(children.serialize({ 'dirtyOnly': false })).deep.equal(changeSetWithTwoChildren_full);
        });

        it('Should handle removals correctly', function() {
            children.remove(childNode1);
            expect(childNode1.getParent()).to.be.undefined;
            children.remove(childNode2.getGuid());
            expect(children._serialize(true, false, BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE)).to.be.empty;
            expect(children._serialize(false)).to.be.empty;
            removalChangeSet = children.serialize({
                'dirtyOnly': true,
                'includeRootTypeid': false,
                'dirtinessType': BaseProperty.MODIFIED_STATE_FLAGS.DIRTY,
            });
            expect(removalChangeSet).to.have.all.keys(['remove']);
            expect(removalChangeSet.remove).to.have.length(2);
            expect(removalChangeSet.remove).to.contain(childNode1.getGuid());
            expect(removalChangeSet.remove).to.contain(childNode1.getGuid());
        });

        it('Should support deserialization', function() {
            var deserializedNode = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            var deserializedChanges1 = deserializedNode._properties.children.deserialize(changeSetWithTwoChildren);
            var CS4 = deserializedNode._properties.children.serialize({ 'dirtyOnly': false });
            expect(CS4).to.deep.equal(changeSetWithTwoChildren);
            expect(deserializedChanges1).to.deep.equal(changeSetWithTwoChildren);

            var deserializedChanges2 = deserializedNode._properties.children.deserialize(changeSetWithTwoChildren);
            expect(deserializedChanges2).to.be.empty;

            var deserializedChanges3 = deserializedNode._properties.children.deserialize({});
            expect(deserializedChanges3).to.deep.equal(removalChangeSet);
        });

        it('Should support deserialization for inserts and removes', function() {
            var deserializedNode = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            var deserializedNode2 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');

            var namedProperty = PropertyFactory.create('NamedProperty');
            deserializedNode._properties.children.insert(namedProperty);
            deserializedNode2.deserialize(deserializedNode.serialize({ 'dirtyOnly': false }));
            expect(deserializedNode2.serialize({ 'dirtyOnly': false })).to.deep.equal(
                deserializedNode.serialize({ 'dirtyOnly': false }));

            deserializedNode._properties.children.remove(namedProperty);
            deserializedNode2.deserialize(deserializedNode.serialize({ 'dirtyOnly': false }));
            expect(deserializedNode2.serialize({ 'dirtyOnly': false })).to.deep.equal(
                deserializedNode.serialize({ 'dirtyOnly': false }));
        });

        it('Should track modifies', function() {
            var modifyNode1 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            var modifyNode2 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');

            modifyNode1._properties.children.deserialize(changeSetWithTwoChildren);
            modifyNode2._properties.children.deserialize(changeSetWithTwoChildren);

            modifyNode1._properties.children.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
                BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
            var child1 = modifyNode1._properties.children.get(childNode1.getGuid());
            child1._properties.stringProperty.value = 'modify test';
            var modifyChangeSet = modifyNode1._properties.children._serialize(true);
            modifyNode2._properties.children.applyChangeSet(modifyChangeSet);
            expect(modifyNode2._properties.children._serialize(false))
                .to.deep.equal(modifyNode1._properties.children._serialize(false));
        });

        it('Should support hierarchical properties', function() {
            var node1 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            var node2 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            var node3 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');

            // Create a hierarchy of three nodes
            node1._properties.children.insert(node2);
            node2._properties.children.insert(node3);
            node3._properties.stringProperty.value = 'test';

            // Check that deserializing and serializing works with a hierarchy
            var hierarchicalChangeSet = node1.serialize({ 'dirtyOnly': true });
            var deserializedNode = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            deserializedNode.deserialize(hierarchicalChangeSet);
            var child1 = deserializedNode._properties.children.getAsArray()[0];
            expect(child1).to.not.equal(undefined);
            var child2 = child1._properties.children.getAsArray()[0];
            expect(child2).to.not.equal(undefined);
            expect(child2._properties.stringProperty.value).to.equal('test');

            // Test that hierarchical modifies work
            node1.cleanDirty();
            node3._properties.stringProperty.value = 'test2';
            var hierarchicalModifyChangeSet = node1.serialize({ 'dirtyOnly': true });

            deserializedNode.applyChangeSet(hierarchicalModifyChangeSet);
            child1 = deserializedNode._properties.children.getAsArray()[0];
            expect(child1).to.not.equal(undefined);
            child2 = child1._properties.children.getAsArray()[0];
            expect(child2).to.not.equal(undefined);
            expect(child2._properties.stringProperty.value).to.equal('test2');
        });

        it('adding a NamedNodeProperty should be possible', function() {
            var set = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0')._properties.children;
            var namedNodeProp = PropertyFactory.create('NamedNodeProperty');
            set.insert(namedNodeProp);

            expect(set.has(namedNodeProp.getGuid())).to.be.true;
            expect(set.get(namedNodeProp.getGuid())).to.equal(namedNodeProp);
        });

        it('path creation and resolution should work for entries of the map', function() {
            var rootNode = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            var node = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            rootNode._properties.children.insert(node);

            // Test whether the returned paths are correct
            expect(node.getAbsolutePath()).to.equal('/children[' + node.getGuid() + ']');
            expect(node.getRelativePath(node)).to.equal('');
            expect(node.getRelativePath(rootNode.resolvePath('children'))).to.equal('[' + node.getGuid() + ']');
            expect(rootNode.getRelativePath(node)).to.equal('../../');

            expect(rootNode.resolvePath('children[' + node.getGuid() + ']')).to.equal(node);
            expect(rootNode.resolvePath('children').resolvePath('[' + node.getGuid() + ']')).to.equal(node);

            // Test whether they are updated correctly
            rootNode._properties.children.remove(node);

            // After removal the old paths should be undefined
            expect(rootNode.resolvePath('children[' + node.getGuid() + ']')).to.be.undefined;
            expect(rootNode.resolvePath('children').resolvePath('[' + node.getGuid() + ']')).to.be.undefined;

            // And the node should have an empty absolute path
            expect(node.getAbsolutePath()).to.equal('/');
        });

        describe('Setting values', function() {
            before(function() {
                var SetValueEntryTemplate = {
                    typeid: 'autodesk.tests:SetValueEntry-1.0.0',
                    inherits: ['NamedProperty'],
                    properties: [{ id: 'string', typeid: 'String' }],
                };

                var SetValueTemplate = {
                    typeid: 'autodesk.tests:SetValue-1.0.0',
                    properties: [{ id: 'set', typeid: 'autodesk.tests:SetValueEntry-1.0.0', context: 'set' }],
                };

                PropertyFactory.register(SetValueEntryTemplate);
                PropertyFactory.register(SetValueTemplate);
            });

            it('should set values for a list of property inputs', function() {
                var setValueEntry1 = PropertyFactory.create('autodesk.tests:SetValueEntry-1.0.0', null, {
                    string: 'I am a string 1',
                });

                var setValueEntry2 = PropertyFactory.create('autodesk.tests:SetValueEntry-1.0.0', null, {
                    string: 'I am a string 2',
                });

                var setValue = PropertyFactory.create('autodesk.tests:SetValue-1.0.0');

                setValue.get('set').setValues([setValueEntry1, setValueEntry2]);

                expect(setValue.get('set').getAsArray().length).to.equal(2);
                expect(setValue.get('set').getAsArray()[0].get('string').getValue()).to.equal('I am a string 1');
                expect(setValue.get('set').getAsArray()[1].get('string').getValue()).to.equal('I am a string 2');
            });

            it('should set values for a list of untyped inputs', function() {
                var setValue = PropertyFactory.create('autodesk.tests:SetValue-1.0.0');

                setValue.get('set').setValues([{ string: 'I am a string 1' }, { string: 'I am a string 2' }]);

                expect(setValue.get('set').getAsArray().length).to.equal(2);
                expect(setValue.get('set').getAsArray()[0].get('string').getValue()).to.equal('I am a string 1');
                expect(setValue.get('set').getAsArray()[1].get('string').getValue()).to.equal('I am a string 2');
            });

            it('should update values for existing keys and create new ones for non-existing keys', function() {
                var setValueEntry1 = PropertyFactory.create('autodesk.tests:SetValueEntry-1.0.0', null, {
                    string: 'I am a string 1',
                });

                var setValueEntry2 = PropertyFactory.create('autodesk.tests:SetValueEntry-1.0.0', null, {
                    string: 'I am a string 2',
                });

                var setValue = PropertyFactory.create('autodesk.tests:SetValue-1.0.0');

                setValue.get('set').setValues([setValueEntry1, setValueEntry2]);
                setValueEntry1.get('string').setValue('I am a string 1, overriden');
                setValue.get('set').setValues([setValueEntry1, setValueEntry2, { string: 'I am a string 3' }]);

                expect(setValue.get('set').getAsArray().length).to.equal(3);
                expect(setValue.get('set').getAsArray()[0].get('string').getValue()).to.equal('I am a string 1, overriden');
                expect(setValue.get('set').getAsArray()[1].get('string').getValue()).to.equal('I am a string 2');
                expect(setValue.get('set').getAsArray()[2].get('string').getValue()).to.equal('I am a string 3');

                setValueEntry2.get('string').setValue('I am a string 2, overriden');
                setValue.get('set').setValues([{ string: 'I am a string 4' }, setValueEntry2]);

                expect(setValue.get('set').getAsArray().length).to.equal(4);
                expect(setValue.get('set').getAsArray()[0].get('string').getValue()).to.equal('I am a string 1, overriden');
                expect(setValue.get('set').getAsArray()[3].get('string').getValue()).to.equal('I am a string 2, overriden');
                expect(setValue.get('set').getAsArray()[1].get('string').getValue()).to.equal('I am a string 3');
                expect(setValue.get('set').getAsArray()[2].get('string').getValue()).to.equal('I am a string 4');
            });
        });
    });

    describe('squashing', function() {
        //
        // Helper function which takes a sequence of callbacks that are successively executed
        // and the changes applied by the callbacks are separately tracked and squashed in a
        // a ChangeSet. This ChangeSet is then compared to the state in the property object
        //
        // Optionally, a a callback which controls the initial state before the squashing can
        // be given as first parameter
        //
        var testChangeSetSquashing = function(in_options) {
            var testProperty = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');

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
            expect(initialChangeset.getSerializedChangeSet()).to.deep.equal(testProperty.serialize());
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
                    expect(changeset['set<NamedProperty>'].children).to.have.all.keys('remove');
                },
            });
        });
        it('of a replace operation should be possible', function() {
            // Create two nodes with the same GUID
            var node1 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            var node2 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            node2._properties.guid.value = node1._properties.guid.value;
            node2._properties.stringProperty.value = 'testString2';

            testChangeSetSquashing({
                pre: function(root) {
                    root._properties.children.insert(node1);
                },
                callbacks: [
                    removeFirstNodeInRoot,
                    function(root) {
                        root._properties.children.insert(node2);
                    },
                ],
                post: function(changeset) {
                    expect(changeset['set<NamedProperty>'].children).to.have.all.keys('remove', 'insert');
                },
            });
        });
    });

    describe('Rebasing', function() {
        var testRebasing = function(in_options) {
            // Prepare the initial state
            var baseProperty1 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            if (in_options.prepare) {
                in_options.prepare(baseProperty1);
            }
            // Create two copies of this state
            var baseProperty2 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            baseProperty2.deserialize(baseProperty1.serialize());
            var baseProperty3 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            baseProperty3.deserialize(baseProperty1.serialize());

            // Make sure the states are clear
            baseProperty1.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
                BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
            baseProperty2.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
                BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
            baseProperty3.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
                BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);

            var initialChangeSet = baseProperty1.serialize();

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
            var node1 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            var node2 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');

            testRebasing({
                prepare: function(root) {
                    root._properties.children.insert(node1);
                    root._properties.children.insert(node2);
                },
                op1: function(root) {
                    root._properties.children.remove(node1);
                },
                op2: function(root) {
                    root._properties.children.remove(node2);
                },
                compareToSequential: true,
            });
        });

        it('with a modify and a remove should possible', function() {
            var node1 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');

            testRebasing({
                prepare: function(root) {
                    root._properties.children.insert(node1);
                },
                op1: modifyLeaf,
                op2: removeFirstNodeInRoot,
                compareToSequential: true,
            });
        });

        it('with a remove and a modify should possible', function() {
            var node1 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');

            testRebasing({
                prepare: function(root) {
                    root._properties.children.insert(node1);
                },
                op1: removeFirstNodeInRoot,
                op2: modifyLeaf,
                compareToSequential: false,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.have.length(1);
                    expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.ENTRY_MODIFIED_AFTER_REMOVE);
                    expect(conflicts[0].path).to.be.equal('children[' + node1.getGuid() + ']');
                    expect(ChangeSet.isEmptyChangeSet(changeSet)).to.be.ok;
                },
            });
        });

        it('with two compatible removes should be possible', function() {
            var node1 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');

            testRebasing({
                prepare: function(root) {
                    root._properties.children.insert(node1);
                },
                op1: function(root) {
                    root._properties.children.remove(node1);
                },
                op2: function(root) {
                    root._properties.children.remove(node1);
                },
                compareToSequential: false,
                checkResult: function(conflicts, changeSet) {
                    expect(ChangeSet.isEmptyChangeSet(changeSet)).to.be.ok;
                },
            });
        });

        it('with two indendent recursive modifies should be possible', function() {
            var node1 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');

            testRebasing({
                prepare: function(root) {
                    root._properties.children.insert(node1);
                },
                op1: function(root) {
                    root._properties.children.getAsArray()[0]._properties.stringProperty.value = 'a';
                },
                op2: function(root) {
                    root._properties.children.getAsArray()[0]._properties.stringProperty2.value = 'a';
                },
                compareToSequential: true,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.be.empty;
                },
            });
        });

        it('with two conflicting recursive modifies should be possible and report a conflict', function() {
            var node1 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');

            testRebasing({
                prepare: function(root) {
                    root._properties.children.insert(node1);
                },
                op1: function(root) {
                    root._properties.children.getAsArray()[0]._properties.stringProperty.value = 'a';
                },
                op2: function(root) {
                    root._properties.children.getAsArray()[0]._properties.stringProperty.value = 'a';
                },
                compareToSequential: true,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.have.length(1);
                    expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
                    expect(conflicts[0].path).to.be.equal('children[' + node1.getGuid() + '].stringProperty');
                },
            });
        });

        it('with modify followed by remove+insert should work', function() {
            var node1;
            testRebasing({
                prepare: function(root) {
                    node1 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');

                    root._properties.children.insert(node1);
                },
                op1: modifyLeaf,
                op2: function(root) {
                    var node2 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
                    node2._properties.guid.value = node1._properties.guid.value;

                    root._properties.children.remove(node1);
                    root._properties.children.insert(node2);
                },
                compareToSequential: true,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.have.length(1);
                    expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.REMOVE_AFTER_MODIFY);
                    expect(conflicts[0].path).to.be.equal('children[' + node1.getGuid() + ']');
                    expect(changeSet['set<NamedProperty>'].children).to.have.all.keys('remove', 'insert');
                },
            });
        });

        it('with remove+insert followed by modify should report conflict', function() {
            var node1 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');

            testRebasing({
                prepare: function(root) {
                    root._properties.children.insert(node1);
                },
                op1: function(root) {
                    var node2 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
                    node2._properties.guid.value = node1._properties.guid.value;

                    root._properties.children.remove(node1);
                    root._properties.children.insert(node2);
                },
                op2: modifyLeaf,
                compareToSequential: false,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.have.length(1);
                    expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.ENTRY_MODIFICATION_AFTER_REMOVE_INSERT);
                    expect(conflicts[0].path).to.be.equal('children[' + node1.getGuid() + ']');
                },
            });
        });

        it('with remove+insert followed by remove+insert should report conflict', function() {
            var node = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            var node1 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            var node2 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');

            node1._properties.guid.value = node._properties.guid.value;
            node2._properties.guid.value = node._properties.guid.value;
            testRebasing({
                prepare: function(root) {
                    root._properties.children.insert(node);
                },
                op1: function(root) {
                    root._properties.children.set(node1);
                },
                op2: function(root) {
                    root._properties.children.set(node2);
                },
                compareToSequential: false,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.have.length(1);
                    expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
                    expect(conflicts[0].path).to.be.equal('children[' + node.getGuid() + ']');
                },
            });
        });

        it('with conflicting inserts should report conflict', function() {
            var node1 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            var node2 = PropertyFactory.create('autodesk.tests:TestPropertyID-1.0.0');
            node2._properties.guid.value = node1._properties.guid.value;

            testRebasing({
                prepare: function(root) {
                },
                op1: function(root) {
                    root._properties.children.insert(node1);
                },
                op2: function(root) {
                    root._properties.children.insert(node2);
                },
                compareToSequential: false,
                checkResult: function(conflicts, changeSet) {
                    expect(ChangeSet.isEmptyChangeSet(changeSet)).to.be.ok;
                    expect(conflicts).to.have.length(1);
                    expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.INSERTED_ENTRY_WITH_SAME_KEY);
                    expect(conflicts[0].path).to.be.equal('children[' + node1.getGuid() + ']');
                },
            });
        });
    });
});
