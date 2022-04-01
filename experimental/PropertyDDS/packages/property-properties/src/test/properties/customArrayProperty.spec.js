/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-unused-expressions, max-nested-callbacks */
/**
 * @fileoverview In this file, we will test the functions of a BaseProperty object
 *    described in /src/properties/baseProperty.js
 */
var PropertyFactory, BaseProperty, OurTestTemplate, OurArrayTestTemplate2, error,
    DeterministicRandomGenerator, _, ChangeSet, deepCopy;

var possibleChanges = {
    0: 'insert',
    1: 'modify',
    2: 'remove',
    3: 'set',
};

var createTestArrayProp = function() {
    return PropertyFactory.create('autodesk.tests:CustomArrayTestID-1.0.0')._properties.MyCustomArray;
};

var createRandomProperty = function() {
    var node1 = PropertyFactory.create('autodesk.tests:TestID-1.0.0');
    node1._properties.MyFloatProp.value = Math.random() * 100;
    node1._properties.MyIntProp.value = Math.random() * 100;
    return node1;
};

describe('CustomArrayProperty', function() {
    /**
     * Get all the objects we need in this test here.
     */
    before(function() {
        PropertyFactory = require('../..').PropertyFactory;
        BaseProperty = require('../..').BaseProperty;
        DeterministicRandomGenerator = require('@fluid-experimental/property-common').DeterministicRandomGenerator;
        ChangeSet = require('@fluid-experimental/property-changeset').ChangeSet;
        _ = require('lodash');
        deepCopy = _.cloneDeep;

        OurTestTemplate = {
            typeid: 'autodesk.tests:TestID-1.0.0',
            properties: [{
                id: 'MyFloatProp', typeid: 'Float32',
            }, {
                id: 'MyIntProp', typeid: 'Int32',
            },
            ],
        };
        PropertyFactory._reregister(OurTestTemplate);

        OurArrayTestTemplate2 = {
            typeid: 'autodesk.tests:CustomArrayTestID-1.0.0',
            properties: [
                { id: 'MyCustomArray', typeid: 'autodesk.tests:TestID-1.0.0', context: 'array' },
                { id: 'SomeOtherProperty', typeid: 'String' },
            ],
        };
        PropertyFactory._reregister(OurArrayTestTemplate2);

        var NamedPropertyWithStringTemplate = {
            typeid: 'autodesk.tests:Array.NamedPropertyWithString-1.0.0',
            inherits: 'NamedProperty',
            properties: [{
                id: 'stringProperty', typeid: 'String',
            }],
        };
        PropertyFactory._reregister(NamedPropertyWithStringTemplate);
    });

    describe('Checking the generalized squash function of a CustomPropertyArrayProperty', function() {
        it('[random number test] should be squashed to the expected changeset', function(done) {
            try {
                var arrayProp = createTestArrayProp();

                var currentArrayLength = 0;

                arrayProp.insertRange(0, [createRandomProperty(), createRandomProperty(),
                createRandomProperty(), createRandomProperty()]);
                arrayProp.cleanDirty();

                // Create a copy of this state
                var arrayPropCopy = createTestArrayProp();
                arrayPropCopy.deserialize(arrayProp.serialize({ 'dirtyOnly': false }));
                arrayPropCopy.cleanDirty();

                for (var i = 0; i < 500; ++i) {
                    currentArrayLength = arrayProp.length;
                    var nextOpType = 'insert';
                    var opOffset = 0;

                    if (currentArrayLength > 0) {
                        nextOpType = possibleChanges[Math.floor(Math.random() * 4)];
                        opOffset = Math.min(Math.floor(Math.random() * currentArrayLength), currentArrayLength - 1);
                    }
                    var opLength = 1 + Math.min(Math.floor(Math.random() * (currentArrayLength - opOffset)),
                        currentArrayLength - opOffset - 1);

                    switch (nextOpType) {
                        case 'remove': {
                            arrayProp.removeRange(opOffset, opLength);
                            break;
                        }
                        case 'insert': {
                            arrayProp.insertRange(opOffset, [createRandomProperty()]);
                            break;
                        }
                        case 'modify': {
                            var childProperty = arrayProp.get(opOffset);
                            childProperty._properties.MyFloatProp.value = Math.random() * 100;
                            childProperty._properties.MyIntProp.value = Math.random() * 100;
                            break;
                        }
                        case 'set': {
                            arrayProp.set(opOffset, createRandomProperty());
                            break;
                        }
                        // no default
                    }

                    var serializedDirtyChanges = arrayProp.serialize({
                        'dirtyOnly': true,
                        'includeRootTypeid': false,
                        'dirtinessType': BaseProperty.MODIFIED_STATE_FLAGS.DIRTY,
                    });
                    var arrayPropTest = createTestArrayProp();
                    arrayPropTest.deserialize(arrayPropCopy.serialize({ 'dirtyOnly': false }));
                    arrayPropTest.cleanDirty();
                    arrayPropTest.applyChangeSet(serializedDirtyChanges);
                }
            } catch (e) {
                error = e;
            } finally {
                expect(error).to.equal(undefined);
                expect(arrayProp).to.not.equal(null);
                expect(arrayProp.serialize({ 'dirtyOnly': false })).to.deep.equal(
                    arrayPropTest.serialize({ 'dirtyOnly': false }));
                done();
            }
        });
    });

    describe('Path resolution', function() {
        it('should work for array properties', function() {
            var arrayParent = PropertyFactory.create('autodesk.tests:CustomArrayTestID-1.0.0');
            var arrayProp = arrayParent._properties.MyCustomArray;

            // prepare initial state
            var entries = [];
            for (var i = 0; i < 10; i++) {
                var entry = PropertyFactory.create('autodesk.tests:TestID-1.0.0');
                entry._properties.MyIntProp.value = i;
                entries.push(entry);
            }

            arrayParent._properties.MyCustomArray.insertRange(0, entries);

            // Make sure that arrray access works
            expect(arrayParent.resolvePath('MyCustomArray[0]')._properties.MyIntProp.value).to.equal(0);
            expect(arrayProp.resolvePath('[2]')._properties.MyIntProp.value).to.equal(2);

            // Test out of bounds access
            expect(arrayParent.resolvePath('MyCustomArray[-1]')).to.be.undefined;
            expect(arrayParent.resolvePath('MyCustomArray[10]')).to.be.undefined;

            var myTestArrayProp = arrayProp.get(5);
            expect(myTestArrayProp.getAbsolutePath()).to.equal('/MyCustomArray[5]');
            expect(myTestArrayProp.getRelativePath(arrayProp)).to.equal('[5]');

            // Test exception on parsing error
            expect(function() { arrayParent.resolvePath('MyCustomArray["abcd"]'); }).to.throw();

            // Test path resolution after insertion
            var newEntry = PropertyFactory.create('autodesk.tests:TestID-1.0.0');
            newEntry._properties.MyIntProp.value = -1;
            arrayParent._properties.MyCustomArray.insertRange(0, [newEntry]);
            expect(arrayParent.resolvePath('MyCustomArray[0]')._properties.MyIntProp.value).to.equal(-1);
            expect(myTestArrayProp.getAbsolutePath()).to.equal('/MyCustomArray[6]');

            // Test path resolution after setting
            // TODO: set currently broken
            var newEntry2 = PropertyFactory.create('autodesk.tests:TestID-1.0.0');
            newEntry2._properties.MyIntProp.value = -2;
            arrayParent._properties.MyCustomArray.set(0, newEntry2);
            expect(arrayParent.resolvePath('MyCustomArray[0]')._properties.MyIntProp.value).to.equal(-2);

            // Test path resolution after removal
            arrayParent._properties.MyCustomArray.removeRange(0, 1);
            expect(arrayParent.resolvePath('MyCustomArray[0]')._properties.MyIntProp.value).to.equal(0);
            expect(myTestArrayProp.getAbsolutePath()).to.equal('/MyCustomArray[5]');

            // Test path resolution after insertion via applyChangeSet
            arrayParent._properties.MyCustomArray.applyChangeSet({
                insert: [[0, [{
                    typeid: 'autodesk.tests:TestID-1.0.0',
                    Float32: {
                        MyFloatProp: 16,
                    },
                    Int32: {
                        MyIntProp: 17,
                    },
                }, {
                    typeid: 'autodesk.tests:TestID-1.0.0',
                    Float32: {
                        MyFloatProp: 18,
                    },
                    Int32: {
                        MyIntProp: 19,
                    },
                }]],
                ],
            });
            expect(arrayParent.resolvePath('MyCustomArray[0]')._properties.MyIntProp.value).to.equal(17);
            expect(myTestArrayProp.getAbsolutePath()).to.equal('/MyCustomArray[7]');

            var serialied = arrayParent._properties.MyCustomArray.serialize({ 'dirtyOnly': false });

            // Test path resolution after removal
            arrayParent._properties.MyCustomArray.applyChangeSet({
                remove: [[0, 1]],
            });
            expect(arrayParent.resolvePath('MyCustomArray[0]')._properties.MyIntProp.value).to.equal(19);
            expect(myTestArrayProp.getAbsolutePath()).to.equal('/MyCustomArray[6]');
            expect(arrayParent.resolvePath('MyCustomArray[11]')).to.be.undefined;

            // Test Path resolution after deserialize
            arrayParent._properties.MyCustomArray.deserialize(serialied);
            expect(arrayParent.resolvePath('MyCustomArray[0]')._properties.MyIntProp.value).to.equal(17);
            expect(arrayParent.resolvePath('MyCustomArray[11]')).not.to.be.undefined;

            arrayParent._properties.MyCustomArray.deserialize({});
            expect(arrayParent.resolvePath('MyCustomArray[0]')).to.be.undefined;
            expect(arrayParent.resolvePath('MyCustomArray[11]')).to.be.undefined;

            // Try multiple levels
            var leaf = PropertyFactory.create('NodeProperty');
            expect(leaf.resolvePath('/')).to.equal(leaf);
            var array1 = PropertyFactory.create('NodeProperty', 'array');
            array1.push(leaf);
            expect(leaf.resolvePath('/')).to.equal(array1);

            var array2 = PropertyFactory.create(undefined, 'array');
            array2.push(array1);
            expect(leaf.resolvePath('/')).to.equal(array2);

            var array3 = PropertyFactory.create(undefined, 'array');
            array3.push(array2);
            expect(leaf.resolvePath('/')).to.equal(array3);
        });
    });

    describe('Sized arrays', function() {
        // Test fix for an issue where custom array templates with non-zero sizes
        // resulted in the array initially containing objects without a parent.
        it('should work for custom array property templates with size specified', function() {
            var TestString = {
                typeid: 'autodesk.test:test.string-1.0.0',
                properties: [
                    { id: 'data', typeid: 'String' },
                ],
            };

            var TestCustomArray = {
                typeid: 'autodesk.test:test.customarray-1.0.0',
                properties: [
                    { id: 'data', typeid: 'autodesk.test:test.string-1.0.0', context: 'array', length: 3 },
                ],
            };
            PropertyFactory._reregister(TestString);
            PropertyFactory._reregister(TestCustomArray);

            var sizedArray = PropertyFactory.create('autodesk.test:test.customarray-1.0.0');
            // Prior to the fix to properly parent initial elements, clear() would result in an exception with
            // the message 'Trying to remove a property from an array that has not the array as parent.'
            var clearArrayFn = function() {
                sizedArray.resolvePath('data').clear();
            };
            expect(clearArrayFn).to.not.throw();
        });
    });

    describe('Commit', function() {
        /* it('should not appear in the changeset when committing a change on its sibling', function() {
          // TODO: This test cannot be implemented in Fluid
          let cm = new HFDM();
          let workspace = cm.createWorkspace();
          let checkoutView = workspace._getCheckoutView();
          let pset = PropertyFactory.create('autodesk.tests:CustomArrayTestID-1.0.0');

          return cm._createRepository({local: true}).then(function(params) {
            return cm._checkoutAttempt(params.branch.getUrn(), checkoutView);
          }).then(function() {
            checkoutView.getRoot().insert('pset', pset);
            return  cm._commit(null, checkoutView);
          }).then(function(commitNode) {

            checkoutView.register('modified', function(cv, changeSet) {
              expect(changeSet).to.not.be.undefined;
              expect(
                changeSet.getSerializedChangeSet()
                          .modify['autodesk.tests:CustomArrayTestID-1.0.0']['array<autodesk.tests:TestID-1.0.0>']
              ).to.not.exist;
            });
            checkoutView.getRoot().resolvePath('pset.SomeOtherProperty').setValue('foobar');
            return cm._commit(null, checkoutView);
          });
        }); */

        describe('Nested collections', function() {
            it('should support squashing of nested maps', function() {
                var nodeProp = PropertyFactory.create('NodeProperty');
                var arrayProp = PropertyFactory.create('array<BaseProperty>');
                var testMap = PropertyFactory.create('map<Bool>');

                nodeProp.insert('array', arrayProp);
                testMap.set('test', true);
                arrayProp.push(testMap);
                var CS1 = nodeProp.serialize({ 'dirtyOnly': false });

                nodeProp.cleanDirty();
                testMap.set('test', false);
                var CS2 = nodeProp.serialize({ 'dirtyOnly': true });

                var CS = new ChangeSet(CS1);
                CS.applyChangeSet(new ChangeSet(CS2));
                var arrayChanges = CS.getSerializedChangeSet().insert['array<>'].array;
                expect(arrayChanges.insert[0][1][0]).to.have.all.keys('insert', 'typeid');
                expect(arrayChanges.insert[0][1][0].insert['test']).to.equal(false);
            });

            it('should support basic rebasing of nested maps', function() {
                var nodeProp = PropertyFactory.create('NodeProperty');
                var arrayProp = PropertyFactory.create('array<BaseProperty>');
                var testMap = PropertyFactory.create('map<Bool>');

                nodeProp.insert('array', arrayProp);
                testMap.set('test', true);
                arrayProp.push(testMap);

                nodeProp.cleanDirty();
                testMap.set('test', false);
                var CS1 = nodeProp.serialize({ 'dirtyOnly': true });
                var CS2 = deepCopy(CS1);

                var CS = new ChangeSet(CS1);
                var conflicts = [];
                CS._rebaseChangeSet(CS2, conflicts);
                expect(conflicts.length).to.equal(1);
                expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
                expect(conflicts[0].path).to.be.equal('array[0][test]');
            });

            it('should be deserializable', function() {
                var testArray = PropertyFactory.create('array<>');
                testArray.push(PropertyFactory.create('array<>'));
                var serialized = testArray.serialize({ 'dirtyOnly': false });

                var testArray2 = PropertyFactory.create('array<>');
                testArray2.deserialize(serialized);
                expect(testArray2.serialize({ 'dirtyOnly': false })).to.deep.equal(testArray.serialize({ 'dirtyOnly': false }));
            });
        });

        describe('deserialize', function() {
            // Returns a sequence of random NamedProperties
            var createRandomEntries = function(in_count) {
                return _.map(_.range(in_count), function() {
                    var property = PropertyFactory.create('autodesk.tests:Array.NamedPropertyWithString-1.0.0');
                    property._properties.stringProperty.value = 'initial';
                    return property;
                });
            };

            // Manually copy the array (we don't use deserialize for the copy
            // here since we want to test that function below and don't want
            // an error here to affect the comparison)
            var manuallyCopyArray = function(arrayProperty) {
                var copiedArray = PropertyFactory.create('autodesk.tests:Array.NamedPropertyWithString-1.0.0',
                    'array');
                var copiedEntries = _.map(arrayProperty.getEntriesReadOnly(), function(entry) {
                    // Create a named property with the same guid
                    var newNode = PropertyFactory.create('autodesk.tests:Array.NamedPropertyWithString-1.0.0');
                    newNode._properties.guid.value = entry.getGuid();
                    newNode._properties.stringProperty.value = entry._properties.stringProperty.value;
                    return newNode;
                });
                copiedArray.insertRange(0, copiedEntries);

                return copiedArray;
            };

            // Prepare the initial state
            var initializeArrayForComparison = function(in_count) {
                // Create an array with named properties
                var arrayProperty = PropertyFactory.create('NamedProperty', 'array');
                var entries = createRandomEntries(in_count);
                arrayProperty.insertRange(0, entries);

                var copiedArray = manuallyCopyArray(arrayProperty);

                return {
                    original: arrayProperty,
                    copy: copiedArray,
                };
            };

            // Counts the changes in the array
            var countChanges = function(in_testArray) {
                // First create a copy of the copy to check afterwards whether the changeset is correct
                var copy2 = manuallyCopyArray(in_testArray.copy);

                // deserialize the changes into the copied array property
                in_testArray.copy.cleanDirty();
                var deserialized = in_testArray.copy.deserialize(in_testArray.original.serialize({ 'dirtyOnly': false }));

                expect(in_testArray.copy.serialize({ 'dirtyOnly': false })).to.deep.equal(
                    in_testArray.original.serialize({ 'dirtyOnly': false }));
                expect(deserialized).to.deep.equal(in_testArray.copy.serialize({ 'dirtyOnly': true }));

                // Make sure the returned ChangeSet is correct
                copy2.applyChangeSet(deserialized);
                expect(copy2.serialize({ 'dirtyOnly': false })).to.deep.equal(
                    in_testArray.original.serialize({ 'dirtyOnly': false }));

                // Count insert, modify and remove operations
                var insertedCount = _.reduce(deserialized.insert, function(last, insertedRange) {
                    return last + insertedRange[1].length;
                }, 0);
                var removedCount = _.reduce(deserialized.remove, function(last, removedRange) {
                    return last + removedRange[1];
                }, 0);
                var modifiedCount = _.reduce(deserialized.modify, function(last, modifiedRange) {
                    return last + modifiedRange[1].length;
                }, 0);

                return {
                    insertedCount: insertedCount,
                    removedCount: removedCount,
                    modifiedCount: modifiedCount,
                    totalCount: insertedCount + removedCount + modifiedCount,
                    insertedRanges: deserialized.insert ? deserialized.insert.length : 0,
                    removedRanges: deserialized.remove ? deserialized.remove.length : 0,
                    modifiedRanges: deserialized.modify ? deserialized.modify.length : 0,
                };
            };

            it('should report an empty ChangeSet for deserialize without changes', function() {
                var testArray = initializeArrayForComparison(50);

                // Check the returned ChangeSet
                var changed = countChanges(testArray);
                expect(changed).to.deep.equal({
                    insertedCount: 0,
                    removedCount: 0,
                    modifiedCount: 0,
                    totalCount: 0,
                    insertedRanges: 0,
                    removedRanges: 0,
                    modifiedRanges: 0,
                });
            });

            it('should report an empty ChangeSet for a length 0 array', function() {
                var testArray = initializeArrayForComparison(0);

                // Check the returned ChangeSet
                var changed = countChanges(testArray);
                expect(changed).to.deep.equal({
                    insertedCount: 0,
                    removedCount: 0,
                    modifiedCount: 0,
                    totalCount: 0,
                    insertedRanges: 0,
                    removedRanges: 0,
                    modifiedRanges: 0,
                });
            });

            it('should report a compact ChangeSet for simple move in an array of NamedProperties', function() {
                var testArray = initializeArrayForComparison(50);

                // Move a segment in the array
                var entries = [
                    testArray.original.get(45),
                    testArray.original.get(46),
                    testArray.original.get(47),
                ];
                testArray.original.removeRange(45, 3);
                testArray.original.insertRange(3, entries);

                // Check the returned ChangeSet
                var changed = countChanges(testArray);
                expect(changed).to.deep.equal({
                    insertedCount: 3,
                    removedCount: 3,
                    modifiedCount: 0,
                    totalCount: 6,
                    insertedRanges: 1,
                    removedRanges: 1,
                    modifiedRanges: 0,
                });
            });

            it('should report a compact ChangeSet for simple inserts in an array of NamedProperties', function() {
                var testArray = initializeArrayForComparison(50);

                testArray.original.insertRange(0, createRandomEntries(5));
                testArray.original.insertRange(25, createRandomEntries(5));
                testArray.original.insertRange(testArray.original.length, createRandomEntries(5));

                var changed = countChanges(testArray);
                expect(changed).to.deep.equal({
                    insertedCount: 15,
                    removedCount: 0,
                    modifiedCount: 0,
                    totalCount: 15,
                    insertedRanges: 3,
                    removedRanges: 0,
                    modifiedRanges: 0,
                });
            });

            it('should report a compact ChangeSet for simple removes in an array of NamedProperties', function() {
                var testArray = initializeArrayForComparison(50);

                testArray.original.removeRange(0, 5);
                testArray.original.removeRange(15, 5);
                testArray.original.removeRange(testArray.original.length - 5, 5);

                var changed = countChanges(testArray);
                expect(changed).to.deep.equal({
                    insertedCount: 0,
                    removedCount: 15,
                    modifiedCount: 0,
                    totalCount: 15,
                    insertedRanges: 0,
                    removedRanges: 3,
                    modifiedRanges: 0,
                });
            });

            it('should report a compact ChangeSet for simple replaces in an array of NamedProperties', function() {
                var testArray = initializeArrayForComparison(50);

                testArray.original.removeRange(0, 5);
                testArray.original.insertRange(0, createRandomEntries(5));

                testArray.original.removeRange(15, 5);
                testArray.original.insertRange(15, createRandomEntries(5));

                testArray.original.removeRange(testArray.original.length - 5, 5);
                testArray.original.insertRange(testArray.original.length, createRandomEntries(5));

                var changed = countChanges(testArray);
                expect(changed).to.deep.equal({
                    insertedCount: 15,
                    removedCount: 15,
                    modifiedCount: 0,
                    totalCount: 30,
                    insertedRanges: 3,
                    removedRanges: 3,
                    modifiedRanges: 0,
                });
            });

            it('should report a compact ChangeSet for modifies after inserts and removes', function() {
                var testArray = initializeArrayForComparison(50);

                testArray.original.removeRange(5, 5);
                testArray.original.get(7)._properties.stringProperty.value = 'NewValue1';
                testArray.original.insertRange(10, createRandomEntries(5));
                testArray.original.get(20)._properties.stringProperty.value = 'NewValue2';
                testArray.original.get(21)._properties.stringProperty.value = 'NewValue3';
                testArray.original.get(22)._properties.stringProperty.value = 'NewValue4';

                var changed = countChanges(testArray);
                expect(changed).to.deep.equal({
                    insertedCount: 5,
                    removedCount: 5,
                    modifiedCount: 4,
                    totalCount: 14,
                    insertedRanges: 1,
                    removedRanges: 1,
                    modifiedRanges: 2,
                });
            });

            it('should report a compact ChangeSet for a randomized array of NamedProperties', function() {
                var generator = new DeterministicRandomGenerator('931cff4d-392f-2f41-5c52-2e17965270dc');
                this.timeout(90000);

                for (var i = 0; i < 20; i++) {
                    var numInitialEntries = generator.irandom(300);
                    var testArray = initializeArrayForComparison(numInitialEntries);

                    // Perform modifications to the array
                    var numModification = generator.irandom(10);
                    var modifiedEntries = 0;
                    for (var j = 0; j < numModification; j++) {
                        switch (generator.irandom(3)) {
                            case 0:
                                // Remove entries from the array
                                if (testArray.original.length > 0) {
                                    var rangeStart = generator.irandom(testArray.original.length);
                                    var rangeLength = generator.irandom(testArray.original.length - rangeStart - 1) + 1;
                                    testArray.original.removeRange(rangeStart, rangeLength);

                                    modifiedEntries += rangeLength;
                                }
                                break;
                            case 1:
                                // Insert entries into the array
                                var rangeStart = generator.irandom(testArray.original.length + 1);
                                var rangeLength = generator.irandom(50);
                                testArray.original.insertRange(rangeStart, createRandomEntries(rangeLength));

                                modifiedEntries += rangeLength;
                                break;
                            case 2:
                                if (testArray.original.length > 0) {
                                    // Modify entries in the array
                                    var rangeStart = generator.irandom(testArray.original.length);
                                    var rangeLength = generator.irandom(testArray.original.length - rangeStart);
                                    for (var j = rangeStart; j < rangeStart + rangeLength; j++) {
                                        testArray.original.get(j)._properties.stringProperty.value += 'modified';
                                    }

                                    modifiedEntries += rangeLength;
                                }
                                break;
                            default:
                                throw new Error('Should never happen');
                        }
                    }

                    // Check whether the reported changes are as compact as the modifications
                    var changed = countChanges(testArray);

                    // Make sure the reported ChangeSet is not longer than the acutally performed modifications
                    expect(changed.totalCount).to.be.at.most(modifiedEntries);
                }
            });
        });
    });
});
