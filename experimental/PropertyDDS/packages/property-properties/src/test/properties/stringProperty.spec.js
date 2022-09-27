/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview In this file, we will test the string property object described in /src/properties/stringProperty.js
 */

const { ChangeSet } = require('@fluid-experimental/property-changeset');
const { MSG } = require('@fluid-experimental/property-common').constants;
const _ = require('lodash');
const { PropertyFactory } = require('../..');
const { BaseProperty } = require('../..');
const deepCopy = _.cloneDeep;

describe('StringProperty', function() {
    var changeSetWithEntries, removalChangeSet;
    var myStringProp;

    before(function() {
        // Register a template with a set property for the tests
        var SimpleStringTestPropertyTemplate = {
            typeid: 'autodesk.tests:SimpleStringTestProperty-1.0.0',
            properties: [
                { id: 'stringProperty', typeid: 'String' },
            ],
        };
        PropertyFactory._reregister(SimpleStringTestPropertyTemplate);

        myStringProp = PropertyFactory.create('String');
    });

    // Inserts a char into the string
    var insertText = function(stringProp) {
        stringProp.insertRange(0, 'x');
    };

    // Removes the first char from the string
    var removeText = function(stringProp) {
        stringProp.removeRange(0, 1);
    };

    // Modifies the text
    var modifyText = function(stringProp) {
        stringProp.setRange(0, 'y');
    };

    // set the text to a given string
    var setText = function(stringProp) {
        stringProp.value = 's';
    };

    describe('Testing creation, assignment and serialization', function() {
        it('should be empty at the beginning', function() {
            expect(myStringProp.value).to.equal('');
            expect(myStringProp.getValue()).to.equal('');
            expect(myStringProp.serialize({ 'dirtyOnly': true })).to.be.empty;
            expect(myStringProp.serialize({ 'dirtyOnly': false })).to.equal('');
        });

        it('should be possible to insert into the string', function() {
            // Text insertion
            myStringProp.insertRange(0, 'abef');
            expect(myStringProp.value).to.equal('abef');
            expect(myStringProp.getValue()).to.equal('abef');
            myStringProp.insertRange(2, 'cd');
            expect(myStringProp.value).to.equal('abcdef');
            expect(myStringProp.getValue()).to.equal('abcdef');
            changeSetWithEntries = myStringProp.serialize({ 'dirtyOnly': true });
            expect(myStringProp.serialize({ 'dirtyOnly': false })).to.equal('abcdef');
            var CS = myStringProp.serialize({ 'dirtyOnly': true });
            expect(CS.insert &&
                CS.insert[0] &&
                CS.insert[0][1] === 'abcdef').to.be.ok;
        });

        it('Should handle removals correctly', function() {
            myStringProp.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY);
            myStringProp.removeRange(3, 2);
            expect(myStringProp.value).to.equal('abcf');
            expect(myStringProp.getValue()).to.equal('abcf');
            removalChangeSet = myStringProp._serialize(true, false, BaseProperty.MODIFIED_STATE_FLAGS.DIRTY);
            expect(removalChangeSet).to.have.all.keys(['remove']);
            expect(removalChangeSet.remove).to.have.length(1);
            expect(removalChangeSet.remove[0]).to.deep.equal([3, 2]);
        });

        it('Should support deserialization', function() {
            var deserializedNode = PropertyFactory.create('String');
            var deserializedChanges1 = deserializedNode.deserialize(changeSetWithEntries);
            expect(deserializedChanges1).to.deep.equal(changeSetWithEntries);

            var deserializedChanges2 = deserializedNode.deserialize(changeSetWithEntries);
            expect(ChangeSet.isEmptyChangeSet(deserializedChanges2)).to.be.ok;

            var deserializedChanges3 = deserializedNode.deserialize({});
            expect(deserializedChanges3).to.deep.equal({ remove: [[0, 6]] });

            deserializedNode.deserialize(changeSetWithEntries); // refill
            var deserializedChanges4 = deserializedNode.deserialize('');
            expect(deserializedChanges4).to.deep.equal('');
        });

        it('inserting at a bad position should throw an exception', function() {
            expect(function() {
                myStringProp.insertRange(2242, 'x');
            }).to.throw();
        });

        it('insert after set should work', function() {
            var testString = PropertyFactory.create('String');
            testString.value = 'A';
            testString.insertRange(0, 'B');
            expect(testString.value).to.equal('BA');
            expect(testString.getValue()).to.equal('BA');
            expect(testString.serialize({ 'dirtyOnly': true })).to.equal('BA');
        });

        it('remove after set should work', function() {
            var testString = PropertyFactory.create('String');
            testString.value = 'ABCD';
            testString.removeRange(1, 2);
            expect(testString.value).to.equal('AD');
            expect(testString.getValue()).to.equal('AD');
            expect(testString.serialize({ 'dirtyOnly': true })).to.equal('AD');
        });

        it('modify after set should work', function() {
            var testString = PropertyFactory.create('String');
            testString.value = 'ABCD';
            testString.setRange(1, 'XY');
            expect(testString.value).to.equal('AXYD');
            expect(testString.getValue()).to.equal('AXYD');
            expect(testString.serialize({ 'dirtyOnly': true })).to.equal('AXYD');
        });

        it('set must stay a set', function() {
            var testString = PropertyFactory.create('String');
            testString.value = 'ABCD';
            expect(testString.serialize({ 'dirtyOnly': true })).to.equal('ABCD');
            testString.cleanDirty();
            testString.value = 'XY';
            expect(testString.serialize({ 'dirtyOnly': true })).to.equal('XY');
            testString.insertRange(2, 'Z');
            expect(testString.serialize({ 'dirtyOnly': true })).to.equal('XYZ');
        });

        it('.get should return a single letter', function() {
            var testString = PropertyFactory.create('String');
            testString.value = 'ABCD';
            expect(testString.get(2)).to.equal('C');
        });

        it('.getFullTypeid should return a string of the typeid', function() {
            var testString = PropertyFactory.create('String');
            expect(testString.getFullTypeid()).to.equal('String');
        });

        it('.insert should insert a string', function() {
            var testString = PropertyFactory.create('String');
            testString.setValue('AAAAA');
            testString.insert(1, 'BB');
            expect(testString.getValue()).to.equal('ABBAAAA');
        });

        it('.insertRange should insert a string', function() {
            var testString = PropertyFactory.create('String');
            testString.setValue('AAAAA');
            testString.insertRange(1, 'BB');
            expect(testString.getValue()).to.equal('ABBAAAA');
        });

        it('Should report dirtiness correctly when introducing a modification in certain order', function() {
            testString = PropertyFactory.create('String');
            let newValue = "test";
            const node = PropertyFactory.create('NodeProperty');
            node.insert('stringProp', testString);
            // Ignore insert changeset
            node.cleanDirty();
            node.applyChangeSet(JSON.parse(`{"modify":{"String":{"stringProp":{"value":"${newValue}","oldValue": ""}}}}`));
            node.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
            node.cleanDirty();
            let oldValue = newValue;
            newValue = "test1";
            node.applyChangeSet(JSON.parse(`{"modify":{"String":{"stringProp":{"value":"${newValue}","oldValue": "${oldValue}"}}}}`));
            node.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
            expect(Object.keys(node._serialize(true, false, 2))).to.have.length(1);
        });

        it('.insertRange should also accept an array with a single string', function() {
            var testString = PropertyFactory.create('String');
            testString.setValue('AAAAA');
            testString.insertRange(1, ['BC']);
            expect(testString.getValue()).to.equal('ABCAAAA');
        });

        it('.insertRange should join an array with more than one string', function() {
            var testString = PropertyFactory.create('String');
            testString.setValue('AAAAA');
            testString.insertRange(1, ['B', 'C', 'D']);
            expect(testString.getValue()).to.equal('ABCDAAAA');
        });

        it('.push should add a string to the end of the original string and return the length of the string', function() {
            var testString = PropertyFactory.create('String');
            testString.setValue('AAAAA');
            testString.push('BB');
            expect(testString.getValue()).to.equal('AAAAABB');
            expect(testString.push('CC')).to.equal(9);
        });
    });

    describe('inherited API methods', function() {
        it('.clear should remove all values from the string', function() {
            var testString = PropertyFactory.create('String');
            testString.setValue('AAAAA');
            expect(testString.getValue()).to.equal('AAAAA');
            testString.clear();
            expect(testString.getValue()).to.equal('');
        });

        it('.getEntriesReadOnly should return a string', function() {
            var testString = PropertyFactory.create('String');
            testString.setValue('AAAAA');
            expect(testString.getEntriesReadOnly()).to.equal('AAAAA');
        });

        it('.getIds should return an array of string ids', function() {
            var testString = PropertyFactory.create('String');
            testString.setValue('AAAAA');
            expect(testString.getIds()).to.deep.equal(['0', '1', '2', '3', '4']);
        });

        it('.getLength should return the length of the string', function() {
            var testString = PropertyFactory.create('String');
            expect(testString.getLength()).to.equal(0);
            testString.setValue('AAAAA');
            expect(testString.getLength()).to.equal(5);
        });

        it('.pop should remove the last letter', function() {
            var testString = PropertyFactory.create('String');
            testString.setValue('ABCDE');
            testString.pop();
            expect(testString.getValue()).to.equal('ABCD');
        });

        it('.remove should remove a single letter', function() {
            var testString = PropertyFactory.create('String');
            testString.setValue('ABCDE');
            testString.remove(2);
            expect(testString.getValue()).to.equal('ABDE');
            expect(testString.remove(1)).to.equal('B');
        });

        it('removeRange should remove a range of letters', function() {
            var testString = PropertyFactory.create('String');
            testString.setValue('ABCDEFG');
            testString.removeRange(1, 2);
            expect(testString.getValue()).to.equal('ADEFG');
            expect(testString.removeRange(2, 3)).to.equal('EFG');
        });

        it('@regression removeRange should clear a value longer than the special value "setAsLiteral"', function() {
            var testString = PropertyFactory.create('String');
            testString.setValue('AAAAAAAAAAAAAAAAAA');
            testString.removeRange(0, testString.getValue().length);
            expect(testString.getValue()).to.equal('');
        });

        it('set should set a single character', function() {
            var testString = PropertyFactory.create('String');
            testString.setValue('ABCDEFG');
            testString.set(3, 'x');
            expect(testString.getValue()).to.equal('ABCxEFG');
        });

        it('set should not allow setting more than one character', function() {
            var testString = PropertyFactory.create('String');
            testString.setValue('ABCDEFG');

            expect(function() { testString.set(0, 'ab'); }).to.throw(MSG.STRING_SET_ONE_CHAR);
        });

        it('set should throw if in_offset is not an integer', function() {
            var testString = PropertyFactory.create('String');
            testString.setValue('ABCDEFG');

            expect(function() { testString.set('test', 'a'); }).to.throw(MSG.STRING_SET_NEEDS_INDEX);
        });

        it('setRange should replace a range of letters', function() {
            var testString = PropertyFactory.create('String');
            testString.setValue('ABCDEFG');
            testString.setRange(3, 'xx');
            expect(testString.getValue()).to.equal('ABCxxFG');
        });

        it('setRange should throw if trying to set out of range', function() {
            var testString = PropertyFactory.create('String');
            testString.setValue('ABCDEFG');
            var fn = function() {
                testString.setRange(5, 'xxxxxx');
            };
            expect(fn).to.throw();
        });

        it('setRange should throw if in_offset is not an integer', function() {
            var testString = PropertyFactory.create('String');
            testString.setValue('ABCDEFG');
            var fn = function() {
                testString.setRange('test', 'xx');
            };
            expect(fn).to.throw(MSG.NOT_NUMBER);
        });

        it('shift should remove a single letter at the beginning of the string', function() {
            var testString = PropertyFactory.create('String');
            testString.setValue('ABCDEFG');
            testString.shift();
            expect(testString.getValue()).to.equal('BCDEFG');
            expect(testString.shift()).to.equal('B');
        });

        it('unshift should add letters at the beginning of a string and return the length of the string', function() {
            var testString = PropertyFactory.create('String');
            testString.setValue('ABC');
            testString.unshift('DE');
            expect(testString.getValue()).to.equal('DEABC');
            expect(testString.unshift('FGH')).to.equal(8);
        });
    });

    describe('change set specification should be met', function() {
        it('Should handle inserts correctly', function() {
            var t = PropertyFactory.create('String');
            t.value = 'test';
            t.cleanDirty();
            t.insert(2, '_test_');
            expect(t.serialize({ 'dirtyOnly': true })).to.deep.equal(
                {
                    'insert': [[2, '_test_']],
                },
            );
        });

        it('Should handle push correctly', function() {
            var t = PropertyFactory.create('String');
            t.value = 'test';
            t.cleanDirty();
            t.push('_test_');
            expect(t.serialize({ 'dirtyOnly': true })).to.deep.equal(
                {
                    'insert': [[4, '_test_']],
                },
            );
        });

        it('Should handle modifies correctly', function() {
            var t = PropertyFactory.create('String');
            t.value = 'test';
            t.cleanDirty();
            t.setRange(1, '_x_');
            expect(t.serialize({ 'dirtyOnly': true })).to.deep.equal(
                {
                    'modify': [[1, '_x_']],
                },
            );
        });
    });

    describe('squashing', function() {
        // Helper function to test the squashing for different containers
        var innerTestChangeSetSquashing = function(io_testProperty, io_stringProperty,
            io_initialChangeset, in_options, in_collection) {
            var squashedChangeset = new ChangeSet();
            io_testProperty.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
                BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
            var callbacks = in_options.callbacks;
            for (var i = 0; i < callbacks.length; i++) {
                callbacks[i](io_stringProperty);
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
            var testProperty = PropertyFactory.create('autodesk.tests:SimpleStringTestProperty-1.0.0');
            var nodeTestProperty = PropertyFactory.create('NodeProperty');
            var stringInNodeProperty = PropertyFactory.create('String');
            nodeTestProperty.insert('stringProperty', stringInNodeProperty);
            var mapTestProperty = PropertyFactory.create('map<>');
            var stringInMapProperty = PropertyFactory.create('String');
            mapTestProperty.insert('stringProperty', stringInMapProperty);

            if (in_options.pre) {
                in_options.pre(testProperty._properties.stringProperty);
                in_options.pre(stringInNodeProperty);
                in_options.pre(stringInMapProperty);
            }

            var initialChangeset = new ChangeSet(testProperty.serialize());
            initialChangeset.setIsNormalized(true);
            var initialChangesetNode = new ChangeSet(nodeTestProperty.serialize());
            initialChangesetNode.setIsNormalized(true);
            var initialChangesetMap = new ChangeSet(mapTestProperty.serialize());
            initialChangesetMap.setIsNormalized(true);

            innerTestChangeSetSquashing(testProperty,
                testProperty._properties.stringProperty, initialChangeset, in_options);
            innerTestChangeSetSquashing(nodeTestProperty,
                stringInNodeProperty, initialChangesetNode, in_options, true);
            innerTestChangeSetSquashing(mapTestProperty,
                stringInMapProperty, initialChangesetMap, in_options, true);

            if (!initialChangeset.getSerializedChangeSet().String) {
                // empty changeset
                expect(testProperty.serialize().String.stringProperty).to.equal('');
            } else {
                // according to the spec, the String changeset can either be a string or (insert|modify|remove) style
                var initialChangesetString = initialChangeset.getSerializedChangeSet().String.stringProperty;
                if (!_.isString(initialChangesetString)) {
                    initialChangesetString = initialChangesetString.insert[0][1];
                }
                expect(initialChangesetString).to.deep.equal(testProperty.serialize().String.stringProperty);
            }

            if (!initialChangesetNode.getSerializedChangeSet().insert) {
                // empty changeset
                expect(nodeTestProperty.serialize().insert.String.stringProperty).to.equal('');
            } else {
                // according to the spec, the String changeset can either be a string or (insert|modify|remove) style
                var nodeInitialChangesetString = initialChangesetNode.getSerializedChangeSet()
                    .insert.String.stringProperty;
                if (!_.isString(nodeInitialChangesetString)) {
                    nodeInitialChangesetString = nodeInitialChangesetString.insert[0][1];
                }
                expect(nodeInitialChangesetString).to.deep.equal(nodeTestProperty.serialize()
                    .insert.String.stringProperty);
            }

            if (!initialChangesetMap.getSerializedChangeSet().insert) {
                // empty changeset
                expect(mapTestProperty.serialize().insert.String.stringProperty).to.equal('');
            } else {
                // according to the spec, the String changeset can either be a string or (insert|modify|remove) style
                var mapInitialChangesetString = initialChangesetMap.getSerializedChangeSet()
                    .insert.String.stringProperty;
                if (!_.isString(mapInitialChangesetString)) {
                    mapInitialChangesetString = mapInitialChangesetString.insert[0][1];
                }
                expect(mapInitialChangesetString).to.deep.equal(mapTestProperty.serialize().insert.String.stringProperty);
            }
        };

        it('should work for multiple independent inserts', function() {
            testChangeSetSquashing({ callbacks: [insertText, insertText, insertText] });
        });

        it('should work for inserts followed by removes', function() {
            testChangeSetSquashing({
                callbacks: [insertText, insertText, removeText, removeText],
                post: function(changeset) {
                    expect(changeset).to.be.empty;
                },
            });
        });

        it('should work for mixed modifies and inserts', function() {
            testChangeSetSquashing({
                callbacks: [insertText, modifyText, insertText, modifyText],
            });
        });

        it('an insert, modify and a remove should give an empty changeset', function() {
            testChangeSetSquashing({
                callbacks: [insertText, modifyText, removeText],
                post: function(changeset) {
                    expect(changeset).to.be.empty;
                },
            });
        });
        it('work for modifies after an already existing insert', function() {
            testChangeSetSquashing({
                pre: insertText,
                callbacks: [modifyText, modifyText],
            });
        });
        it('of modify and remove after an already existing insert should work', function() {
            testChangeSetSquashing({
                pre: insertText,
                callbacks: [modifyText, removeText],
                post: function(changeset) {
                    expect(changeset.String.stringProperty).to.have.all.keys('remove');
                },
            });
        });

        it('modify after set should work', function() {
            testChangeSetSquashing({
                callbacks: [setText, modifyText],
                post: function(changeset) {
                    expect(changeset.String.stringProperty).to.equal('y');
                },
            });
        });

        it('set after pre-insert and insert should work', function() {
            testChangeSetSquashing({
                pre: insertText,
                callbacks: [insertText, modifyText, setText],
                post: function(changeset) {
                    expect(changeset.String.stringProperty).to.equal('s');
                },
            });
        });

        it('insert after set should work', function() {
            testChangeSetSquashing({
                callbacks: [setText, insertText],
                post: function(changeset) {
                    expect(changeset.String.stringProperty).to.equal('xs');
                },
            });
        });

        it('insert, set, insert/modify should work', function() {
            testChangeSetSquashing({
                callbacks: [insertText, setText, insertText, modifyText],
                post: function(changeset) {
                    expect(changeset.String.stringProperty).to.equal('ys');
                },
            });
        });

        it('insert, set, insert/modify, set should work', function() {
            testChangeSetSquashing({
                callbacks: [insertText, setText, insertText, modifyText, setText],
                post: function(changeset) {
                    expect(changeset.String.stringProperty).to.equal('s');
                },
            });
        });
    });

    describe('Rebasing', function() {
        var createPropertyForRebaseTestByTemplate = function() {
            return PropertyFactory.create('autodesk.tests:SimpleStringTestProperty-1.0.0');
        };

        var createNodePropertyForRebase = function() {
            var nodeTestProperty = PropertyFactory.create('NodeProperty');
            var stringInNodeProperty = PropertyFactory.create('String');
            nodeTestProperty.insert('stringProperty', stringInNodeProperty);
            return nodeTestProperty;
        };

        var createMapPropertyForRebase = function() {
            var mapTestProperty = PropertyFactory.create('map<>');
            var stringInNodeProperty = PropertyFactory.create('String');
            mapTestProperty.insert('stringProperty', stringInNodeProperty);
            return mapTestProperty;
        };

        var getStringPropertyFromNode = function(in_testProperty) {
            return in_testProperty._properties.stringProperty;
        };

        var getStringPropertyFromMap = function(in_testProperty) {
            return in_testProperty.get('stringProperty');
        };

        var testRebasingInner = function(in_creator, in_getInnerProperty, in_options, in_isCollection) {
            // Prepare the initial state
            var baseProperty1 = in_creator();
            if (in_options.prepare) {
                in_options.prepare(in_getInnerProperty(baseProperty1));
            }
            // Create two copies of this state
            var baseProperty2 = in_creator();
            baseProperty2.deserialize(baseProperty1._serialize(false));
            var baseProperty3 = in_creator();
            baseProperty3.deserialize(baseProperty1._serialize(false));

            // Make sure the states are clear
            baseProperty1.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
                BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
            baseProperty2.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
                BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
            baseProperty3.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
                BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);

            var initialChangeSet = baseProperty1._serialize(false);

            // Apply the operations to the two properties in parallel
            if (in_options.op1) {
                in_options.op1(in_getInnerProperty(baseProperty1));
            }
            if (in_options.op2) {
                in_options.op2(in_getInnerProperty(baseProperty2));
            }

            // Get the ChangeSets
            var changeSet1 = new ChangeSet(baseProperty1._serialize(true));
            var changeSet2 = baseProperty2._serialize(true);

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
                var finalChangeSet = baseProperty3._serialize(false);
                if (in_isCollection && finalChangeSet.insert) {
                    finalChangeSet = finalChangeSet.insert;
                }

                var combinedSerialized = combinedChangeSet.getSerializedChangeSet();
                if (in_isCollection && combinedSerialized.insert) {
                    combinedSerialized = combinedSerialized.insert;
                }

                if (!combinedSerialized.String) {
                    // empty changeset
                    expect(finalChangeSet.String.stringProperty).to.equal('');
                } else {
                    // according to the spec, the String changeset can either be a string or (insert|modify|remove) style
                    var combinedChangeSetString = combinedSerialized.String.stringProperty;
                    if (!_.isString(combinedChangeSetString)) {
                        combinedChangeSetString = combinedChangeSetString.insert[0][1];
                    }
                    expect(combinedChangeSetString).to.deep.equal(finalChangeSet.String.stringProperty);
                }
            }

            if (in_options.checkResult) {
                if (in_isCollection && changeSet2.modify) {
                    changeSet2 = changeSet2.modify;
                }
                combinedChangeSet = combinedChangeSet.getSerializedChangeSet();
                if (in_isCollection && combinedChangeSet.insert) {
                    combinedChangeSet = combinedChangeSet.insert;
                }
                in_options.checkResult(conflicts, changeSet2, combinedChangeSet);
            }
        };

        var testRebasing = function(in_options) {
            testRebasingInner(createPropertyForRebaseTestByTemplate, getStringPropertyFromNode, in_options);
            testRebasingInner(createNodePropertyForRebase, getStringPropertyFromNode, in_options, true);
            testRebasingInner(createMapPropertyForRebase, getStringPropertyFromMap, in_options, true);
        };

        it('with a NOP should be possible', function() {
            testRebasing({
                op2: insertText,
                compareToSequential: true,
            });
        });

        it('with independent inserts should be possible', function() {
            testRebasing({
                op1: insertText,
                op2: insertText,
                compareToSequential: true,
            });
        });

        it('with independent removes should be possible', function() {
            testRebasing({
                prepare: function(root) {
                    insertText(root);
                    insertText(root);
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
                prepare: insertText,
                op1: modifyText,
                op2: removeText,
                compareToSequential: true,
            });
        });

        it('with a remove and a modify should possible', function() {
            testRebasing({
                prepare: insertText,
                op1: removeText,
                op2: modifyText,
                compareToSequential: false,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.have.length(1);
                    expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.ENTRY_MODIFIED_AFTER_REMOVE);
                    expect(conflicts[0].path).to.be.equal('stringProperty');
                },
            });
        });

        it('with two compatible removes should be possible', function() {
            testRebasing({
                prepare: insertText,
                op1: removeText,
                op2: removeText,
                compareToSequential: false,
                checkResult: function(conflicts, changeSet) {
                    expect(ChangeSet.isEmptyChangeSet(changeSet)).to.be.ok;
                },
            });
        });

        it('with two independent modifies should be possible', function() {
            testRebasing({
                prepare: function(root) {
                    root.insertRange(0, 'ab');
                },
                op1: modifyText,
                op2: function(root) {
                    root.setRange(1, 'z');
                },
                compareToSequential: true,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.be.empty;
                },
            });
        });
        // TODO: test with the same value
        it('with two conflicting modifies should be possible and report a conflict', function() {
            testRebasing({
                prepare: insertText,
                op1: function(stringProp) {
                    stringProp.setRange(0, 'j');
                },
                op2: modifyText,
                compareToSequential: true,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.have.length(1);
                    expect(changeSet.String.stringProperty.modify[0][1]).to.equal('y');
                    expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
                    expect(conflicts[0].path).to.be.equal('stringProperty');
                },
            });
        });

        it('with modify followed by remove+insert should work', function() {
            testRebasing({
                prepare: insertText,
                op1: modifyText,
                op2: function(root) {
                    removeText(root);
                    insertText(root);
                },
                compareToSequential: true,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.have.length(1);
                    expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.REMOVE_AFTER_MODIFY);
                    expect(conflicts[0].path).to.be.equal('stringProperty');
                    expect(changeSet.String.stringProperty).to.have.all.keys('remove', 'insert');
                },
            });
        });

        it('with remove + insert followed by modify should report conflict', function() {
            testRebasing({
                prepare: insertText,
                op1: function(root) {
                    removeText(root);
                    insertText(root);
                },
                op2: modifyText,
                compareToSequential: false,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.have.length(1);
                    expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.ENTRY_MODIFIED_AFTER_REMOVE);
                    expect(conflicts[0].path).to.be.equal('stringProperty');
                },
            });
        });

        it('with conflicting inserts should report conflict', function() {
            testRebasing({
                prepare: insertText,
                op1: insertText,
                op2: insertText,
                compareToSequential: false,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.have.length(1);
                    expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.INSERTED_ENTRY_WITH_SAME_KEY);
                    expect(conflicts[0].path).to.be.equal('stringProperty');
                },
            });
        });

        it('with conflicting remove and insert should keep the insert and move it to the correct position', function() {
            testRebasing({
                prepare: function(p) {
                    p.insertRange(0, '0123456');
                },
                op1: function(p) {
                    p.removeRange(2, 5);
                },
                op2: function(p) {
                    p.insertRange(5, 't');
                },
                compareToSequential: false,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.have.length(0);
                    expect(changeSet).to.deep.equal({
                        'String': { stringProperty: { insert: [[2, 't']] } },
                    });
                },
            });
        });

        it('with touching remove and insert should not report conflict and keep them', function() {
            testRebasing({
                prepare: function(p) {
                    p.insertRange(0, '0123456');
                },
                op1: function(p) {
                    p.removeRange(2, 3);
                },
                op2: function(p) {
                    p.insertRange(5, 'b');
                    p.insertRange(2, 'a');
                },
                compareToSequential: false,
                checkResult: function(conflicts, rebasedCS2, combinedChangeSet) {
                    expect(conflicts).to.have.length(0);
                    expect(rebasedCS2).to.deep.equal({ 'String': { stringProperty: { insert: [[2, 'ab']] } } });
                    expect(combinedChangeSet).to.deep.equal({ 'String': { 'stringProperty': '01ab56' } });
                },
            });
        });

        it('with conflicting set and insert should report a conflict', function() {
            testRebasing({
                prepare: insertText,
                op1: setText,
                op2: insertText,
                compareToSequential: false,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.have.length(1);
                    expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
                    expect(conflicts[0].path).to.be.equal('stringProperty');
                    expect(changeSet.String.stringProperty).to.be.equal('s');
                },
            });
        });

        it('with conflicting insert and set should report a conflict', function() {
            testRebasing({
                prepare: insertText,
                op1: insertText,
                op2: setText,
                compareToSequential: false,
                checkResult: function(conflicts, changeSet) {
                    expect(conflicts).to.have.length(1);
                    expect(conflicts[0].type).to.be.equal(ChangeSet.ConflictType.COLLIDING_SET);
                    expect(conflicts[0].path).to.be.equal('stringProperty');
                    expect(changeSet.String.stringProperty).to.be.equal('s');
                },
            });
        });

        it('should correctly handle boundary cases', function() {
            var testChangeSet = function(in_CS, in_CS2) {
                var root = PropertyFactory.create('NodeProperty');
                var initialString = PropertyFactory.create('String');
                root.insert('str', initialString);
                initialString.value = 'AAAAAA';
                root.applyChangeSet(in_CS);
                if (in_CS2) {
                    root.applyChangeSet(in_CS2);
                }
                return initialString.value;
            };

            var CS1 = new ChangeSet({ modify: { String: { str: { 'remove': [[2, 2]] } } } });
            var CS2 = new ChangeSet({ modify: { String: { str: { 'insert': [[2, '-'], [4, '-']] } } } });

            expect(testChangeSet(CS1.getSerializedChangeSet())).to.equal('AAAA');
            expect(testChangeSet(CS2.getSerializedChangeSet())).to.equal('AA-AA-AA');

            var conflicts = [];
            var rebasedCS1 = CS2._rebaseChangeSet(deepCopy(CS1.getSerializedChangeSet()), conflicts);
            var rebasedCS2 = CS1._rebaseChangeSet(deepCopy(CS2.getSerializedChangeSet()), conflicts);

            expect(rebasedCS1.modify.String.str.remove.length).to.equal(1);
            expect(testChangeSet(CS2.getSerializedChangeSet(), rebasedCS1)).to.equal('AA--AA');
            expect(testChangeSet(CS1.getSerializedChangeSet(), rebasedCS2)).to.equal('AA--AA');
        });
    });

    it('field "length" in schema should be ignored', function() {
        var SchemaStringWithLength = {
            typeid: 'autodesk.tests:SchemaStringWithLength-1.0.0',
            properties: [
                { id: 'stringProperty', typeid: 'String', length: 4 },
            ],
        };
        PropertyFactory.register(SchemaStringWithLength);

        var prop = PropertyFactory.create(SchemaStringWithLength.typeid);
        expect(prop.get('stringProperty').getValue()).to.equal('');
    });

    it.skip('@bugfix field "length" not a number in schema should be ignored', function() {
        var SchemaStringWithStringLength = {
            typeid: 'autodesk.tests:SchemaStringWithStringLength-1.0.0',
            properties: [
                { id: 'stringProperty', typeid: 'String', length: '4' },
            ],
        };
        PropertyFactory.register(SchemaStringWithStringLength);

        var prop = PropertyFactory.create(SchemaStringWithStringLength.typeid);
        expect(prop.get('stringProperty').getValue()).to.equal('');
    });
});
