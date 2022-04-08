/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-unused-expressions */
/**
 * @fileoverview In this file, we will test the Int64ArrayProperty
 *    object described in /src/properties/arrayProperty.js
 */

describe('Int64ArrayProperty', function() {
    var PropertyFactory, BaseProperty, ChangeSet, MSG;
    var changeSetWithEntries, removalChangeSet;
    var myInt64Prop, Int64;

    before(function() {
        // Get all the objects we need in this test here.
        PropertyFactory = require('../..').PropertyFactory;
        BaseProperty = require('../..').BaseProperty;
        ChangeSet = require('@fluid-experimental/property-changeset').ChangeSet;
        Int64 = require('@fluid-experimental/property-common').Int64;
        MSG = require('@fluid-experimental/property-common').constants.MSG;

        // Register a template with a set property for the tests
        var SimpleInt64TestPropertyTemplate = {
            typeid: 'autodesk.tests:SimpleInt64TestProperty-1.0.0',
            properties: [
                { id: 'int64Property', typeid: 'Int64', context: 'array' },
            ],
        };
        PropertyFactory._reregister(SimpleInt64TestPropertyTemplate);

        myInt64Prop = PropertyFactory.create('Int64', 'array');
    });

    // Inserts an Int64 value into the array
    var insertInt64Value = function(int64Prop) {
        int64Prop.insertRange(0, [new Int64(0, 1)]);
    };

    // Removes the first element from the array
    var removeArrayElement = function(int64Prop) {
        int64Prop.removeRange(0, 1);
    };

    // Modifies an array value
    var modifyInt64Value = function(int64Prop) {
        int64Prop.setRange(0, [new Int64(0, 2)]);
    };

    describe('Testing creation, assignment and serialization', function() {
        it('should be empty at the beginning', function() {
            expect(myInt64Prop.length).to.equal(0);
            expect(myInt64Prop.serialize({ 'dirtyOnly': true })).to.be.empty;
            expect(myInt64Prop.serialize({ 'dirtyOnly': false })).to.be.empty;
        });

        it('should be possible to insert into the 64 bit array', function() {
            // Text insertion
            myInt64Prop.insertRange(0, [new Int64(1, 2), '12345678987654321']);
            expect(myInt64Prop.get(0)).to.deep.equal(new Int64(1, 2));
            myInt64Prop.insertRange(2, [5]);
            expect(myInt64Prop.get(1)).to.deep.equal(new Int64(1653732529, 2874452));
            changeSetWithEntries = myInt64Prop.serialize({ 'dirtyOnly': true });
            expect(myInt64Prop.serialize({ 'dirtyOnly': false })).to.deep.equal(
                { insert: [[0, [[1, 2], [1653732529, 2874452], [5, 0]]]] });
            expect(myInt64Prop.serialize({ 'dirtyOnly': true })).to.deep.equal(
                { insert: [[0, [[1, 2], [1653732529, 2874452], [5, 0]]]] });
        });

        it('should be possible to set values in the 64 bit array', function() {
            myInt64Prop.setRange(0, [1, '123', new Int64(2, 2)]);
            expect(myInt64Prop.get(0)).to.deep.equal(new Int64(1, 0));
            myInt64Prop.setRange(2, [new Int64(4, 5)]);
            changeSetWithEntries = myInt64Prop.serialize({ 'dirtyOnly': true });
            expect(myInt64Prop.serialize({ 'dirtyOnly': false })).to.deep.equal(
                { insert: [[0, [[1, 0], [123, 0], [4, 5]]]] });
            expect(myInt64Prop.serialize({ 'dirtyOnly': true })).to.deep.equal(
                { insert: [[0, [[1, 0], [123, 0], [4, 5]]]] });
        });

        it('.setRange should throw an error when in_offset is not an integer', function() {
            expect(() => { myInt64Prop.setRange('test', [new Int64(2, 2)]); })
                .to.throw(MSG.NOT_NUMBER);
        });

        it('.setRange should throw an error when in_array is not an array', function() {
            expect(() => { myInt64Prop.setRange(0, new Int64(2, 2)); })
                .to.throw(MSG.IN_ARRAY_NOT_ARRAY + 'Int64ArrayProperty.setRange');
        });

        it('Should handle removals correctly', function() {
            myInt64Prop.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY);
            myInt64Prop.removeRange(0, 2);
            expect(myInt64Prop.get(0)).to.deep.equal(new Int64(4, 5));
            removalChangeSet = myInt64Prop.serialize({
                'dirtyOnly': true,
                'includeRootTypeid': false,
                'dirtinessType': BaseProperty.MODIFIED_STATE_FLAGS.DIRTY,
            });
            expect(removalChangeSet).to.have.all.keys(['remove']);
            expect(removalChangeSet.remove).to.have.length(1);
            expect(removalChangeSet.remove[0]).to.deep.equal([0, 2]);
        });

        it('Should support deserialization', function() {
            var deserializedNode = PropertyFactory.create('Int64', 'array');
            var deserializedChanges1 = deserializedNode.deserialize(changeSetWithEntries);
            expect(deserializedChanges1).to.deep.equal(changeSetWithEntries);

            var deserializedChanges3 = deserializedNode.deserialize({});
            expect(deserializedChanges3).to.deep.equal({ remove: [[0, 3]] });
        });

        it('inserting at a bad position should throw an exception', function() {
            expect(function() {
                myInt64Prop.insertRange(2242, new Int64(4, 5));
            }).to.throw();
        });

        it('Should support applying changeset', function() {
            var node = PropertyFactory.create('Int64', 'array');
            node._applyChangeset(changeSetWithEntries);
            expect(node.get(0)).to.deep.equal(new Int64(1));
            expect(node.serialize()).to.deep.equal(
                { insert: [[0, [[1, 0], [123, 0], [4, 5]]]] });
        });
    });

    describe('change set specification should be met', function() {
        it('Should handle push correctly', function() {
            var t = PropertyFactory.create('Int64', 'array');
            t.insertRange(0, [new Int64(1, 2), new Int64(3, 4)]);
            t.cleanDirty();
            t.push(new Int64(4, 5));
            expect(t.serialize({ 'dirtyOnly': true })).to.deep.equal(
                {
                    'insert': [[2, [[4, 5]]]],
                },
            );
        });

        it('Should handle modifies correctly', function() {
            var t = PropertyFactory.create('Int64', 'array');
            t.insertRange(0, [new Int64(1, 2), new Int64(3, 4)]);
            t.cleanDirty();
            t.set(1, new Int64(4, 5));
            expect(t.serialize({ 'dirtyOnly': true })).to.deep.equal(
                {
                    'modify': [[1, [[4, 5]]]],
                },
            );
        });
    });

    describe('squashing', function() {
        // Helper function to test the squashing for different containers
        var innerTestChangeSetSquashing = function(io_testProperty, io_int64Property,
            io_initialChangeset, in_options, in_collection) {
            var squashedChangeset = new ChangeSet();
            io_initialChangeset.setIsNormalized(true);
            io_testProperty.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
                BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
            var callbacks = in_options.callbacks;
            for (var i = 0; i < callbacks.length; i++) {
                callbacks[i](io_int64Property);
                var changes = io_testProperty.serialize({ 'dirtyOnly': true });
                io_testProperty.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
                    BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
                squashedChangeset.applyChangeSet(changes);
            }

            if (in_options.post) {
                var SC = squashedChangeset.getSerializedChangeSet();
                if (in_collection && SC.modify) {
                    SC = SC.modify;
                }
                in_options.post(SC);
            }
            io_initialChangeset.applyChangeSet(squashedChangeset.getSerializedChangeSet());
        };

        //
        // Helper function which takes a sequence of callbacks that are successively executed
        // and the changes applied by the callbacks are separately tracked and squashed in a
        // a ChangeSet. This ChangeSet is then compared to the state in the property object
        //
        // Optionally, a a callback which controls the initial state before the squashing can
        // be given as first parameter
        //
        var testChangeSetSquashing = function(in_options) {
            var testProperty = PropertyFactory.create('autodesk.tests:SimpleInt64TestProperty-1.0.0');

            if (in_options.pre) {
                in_options.pre(testProperty._properties.int64Property);
            }

            var initialChangeset = new ChangeSet(testProperty.serialize({ 'dirtyOnly': false }));
            initialChangeset.setIsNormalized(true);

            innerTestChangeSetSquashing(testProperty,
                testProperty._properties.int64Property, initialChangeset, in_options);

            var initialChangeset = initialChangeset.getSerializedChangeSet();
            if (ChangeSet.isEmptyChangeSet(initialChangeset)) {
                // if one is empty the other should be empty, too
                expect(testProperty.serialize({ 'dirtyOnly': false })).to.be.empty;
            } else {
                // else they must be deep equal
                expect(initialChangeset['array<Int64>'].int64Property).to.deep.equal(
                    testProperty.serialize({ 'dirtyOnly': false })['array<Int64>'].int64Property);
            }
        };

        it('should work for multiple independent inserts', function() {
            testChangeSetSquashing({ callbacks: [insertInt64Value, insertInt64Value, insertInt64Value] });
        });

        it('should work for inserts followed by removes', function() {
            testChangeSetSquashing({
                callbacks: [insertInt64Value, insertInt64Value, removeArrayElement, removeArrayElement],
                post: function(changeset) {
                    expect(changeset).to.be.empty;
                },
            });
        });

        it('should work for mixed modifies and inserts', function() {
            testChangeSetSquashing({
                callbacks: [insertInt64Value, modifyInt64Value, insertInt64Value, modifyInt64Value],
            });
        });

        it('an insert, modify and a remove should give an empty changeset', function() {
            testChangeSetSquashing({
                callbacks: [insertInt64Value, modifyInt64Value, removeArrayElement],
                post: function(changeset) {
                    expect(changeset).to.be.empty;
                },
            });
        });
        it('work for modifies after an already existing insert', function() {
            testChangeSetSquashing({
                pre: insertInt64Value,
                callbacks: [modifyInt64Value, modifyInt64Value],
            });
        });
        it('of modify and remove after an already existing insert should work', function() {
            testChangeSetSquashing({
                pre: insertInt64Value,
                callbacks: [modifyInt64Value, removeArrayElement],
                post: function(changeset) {
                    expect(changeset['array<Int64>'].int64Property).to.have.all.keys('remove');
                },
            });
        });
    });

    describe('Rebasing', function() {
        var createPropertyForRebaseTestByTemplate = function() {
            return PropertyFactory.create('autodesk.tests:SimpleInt64TestProperty-1.0.0');
        };

        var getint64PropertyFromNode = function(in_testProperty) {
            return in_testProperty._properties.int64Property;
        };

        var testRebasingInner = function(in_creator, in_getInnerProperty, in_options, in_isCollection) {
            // Prepare the initial state
            var baseProperty1 = in_creator();
            if (in_options.prepare) {
                in_options.prepare(in_getInnerProperty(baseProperty1));
            }
            // Create two copies of this state
            var baseProperty2 = in_creator();
            baseProperty2.deserialize(baseProperty1.serialize({ 'dirtyOnly': false }));
            var baseProperty3 = in_creator();
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
                in_options.op1(in_getInnerProperty(baseProperty1));
            }
            if (in_options.op2) {
                in_options.op2(in_getInnerProperty(baseProperty2));
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
                    in_options.op1(in_getInnerProperty(baseProperty3));
                }
                if (in_options.op2) {
                    in_options.op2(in_getInnerProperty(baseProperty3));
                }
                var finalChangeSet = baseProperty3.serialize({ 'dirtyOnly': false });
                if (in_isCollection && finalChangeSet.insert) {
                    finalChangeSet = finalChangeSet.insert;
                }

                var combinedSerialized = combinedChangeSet.getSerializedChangeSet();
                if (ChangeSet.isEmptyChangeSet(combinedSerialized)) {
                    // if one is empty the other should be empty, too
                    expect(finalChangeSet).to.be.empty;
                } else {
                    // else they must be deep equal
                    expect(combinedSerialized['array<Int64>'].int64Property).to.deep.equal(
                        finalChangeSet['array<Int64>'].int64Property);
                }
            }

            if (in_options.checkResult) {
                if (in_isCollection && changeSet2.modify) {
                    changeSet2 = changeSet2.modify;
                }
                in_options.checkResult(conflicts, changeSet2, combinedChangeSet);
            }
        };

        var testRebasing = function(in_options) {
            testRebasingInner(createPropertyForRebaseTestByTemplate, getint64PropertyFromNode, in_options);
        };

        it('with a NOP should be possible', function() {
            testRebasing({
                op2: insertInt64Value,
                compareToSequential: true,
            });
        });

        it('with independent inserts should be possible', function() {
            testRebasing({
                op1: insertInt64Value,
                op2: insertInt64Value,
                compareToSequential: true,
            });
        });

        it('with independent removes should be possible', function() {
            testRebasing({
                prepare: function(root) {
                    insertInt64Value(root);
                    insertInt64Value(root);
                },
                op1: function(root) {
                    root.removeRange(1, 1);
                },
                op2: function(root) {
                    root.removeRange(0, 1);
                },
                compareToSequential: true,
            });
        });

        it('with a modify and a remove should possible', function() {
            testRebasing({
                prepare: insertInt64Value,
                op1: modifyInt64Value,
                op2: removeArrayElement,
                compareToSequential: true,
            });
        });

        it('with a remove and a modify should possible', function() {
            testRebasing({
                prepare: insertInt64Value,
                op1: removeArrayElement,
                op2: modifyInt64Value,
                compareToSequential: false,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.have.length(1);
                    expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.ENTRY_MODIFIED_AFTER_REMOVE);
                    expect(conflicts[0].path).to.be.equal('int64Property');
                },
            });
        });

        it('with two compatible removes should be possible', function() {
            testRebasing({
                prepare: insertInt64Value,
                op1: removeArrayElement,
                op2: removeArrayElement,
                compareToSequential: false,
                checkResult: function(conflicts, changeSet) {
                    expect(ChangeSet.isEmptyChangeSet(changeSet)).to.be.ok;
                },
            });
        });

        it('with two independent modifies should be possible', function() {
            testRebasing({
                prepare: function(root) {
                    root.insertRange(0, [new Int64(9, 8), new Int64(11, 21)]);
                },
                op1: modifyInt64Value,
                op2: function(root) {
                    root.setRange(1, [new Int64(5, 6)]);
                },
                compareToSequential: true,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.be.empty;
                },
            });
        });

        it('with two conflicting modifies should be possible and report a conflict', function() {
            testRebasing({
                prepare: insertInt64Value,
                op1: function(int64Prop) {
                    int64Prop.setRange(0, [new Int64(0, 64)]);
                },
                op2: modifyInt64Value,
                compareToSequential: true,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.have.length(1);
                    expect(changeSet['array<Int64>'].int64Property.modify[0][1]).to.deep.equal([[0, 2]]);
                    expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
                    expect(conflicts[0].path).to.be.equal('int64Property');
                },
            });
        });

        it('with modify followed by remove+insert should work', function() {
            testRebasing({
                prepare: insertInt64Value,
                op1: modifyInt64Value,
                op2: function(root) {
                    removeArrayElement(root);
                    insertInt64Value(root);
                },
                compareToSequential: true,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.have.length(1);
                    expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.REMOVE_AFTER_MODIFY);
                    expect(conflicts[0].path).to.be.equal('int64Property');
                    expect(changeSet['array<Int64>'].int64Property).to.have.all.keys('remove', 'insert');
                },
            });
        });

        it('with remove + insert followed by modify should report conflict', function() {
            testRebasing({
                prepare: insertInt64Value,
                op1: function(root) {
                    removeArrayElement(root);
                    insertInt64Value(root);
                },
                op2: modifyInt64Value,
                compareToSequential: false,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.have.length(1);
                    expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.ENTRY_MODIFIED_AFTER_REMOVE);
                    expect(conflicts[0].path).to.be.equal('int64Property');
                },
            });
        });

        it('with conflicting inserts should report conflict', function() {
            testRebasing({
                prepare: insertInt64Value,
                op1: insertInt64Value,
                op2: insertInt64Value,
                compareToSequential: false,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.have.length(1);
                    expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.INSERTED_ENTRY_WITH_SAME_KEY);
                    expect(conflicts[0].path).to.be.equal('int64Property');
                },
            });
        });
    });
});
