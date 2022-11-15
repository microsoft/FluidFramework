/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* globals assert */

/**
 * @fileoverview In this file, we will test the functions of 64 bit integer properties
 * described in /src/shared/property_sets/properties/int_property.js
 */

var PropertyFactory, nodeProp, containedInt64Prop, directInt64Prop, Int64, Uint64,
    BaseProperty, ChangeSet, TestInt64ArrayTemplate, MSG;

describe('Test Int64Property', function() {
    /**
     * Get all the objects we need in this test here.
     */
    before(function() {
        PropertyFactory = require('../..').PropertyFactory;
        BaseProperty = require('../..').BaseProperty;
        ChangeSet = require('@fluid-experimental/property-changeset').ChangeSet;
        Int64 = require('@fluid-experimental/property-common').Int64;
        Uint64 = require('@fluid-experimental/property-common').Uint64;
        MSG = require('@fluid-experimental/property-common').constants.MSG;

        TestInt64ArrayTemplate = {
            typeid: 'autodesk.tests:Int64TestID-1.0.0',
            properties: [
                { id: 'myInt64', typeid: 'Int64' },
                { id: 'myUint64', typeid: 'Uint64' },
            ],
        };
        PropertyFactory._reregister(TestInt64ArrayTemplate);

        nodeProp = PropertyFactory.create('autodesk.tests:Int64TestID-1.0.0');
        containedInt64Prop = nodeProp._properties.myInt64;
        directInt64Prop = PropertyFactory.create('Int64');
    });

    it('should correctly set/get the values', function() {
        containedInt64Prop.setValueHigh(33);
        containedInt64Prop.setValueLow(22);
        expect(containedInt64Prop.getValueLow()).to.be.equal(22);
        expect(containedInt64Prop.getValueHigh()).to.be.equal(33);
        expect(containedInt64Prop.value.getValueLow()).to.be.equal(22);
        expect(containedInt64Prop.value.getValueHigh()).to.be.equal(33);
        containedInt64Prop.value = new Int64(11, 12);
        expect(containedInt64Prop.getValueLow()).to.be.equal(11);
        expect(containedInt64Prop.getValueHigh()).to.be.equal(12);
        expect(containedInt64Prop.value.getValueLow()).to.be.equal(11);
        expect(containedInt64Prop.value.getValueHigh()).to.be.equal(12);

        // changing the value inderectly should be impossible
        expect(containedInt64Prop.value.setValueLow).to.not.exist;
        expect(containedInt64Prop.value.setValueHigh).to.not.exist;
    });

    it('should correctly setValue when passed a number', function() {
        const prop = PropertyFactory.create('Int64');
        const value = 123;
        prop.setValue(value);
        expect(prop.getValueLow()).to.equal(value);
        expect(prop.getValueHigh()).to.equal(0);
        expect(prop.toString()).to.equal(value.toString());
    });

    it('should correctly setValue when passed a negative number', function() {
        const prop = PropertyFactory.create('Int64');
        const value = -123;
        prop.setValue(value);
        expect(prop.toString()).to.equal(value.toString());
    });

    it('should correctly setValue when passed a large number (above MAX_SAFE_INT)', function() {
        const prop = PropertyFactory.create('Int64');
        const value = Math.pow(2, 53) - 1000;
        prop.setValue(value);

        expect(prop.toString()).to.equal(value.toString());
        expect(prop.getValueLow()).to.equal(4294966296);
        expect(prop.getValueHigh()).to.equal(2097151);
    });

    it('should correctly setValue when passed a large negative number (below MIN_SAFE_INT)', function() {
        const prop = PropertyFactory.create('Int64');
        const value = -Math.pow(2, 53) + 1000;
        prop.setValue(value);

        expect(prop.toString()).to.equal(value.toString());
        expect(prop.getValueLow()).to.equal(1000);
        expect(prop.getValueHigh()).to.equal(-2097152);
    });

    it('should correctly setValue when passed a string', function() {
        const prop = PropertyFactory.create('Int64');
        prop.setValue('1234567890');
        expect(prop.toString()).to.equal('1234567890');
    });

    it('should throw error when passed a string with non numbers', function() {
        const prop = PropertyFactory.create('Int64');
        expect(prop.setValue.bind(prop, 'error')).to.throw(MSG.CANNOT_PARSE_INVALID_CHARACTERS + 'error');
    });

    it('should correctly convert to string', function() {
        containedInt64Prop.value = new Int64(4294967295, 2147483647); // 2^63-1
        expect(containedInt64Prop.toString()).to.be.equal('9223372036854775807');

        containedInt64Prop.value = new Int64(0, 2147483648); // -2^63
        expect(containedInt64Prop.toString()).to.be.equal('-9223372036854775808');

        containedInt64Prop.value = new Int64(845094001, 1810905006);
        expect(containedInt64Prop.toString()).to.be.equal('7777777777777777777');

        containedInt64Prop.value = new Int64(845094001, 0);
        expect(containedInt64Prop.toString()).to.be.equal('845094001');

        containedInt64Prop.value = new Int64(0, 845094001);
        expect(containedInt64Prop.toString()).to.be.equal('3629651096340791296');

        containedInt64Prop.value = new Int64(0, 0xFFFFFFFF);
        expect(containedInt64Prop.toString()).to.be.equal('-4294967296');

        containedInt64Prop.value = new Int64(0xFFFFFFFF, 0xFFFFFFFF);
        expect(containedInt64Prop.toString()).to.be.equal('-1');
    });

    it('int64.fromString should work correctly', function() {
        containedInt64Prop.value = new Int64(0, 0);
        expect(containedInt64Prop.toString()).to.be.equal('0');

        containedInt64Prop.fromString('3629651096340791296');
        expect(containedInt64Prop.value.getValueHigh()).to.be.equal(845094001);
        expect(containedInt64Prop.value.getValueLow()).to.be.equal(0);

        containedInt64Prop.fromString('9223372036854775807');
        expect(containedInt64Prop.value.getValueHigh()).to.be.equal(2147483647);
        expect(containedInt64Prop.value.getValueLow()).to.be.equal(4294967295);

        containedInt64Prop.fromString('-1');
        expect(containedInt64Prop.toString()).to.be.equal('-1');

        containedInt64Prop.fromString('0');
        expect(containedInt64Prop.toString()).to.be.equal('0');

        containedInt64Prop.fromString('18446744073709551615');
        expect(containedInt64Prop.value.getValueHigh()).to.be.equal(0xFFFFFFFF);
        expect(containedInt64Prop.value.getValueLow()).to.be.equal(0xFFFFFFFF);
    });

    it('should correctly serialize/deserialize', function() {
        containedInt64Prop.value = new Int64(11, 12);

        var serialized = containedInt64Prop.serialize({ 'dirtyOnly': true });
        expect(serialized).to.deep.equal([11, 12]);
        containedInt64Prop.cleanDirty();
        serialized = containedInt64Prop.serialize({ 'dirtyOnly': true });
        assert.deepEqual(serialized, {});

        var deserializeResult = directInt64Prop.deserialize(containedInt64Prop.serialize({ 'dirtyOnly': false }));
        expect(deserializeResult).to.deep.equal([11, 12]);
        deserializeResult = directInt64Prop.deserialize(containedInt64Prop.serialize({ 'dirtyOnly': false }));
        expect(deserializeResult).to.not.exist;
        expect(directInt64Prop.getValueLow()).to.be.equal(11);
        expect(directInt64Prop.getValueHigh()).to.be.equal(12);

        var otherNodeProp = PropertyFactory.create('autodesk.tests:Int64TestID-1.0.0');
        otherNodeProp.deserialize(nodeProp.serialize({ 'dirtyOnly': false }));
        expect(otherNodeProp._properties.myInt64.getValueLow()).to.be.equal(11);
        expect(otherNodeProp._properties.myInt64.getValueHigh()).to.be.equal(12);
    });

    it('should correctly dirty on set', function() {
        directInt64Prop.cleanDirty();
        expect(directInt64Prop.isDirty()).to.be.false;
        directInt64Prop.value = new Int64(32, 42);
        expect(directInt64Prop.isDirty()).to.be.true;

        directInt64Prop.cleanDirty();
        expect(directInt64Prop.isDirty()).to.be.false;
        directInt64Prop.setValueHigh(66);
        expect(directInt64Prop.isDirty()).to.be.true;
        directInt64Prop.cleanDirty();
        directInt64Prop.setValueHigh(66);
        expect(directInt64Prop.isDirty()).to.be.false;

        directInt64Prop.cleanDirty();
        expect(directInt64Prop.isDirty()).to.be.false;
        directInt64Prop.setValueLow(33);
        expect(directInt64Prop.isDirty()).to.be.true;
        directInt64Prop.cleanDirty();
        directInt64Prop.setValueLow(33);
        expect(directInt64Prop.isDirty()).to.be.false;
    });

    it('should not violate the ChangeSet Specificaton', function() {
        containedInt64Prop.value = new Int64(32, 42);
        nodeProp._properties.myUint64.value = new Uint64(99, 110);
        expect(nodeProp.serialize({ 'dirtyOnly': false })).to.deep.equal(
            {
                Int64: {
                    myInt64: [32, 42],
                },
                Uint64: {
                    myUint64: [99, 110],
                },
            },
        );
    });

    describe('squashing', function() {
        // Helper function to test the squashing for different containers
        var innerTestChangeSetSquashing = function(io_testProperty, io_intProperty,
            io_initialChangeset, in_options, in_collection) {
            var squashedChangeset = new ChangeSet();
            io_testProperty.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
                BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
            var callbacks = in_options.callbacks;
            for (var i = 0; i < callbacks.length; i++) {
                callbacks[i](io_intProperty);
                var changes = io_testProperty.serialize({ 'dirtyOnly': true });
                io_testProperty.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
                    BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
                squashedChangeset.applyChangeSet(changes);
                // regression test for not-deep-copying array changes
                if (changes.modify) {
                    changes.modify.Int64.intProperty[0] = 888;
                } else {
                    changes.Int64.myInt64[0] = 999;
                }
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
            var testProperty = PropertyFactory.create('autodesk.tests:Int64TestID-1.0.0');
            var nodeTestProperty = PropertyFactory.create('NodeProperty');
            var int64InNodeProperty = PropertyFactory.create('Int64');
            nodeTestProperty.insert('intProperty', int64InNodeProperty);
            var mapTestProperty = PropertyFactory.create('map<>');
            var int64InMapProperty = PropertyFactory.create('Int64');
            mapTestProperty.insert('intProperty', int64InMapProperty);

            if (in_options.pre) {
                in_options.pre(testProperty._properties.intProperty);
                in_options.pre(int64InNodeProperty);
                in_options.pre(int64InMapProperty);
            }

            var initialChangeset = new ChangeSet(testProperty.serialize({ 'dirtyOnly': false }));
            initialChangeset.setIsNormalized(true);
            var initialChangesetNode = new ChangeSet(nodeTestProperty.serialize({ 'dirtyOnly': false }));
            initialChangesetNode.setIsNormalized(true);
            var initialChangesetMap = new ChangeSet(mapTestProperty.serialize({ 'dirtyOnly': false }));
            initialChangesetMap.setIsNormalized(true);

            innerTestChangeSetSquashing(testProperty,
                testProperty._properties.myInt64, initialChangeset, in_options);
            innerTestChangeSetSquashing(nodeTestProperty,
                int64InNodeProperty, initialChangesetNode, in_options, true);
            innerTestChangeSetSquashing(mapTestProperty,
                int64InMapProperty, initialChangesetMap, in_options, true);

            var initialChangeset = initialChangeset.getSerializedChangeSet().Int64.intProperty;
            expect(initialChangeset).to.deep.equal(testProperty.serialize({ 'dirtyOnly': false }).Int64.intProperty);

            var nodeInitialChangeset = initialChangesetNode.getSerializedChangeSet().insert.Int64.intProperty;
            expect(nodeInitialChangeset).to.deep.equal(nodeTestProperty.serialize(
                { 'dirtyOnly': false }).insert.Int64.intProperty);

            var mapInitialChangeset = initialChangesetMap.getSerializedChangeSet().insert.Int64.intProperty;
            expect(mapInitialChangeset).to.deep.equal(mapTestProperty.serialize(
                { 'dirtyOnly': false }).insert.Int64.intProperty);
        };

        it('should correctly squash 64bit properties', function() {
            testChangeSetSquashing({
                callbacks: [
                    function(io_prop) {
                        io_prop.setValueHigh(1);
                    },
                    function(io_prop) {
                        io_prop.setValueHigh(2);
                    },
                ],
            });
        });

        it('should correctly squash low/high 64bit property changes', function() {
            testChangeSetSquashing({
                callbacks: [
                    function(io_prop) {
                        io_prop.setValueHigh(1);
                    },
                    function(io_prop) {
                        io_prop.setValueLow(2);
                    },
                ],
            });
        });

        it('should squash two ChangeSets, one inserts the other modifies the same Int64 property', function() {
            var nodeTestProperty = PropertyFactory.create('NodeProperty');
            var int64Property = PropertyFactory.create('Int64');
            nodeTestProperty.insert('myProp', int64Property);

            var changeSet1 = new ChangeSet(nodeTestProperty.serialize({ dirtyOnly: true }));

            nodeTestProperty.cleanDirty();
            nodeTestProperty.resolvePath('myProp').setValueHigh(100);
            var changeSet2 = new ChangeSet(nodeTestProperty.serialize({ dirtyOnly: true }));

            var nodeTestProperty = PropertyFactory.create('NodeProperty');
            var int64Property = PropertyFactory.create('Int64');
            int64Property.setValueHigh(100);
            nodeTestProperty.insert('myProp', int64Property);
            var expectedChangeSet = nodeTestProperty.serialize({ dirtyOnly: true });

            changeSet1.applyChangeSet(changeSet2);

            expect(
                changeSet1.getSerializedChangeSet().insert.Int64.myProp ===
                changeSet2.getSerializedChangeSet().modify.Int64.myProp,
            ).to.be.false;
            expect(changeSet1.getSerializedChangeSet()).to.eql(expectedChangeSet);
        });

        it('should squash two ChangeSets, one inserts the other modifies the same Int64 property', function() {
            var nodeTestProperty = PropertyFactory.create('NodeProperty');
            var Uint64Property = PropertyFactory.create('Uint64');
            nodeTestProperty.insert('myProp', Uint64Property);

            var changeSet1 = new ChangeSet(nodeTestProperty.serialize({ dirtyOnly: true }));

            nodeTestProperty.cleanDirty();
            nodeTestProperty.resolvePath('myProp').setValueHigh(100);
            var changeSet2 = new ChangeSet(nodeTestProperty.serialize({ dirtyOnly: true }));

            var nodeTestProperty = PropertyFactory.create('NodeProperty');
            var Uint64Property = PropertyFactory.create('Uint64');
            Uint64Property.setValueHigh(100);
            nodeTestProperty.insert('myProp', Uint64Property);
            var expectedChangeSet = nodeTestProperty.serialize({ dirtyOnly: true });

            changeSet1.applyChangeSet(changeSet2);

            expect(
                changeSet1.getSerializedChangeSet().insert.Uint64.myProp ===
                changeSet2.getSerializedChangeSet().modify.Uint64.myProp,
            ).to.be.false;
            expect(changeSet1.getSerializedChangeSet()).to.eql(expectedChangeSet);
        });
    });

    describe('rebasing', function() {
        var createPropertyForRebaseTestByTemplate = function() {
            return PropertyFactory.create('autodesk.tests:Int64TestID-1.0.0');
        };

        var createNodePropertyForRebase = function() {
            var nodeTestProperty = PropertyFactory.create('NodeProperty');
            var int64InNodeProperty = PropertyFactory.create('Int64');
            nodeTestProperty.insert('myInt64', int64InNodeProperty);
            return nodeTestProperty;
        };

        var createMapPropertyForRebase = function() {
            var mapTestProperty = PropertyFactory.create('map<>');
            var int64InNodeProperty = PropertyFactory.create('Int64');
            mapTestProperty.insert('myInt64', int64InNodeProperty);
            return mapTestProperty;
        };

        var getIntPropertyFromNode = function(in_testProperty) {
            return in_testProperty._properties.myInt64;
        };

        var getIntPropertyFromMap = function(in_testProperty) {
            return in_testProperty.get('myInt64');
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
                if (in_isCollection && combinedSerialized.insert) {
                    combinedSerialized = combinedSerialized.insert;
                }

                expect(combinedSerialized).to.deep.equal(finalChangeSet);
            }

            if (in_options.checkResult) {
                if (in_isCollection && changeSet2.modify) {
                    changeSet2 = changeSet2.modify;
                }
                in_options.checkResult(conflicts, changeSet2, combinedChangeSet);
            }
        };

        var testRebasing = function(in_options) {
            testRebasingInner(createPropertyForRebaseTestByTemplate, getIntPropertyFromNode, in_options);
            testRebasingInner(createNodePropertyForRebase, getIntPropertyFromNode, in_options, true);
            testRebasingInner(createMapPropertyForRebase, getIntPropertyFromMap, in_options, true);
        };

        it('with two modifies should be possible and report a conflict', function() {
            testRebasing({
                op1: function(io_prop) {
                    io_prop.setValueHigh(1);
                },
                op2: function(io_prop) {
                    io_prop.setValueHigh(2);
                },
                compareToSequential: true,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.have.length(1);
                    expect(changeSet.Int64.myInt64).to.deep.equal([0, 2]);
                    expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
                },
            });
        });

        it('with low/high modifies should be possible and report a conflict', function() {
            testRebasing({
                op1: function(io_prop) {
                    io_prop.setValueHigh(1);
                },
                op2: function(io_prop) {
                    io_prop.setValueLow(2);
                },
                compareToSequential: false,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.have.length(1);
                    expect(changeSet.Int64.myInt64).to.deep.equal([2, 0]);
                    expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
                },
            });
        });
    });
});
