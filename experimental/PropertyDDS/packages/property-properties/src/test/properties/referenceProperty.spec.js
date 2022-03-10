/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-unused-expressions  */
/* eslint-disable max-nested-callbacks */
/**
 * @fileoverview In this file, we will test the reference properties
 *    described in /src/properties/referenceProperty.js,
 *                 /src/properties/referenceArrayProperty.js,
 *                 /src/properties/referenceMapProperty.js
 */
const { ChangeSet } = require('@fluid-experimental/property-changeset');
const { MSG } = require('@fluid-experimental/property-common').constants;
const { BaseProperty } = require('../..');
const { PropertyFactory } = require('../..');
const { ReferenceProperty } = require('../../properties/referenceProperty');
const { ReferenceMapProperty } = require('../../properties/referenceMapProperty');
const { ReferenceArrayProperty } = require('../../properties/referenceArrayProperty');

describe('Reference Properties', function() {
    var dereferenceToken;

    before(function() {
        dereferenceToken = BaseProperty.PATH_TOKENS.REF;

        // A template that contains all types of reference properties
        var referencePropertyTestTemplate = {
            typeid: 'autodesk.test:referencePropertyTest-1.0.0',
            properties: [
                { id: 'ref', typeid: 'Reference<NodeProperty>' },
                { id: 'ref_anon', typeid: 'Reference' },
                { id: 'refArray', typeid: 'Reference<NodeProperty>', context: 'array' },
                { id: 'refArray_anon', typeid: 'Reference', context: 'array' },
                { id: 'refMap', typeid: 'Reference<NodeProperty>', context: 'map' },
                { id: 'refMap_anon', typeid: 'Reference', context: 'map' },
            ],
        };

        PropertyFactory._reregister(referencePropertyTestTemplate);
    });

    describe('ReferenceProperty', function() {
        it('should be possible to create', function() {
            // Test creation of an anonymous reference
            var reference = PropertyFactory.create('Reference');
            expect(reference).to.be.instanceof(ReferenceProperty);
            expect(reference.getReferenceTargetTypeId()).to.equal('BaseProperty');

            // Test creation of a typed reference
            var reference = PropertyFactory.create('Reference<NodeProperty>');
            expect(reference).to.be.instanceof(ReferenceProperty);
            expect(reference.getReferenceTargetTypeId()).to.equal('NodeProperty');

            // Test creation via a template
            var prop = PropertyFactory.create('autodesk.test:referencePropertyTest-1.0.0');
            expect(prop._properties.ref_anon).to.be.instanceof(ReferenceProperty);
            expect(prop._properties.ref_anon.getReferenceTargetTypeId()).to.equal('BaseProperty');
            expect(prop._properties.ref).to.be.instanceof(ReferenceProperty);
            expect(prop._properties.ref.getReferenceTargetTypeId()).to.equal('NodeProperty');
        });

        it('empty reference should resolve to undefined', function() {
            var reference = PropertyFactory.create('Reference');

            // It should work with the default value
            expect(reference.referenced).to.be.undefined;
            expect(reference.get()).to.be.undefined;

            // Explicitly setting it should have the same effect
            reference.value = '';
            expect(reference.referenced).to.be.undefined;
            expect(reference.get()).to.be.undefined;
        });

        it('setting a referenced member to undefined should turn it into an empty string', function() {
            var reference = PropertyFactory.create('Reference');

            // First set it to something else than an empty reference
            reference.value = '/test';

            // Now reset it via the referenced member
            reference.ref = undefined;
            // And check the result
            expect(reference.value).to.equal('');
            expect(reference.ref).to.be.undefined;
        });

        it('setting a reference to a non absolute path should not throw', function() {
            var reference = PropertyFactory.create('Reference');
            expect(function() { reference.value = 'test'; }).to.not.throw();
        });

        it('.get should work to resolve the referenced property', function() {
            var root = PropertyFactory.create('NodeProperty');
            var reference = PropertyFactory.create('Reference<String>');
            var target = PropertyFactory.create('String');
            var node = PropertyFactory.create('NodeProperty');
            var nodeTarget = PropertyFactory.create('String');
            root.insert('target', target);
            root.insert('reference', reference);
            root.insert('node', node);
            node.insert('target', nodeTarget);

            reference.set(target);
            expect(root.get('reference')).to.equal(target);

            // checking that a primitive value for in_options is ignored:
            expect(root.get('reference', 'string')).to.equal(target);

            expect(root.get('reference', {
                referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.ALWAYS,
            })).to.equal(target);
            expect(root.get('reference', {
                referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER,
            })).to.equal(reference);
            expect(root.get('reference', {
                referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NO_LEAFS,
            })).to.equal(reference);

            reference.set(node);
            expect(root.get(['reference', 'target'], {
                referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.ALWAYS,
            })).to.equal(nodeTarget);
            expect(root.get(['reference', 'target'], {
                referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER,
            })).to.equal(undefined);
            expect(root.get(['reference', 'target'], {
                referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NO_LEAFS,
            })).to.equal(nodeTarget);
        });

        it('.get should work with different types of input', function() {
            var root = PropertyFactory.create('NodeProperty');
            var reference = PropertyFactory.create('Reference<String>');
            var node = PropertyFactory.create('NodeProperty');
            var nodeTarget = PropertyFactory.create('String');
            root.insert('reference', reference);
            root.insert('node', node);
            node.insert('target', nodeTarget);
            reference.set(node);
            expect(reference.get()).to.equal(node);
            expect(reference.get('')).to.equal(node);
            expect(reference.get(['target'])).to.equal(nodeTarget);
            expect(reference.get('target')).to.equal(node);
            expect(reference.get([])).to.equal(reference);
        });

        it('.get should return undefined with invalid reference', function() {
            var root = PropertyFactory.create('NodeProperty');
            var reference = PropertyFactory.create('Reference<String>');
            var node = PropertyFactory.create('NodeProperty');
            var nodeTarget = PropertyFactory.create('String');

            // when reference is not inserted to the tree
            root.insert('node', node);
            node.insert('target', nodeTarget);
            reference.set(node);
            expect(reference.get(['target'])).to.undefined;

            // with invalid reference input
            root.insert('reference', reference);
            reference.set('invalid_node');
            expect(reference.get(['target'])).to.undefined;

            // dereference property is removed
            reference.set('node');
            expect(reference.get(['target'])).to.equal(nodeTarget);
            node.remove('target');
            expect(reference.get(['target'])).to.undefined;
        });

        it('.resolvePath should work to resolve the referenced property', function() {
            var root = PropertyFactory.create('NodeProperty');
            var reference = PropertyFactory.create('Reference<String>');
            var target = PropertyFactory.create('String');
            var node = PropertyFactory.create('NodeProperty');
            var nodeTarget = PropertyFactory.create('String');
            root.insert('target', target);
            root.insert('reference', reference);
            root.insert('node', node);
            node.insert('target', nodeTarget);

            reference.set(target);
            expect(root.resolvePath('reference')).to.equal(target);
            expect(root.resolvePath('reference', {
                referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.ALWAYS,
            })).to.equal(target);
            expect(root.resolvePath('reference', {
                referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER,
            })).to.equal(reference);
            expect(root.resolvePath('reference', {
                referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NO_LEAFS,
            })).to.equal(reference);

            reference.set(node);
            expect(root.resolvePath('reference.target', {
                referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.ALWAYS,
            })).to.equal(nodeTarget);
            expect(root.resolvePath('reference.target', {
                referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER,
            })).to.equal(undefined);
            expect(root.resolvePath('reference.target', {
                referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NO_LEAFS,
            })).to.equal(nodeTarget);
        });

        describe('Reference resolution', function() {
            var root, target, reference, reference2, relativeReference, relativeReference2;
            var nodeTarget, nestedChild, nodeTarget2, nestedChild2;
            var mapTarget, nestedMapChild;
            var arrayTarget, nestedArrayChild;

            beforeEach(function() {
                root = PropertyFactory.create('NodeProperty');

                nodeTarget = PropertyFactory.create('NodeProperty');
                nestedChild = PropertyFactory.create('String');
                relativeReference = PropertyFactory.create('Reference<String>');
                nodeTarget.insert('nested', nestedChild);
                nodeTarget.insert('relativeReference', relativeReference);

                nodeTarget2 = PropertyFactory.create('NodeProperty');
                nestedChild2 = PropertyFactory.create('String');
                relativeReference2 = PropertyFactory.create('Reference<Reference>');
                nodeTarget2.insert('nested', nestedChild2);
                nodeTarget2.insert('relativeReference2', relativeReference2);

                mapTarget = PropertyFactory.create('map<>');
                nestedMapChild = PropertyFactory.create('String');
                mapTarget.insert('nested', nestedMapChild);

                arrayTarget = PropertyFactory.create('array<>');
                nestedArrayChild = PropertyFactory.create('String');
                arrayTarget.push(nestedArrayChild);

                target = PropertyFactory.create('String');
                reference = PropertyFactory.create('Reference<String>');
                reference2 = PropertyFactory.create('Reference<Reference>');

                root.insert('target', target);
                root.insert('nodeTarget', nodeTarget);
                root.insert('nodeTarget2', nodeTarget2);
                root.insert('mapTarget', mapTarget);
                root.insert('arrayTarget', arrayTarget);

                root.insert('reference', reference);
                root.insert('reference2', reference2);

                target.value = 'test';
            });

            it('should allow resolving references', function() {
                reference.value = '/target';

                expect(reference.ref).to.equal(target);
                expect(reference.ref.value).to.equal('test');
            });

            it('should support setting via set', function() {
                reference.set(target);

                expect(reference.ref).to.equal(target);
                expect(reference.ref.value).to.equal('test');
                expect(reference.value).to.equal('/target');
            });

            it('set with a Property should work', function() {
                reference.set(nestedChild);
                expect(reference.getValue()).to.equal('/nodeTarget.nested');
            });

            it('set with a path should work', function() {
                reference.set('/nodeTarget.nested');
                expect(reference.getValue()).to.equal('/nodeTarget.nested');
            });

            it('set with something else should throw', function() {
                expect(function() { reference.set(123); }).to.throw(MSG.PROPERTY_OR_UNDEFINED);
            });

            it('setValue with a Property should work', function() {
                reference.setValue(nestedChild);
                expect(reference.getValue()).to.equal('/nodeTarget.nested');
            });

            it('setValue with a path should work', function() {
                reference.setValue('/nodeTarget.nested');
                expect(reference.getValue()).to.equal('/nodeTarget.nested');
            });

            it('setValue with something else should throw', function() {
                expect(function() { reference.setValue(123); }).to.throw(MSG.PROPERTY_OR_UNDEFINED);
            });

            it('should have a working isReferenceValid', function() {
                // An empty reference should be valid
                reference.value = '';
                expect(reference.isReferenceValid()).to.be.true;

                // A reference to an existing property should be valid
                reference.set(target);
                expect(reference.isReferenceValid()).to.be.true;

                // A reference that cannot be resolved should be invalid
                reference.value = '/invalid_path';
                expect(reference.isReferenceValid()).to.be.false;
            });

            it('should allow dereferencing via a *', function() {
                reference.set(target);
                expect(root.resolvePath('/reference')).to.equal(target);
                expect(root.resolvePath('/reference*')).to.equal(reference);
                expect(root.get('reference', { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER }))
                    .to.equal(reference);
                expect(root.get(['reference', dereferenceToken])).to.equal(reference);
            });

            it('should allow dereferencing via a * with nested reference property', function() {
                reference.set(target);
                reference2.set('/reference*');
                expect(root.get('reference2')).to.equal(reference);
                expect(root.resolvePath('/reference2')).to.equal(reference);
            });

            it('should allow dereferencing via multiple jumps', function() {
                let reference3 = PropertyFactory.create('Reference');
                let reference4 = PropertyFactory.create('Reference');
                let reference5 = PropertyFactory.create('Reference');
                root.insert('reference3', reference3);
                root.insert('reference4', reference4);
                root.insert('reference5', reference5);
                reference.set(target);
                reference2.set('reference');
                reference3.set('reference2');
                reference4.set('reference3');
                reference5.set('reference4');
                expect(root.get('reference5')).to.equal(target);
                expect(root.resolvePath('/reference5')).to.equal(target);
                expect(root.get('reference4')).to.equal(target);
                expect(root.resolvePath('/reference4')).to.equal(target);
                expect(root.get('reference3')).to.equal(target);
                expect(root.resolvePath('/reference3')).to.equal(target);
                expect(root.get('reference2')).to.equal(target);
                expect(root.resolvePath('/reference2')).to.equal(target);
                expect(root.get('reference')).to.equal(target);
                expect(root.resolvePath('/reference')).to.equal(target);
            });

            it('should allow dereferencing via * multiple jumps', function() {
                let reference3 = PropertyFactory.create('Reference');
                let reference4 = PropertyFactory.create('Reference');
                let reference5 = PropertyFactory.create('Reference');
                root.insert('reference3', reference3);
                root.insert('reference4', reference4);
                root.insert('reference5', reference5);
                reference.set(target);
                reference2.set('reference');
                reference3.set('reference2');
                reference4.set('reference3*');
                reference5.set('reference4');
                expect(root.get('reference5')).to.equal(reference3);
                expect(root.resolvePath('/reference5')).to.equal(reference3);
                expect(root.get('reference4')).to.equal(reference3);
                expect(root.resolvePath('/reference4')).to.equal(reference3);
                expect(root.get('reference3')).to.equal(target);
                expect(root.resolvePath('/reference3')).to.equal(target);
                expect(root.get('reference2')).to.equal(target);
                expect(root.resolvePath('/reference2')).to.equal(target);
                expect(root.get('reference')).to.equal(target);
                expect(root.resolvePath('/reference')).to.equal(target);
            });

            it('should allow accessing nested paths', function() {
                reference.set(nodeTarget);

                expect(root.resolvePath('/reference.nested')).to.equal(nestedChild);
                expect(root.get(['reference', 'nested'])).to.equal(nestedChild);
                expect(root.resolvePath('/reference*.nested')).to.equal(undefined);
                expect(root.get(['reference', dereferenceToken, 'nested'])).to.equal(undefined);

                nestedChild.value = 'test_value';
                expect(root.resolvePath('/reference.nested').value).to.equal('test_value');
            });

            it('should allow accessing referenced maps', function() {
                reference.set(mapTarget);

                expect(root.resolvePath('/reference[nested]')).to.equal(nestedMapChild);
                expect(root.resolvePath('/reference*[nested]')).to.equal(undefined);
            });

            it('should allow accessing referenced arrays', function() {
                reference.set(arrayTarget);

                expect(root.resolvePath('/reference[0]')).to.equal(nestedArrayChild);
                expect(root.get(['reference', 0])).to.equal(nestedArrayChild);
                expect(root.resolvePath('/reference*[0]')).to.equal(undefined);
            });

            it('forwarding should work over multiple jumps', function() {
                reference.set(nodeTarget);
                reference2.set(reference);

                expect(root.resolvePath('/reference2.nested')).to.equal(nestedChild);
            });

            it('should continue to work when the reference or the referenced node changes', function() {
                reference.set(nodeTarget);
                expect(root.resolvePath('/reference.nested')).to.equal(nestedChild);
                expect(root.get(['reference', 'nested'])).to.equal(nestedChild);

                reference.set(nodeTarget2);
                expect(root.resolvePath('/reference.nested*')).to.equal(nestedChild2);
                expect(root.get(['reference', 'nested', dereferenceToken])).to.equal(nestedChild2);

                nodeTarget2.remove('nested');
                var newChild = PropertyFactory.create('String');
                nodeTarget2.insert('nested', newChild);
                expect(root.resolvePath('/reference.nested')).to.equal(newChild);
                expect(root.get(['reference', 'nested'])).to.equal(newChild);
            });

            it('should work with relative paths using getReferencedProperty', function() {
                relativeReference.setValue('../nodeTarget2');
                expect(relativeReference.get()).to.equal(nodeTarget2);
            });

            it('should work with relative paths using getReferencedProperty', function() {
                relativeReference.setValue('../nodeTarget2');
                expect(relativeReference.get()).to.equal(nodeTarget2);
                expect(relativeReference.ref).to.equal(nodeTarget2);
            });

            it('should work with multiple jumps with relative references', function() {
                relativeReference.setValue('../nodeTarget');
                relativeReference2.setValue('../nodeTarget.relativeReference');
                expect(root.resolvePath('/nodeTarget2.relativeReference2.nested')).to.equal(nestedChild);
                expect(root.get(['nodeTarget2', 'relativeReference2', 'nested'])).to.equal(nestedChild);
                expect(root.get(['nodeTarget2', 'relativeReference2'])).to.equal(nodeTarget);
                expect(root.get(['nodeTarget2', 'relativeReference2'],
                    { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NO_LEAFS })).to.equal(relativeReference2);
                expect(root.get(['nodeTarget2', 'relativeReference2', 'nested'],
                    { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER })).to.equal(undefined);
                expect(root.get(['nodeTarget2', 'relativeReference2'],
                    { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NO_LEAFS }).get(['nested'])).to.equal(nestedChild);
            });

            it('should return undefined when going beyond the root', function() {
                relativeReference.setValue('../../nodeTarget2');
                expect(relativeReference.get()).to.be.undefined;
            });

            it('should clone', function() {
                var clone = relativeReference.clone();
                expect(relativeReference._serialize(false)).to.eql(clone._serialize(false));
            });

            it('get context should return single', function() {
                expect(reference.getContext()).to.equal('single');
            });

            it('getFullTypeid should work', function() {
                expect(reference.getFullTypeid()).to.equal('Reference<String>');
                expect(reference.getFullTypeid(false)).to.equal('Reference<String>');
            });

            it('isPrimitiveType should evaluate to true', function() {
                expect(reference.isPrimitiveType()).to.equal(true);
            });
        });
    });

    describe('ReferenceMapProperty', function() {
        it('should be possible to create', function() {
            // Test creation of an anonymous reference
            var reference = PropertyFactory.create('Reference', 'map');
            expect(reference).to.be.instanceof(ReferenceMapProperty);
            expect(reference.getReferenceTargetTypeId()).to.equal('BaseProperty');

            // Test creation of a typed reference
            var reference = PropertyFactory.create('Reference<NodeProperty>', 'map');
            expect(reference).to.be.instanceof(ReferenceMapProperty);
            expect(reference.getReferenceTargetTypeId()).to.equal('NodeProperty');

            // Test creation of a typed reference
            var reference = PropertyFactory.create('map<Reference<NodeProperty>>');
            expect(reference).to.be.instanceof(ReferenceMapProperty);
            expect(reference.getReferenceTargetTypeId()).to.equal('NodeProperty');

            // Test creation via a template
            var prop = PropertyFactory.create('autodesk.test:referencePropertyTest-1.0.0');
            expect(prop._properties.refMap_anon).to.be.instanceof(ReferenceMapProperty);
            expect(prop._properties.refMap_anon.getReferenceTargetTypeId()).to.equal('BaseProperty');
            expect(prop._properties.refMap).to.be.instanceof(ReferenceMapProperty);
            expect(prop._properties.refMap.getReferenceTargetTypeId()).to.equal('NodeProperty');
        });

        it('empty reference should resolve to undefined', function() {
            var reference = PropertyFactory.create('Reference', 'map');

            // It should work for missing entries
            expect(reference.get('missing')).to.be.undefined;

            // Explicitly setting it should have the same effect
            reference.insert('test', '');
            expect(reference.get('test')).to.be.undefined;
        });

        it('setting a referenced member to undefined should turn it into an empty string', function() {
            var reference = PropertyFactory.create('Reference', 'map');

            // First set it to something else than an empty reference
            reference.insert('test', '/test');

            // Now reset it via the referenced member
            reference.set('test', undefined);
            reference.insert('test2', undefined);

            // And check the result
            expect(reference.getValue('test')).to.equal('');
            expect(reference.getValue('test2')).to.equal('');
            expect(reference.get('test')).to.be.undefined;
        });

        it('setting a reference to a non absolute path should not throw', function() {
            var reference = PropertyFactory.create('Reference', 'map');
            expect(function() { reference.set('test', 'test'); }).to.not.throw();
            expect(function() { reference.insert('test2', 'test'); }).to.not.throw();
        });

        describe('Reference resolution', function() {
            var root, target, reference, reference2, reference3, reference4, relativeReference;
            var nodeTarget, nestedChild, nodeTarget2, nestedChild2;
            var mapTarget, nestedMapChild;
            var arrayTarget, nestedArrayChild;

            beforeEach(function() {
                root = PropertyFactory.create('NodeProperty');
                target = PropertyFactory.create('String');

                nodeTarget = PropertyFactory.create('NodeProperty');
                nestedChild = PropertyFactory.create('String');
                relativeReference = PropertyFactory.create('Reference<String>', 'map');
                nodeTarget.insert('nested', nestedChild);
                nodeTarget.insert('relativeReference', relativeReference);

                nodeTarget2 = PropertyFactory.create('NodeProperty');
                nestedChild2 = PropertyFactory.create('String');
                nodeTarget2.insert('nested', nestedChild2);

                mapTarget = PropertyFactory.create('map<>');
                nestedMapChild = PropertyFactory.create('String');
                mapTarget.insert('nested', nestedMapChild);

                arrayTarget = PropertyFactory.create('array<>');
                nestedArrayChild = PropertyFactory.create('String');
                arrayTarget.push(nestedArrayChild);

                reference = PropertyFactory.create('Reference<String>', 'map');
                reference2 = PropertyFactory.create('Reference<Reference>', 'map');
                reference3 = PropertyFactory.create('Reference<Reference>');
                reference4 = PropertyFactory.create('Reference<String>');

                root.insert('target', target);
                root.insert('nodeTarget', nodeTarget);
                root.insert('nodeTarget2', nodeTarget2);
                root.insert('mapTarget', mapTarget);
                root.insert('arrayTarget', arrayTarget);

                root.insert('reference', reference);
                root.insert('reference2', reference2);
                root.insert('reference3', reference3);
                root.insert('reference4', reference4);

                target.value = 'test';
            });

            it('should allow resolving references', function() {
                reference.setValue('test', '/target');

                expect(reference.get('test')).to.equal(target);
                expect(reference.get('test').value).to.equal('test');
            });

            it('@bugfix should allow dereferencing via a * with reference map property', function() {
                reference4.set(target);
                reference3.set('/reference4*');
                reference.setValue('test', '/reference3');
                reference.setValue('test2', '/reference3*');
                expect(reference.get('test')).to.equal(reference4);
                expect(reference.get('test2')).to.equal(reference3);
            });

            it('should support setting via set', function() {
                reference.set('test', target);

                expect(reference.get('test')).to.equal(target);
                expect(reference.get('test').value).to.equal('test');
                expect(reference.getValue('test')).to.equal('/target');
            });

            it('set (insert) with a Property should work', function() {
                reference.set('test', nestedChild);
                expect(reference.getValue('test')).to.equal('/nodeTarget.nested');
            });

            it('set (insert) with a path should work', function() {
                reference.set('test', '/nodeTarget.nested');
                expect(reference.getValue('test')).to.equal('/nodeTarget.nested');
            });

            it('set (insert) with something else should throw', function() {
                expect(function() { reference.set('test', 123); }).to.throw(MSG.PROPERTY_OR_UNDEFINED);
            });

            it('set (modify) with a Property should work', function() {
                reference.set('test');
                expect(reference.getValue('test')).to.equal('');
                reference.set('test', nestedChild);
                expect(reference.getValue('test')).to.equal('/nodeTarget.nested');
            });

            it('set (modify) with a path should work', function() {
                reference.set('test');
                expect(reference.getValue('test')).to.equal('');
                reference.set('test', '/nodeTarget.nested');
                expect(reference.getValue('test')).to.equal('/nodeTarget.nested');
            });

            it('set (modify) with something else should throw', function() {
                reference.set('test');
                expect(reference.getValue('test')).to.equal('');
                expect(function() { reference.set('test', 123); }).to.throw(MSG.PROPERTY_OR_UNDEFINED);
            });

            it('insert with a Property should work', function() {
                reference.insert('test', nestedChild);
                expect(reference.getValue('test')).to.equal('/nodeTarget.nested');
            });

            it('insert with a path should work', function() {
                reference.insert('test', '/nodeTarget.nested');
                expect(reference.getValue('test')).to.equal('/nodeTarget.nested');
            });

            it('insert with something else should throw', function() {
                expect(function() { reference.insert('test', 123); }).to.throw(MSG.PROPERTY_OR_UNDEFINED);
            });

            it('setValues with Property and path should work', function() {
                reference.setValues([nestedChild, '/nodeTarget.nested']);
                expect(reference.getValue(0)).to.equal('/nodeTarget.nested');
                expect(reference.getValue(1)).to.equal('/nodeTarget.nested');

                reference.setValues([undefined, '']);
                expect(reference.getValue(0)).to.equal('');
                expect(reference.getValue(1)).to.equal('');

                reference.setValues({ 'test': nestedChild, 'test2': '/nodeTarget.nested' });
                expect(reference.getValue('test')).to.equal('/nodeTarget.nested');
                expect(reference.getValue('test2')).to.equal('/nodeTarget.nested');
            });

            it('setValues with something else should throw', function() {
                expect(function() { reference.setValues({ 'test': 123 }); }).to.throw(MSG.PROPERTY_OR_UNDEFINED);
            });

            it('should have a working isReferenceValid', function() {
                // An empty reference should be valid
                reference.setValue('test', '');
                expect(reference.isReferenceValid('test')).to.be.true;

                // A reference to an existing property should be valid
                reference.set('test', target);
                expect(reference.isReferenceValid('test')).to.be.true;

                // A reference that cannot be resolved should be invalid
                reference.setValue('test', '/invalid_path');
                expect(reference.isReferenceValid('test')).to.be.false;
            });

            it('should allow dereferencing via the array syntax', function() {
                reference.set('test', target);
                expect(root.resolvePath('/reference[test]')).to.equal(target);
            });

            it('should allow accessing nested paths', function() {
                reference.insert('test', nodeTarget);
                expect(root.resolvePath('/reference[test].nested')).to.equal(nestedChild);
            });

            it('should allow accessing referenced maps', function() {
                reference.set('test', mapTarget);

                expect(root.resolvePath('/reference[test][nested]')).to.equal(nestedMapChild);
            });

            it('should allow accessing referenced arrays', function() {
                reference.set('test', arrayTarget);

                expect(root.resolvePath('/reference[test][0]')).to.equal(nestedArrayChild);
            });

            it('double dereferencing a reference should work', function() {
                reference.set('test', target);
                reference2.set('test', reference);

                expect(root.resolvePath('/reference2[test][test]')).to.equal(target);
            });

            it('mixing maps and normal maps should work', function() {
                reference.set('test', target);
                reference3.set(reference);

                expect(root.resolvePath('/reference3[test]')).to.equal(target);
                expect(root.resolvePath('/reference3*[test]')).to.equal(undefined);
                expect(root.get(['reference3', dereferenceToken, 'test'])).to.equal(undefined);

                reference.set('test', reference3);
                reference3.set(target);

                expect(root.resolvePath('/reference[test]')).to.equal(target);
                expect(root.resolvePath('/reference[test]*')).to.equal(reference3);
                expect(root.get(['reference', 'test', dereferenceToken]));
            });

            it('should continue to work when the reference or the referenced node changes', function() {
                reference.insert('test', nodeTarget);
                expect(root.resolvePath('/reference[test].nested')).to.equal(nestedChild);
                expect(reference.resolvePath('[test].nested')).to.equal(nestedChild);

                reference.set('test', nodeTarget2);
                expect(root.resolvePath('/reference[test].nested')).to.equal(nestedChild2);
                expect(reference.resolvePath('[test].nested')).to.equal(nestedChild2);

                nodeTarget2.remove('nested');
                var newChild = PropertyFactory.create('String');
                nodeTarget2.insert('nested', newChild);
                expect(reference.resolvePath('[test].nested')).to.equal(newChild);
            });

            it('should allow dereferencing via the array syntax using relative paths', function() {
                relativeReference.setValue('test', '../target');
                expect(root.resolvePath('/nodeTarget.relativeReference[test]')).to.equal(target);
            });

            it('remove should work and return the string path', function() {
                reference.insert('two', target);
                expect(reference.remove('two')).to.equal('/target');
                expect(reference.getValue('two')).to.be.undefined;
            });

            it('getValues should return a map containing path strings', function() {
                var newReference = PropertyFactory.create('Reference<String>', 'map');
                newReference.insert('one', target);
                newReference.insert('two', nodeTarget);
                expect(newReference.getValues()).to.deep.equal({
                    'one': '/target',
                    'two': '/nodeTarget',
                });
            });

            it('getContext should return map', function() {
                var newReference = PropertyFactory.create('Reference<String>', 'map');
                expect(newReference.getContext()).to.equal('map');
            });
        });
    });

    describe('ReferenceArrayProperty', function() {
        it('should be possible to create', function() {
            // Test creation of an anonymous reference
            var reference = PropertyFactory.create('Reference', 'array');
            expect(reference).to.be.instanceof(ReferenceArrayProperty);
            expect(reference.getReferenceTargetTypeId()).to.equal('BaseProperty');

            // Test creation of a typed reference
            var reference = PropertyFactory.create('Reference<NodeProperty>', 'array');
            expect(reference).to.be.instanceof(ReferenceArrayProperty);
            expect(reference.getReferenceTargetTypeId()).to.equal('NodeProperty');

            // Test creation of a typed reference
            var reference = PropertyFactory.create('array<Reference<NodeProperty>>');
            expect(reference).to.be.instanceof(ReferenceArrayProperty);
            expect(reference.getReferenceTargetTypeId()).to.equal('NodeProperty');

            // Test creation via a template
            var prop = PropertyFactory.create('autodesk.test:referencePropertyTest-1.0.0');
            expect(prop._properties.refArray_anon).to.be.instanceof(ReferenceArrayProperty);
            expect(prop._properties.refArray_anon.getReferenceTargetTypeId()).to.equal('BaseProperty');
            expect(prop._properties.refArray).to.be.instanceof(ReferenceArrayProperty);
            expect(prop._properties.refArray.getReferenceTargetTypeId()).to.equal('NodeProperty');
        });

        it('empty reference should resolve to undefined', function() {
            var reference = PropertyFactory.create('Reference', 'array');

            // Explicitly setting it should have the same effect
            reference.push('');
            expect(reference.get(0)).to.be.undefined;

            // Explicitly setting it should have the same effect
            reference.set(0, '');
            expect(reference.get(0)).to.be.undefined;
            expect(reference.getValue(0)).to.equal('');
        });

        it('setting a referenced member to undefined should turn it into an empty string', function() {
            var reference = PropertyFactory.create('Reference', 'array');

            // Test pushing a value
            reference.push(undefined);
            expect(reference.get(0)).to.equal(undefined);

            // First set it to something else than an empty reference
            reference.set(0, '/test');

            // Now reset it via the referenced member
            reference.set(0, undefined);

            // And check the result
            expect(reference.get(0)).to.equal(undefined);
        });

        it.skip('setting a reference to a non absolute path should not throw', function() {
            var reference = PropertyFactory.create('Reference', 'array');
            expect(function() { reference.push('test'); }).to.throw();
            expect(function() { reference.push(''); reference.set(0, 'test'); }).to.throw();
        });

        describe('Reference resolution', function() {
            var root, target, reference, reference2, reference3, relativeReference;
            var nodeTarget, nestedChild, nodeTarget2, nestedChild2;
            var mapTarget, nestedMapChild;
            var arrayTarget, nestedArrayChild;

            beforeEach(function() {
                root = PropertyFactory.create('NodeProperty');

                nodeTarget = PropertyFactory.create('NodeProperty');
                nestedChild = PropertyFactory.create('String');
                relativeReference = PropertyFactory.create('Reference<String>', 'array');
                nodeTarget.insert('nested', nestedChild);
                nodeTarget.insert('relativeReference', relativeReference);

                nodeTarget2 = PropertyFactory.create('NodeProperty');
                nestedChild2 = PropertyFactory.create('String');
                nodeTarget2.insert('nested', nestedChild2);

                mapTarget = PropertyFactory.create('map<>');
                nestedMapChild = PropertyFactory.create('String');
                mapTarget.insert('nested', nestedMapChild);

                arrayTarget = PropertyFactory.create('array<>');
                nestedArrayChild = PropertyFactory.create('String');
                arrayTarget.push(nestedArrayChild);

                target = PropertyFactory.create('String');
                reference = PropertyFactory.create('Reference<String>', 'array');
                reference2 = PropertyFactory.create('Reference<Reference>', 'array');
                reference3 = PropertyFactory.create('Reference<Reference>');

                root.insert('target', target);
                root.insert('nodeTarget', nodeTarget);
                root.insert('nodeTarget2', nodeTarget2);
                root.insert('mapTarget', mapTarget);
                root.insert('arrayTarget', arrayTarget);

                root.insert('reference', reference);
                root.insert('reference2', reference2);
                root.insert('reference3', reference3);

                target.value = 'test';
            });

            it('should allow resolving references', function() {
                reference.push('/target');

                expect(reference.get(0)).to.equal(target);
                expect(reference.get(0).value).to.equal('test');
            });

            it('should support setting via push', function() {
                reference.push(target);

                expect(reference.get(0)).to.equal(target);
                expect(reference.get(0).value).to.equal('test');
                // expect(reference.get(0)).to.equal('/target');
                // this last test will break when we get rid of getReferencedProperty. Fix when get supports '*'
            });

            it('should support setting via insert', function() {
                reference.insert(0, target);

                expect(reference.get(0)).to.equal(target);
                expect(reference.get(0).value).to.equal('test');
                // expect(reference.get(0)).to.equal('/target');
                // see comment above
            });

            it('should support setting via insertRange', function() {
                reference.insertRange(0, [target, nodeTarget]);

                expect(reference.get(0)).to.equal(target);
                expect(reference.get(0).value).to.equal('test');
                // expect(reference.get(0)).to.equal('/target');
                // see comment above
                expect(reference.get(1)).to.equal(nodeTarget);
                // expect(reference.get(1)).to.equal('/nodeTarget');
                // see comment above
            });

            it('should support setting via setRange', function() {
                reference.insertRange(0, ['', '']);
                reference.setRange(0, [target, nodeTarget]);

                expect(reference.get(0)).to.equal(target);
                expect(reference.get(0).value).to.equal('test');
                // expect(reference.get(0)).to.equal('/target');
                // see comment above
                expect(reference.get(1)).to.equal(nodeTarget);
                // expect(reference.get(1)).to.equal('/nodeTarget');
                // see comment above
            });

            it('should support setting via set', function() {
                reference.insertRange(0, ['', '']);
                reference.set(0, target);
                reference.set(1, nodeTarget);

                expect(reference.get(0)).to.equal(target);
                expect(reference.get(0).value).to.equal('test');
                // expect(reference.get(0)).to.equal('/target');
                // to fix once .get accepts '*' tokens
                expect(reference.get(1)).to.equal(nodeTarget);
                // expect(reference.get(1)).to.equal('/nodeTarget');
                // to fix once .get accepts '*' tokens
            });

            it('set with a Property should work', function() {
                reference.insert(0);
                expect(reference.getValue(0)).to.equal('');
                reference.set(0, nestedChild);
                expect(reference.getValue(0)).to.equal('/nodeTarget.nested');
            });

            it('set with a path should work', function() {
                reference.insert(0);
                expect(reference.getValue(0)).to.equal('');
                reference.set(0, '/nodeTarget.nested');
                expect(reference.getValue(0)).to.equal('/nodeTarget.nested');
            });

            it('set with something else should throw', function() {
                reference.insert(0);
                expect(reference.getValue(0)).to.equal('');
                expect(function() { reference.set(0, 123); }).to.throw(MSG.PROPERTY_OR_UNDEFINED);
            });

            it('set should throw if in_offset is not an integer', function() {
                reference.insert(0);
                expect(reference.getValue(0)).to.equal('');
                expect(function() { reference.set('test', '/nodeTarget.nested'); })
                    .to.throw(MSG.NOT_NUMBER);
            });

            it('setRange with a Property and a path should work', function() {
                reference.insert(0);
                reference.insert(1);
                expect(reference.getValue(0)).to.equal('');
                expect(reference.getValue(1)).to.equal('');

                reference.setRange(0, [nestedChild, '/nodeTarget.nested']);
                expect(reference.getValue(0)).to.equal('/nodeTarget.nested');
                expect(reference.getValue(1)).to.equal('/nodeTarget.nested');
            });

            it('setRange with something else should throw', function() {
                reference.insert(0);
                expect(reference.getValue(0)).to.equal('');
                expect(function() { reference.setRange(0, [123]); }).to.throw(MSG.PROPERTY_OR_UNDEFINED);
            });

            it('setRange should throw if in_offset is not an integer', function() {
                reference.insert(0);
                reference.insert(1);
                expect(reference.getValue(0)).to.equal('');
                expect(reference.getValue(1)).to.equal('');
                expect(function() { reference.setRange('test', [nestedChild, '/nodeTarget.nested']); })
                    .to.throw(MSG.NOT_NUMBER);
            });

            it('insert with a Property should work', function() {
                reference.insert(0, nestedChild);
                expect(reference.getValue(0)).to.equal('/nodeTarget.nested');
            });

            it('insert with a path should work', function() {
                reference.insert(0, '/nodeTarget.nested');
                expect(reference.getValue(0)).to.equal('/nodeTarget.nested');
            });

            it('insert with something else should throw', function() {
                expect(function() { reference.insert(0, 123); }).to.throw(MSG.PROPERTY_OR_UNDEFINED);
            });

            it('insertRange with a Property and a path should work', function() {
                reference.insertRange(0, [nestedChild, '/nodeTarget.nested']);
                expect(reference.getValue(0)).to.equal('/nodeTarget.nested');
                expect(reference.getValue(1)).to.equal('/nodeTarget.nested');
            });

            it('insertRange with something else should throw', function() {
                expect(function() { reference.insertRange(0, [123]); }).to.throw(MSG.PROPERTY_OR_UNDEFINED);
            });

            it('enqueue with a Property should work', function() {
                reference.enqueue(nestedChild);
                expect(reference.getValue(0)).to.equal('/nodeTarget.nested');
            });

            it('enqueue with a path should work', function() {
                reference.enqueue('/nodeTarget.nested');
                expect(reference.getValue(0)).to.equal('/nodeTarget.nested');
            });

            it('enqueue with something else should throw', function() {
                expect(function() { reference.enqueue(123); }).to.throw(MSG.PROPERTY_OR_UNDEFINED);
            });

            it('push with a Property should work', function() {
                reference.push(nestedChild);
                expect(reference.getValue(0)).to.equal('/nodeTarget.nested');
            });

            it('push with a path should work', function() {
                reference.push('/nodeTarget.nested');
                expect(reference.getValue(0)).to.equal('/nodeTarget.nested');
            });

            it('push with something else should throw', function() {
                expect(function() { reference.push(123); }).to.throw(MSG.PROPERTY_OR_UNDEFINED);
            });

            it('unshift with a Property should work', function() {
                reference.unshift(nestedChild);
                expect(reference.getValue(0)).to.equal('/nodeTarget.nested');
            });

            it('unshift with a path should work', function() {
                reference.unshift('/nodeTarget.nested');
                expect(reference.getValue(0)).to.equal('/nodeTarget.nested');
            });

            it('unshift with something else should throw', function() {
                expect(function() { reference.unshift(123); }).to.throw(MSG.PROPERTY_OR_UNDEFINED);
            });

            it('setValues with Property and path should work', function() {
                reference.setValues([nestedChild, '/nodeTarget.nested']);
                expect(reference.getValue(0)).to.equal('/nodeTarget.nested');
                expect(reference.getValue(1)).to.equal('/nodeTarget.nested');

                reference.setValues([undefined, '']);
                expect(reference.getValue(0)).to.equal('');
                expect(reference.getValue(1)).to.equal('');

                reference.setValues({ 0: nestedChild, 1: '/nodeTarget.nested' });
                expect(reference.getValue(0)).to.equal('/nodeTarget.nested');
                expect(reference.getValue(1)).to.equal('/nodeTarget.nested');
            });

            it('setValues with something else should throw', function() {
                expect(function() { reference.setValues({ 0: 123 }); }).to.throw(MSG.PROPERTY_OR_UNDEFINED);
            });

            it('should have a working isReferenceValid', function() {
                // An empty reference should be valid
                reference.push('');
                expect(reference.isReferenceValid(0)).to.be.true;

                // A reference to an existing property should be valid
                reference.set(0, target);
                expect(reference.isReferenceValid(0)).to.be.true;

                // A reference that cannot be resolved should be invalid
                reference.set(0, '/invalid_path');
                expect(reference.isReferenceValid(0)).to.be.false;
            });

            it('should allow dereferencing via the array syntax', function() {
                reference.push(target);

                expect(root.resolvePath('/reference[0]')).to.equal(target);
            });

            it('should allow accessing nested paths', function() {
                reference.push(nodeTarget);

                expect(root.resolvePath('/reference[0].nested')).to.equal(nestedChild);
            });

            it('should allow accessing referenced maps', function() {
                reference.push(mapTarget);

                expect(root.resolvePath('/reference[0][nested]')).to.equal(nestedMapChild);
            });

            it('should allow accessing referenced arrays', function() {
                reference.push(arrayTarget);

                expect(root.resolvePath('/reference[0][0]')).to.equal(nestedArrayChild);
            });

            it('double dereferencing a reference should work', function() {
                reference.push(target);
                reference2.push(reference);

                expect(root.resolvePath('/reference2[0][0]')).to.equal(target);
            });

            it('mixing references and array references should work', function() {
                reference.push(target);
                reference3.set(reference);

                expect(root.resolvePath('/reference3[0]')).to.equal(target);
                expect(root.resolvePath('/reference3*[0]')).to.equal(undefined);

                reference.set(0, reference3);
                reference3.set(target);

                expect(root.resolvePath('/reference[0]')).to.equal(target);
                expect(root.resolvePath('/reference[0]*')).to.equal(reference3);
            });

            it('should continue to work when the reference or the referenced node changes', function() {
                reference.push(nodeTarget);

                expect(root.resolvePath('/reference[0].nested')).to.equal(nestedChild);
                expect(reference.resolvePath('[0].nested')).to.equal(nestedChild);

                reference.set(0, nodeTarget2);
                expect(root.resolvePath('/reference[0].nested')).to.equal(nestedChild2);
                expect(reference.resolvePath('[0].nested')).to.equal(nestedChild2);

                nodeTarget2.remove('nested');
                var newChild = PropertyFactory.create('String');
                nodeTarget2.insert('nested', newChild);
                expect(reference.resolvePath('[0].nested')).to.equal(newChild);
            });

            it('should allow dereferencing via the array syntax using relative paths', function() {
                relativeReference.push('../target');
                expect(root.resolvePath('/nodeTarget.relativeReference[0]')).to.equal(target);
            });

            it('Should return references value when a reference points to a context simple property', function() {
                let test = PropertyFactory.create('NodeProperty');
                let ref = PropertyFactory.create('Reference');
                let nameProperty = PropertyFactory.create('NamedProperty');
                test.insert('b', nameProperty);
                test.insert('reference', ref);
                test.resolvePath('reference*').set(nameProperty);
                expect(test.getValues()).to.deep.equal({
                    b: {
                        guid: nameProperty.getGuid(),
                    },
                    reference: {
                        guid: nameProperty.getGuid(),
                    },
                });
            });

            it('.pop should work', function() {
                reference.insertRange(0, [target, nodeTarget]);
                expect(reference.length).to.equal(2);
                reference.pop();
                expect(reference.length).to.equal(1);
                expect(reference.pop()).to.equal('/target');
            });
            it('.remove and .removeRange should work', function() {
                reference.insertRange(0, [target, nodeTarget]);
                expect(reference.length).to.equal(2);
                expect(reference.remove(0)).to.equal('/target');
                expect(reference.length).to.equal(1);
                reference.insert(1, target);
                expect(reference.removeRange(0, 2)).to.deep.equal(['/nodeTarget', '/target']);
                expect(reference.length).to.equal(0);
            });
            it('.getValues should work', function() {
                reference.insertRange(0, [target, nodeTarget]);
                expect(reference.getValues()).to.deep.equal(['/target', '/nodeTarget']);
            });
        });
    });

    describe('Changeset tests', function() {
        var root;
        beforeEach(function() {
            root = PropertyFactory.create('NodeProperty');
            root.insert('template', PropertyFactory.create('autodesk.test:referencePropertyTest-1.0.0'));
            root.insert('reference', PropertyFactory.create('Reference<String>'));
            root.insert('referenceMap', PropertyFactory.create('Reference<String>', 'map'));
            root.insert('referenceArray', PropertyFactory.create('Reference<String>', 'array'));

            root.insert('reference_anon', PropertyFactory.create('Reference'));
            root.insert('referenceMap_anon', PropertyFactory.create('Reference', 'map'));
            root.insert('referenceArray_anon', PropertyFactory.create('Reference', 'array'));

            root.insert('target', PropertyFactory.create('String'));

            var target = root._properties.target;

            root._properties.reference.set(target);
            root._properties.referenceMap.set('entry', target);
            root._properties.referenceArray.push(target);

            root._properties.reference_anon.set(target);
            root._properties.referenceMap_anon.set('entry', target);
            root._properties.referenceArray_anon.push(target);

            root._properties.template.ref.set(target);
            root._properties.template.refMap.set('entry', target);
            root._properties.template.refArray.push(target);

            root._properties.template.ref_anon.set(target);
            root._properties.template.refMap_anon.set('entry', target);
            root._properties.template.refArray_anon.push(target);
        });

        it('serialize and deserialize should work', function() {
            var root2 = PropertyFactory.create('NodeProperty');
            root2.deserialize(root.serialize());
            expect(root.serialize({ 'dirtyOnly': false })).to.deep.equal(root.serialize({ 'dirtyOnly': false }));

            var root2Target = root2._properties.target;
            expect(root2._properties.reference.get()).to.deep.equal(root2Target);
            expect(root2._properties.referenceMap.get('entry')).to.deep.equal(root2Target);
            expect(root2._properties.referenceArray.get()).to.deep.equal(root2Target);

            expect(root2._properties.reference_anon.get()).to.deep.equal(root2Target);
            expect(root2._properties.referenceMap_anon.get('entry')).to.deep.equal(root2Target);
            expect(root2._properties.referenceArray_anon.get()).to.deep.equal(root2Target);

            expect(root2._properties.template.ref.get()).to.deep.equal(root2Target);
            expect(root2._properties.template.refMap.get('entry')).to.deep.equal(root2Target);
            expect(root2._properties.template.refArray.get()).to.deep.equal(root2Target);

            expect(root2._properties.template.ref_anon.get()).to.deep.equal(root2Target);
            expect(root2._properties.template.refMap_anon.get('entry')).to.deep.equal(root2Target);
            expect(root2._properties.template.refArray_anon.get()).to.deep.equal(root2Target);
        });

        it('squash should work', function() {
            var CS1 = root.serialize({ 'dirtyOnly': false });
            root.cleanDirty();

            root.insert('target2', PropertyFactory.create('String'));
            var target2 = root._properties.target2;

            // Set everything to the new target
            root._properties.reference.set(target2);
            root._properties.referenceMap.set('entry', target2);
            root._properties.referenceArray.set(0, target2);
            root._properties.referenceArray.push(target2);

            root._properties.reference_anon.set(target2);
            root._properties.referenceMap_anon.set('entry', target2);
            root._properties.referenceArray_anon.set(0, target2);
            root._properties.referenceArray_anon.push(target2);

            root._properties.template.ref.set(target2);
            root._properties.template.refMap.set('entry', target2);
            root._properties.referenceArray_anon.set(0, target2);
            root._properties.template.refArray.push(target2);

            root._properties.template.ref_anon.set(target2);
            root._properties.template.refMap_anon.set('entry', target2);
            root._properties.referenceArray_anon.set(0, target2);
            root._properties.template.refArray_anon.push(target2);
            var CS2 = root.serialize({ 'dirtyOnly': true });
            var squashed = new ChangeSet(CS1);
            squashed.applyChangeSet(CS2);
            expect(squashed.getSerializedChangeSet()).to.deep.equal(root.serialize({ 'dirtyOnly': false }));
        });

        it('rebase should work', function() {
            root.cleanDirty();

            root.insert('target2', PropertyFactory.create('String'));
            root.cleanDirty();
            var target2 = root._properties.target2;

            // Set everything to the new target
            root._properties.reference.set(target2);
            root._properties.referenceMap.setValue('entry', target2);

            root._properties.reference_anon.set(target2);
            root._properties.referenceMap_anon.setValue('entry', target2);
            root._properties.referenceArray_anon.set(0, target2);

            root._properties.template.ref.set(target2);
            root._properties.template.refMap.setValue('entry', target2);
            root._properties.referenceArray_anon.set(0, target2);

            root._properties.template.ref_anon.set(target2);
            root._properties.template.refMap_anon.setValue('entry', target2);
            root._properties.referenceArray_anon.set(0, target2);

            var CS1 = root.serialize({ 'dirtyOnly': true });
            var CS2 = root.serialize({ 'dirtyOnly': true });
            var rebased = new ChangeSet(CS1);

            var conflicts = [];
            rebased._rebaseChangeSet(CS2, conflicts);

            // each of the set commands should report a conflict
            expect(conflicts.length).to.equal(8);
            for (var i = 0; i < conflicts.length; i++) {
                expect(conflicts[i].type).to.equal(ChangeSet.ConflictType.COLLIDING_SET);
            }

            root.cleanDirty();
            root._properties.referenceArray.push(target2);
            root._properties.referenceArray_anon.push(target2);
            root._properties.template.refArray.push(target2);
            root._properties.template.refArray_anon.push(target2);

            CS1 = root.serialize({ 'dirtyOnly': true });
            CS2 = root.serialize({ 'dirtyOnly': true });
            rebased = new ChangeSet(CS1);
            conflicts = [];
            rebased._rebaseChangeSet(CS2, conflicts);
            expect(conflicts.length).to.equal(4);
            for (var i = 0; i < conflicts.length; i++) {
                expect(conflicts[i].type).to.equal(ChangeSet.ConflictType.INSERTED_ENTRY_WITH_SAME_KEY);
            }
        });
    });
});
