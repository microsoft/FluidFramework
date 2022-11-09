/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* globals isBrowser, assert */

/**
 * @fileoverview In this file, we will test the functions of a BaseProperty object
 * described in /src/properties/baseProperty.js
 */

const { ChangeSet } = require('@fluid-experimental/property-changeset');
const { MSG } = require('@fluid-experimental/property-common').constants;
const { DeterministicRandomGenerator, HashCalculator } = require("@fluid-experimental/property-common");
_ = require('lodash');
const { PropertyFactory } = require('../..');
const { BaseProperty } = require('../..');
const deepCopy = _.cloneDeep;
const { PATH_TOKENS } = BaseProperty;

var OurArrayTestTemplate;
var arrayProp;
var testFailed = false;
var changeSet2;
var conflicts;

var possibleChanges = {
    0: 'insert',
    1: 'modify',
    2: 'remove',
};

var getRandomNumbersArray = function(in_size, randomGenerator) {
    var result = [];
    for (var i = 0; i < in_size; i++) {
        result.push(Math.floor(randomGenerator.random() * 100));
    }
    return result;
};

var compareArrays = function(ap1, ap2) {
    if (ap1.length !== ap2.length) {
        return false;
    }
    for (var i = 0; i !== ap1.length; i++) {
        if (ap1.getEntriesReadOnly()[i] !== ap2.getEntriesReadOnly()[i]) {
            return false;
        }
    }
    return true;
};

var TestArrayFloat32 = {
    typeid: 'autodesk.test:test.arrayfloat32-1.0.0',
    properties: [
        { id: 'data', typeid: 'Float32', context: 'array', length: 3 },
    ],
};

var TestArrayString = {
    typeid: 'autodesk.test:test.arraystring-1.0.0',
    properties: [
        { id: 'data', typeid: 'String', context: 'array', length: 3 },
    ],
};

var TestArrayBool = {
    typeid: 'autodesk.test:test.arraybool-1.0.0',
    properties: [
        { id: 'data', typeid: 'Bool', context: 'array', length: 3 },
    ],
};

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

var TestDynamicLengthArray = {
    typeid: 'autodesk.test:test.dynamicArray-1.0.0',
    properties: [
        { id: 'data', typeid: 'Int32', context: 'array' },
    ],
};

var TestDynamicLengthNonPrimitiveArray = {
    typeid: 'autodesk.test:test.nonPrimitiveArray-1.0.0',
    properties: [
        { id: 'data', typeid: 'autodesk.test:test.string-1.0.0', context: 'array' },
    ],
};

var OurArrayTestTemplate = {
    typeid: 'autodesk.tests:ArrayTestID-1.0.0',
    properties: [
        { id: 'MyArray', typeid: 'Float32', context: 'array' },
    ],
};

var NestedArrayTestTemplate = {
    typeid: 'autodesk.tests:NestedArrayTest-1.0.0',
    properties: [
        {
            id: 'nest', properties: [
                { id: 'MyArray', typeid: 'Float32', context: 'array' },
            ],
        },
    ],
};

var ComplexTemplate = {
    typeid: 'autodesk.tests:ComplexProp-1.0.0',
    properties: [
        {
            id: 'nest', properties: [
                { id: 'data', typeid: 'Float32' },
            ],
        },
    ],
};
var ComplexTemplate2 = {
    typeid: 'autodesk.tests:ComplexProp2-1.0.0',
    properties: [
        {
            id: 'nest', properties: [
                { id: 'data2', typeid: 'Float32' },
            ],
        },
    ],
};
var ComplexTemplate3 = {
    typeid: 'autodesk.tests:ComplexProp3-1.0.0',
    properties: [
        { id: 'complex1', typeid: 'autodesk.tests:ComplexProp-1.0.0' },
        { id: 'complex2', typeid: 'autodesk.tests:ComplexProp2-1.0.0' },
    ],
};

var ComplexArrayTemplate = {
    typeid: 'autodesk.tests:ComplexArray-1.0.0',
    properties: [
        { id: 'myarray', typeid: 'autodesk.tests:ComplexProp-1.0.0', context: 'array' },
    ],
};
var Complex3ArrayTemplate = {
    typeid: 'autodesk.tests:Complex3Array-1.0.0',
    properties: [
        { id: 'myarray', typeid: 'autodesk.tests:ComplexProp3-1.0.0', context: 'array' },
    ],
};

describe('ArrayProperty', function() {
    /**
     * Get all the objects we need in this test here.
     */
    before(function() {
        PropertyFactory._reregister(OurArrayTestTemplate);
        PropertyFactory._reregister(TestArrayFloat32);
        PropertyFactory._reregister(TestString);
        PropertyFactory._reregister(TestCustomArray);
        PropertyFactory._reregister(TestArrayString);
        PropertyFactory._reregister(TestArrayBool);
        PropertyFactory._reregister(TestDynamicLengthArray);
        PropertyFactory._reregister(TestDynamicLengthNonPrimitiveArray);
        PropertyFactory._reregister(NestedArrayTestTemplate);
        PropertyFactory._reregister(ComplexArrayTemplate);
        PropertyFactory._reregister(ComplexTemplate);
        PropertyFactory._reregister(ComplexTemplate2);
        PropertyFactory._reregister(ComplexTemplate3);
        PropertyFactory._reregister(Complex3ArrayTemplate);
    });

    describe('API methods - non primitive arrays', function() {
        var myProp, stringProp1, stringProp2, stringProp3, stringProp4, myArray;
        before(function() {
            myProp = PropertyFactory.create('autodesk.test:test.nonPrimitiveArray-1.0.0');
            stringProp1 = PropertyFactory.create('autodesk.test:test.string-1.0.0');
            stringProp2 = PropertyFactory.create('autodesk.test:test.string-1.0.0');
            stringProp3 = PropertyFactory.create('autodesk.test:test.string-1.0.0');
            stringProp4 = PropertyFactory.create('autodesk.test:test.string-1.0.0');
            myArray = myProp.get('data');
        });

        it('.clear should remove all items from an array and return nothing', function() {
            myArray.push(stringProp1);
            myArray.push(stringProp2);
            expect(myArray.length).to.equal(2);
            expect(myArray.clear()).to.equal(undefined);
            expect(myArray.length).to.equal(0);
        });

        it('.clear should work on an empty array', function() {
            expect(function() { myArray.clear(); }).to.not.throw();
            expect(function() { myArray.clear(); }).to.not.throw();
        });

        it('.get should return a property', function() {
            myArray.push(stringProp1);
            var result = myArray.get(0) instanceof BaseProperty;
            expect(result).to.be.true;
            expect(myArray.get(0)).to.deep.equal(stringProp1);
        });

        it('.get should return a target deferenced by a chain of reference properties', function() {
            let root = PropertyFactory.create('NodeProperty');
            let reference = PropertyFactory.create('Reference');
            let reference2 = PropertyFactory.create('Reference');
            let reference3 = PropertyFactory.create('Reference');
            let reference4 = PropertyFactory.create('Reference');
            let reference5 = PropertyFactory.create('Reference');
            let target = PropertyFactory.create('String');
            root.insert('array', myProp);
            root.insert('reference', reference);
            root.insert('reference2', reference2);
            root.insert('reference3', reference3);
            root.insert('reference4', reference4);
            root.insert('target', target);

            reference.set(target);
            reference2.set('/reference');
            reference3.set('/reference2');
            reference4.set('/reference3');
            reference5.set('/reference4');
            myArray.push(reference5);

            expect(myArray.get(0)).to.deep.equal(target);
            root.clear();
        });

        it('.get should return a target deferenced by a chain of reference properties with *', function() {
            let root = PropertyFactory.create('NodeProperty');
            let reference = PropertyFactory.create('Reference');
            let reference2 = PropertyFactory.create('Reference');
            let reference3 = PropertyFactory.create('Reference');
            let reference4 = PropertyFactory.create('Reference');
            let reference5 = PropertyFactory.create('Reference');
            let target = PropertyFactory.create('String');
            root.insert('array', myProp);
            root.insert('reference', reference);
            root.insert('reference2', reference2);
            root.insert('reference3', reference3);
            root.insert('reference4', reference4);
            root.insert('target', target);

            reference.set(target);
            reference2.set('/reference');
            reference3.set('/reference2*');
            reference4.set('/reference3');
            reference5.set('/reference4');
            myArray.push(reference5);

            expect(myArray.get(0)).to.deep.equal(reference2);
            root.clear();
        });

        it('.get should work with an array to return nested values', function() {
            var myComplexArray = PropertyFactory.create('autodesk.tests:ComplexArray-1.0.0')._properties.myarray;
            var myComplexProp = PropertyFactory.create('autodesk.tests:ComplexProp-1.0.0');
            myComplexArray.push(myComplexProp);
            expect(myComplexArray.get([0, 'nest'])).to.deep.equal(myComplexArray.get(0).get('nest'));
        });

        it('.get should work with an array as input', function() {
            var testProperty1 = PropertyFactory.create('autodesk.tests:ComplexProp-1.0.0');
            testProperty1.get('nest').get('data').setValue(1);
            var testProperty2 = PropertyFactory.create('autodesk.tests:ComplexProp-1.0.0');
            testProperty2.get('nest').get('data').setValue(2);
            var myArray1 = PropertyFactory.create('autodesk.tests:ComplexArray-1.0.0')._properties.myarray;
            myArray1.push(testProperty1);
            myArray1.push(testProperty2);
            expect(myArray1.get([0, 'nest', 'data']).getValue()).to.equal(1);
        });
        it('.get should accept raise level tokens', function() {
            var testProperty1 = PropertyFactory.create('autodesk.tests:ComplexProp-1.0.0');
            testProperty1.get('nest').get('data').setValue(7);
            var testProperty2 = PropertyFactory.create('autodesk.tests:ComplexProp-1.0.0');
            testProperty2.get('nest').get('data').setValue(8);
            var myArray1 = PropertyFactory.create('autodesk.tests:ComplexArray-1.0.0')._properties.myarray;
            myArray1.push(testProperty1);
            myArray1.push(testProperty2);
            expect(myArray1.get([PATH_TOKENS.UP, 'myarray', 0, 'nest',
            PATH_TOKENS.UP, PATH_TOKENS.UP, 1, 'nest', 'data'])
                .getValue()).to.equal(8);
        });
        it('.get should accept path root tokens', function() {
            var testProperty1 = PropertyFactory.create('autodesk.tests:ComplexProp-1.0.0');
            testProperty1.get('nest').get('data').setValue(3);
            var testProperty2 = PropertyFactory.create('autodesk.tests:ComplexProp-1.0.0');
            testProperty2.get('nest').get('data').setValue(6);
            var testProperty3 = PropertyFactory.create('autodesk.tests:ComplexProp-1.0.0');
            testProperty3.get('nest').get('data').setValue(9);
            var myArrayProp = PropertyFactory.create('autodesk.tests:ComplexArray-1.0.0');
            var myArray1 = myArrayProp._properties.myarray;
            myArray1.insertRange(0, [testProperty1, testProperty2, testProperty3]);
            expect(myArray1.get([PATH_TOKENS.ROOT])).to.equal(myArrayProp);
            expect(myArray1.get([PATH_TOKENS.ROOT, 'myarray', 2])).to.equal(testProperty3);
        });

        it('.getEntriesReadOnly should return an array', function() {
            myArray.push(stringProp1);
            myArray.push(stringProp2);
            expect(myArray.getEntriesReadOnly()).to.deep.equal([stringProp1, stringProp2]);
        });

        it('.getFullTypeid will return a string of the full type id with or without collection', function() {
            // defaults to false
            expect(myArray.getFullTypeid()).to.equal('array<autodesk.test:test.string-1.0.0>');
            // in_hideCollection: true
            expect(myArray.getFullTypeid(true)).to.equal('autodesk.test:test.string-1.0.0');
        });

        it('.getIds should return an array of string indexes', function() {
            myArray.push(stringProp1);
            myArray.push(stringProp2);
            expect(myArray.getIds()).to.deep.equal(['0', '1']);
        });

        it('.getLength should return the length of the array', function() {
            expect(myArray.getLength()).to.equal(0);
            myArray.push(stringProp1);
            myArray.push(stringProp2);
            expect(myArray.getLength()).to.equal(2);
        });

        it('.has should work', function() {
            myArray.push(stringProp1);
            myArray.push(stringProp2);
            expect(myArray.has(1)).to.be.true;
            expect(myArray.has(2)).to.be.false;
        });

        it('.getRelativePath should return a valid path', function() {
            var testProperty1 = PropertyFactory.create('autodesk.tests:ComplexProp-1.0.0');
            var testProperty2 = PropertyFactory.create('autodesk.tests:ComplexProp-1.0.0');
            var myArray1 = PropertyFactory.create('autodesk.tests:ComplexArray-1.0.0')._properties.myarray;
            myArray1.push(testProperty1);
            myArray1.push(testProperty2);
            expect(myArray1.get([0, 'nest', 'data']).getRelativePath(myArray1)).to.equal('[0].nest.data');
            expect(myArray1.getRelativePath(myArray1.get([0, 'nest', 'data']))).to.equal('../../../');
            expect(myArray1.get([0, 'nest']).getRelativePath(myArray1.get([1, 'nest', 'data'])))
                .to.equal('../../../[0].nest');
        });

        it('.getValues should return an array of objects', function() {
            myArray.push(stringProp1);
            myArray.push(stringProp2);

            myArray.setValues({
                0: {
                    data: 'newTest',
                },
            });
            expect(myArray.getValues()).to.deep.equal([
                {
                    data: 'newTest',
                },
                {
                    data: '',
                },
            ]);
        });

        it('.insert should insert a new property in a non primitive array', function() {
            myArray.insert(0, stringProp1);
            expect(myArray.getLength()).to.equal(1);
            expect(myArray.get(0)).to.deep.equal(stringProp1);
            myArray.insert(1, stringProp2);
            expect(myArray.getLength()).to.equal(2);
        });

        it('.insert should push existing values to the right if index already has a property', function() {
            myArray.insert(0, stringProp1);
            myArray.insert(0, stringProp2);
            expect(myArray.getEntriesReadOnly()).to.deep.equal([stringProp2, stringProp1]);
        });

        it('.insertRange should insert new properties', function() {
            myArray.insertRange(0, [stringProp1, stringProp2]);
            expect(myArray.getLength()).to.equal(2);
            expect(myArray.get(1)).to.deep.equal(stringProp2);
        });

        it('.insertRange should push existing values to the right if index already has a property', function() {
            myArray.insert(0, stringProp1);
            myArray.insertRange(0, [stringProp2, stringProp3]);
            expect(myArray.getEntriesReadOnly()).to.deep.equal([stringProp2, stringProp3, stringProp1]);
        });

        it('pop should remove only last element of an array and return the removed element', function() {
            var myDynamicArray = PropertyFactory.create('autodesk.test:test.nonPrimitiveArray-1.0.0')._properties.data;
            expect(myDynamicArray.length).to.equal(0);
            var firstString = PropertyFactory.create('autodesk.test:test.string-1.0.0');
            var secondString = PropertyFactory.create('autodesk.test:test.string-1.0.0');
            var thirdString = PropertyFactory.create('autodesk.test:test.string-1.0.0');
            var fourthString = PropertyFactory.create('autodesk.test:test.string-1.0.0');
            var fifthString = PropertyFactory.create('autodesk.test:test.string-1.0.0');

            myDynamicArray.push(firstString);
            myDynamicArray.push(secondString);
            myDynamicArray.push(thirdString);
            expect(myDynamicArray.length).to.equal(3);

            myDynamicArray.pop();
            expect(myDynamicArray.length).to.equal(2);
            expect(myDynamicArray.get(0)).to.equal(firstString);
            expect(myDynamicArray.get(1)).to.equal(secondString);
            expect(function() {
                myDynamicArray.get(2);
            }).to.throw(Error);

            myDynamicArray.push(thirdString);
            expect(myDynamicArray.pop()).to.deep.equal(thirdString);
            myDynamicArray.push(fourthString);
            myDynamicArray.pop();
            myDynamicArray.push(fifthString);
            myDynamicArray.pop();
            myDynamicArray.pop();
            myDynamicArray.pop();
            expect(myDynamicArray.length).to.equal(0);
            expect(function() { myDynamicArray.get(1); }).to.throw(Error);
            expect(myDynamicArray.pop()).to.equal(undefined);
        });

        it('push should add the element to the last position and return the new length of the array', function() {
            var myDynamicArray = PropertyFactory.create('autodesk.test:test.nonPrimitiveArray-1.0.0')._properties.data;
            expect(myDynamicArray.length).to.equal(0);
            var firstString = PropertyFactory.create('autodesk.test:test.string-1.0.0');
            var secondString = PropertyFactory.create('autodesk.test:test.string-1.0.0');
            expect(myDynamicArray.push(firstString)).to.equal(1);
            myDynamicArray.push(secondString);
            expect(myDynamicArray.length).to.equal(2);
            expect(myDynamicArray.get(0)).to.equal(firstString);
            expect(myDynamicArray.get(1)).to.equal(secondString);
            expect(function() {
                myDynamicArray.get(2);
            }).to.throw(Error);
        });

        it('.remove should remove an element from an array, moving remaining elements to the left', function() {
            myArray.push(stringProp1);
            myArray.push(stringProp2);
            myArray.remove(1);
            expect(myArray.length).to.equal(1);
            myArray.push(stringProp3);
            myArray.remove(0);
            expect(myArray.getEntriesReadOnly()).to.deep.equal([stringProp3]);
        });

        it('.removeRange should remove a range of elements from an array and move the remaining elements to the left',
            function() {
                myArray.push(stringProp1);
                myArray.push(stringProp2);
                myArray.push(stringProp3);
                expect(myArray.length).to.equal(3);
                myArray.removeRange(0, 2);
                expect(myArray.getEntriesReadOnly()).to.deep.equal([stringProp3]);
            });

        it('.remove and .removeRange should return the items deleted', function() {
            myArray.push(stringProp1);
            myArray.push(stringProp2);
            myArray.push(stringProp3);
            expect(myArray.remove(0)).to.deep.equal(stringProp1);
            expect(myArray.removeRange(0, 2)).to.deep.equal([stringProp2, stringProp3]);
        });

        it('.set changes an existing element', function() {
            myArray.insertRange(0, [stringProp1, stringProp2]);
            myArray.set(1, stringProp3);
            expect(myArray.getEntriesReadOnly()).to.deep.equal([stringProp1, stringProp3]);
        });

        it('.setRange changes a range of existing elements', function() {
            myArray.insertRange(0, [stringProp1, stringProp2]);
            myArray.setRange(0, [stringProp3, stringProp4]);
            expect(myArray.getEntriesReadOnly()).to.deep.equal([stringProp3, stringProp4]);
        });

        it('.set and .setRange should throw if trying to set a non-existing element', function() {
            myArray.insertRange(0, [stringProp1, stringProp2]);
            var incorrectFn1 = function() {
                myArray.set(3, stringProp3);
            };
            expect(incorrectFn1).to.throw(MSG.SET_OUT_OF_BOUNDS);
        });

        it('.setRange should throw if the offset is not an integer', function() {
            myArray.insertRange(0, [stringProp1, stringProp2]);
            expect(() => { myArray.setRange('test', [stringProp3, stringProp4]); }).to.throw(MSG.NOT_NUMBER);
        });

        it('.setRange should throw if the in_array argument is not an array', function() {
            myArray.insertRange(0, [stringProp1, stringProp2]);
            expect(() => { myArray.setRange(1, stringProp3); }).to.throw(MSG.IN_ARRAY_NOT_ARRAY + 'ArrayProperty.setRange');
        });

        it('.set should throw if the offset is not an integer', function() {
            myArray.insertRange(0, [stringProp1, stringProp2]);
            expect(() => { myArray.set('test', stringProp3); }).to.throw(MSG.NOT_NUMBER);
        });

        it('.set should throw if the in_value is an array', function() {
            myArray.insertRange(0, [stringProp1, stringProp2]);
            expect(() => { myArray.set(0, [stringProp3, stringProp4]); }).to.throw(MSG.ARRAY_SET_ONE_ELEMENT);
        });

        it('.setValues should work for custom type arrays', function() {
            myArray.push(stringProp1);
            myArray.push(stringProp2);
            myArray.setValues({
                0: {
                    data: 'newTest',
                },
            });
            expect(myArray.getValues()).to.deep.equal([{ data: 'newTest' }, { data: '' }]);

            stringProp3._properties.data.setValue('newNewTest');
            myArray.setValues([stringProp3]);
            expect(myArray.getLength()).to.equal(1);
            expect(myArray.getValues()).to.deep.equal([{ data: 'newNewTest' }]);
        });

        it('.setValues should work to overwrite the whole array', function() {
            myArray.push(stringProp1);
            myArray.push(stringProp2);
            stringProp3._properties.data.setValue('testing 123');
            myArray.setValues([stringProp3]);
            expect(myArray.getValues()).to.deep.equal([{ data: 'testing 123' }]);
            expect(myArray.length).to.equal(1);
        });

        it('.setValues should work to overwrite part of the array', function() {
            myArray.push(stringProp1);
            myArray.push(stringProp2);
            myArray.setValues({ 0: { data: 'test test test' } });
            expect(myArray.getValues()).to.deep.equal([{ data: 'test test test' }, { data: '' }]);
        });

        it('.shift should remove the first element of an array and return the removed element', function() {
            myArray.push(stringProp1);
            myArray.push(stringProp2);
            myArray.shift();
            expect(myArray.getEntriesReadOnly()).to.deep.equal([stringProp2]);
            expect(myArray.shift()).to.deep.equal(stringProp2);
            expect(myArray.length).to.equal(0);
        });

        it('.shift should return undefined if called on an empty array', function() {
            expect(myArray.shift()).to.be.undefined;
        });

        it('.unshift should add a property at the beginnig of an array and return the new length of the array',
            function() {
                myArray.push(stringProp1);
                myArray.push(stringProp2);
                myArray.unshift(stringProp3);
                expect(myArray.getEntriesReadOnly()).to.deep.equal([stringProp3, stringProp1, stringProp2]);
                expect(myArray.unshift(stringProp4)).to.equal(4);
            });

        afterEach(function() {
            myArray.clear();
        });
    });

    describe('API methods - primitive arrays', function() {
        var myPrimitiveArray;
        before(function() {
            myPrimitiveArray = PropertyFactory.create('autodesk.test:test.dynamicArray-1.0.0')._properties.data;
        });

        it('.clear should remove all elements in the array', function() {
            myPrimitiveArray.insertRange(0, [1, 2, 3]);
            expect(myPrimitiveArray.length).to.equal(3);
            myPrimitiveArray.clear();
            expect(myPrimitiveArray.length).to.equal(0);
        });

        it('.get should return a value', function() {
            myPrimitiveArray.insertRange(0, [1, 2, 3]);
            var result = myPrimitiveArray.get(0);
            expect(result).to.equal(1);
        });

        it('.getEntriesReadOnly should return an array', function() {
            myPrimitiveArray.insertRange(0, [1, 2, 3]);
            const result = myPrimitiveArray.getEntriesReadOnly();
            assert.equal(result.length, 3);
            assert.equal(result[0], 1);
            assert.equal(result[1], 2);
            assert.equal(result[2], 3);
        });

        it('getFullTypeid should return a string of the typeid with or without collection', function() {
            expect(myPrimitiveArray.getFullTypeid()).to.equal('array<Int32>');
            expect(myPrimitiveArray.getFullTypeid(true)).to.equal('Int32');
        });

        it('.getIds should return an array of index strings', function() {
            myPrimitiveArray.insertRange(0, [1, 2, 3]);
            expect(myPrimitiveArray.getIds()).to.deep.equal(['0', '1', '2']);
        });

        it('.getLength should return the length of the array', function() {
            expect(myPrimitiveArray.getLength()).to.equal(0);
            myPrimitiveArray.insertRange(0, [1, 2, 3]);
            expect(myPrimitiveArray.getLength()).to.equal(3);
        });

        it('.has should work', function() {
            myPrimitiveArray.insertRange(0, [1, 2, 3]);
            expect(myPrimitiveArray.has(1)).to.be.true;
            expect(myPrimitiveArray.has(4)).to.be.false;
        });

        it('.setValues and .getValues should work for primitive arrays', function() {
            // tests for getValues on typed arrays fail but only on PhantomJS.
            if (isBrowser && window.top.callPhantom) {
                this.skip();
            }
            var MyArrayProp = PropertyFactory.create('autodesk.test:test.dynamicArray-1.0.0')._properties.data;
            MyArrayProp.insertRange(0, [1, 2, 3]);
            MyArrayProp.setValues({
                0: 12,
                2: 9,
            });

            expect(MyArrayProp.getValues()).to.deep.equal([12, 2, 9]);

            MyArrayProp.setValues([3, 4]);
            expect(MyArrayProp.get(0)).to.equal(3);
            expect(function() { MyArrayProp.get(2); }).to.throw();
        });

        it('.insert should insert a value in a primitive array and move other values to the right', function() {
            myPrimitiveArray.insert(0, 1);
            expect(myPrimitiveArray.length).to.equal(1);
            myPrimitiveArray.insert(0, 2);
            expect(myPrimitiveArray.getValues()).to.deep.equal([2, 1]);
        });

        it('.insertRange should insert a range of values and move other values to the right', function() {
            myPrimitiveArray.insertRange(0, [1, 2, 3]);
            expect(myPrimitiveArray.length).to.equal(3);
            myPrimitiveArray.insertRange(1, [4, 5]);
            expect(myPrimitiveArray.getValues()).to.deep.equal([1, 4, 5, 2, 3]);
        });

        it('.pop should remove the last item of a primitive array and return the removed value', function() {
            var myArray = PropertyFactory.create('autodesk.test:test.dynamicArray-1.0.0')._properties.data;
            myArray.push(1);
            myArray.push(2);
            myArray.push(3);
            expect(myArray.length).to.equal(3);
            myArray.pop();
            expect(myArray.length).to.equal(2);
            expect(myArray.getValues()).to.deep.equal([1, 2]);
            expect(myArray.pop()).to.equal(2);
        });

        it('.pop should return undefined if called on an empty array', function() {
            expect(myPrimitiveArray.pop()).to.be.undefined;
        });

        it('.push should add a value at the end of the array and return the new length', function() {
            myPrimitiveArray.push(1);
            myPrimitiveArray.push(2);
            expect(myPrimitiveArray.getValues()).to.deep.equal([1, 2]);
            expect(myPrimitiveArray.push(4)).to.equal(3);
        });

        it('.remove should remove an element from the array and return that element', function() {
            myPrimitiveArray.insertRange(0, [1, 2, 3]);
            expect(myPrimitiveArray.remove(0)).to.equal(1);
            expect(myPrimitiveArray.getValues()).to.deep.equal([2, 3]);
        });

        it('.removeRange should remove a range of elements from an array and return those elements', function() {
            myPrimitiveArray.insertRange(0, [1, 2, 3, 4, 5]);
            expect(myPrimitiveArray.removeRange(2, 2)).to.deep.equal([3, 4]);
            expect(myPrimitiveArray.getValues()).to.deep.equal([1, 2, 5]);
        });

        it('.resolvePath should work on primitive arrays', function() {
            myPrimitiveArray.insertRange(0, [1, 2, 3]);
            expect(myPrimitiveArray.resolvePath('1')).to.equal(2);
        });

        it('.set should replace a value in a primitive array', function() {
            var myArray = PropertyFactory.create('autodesk.test:test.dynamicArray-1.0.0')._properties.data;
            myArray.push(1);
            myArray.push(2);
            myArray.push(3);
            myArray.set(2, 8);
            expect(myArray.get(2)).to.equal(8);
            expect(myArray.getValues()).to.deep.equal([1, 2, 8]);
        });

        it('.setRange should replace values in a primitive array', function() {
            var myArray = PropertyFactory.create('autodesk.test:test.dynamicArray-1.0.0')._properties.data;
            myArray.push(1);
            myArray.push(2);
            myArray.push(3);
            myArray.setRange(1, [4, 5]);
            expect(myArray.get(1)).to.equal(4);
            expect(myArray.get(2)).to.equal(5);
            expect(myArray.getValues()).to.deep.equal([1, 4, 5]);
        });

        it('.setRange should replace last value in a primitive array', function() {
            var myArray = PropertyFactory.create('autodesk.test:test.dynamicArray-1.0.0')._properties.data;
            myArray.insertRange(0, [1, 2, 3, 4, 5]);
            myArray.setRange(0, [1, 2, 3, 10, 11]);
            expect(myArray.getValues()).to.deep.equal([1, 2, 3, 10, 11]);
        });

        it('.setValues should work to overwrite a whole array', function() {
            arrayProp = PropertyFactory.create('autodesk.test:test.dynamicArray-1.0.0')._properties.data;
            arrayProp.insertRange(0, [1, 2, 3]);
            expect(arrayProp.get(2)).to.equal(3);
            arrayProp.setValues([13, 14]);
            expect(arrayProp.get(0)).to.equal(13);
            var incorrectFn = function() {
                arrayProp.get(2);
            };
            expect(incorrectFn).to.throw();
        });

        it('setValues should work to overwrite part of the array', function() {
            var myArrayProp = PropertyFactory.create('autodesk.test:test.dynamicArray-1.0.0')._properties.data;
            myArrayProp.insertRange(0, [1, 2, 3]);
            expect(myArrayProp.get(2)).to.equal(3);

            myArrayProp.setValues({
                0: 11,
                1: 12,
            });
            expect(myArrayProp.get(0)).to.equal(11);
            var correctFn = function() {
                myArrayProp.get(2);
            };
            expect(correctFn).to.not.throw();
            expect(myArrayProp.get(2)).to.equal(3);
        });

        it('.shift should remove the first element of the array and return that element', function() {
            myPrimitiveArray.insertRange(0, [1, 2, 3, 4]);
            expect(myPrimitiveArray.shift()).to.equal(1);
            expect(myPrimitiveArray.getValues()).to.deep.equal([2, 3, 4]);
        });

        it('.unshift should add a value to the beginning of the array and return the new length', function() {
            myPrimitiveArray.insertRange(0, [1, 2, 3, 4]);
            myPrimitiveArray.unshift(5);
            expect(myPrimitiveArray.unshift(13)).to.equal(6);
            expect(myPrimitiveArray.getValues()).to.deep.equal([13, 5, 1, 2, 3, 4]);
        });

        afterEach(function() {
            myPrimitiveArray.clear();
        });
    });

    describe('testing specific types of arrays', function() {
        it('should support boolean arrays', function() {
            var myBoolArray = PropertyFactory.create('autodesk.test:test.arraybool-1.0.0')._properties.data;
            expect(myBoolArray.length).to.equal(3);

            expect(myBoolArray.get(0)).to.equal(false);
            expect(myBoolArray.get(1)).to.equal(false);
            expect(myBoolArray.get(2)).to.equal(false);
            expect(function() { myBoolArray.get(3); }).to.throw(Error);

            myBoolArray.push(true);
            myBoolArray.push(0);

            expect(myBoolArray.getLength().should.equal(5));
            expect(myBoolArray.get(3)).to.equal(true);
            expect(myBoolArray.get(4)).to.equal(false);

            myBoolArray.pop();
            expect(myBoolArray.getLength().should.equal(4));

            myBoolArray.insert(0, 1);
            expect(myBoolArray.get(0)).to.equal(true);
        });

        it('.set and .get should convert float index to int', function() {
            var myArray = PropertyFactory.create('String', 'array', ['item 0', 'item 1', 'item 2']);
            myArray.set(1.2, 'item 1.2');
            expect(myArray.getLength()).to.equal(3);
            expect(myArray.get(1.6)).to.equal('item 1.2');
        });

        it('.set and .get should convert string index to int', function() {
            var myArray = PropertyFactory.create('String', 'array', ['item 0', 'item 1', 'item 2']);
            myArray.set('0.3', 'item 0.3');
            expect(myArray.getLength()).to.equal(3);
            expect(myArray.get('0.6')).to.equal('item 0.3');
        });

        it('.set and .get should reject float index that cannot be converted to int', function() {
            var myArray = PropertyFactory.create('String', 'array', ['item 0', 'item 1', 'item 2']);
            expect(() => myArray.set(Infinity, 'item infinity')).to.throw(MSG.NOT_NUMBER +
                'in_offset, method: ArrayProperty.setRange or .set');
            expect(() => myArray.get(NaN)).to.throw(MSG.IN_POSITION_MUST_BE_NUMBER);
        });

        it('.set and .get should reject string index that can not be converted to int', function() {
            var myArray = PropertyFactory.create('String', 'array', ['item 0', 'item 1', 'item 2']);
            expect(() => myArray.set('2abc', 'item 2abc')).to.throw(MSG.NOT_NUMBER +
                'in_offset, method: ArrayProperty.setRange or .set');
            expect(() => myArray.get('2abc')).to.throw(MSG.IN_POSITION_MUST_BE_NUMBER);
        });
    });

    describe('Checking the generalized squash function of ArrayProperty', function() {
        it('should be squashed to the expected changeset', function(done) {
            var error;
            try {
                arrayProp = PropertyFactory.create('autodesk.tests:ArrayTestID-1.0.0')._properties.MyArray;

                arrayProp.applyChangeSet({
                    'insert': [[0, [0, 0]]],
                });

                arrayProp.cleanDirty();

                arrayProp.applyChangeSet({
                    'insert': [[0, [2, 3]]],
                });

                arrayProp.applyChangeSet({
                    'modify': [[1, [9, 44]]],
                });

                arrayProp.applyChangeSet({
                    'insert': [[3, [6, 7, 8]]],
                });

                arrayProp.applyChangeSet({
                    'remove': [[4, 1]],
                });

                arrayProp.applyChangeSet({
                    'modify': [[5, [9]]],
                });
            } catch (e) {
                error = e;
            } finally {
                expect(arrayProp).to.not.equal(null);
                expect(arrayProp._getDirtyChanges()).to.deep.equal(
                    {
                        'insert': [[0, [2, 9]], [1, [6, 8]]],
                        'modify': [[0, [44, 9]]],
                    },
                );
                expect(error).to.equal(undefined);
                done();
            }
        });

        it('Merging of reversible modifications', function() {
            var base = {
                'array<Float32>': {
                    'value': {
                        'modify': [
                            [
                                0,
                                [
                                    2,
                                ],
                                [
                                    1,
                                ],
                            ],
                        ],
                    },
                },
            };
            var mod = {
                'array<Float32>': {
                    'value': {
                        'modify': [
                            [
                                0,
                                [
                                    3,
                                ],
                                [
                                    2,
                                ],
                            ],
                        ],
                    },
                },
            };
            var testChangeSet = new ChangeSet(base);
            testChangeSet.applyChangeSet(mod);
            var CS = testChangeSet.getSerializedChangeSet();
            expect(CS['array<Float32>'].value.modify[0].length).to.equal(3);
            expect(CS['array<Float32>'].value.modify[0][1][0]).to.equal(3); // Value after modification
            expect(CS['array<Float32>'].value.modify[0][2][0]).to.equal(1); // Value before modification
        });

        it('[random numbers test] - the resulting insert should be equal to the data array', function(done) {
            var error;
            this.timeout(120000); // When the code is instrumented for coverage analysis, it takes a lot of time.
            for (let j = 0; j < 10; j++) {
                const random = new DeterministicRandomGenerator(j);

                try {
                    arrayProp = PropertyFactory.create('autodesk.tests:ArrayTestID-1.0.0')._properties.MyArray;

                    arrayProp.applyChangeSet({ 'insert': [[0, [1, 2, 3, 4, 5, 6, 7, 8, 9]]] });
                    arrayProp.cleanDirty();
                    var currentArrayLength;

                    for (var i = 0; i < 1000; ++i) {
                        currentArrayLength = arrayProp.length;
                        var nextOpType = 'insert';
                        var opOffset = 0;

                        if (currentArrayLength > 0) {
                            nextOpType = possibleChanges[Math.floor(random.random() * 2.999999)];
                            opOffset = Math.min(Math.floor(random.random() * currentArrayLength), currentArrayLength - 1);
                        }

                        var opLength = 1 + Math.min(Math.floor(random.random() * (currentArrayLength - opOffset)),
                            currentArrayLength - opOffset - 1);

                        var nextChangeset = {};

                        switch (nextOpType) {
                            case 'remove':
                                {
                                    nextChangeset[nextOpType] = [[opOffset, opLength]];
                                    break;
                                }
                            case 'insert':
                                {
                                    nextChangeset[nextOpType] = [];
                                    nextChangeset[nextOpType].push([opOffset, getRandomNumbersArray(Math.floor(random.random() * 4 + 1), random)]);
                                    break;
                                }
                            case 'modify':
                                {
                                    nextChangeset[nextOpType] = [[opOffset,
                                        getRandomNumbersArray(Math.min(random.random() * 2 + 1, opLength), random)]];
                                    break;
                                }
                            // no default
                        }
                        arrayProp.applyChangeSet(nextChangeset);

                        var arrayPropTest = PropertyFactory.create('autodesk.tests:ArrayTestID-1.0.0')._properties.MyArray;
                        arrayPropTest.applyChangeSet({ 'insert': [[0, [1, 2, 3, 4, 5, 6, 7, 8, 9]]] });
                        arrayPropTest.cleanDirty();
                        arrayPropTest.applyChangeSet(arrayProp._getDirtyChanges());

                        if (!compareArrays(arrayProp, arrayPropTest)) {
                            console.warn('Bug found in iteration ', j, i);
                            console.log('Testresults: ');
                            console.log(JSON.stringify(nextChangeset));
                            console.log(arrayProp.getEntriesReadOnly());
                            console.log(arrayPropTest.getEntriesReadOnly());
                            console.log(JSON.stringify(arrayProp._getDirtyChanges()));
                            testFailed = true;
                            break;
                        }
                    }
                } catch (e) {
                    error = e;
                } finally {
                    expect(arrayProp).to.not.equal(null);
                    expect(testFailed).to.equal(false);
                    expect(error).to.equal(undefined);
                }
            }
            done();
        });
    });

    describe('Fixed Size arrays', function() {
        // Should throw an exception when you create a primitive type and try to add it to an array
        // that takes values of that primitive type
        it('should support fixed size arrays for a primitive type', function() {
            var myFloatArray = PropertyFactory.create('autodesk.test:test.arrayfloat32-1.0.0')._properties.data;

            expect(myFloatArray.length).to.equal(3);
            expect(myFloatArray.get(0)).to.equal(0);
            expect(myFloatArray.get(1)).to.equal(0);
            expect(myFloatArray.get(2)).to.equal(0);
            expect(function() { myFloatArray.get(3); }).to.throw(Error);

            // Array should be clean after creation and but full serialization should return an insert
            expect(myFloatArray._serialize(true)).to.be.empty; // Waiting for fix from OT
            expect(myFloatArray._serialize(false)).to.have.keys('insert');

            // This should throw
            // expect(function() { myFloatArray.push(10);}).to.throw(Error);
            // expect(function() { myFloatArray.removeRange(0,1);}).to.throw(Error);
        });

        it('should support fixed size arrays for a primitive type', function() {
            var myStringArray = PropertyFactory.create('autodesk.test:test.arraystring-1.0.0')._properties.data;

            expect(myStringArray.length).to.equal(3);
            expect(myStringArray.get(0)).to.equal('');
            expect(myStringArray.get(1)).to.equal('');
            expect(myStringArray.get(2)).to.equal('');
            expect(function() { myStringArray.get(3); }).to.throw(Error);

            // Array should be clean after creation and but full serialization should return an insert
            expect(myStringArray._serialize(true)).to.be.empty;
            expect(myStringArray._serialize(false)).to.have.keys('insert');

            // This should throw
            // expect(function() { myFloatArray.push('');}).to.throw(Error); // TODO: add all functions
            // expect(function() { myFloatArray.removeRange(0,1);}).to.throw(Error);
        });

        it('should support fixed size arrays for a complex type', function() {
            var myCustomArray = PropertyFactory.create('autodesk.test:test.customarray-1.0.0')._properties.data;

            expect(myCustomArray.length).to.equal(3);
            expect(myCustomArray.get(0)).to.be.instanceof(BaseProperty);
            expect(myCustomArray.get(1)).to.be.instanceof(BaseProperty);
            expect(myCustomArray.get(2)).to.be.instanceof(BaseProperty);
            expect(function() { myCustomArray.get(3); }).to.throw(Error);

            // Array should be clean after creation and but full serialization should return an insert
            expect(myCustomArray._serialize(true)).to.be.empty;
            expect(myCustomArray._serialize(false)).to.have.keys('insert');

            // This should throw
            // expect(function() {
            //   myCustomArray.push(PropertyFactory.create('autodesk.test:test.string-1.0.0'));
            // }).to.throw(Error);
            // expect(function() { myFloatArray.removeRange(0,1);}).to.throw(Error);
        });
    });

    describe('Checking normalized changeset ability of ArrayProperty', function() {
        it('should be equal to the expected value', function(done) {
            var error;
            try {
                arrayProp = PropertyFactory.create('autodesk.tests:ArrayTestID-1.0.0')._properties.MyArray;

                arrayProp.applyChangeSet({ 'insert': [[0, [0, 0]]] });
                arrayProp.applyChangeSet({ 'insert': [[1, [2, 3, 4, 5, 6, 7, 8, 9]]] });
                arrayProp.applyChangeSet({ 'insert': [[4, [222, 333]]] });
                arrayProp.applyChangeSet({ 'remove': [[2, 3]] });
                arrayProp.applyChangeSet({ 'modify': [[3, [33]]] });
                arrayProp.applyChangeSet({ 'remove': [[0, 2]] });
                arrayProp.applyChangeSet({ 'insert': [[0, [123, 456]]] });
            } catch (e) {
                error = e;
            } finally {
                expect(arrayProp).to.not.equal(null);
                expect(arrayProp._getDirtyChanges()).to.deep.equal(
                    {
                        'insert': [[0, [123, 456, 333, 33, 6, 7, 8, 9, 0]]],
                    },
                );
                expect(error).to.equal(undefined);
                done();
            }
        });

        it('[random numbers test] - the resulting insert should be equal to the data array', function(done) {
            var error;
            try {
                arrayProp = PropertyFactory.create('autodesk.tests:ArrayTestID-1.0.0')._properties.MyArray;
                var currentArrayLength = 0;
                const random = new DeterministicRandomGenerator(0);

                for (var i = 0; i < 1000; ++i) {
                    currentArrayLength = arrayProp.length;
                    var nextOpType = 'insert';
                    var opOffset = 0;

                    if (currentArrayLength > 0) {
                        nextOpType = possibleChanges[Math.floor(Math.random() * 2.999999)];
                        opOffset = Math.floor(Math.random() * (currentArrayLength - 0.000001));
                    }

                    var opLength = 1 + Math.floor(Math.random() * (currentArrayLength - opOffset - 0.0001));
                    if (opLength < 1) {
                        opLength = 1;
                    }

                    var nextChangeset = {};

                    switch (nextOpType) {
                        case 'remove':
                            {
                                nextChangeset[nextOpType] = [[opOffset, opLength]];
                                break;
                            }
                        case 'insert':
                            {
                                nextChangeset[nextOpType] = [];
                                nextChangeset[nextOpType].push([opOffset, getRandomNumbersArray(Math.floor(Math.random() * 4 + 1),
                                    random)]);
                                break;
                            }
                        case 'modify':
                            {
                                nextChangeset[nextOpType] = [[opOffset, getRandomNumbersArray(opLength, random)]];
                                break;
                            }
                        // no default
                    }
                    arrayProp.applyChangeSet(nextChangeset);
                }
            } catch (e) {
                error = e;
            } finally {
                expect(arrayProp).to.not.equal(null);
                expect(error).to.equal(undefined);
                if (arrayProp.getEntriesReadOnly().length > 0) {
                    expect(arrayProp._getDirtyChanges().insert[0][1])
                        .to.deep.equal(Array.prototype.slice.call(arrayProp.getEntriesReadOnly()));
                } else {
                    expect(arrayProp._getDirtyChanges().insert).to.equal(undefined);
                }
                done();
            }
        });
    });

    describe('Checking deserialization', function() {
        var runDeserializationTests = function(testArrayOperation, testArray, primitiveProperty) {
            // Serialization into an empty array
            var values = ['test1', 'test2'];
            testArrayOperation(values, { insert: [[0, values]] });

            // Overwriting with a different array
            var values = ['test3'];
            testArrayOperation(values, { insert: [[0, values]] });

            // A second deserialization to the same array should preserve the changeset
            var values = ['test3'];
            testArrayOperation(values, { insert: [[0, values]] });

            // Now we clean the array and overwrite
            testArray.cleanDirty();
            var values = ['test1', 'test2'];
            testArrayOperation(values, { insert: [[0, values]], remove: [[0, 1]] });

            // A second deserialization to the same array
            testArray.cleanDirty();
            var values = ['test1', 'test2'];
            if (primitiveProperty) {
                // should report no change for primitive properties
                testArrayOperation(values, {});
            } else {
                // Result in a replacement for non primitive properties
                testArrayOperation(values, { insert: [[0, values]], remove: [[0, 2]] });
            }

            // Creating an empty array
            testArray.cleanDirty();
            var values = [];
            testArrayOperation(values, { remove: [[0, 2]] });

            // A second serialization to an empty array should report no change
            testArray.cleanDirty();
            var values = [];
            testArrayOperation(values, {});
        };

        it('of a primitive array property', function() {
            var stringArray = PropertyFactory.create('String', 'array');

            var testArrayOperation = function(values, expectedChangeSet) {
                stringArray.deserialize(values.length !== 0 ? { insert: [[0, values]] } : {});
                expect(stringArray.getEntriesReadOnly()).to.deep.equal(values);
                expect(stringArray.serialize({
                    dirtyOnly: true,
                    dirtinessType: BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
                })).to.deep.equal(expectedChangeSet);
                expect(stringArray.serialize({
                    dirtyOnly: true,
                    dirtinessType: BaseProperty.MODIFIED_STATE_FLAGS.DIRTY_CHANGE,
                })).to.deep.equal(expectedChangeSet);
            };

            runDeserializationTests(testArrayOperation, stringArray, true);
        });

        it('of a custom type array', function() {
            var testArray = PropertyFactory.create('autodesk.test:test.string-1.0.0', 'array');

            var mapStringsToCustomType = function(strings) {
                return strings.map(function(x) {
                    return {
                        String: {
                            data: x,
                        },
                        typeid: 'autodesk.test:test.string-1.0.0',
                    };
                });
            };

            var testArrayOperation = function(values, expectedChangeSet) {
                testArray.deserialize(values.length !== 0 ? {
                    insert: [[0,
                        mapStringsToCustomType(values),
                    ]],
                } : {});
                expect(testArray.getEntriesReadOnly().map(function(x) {
                    return x.get('data').getValue();
                })).to.deep.equal(values);

                if (expectedChangeSet.insert) {
                    expectedChangeSet.insert[0][1] = mapStringsToCustomType(expectedChangeSet.insert[0][1]);
                }

                expect(testArray.serialize({
                    dirtyOnly: true,
                    dirtinessType: BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
                })).to.deep.equal(expectedChangeSet);
                expect(testArray.serialize({
                    dirtyOnly: true,
                    dirtinessType: BaseProperty.MODIFIED_STATE_FLAGS.DIRTY_CHANGE,
                })).to.deep.equal(expectedChangeSet);
            };

            runDeserializationTests(testArrayOperation, testArray, false);
        });
    });

    describe('Checking rebasing of an ArrayProperty', function() {
        it('a remove-modify should be correctly rebased to the given changeset and cause conflicts', function(done) {
            var error;
            try {
                arrayProp = PropertyFactory.create('autodesk.tests:ArrayTestID-1.0.0')._properties.MyArray;

                var arrayProp1 = PropertyFactory.create('autodesk.tests:ArrayTestID-1.0.0');
                // prepare initial state
                arrayProp1._properties.MyArray.applyChangeSet({ 'insert': [[0, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]] });

                // create a copy of this state
                var arrayProp2 = PropertyFactory.create('autodesk.tests:ArrayTestID-1.0.0');
                arrayProp2.deserialize(arrayProp1._serialize(false));

                // make sure the states are clear
                arrayProp1.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
                    BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
                arrayProp2.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
                    BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);

                // apply different operations to the two properties in parallel
                arrayProp1._properties.MyArray.applyChangeSet({ 'remove': [[2, 1], [4, 1], [6, 1]] });

                arrayProp2._properties.MyArray.applyChangeSet({ 'modify': [[2, [23, 24]], [5, [33, 34, 35]]] });

                // Get the ChangeSets
                var changeSet1 = new ChangeSet(arrayProp1._serialize(true));
                changeSet2 = arrayProp2._serialize(true);

                // Perform the actual rebase
                conflicts = [];
                changeSet1._rebaseChangeSet(changeSet2, conflicts);
            } catch (e) {
                error = e;
            } finally {
                expect(error).to.equal(undefined);
                expect(changeSet2).to.not.equal(null);
                expect(conflicts.length).to.equal(2);
                expect(conflicts).to.deep.equal(
                    [{
                        path: 'MyArray',
                        type: ChangeSet.ConflictType.ENTRY_MODIFIED_AFTER_REMOVE,
                        conflictingChange:
                        {
                            type: ChangeSet.ConflictType.COLLIDING_SET,
                            operation: [2, [23]],
                        },
                    },
                    {
                        path: 'MyArray',
                        type: ChangeSet.ConflictType.ENTRY_MODIFIED_AFTER_REMOVE,
                        conflictingChange:
                        {
                            type: ChangeSet.ConflictType.COLLIDING_SET,
                            operation: [6, [34]],
                        },
                    }],
                );

                expect(changeSet2['array<Float32>'].MyArray).to.deep.equal(
                    {
                        'modify': [[2, [24, 33, 35]]],
                    },
                );
                done();
            }
        });

        it('@bugfix ensure existing properties are unparented during deserialization', function() {
            // Bug caused by deserialization during rebase
            arrayProp = PropertyFactory.create(TestDynamicLengthNonPrimitiveArray.typeid);
            const customProp = PropertyFactory.create('autodesk.test:test.string-1.0.0');
            arrayProp.get('data').push(customProp);

            const state = arrayProp._serialize(false);
            arrayProp.deserialize(state);

            // Currently, with custom types, the system makes no attempt to detect if the data
            // is in fact unchanged. Eventually hopefully this will not be the case
            // But this test is looking at a bug, where due to the lack of optimization,
            // customProp will be removed from the arrayProp, and as a result customProp is
            // not a child of the array. The bug is, however, that it will still have a parent
            expect(arrayProp.isDirty()).to.equal(true); // If this fires then you've optimized this?
            expect(customProp.getParent()).to.equal(undefined);
        });

        it('rebase of independent modifies in array', function() {
            var arrayObj = PropertyFactory.create('autodesk.tests:Complex3Array-1.0.0');
            var arrayProperty = arrayObj.get('myarray');
            arrayProperty.insert(0, PropertyFactory.create('autodesk.tests:ComplexProp3-1.0.0'));
            arrayObj.cleanDirty();

            // Create the first change
            arrayProperty.get(0).get(['complex1', 'nest', 'data']).setValue(123);
            var changeSet1 = new ChangeSet(arrayObj.serialize({ dirtyOnly: true }));
            arrayObj.cleanDirty();

            // Create the second change
            arrayProperty.get(0).get(['complex2', 'nest', 'data2']).setValue(123);
            var secondChangeSet = arrayObj.serialize({ dirtyOnly: true });

            var changeSet2Copy = deepCopy(secondChangeSet);

            var conflictsArray = [];
            changeSet1._rebaseChangeSet(secondChangeSet, conflictsArray);

            expect(secondChangeSet).to.deep.equal(changeSet2Copy);
            expect(conflictsArray).to.be.empty;
        });

        // TODO: add more rebase tests here!
    });

    describe('Using prettyPrint()', function() {
        it('should output a pretty string with number items', function() {
            var property = PropertyFactory.create('autodesk.test:test.arrayfloat32-1.0.0');
            property.resolvePath('data').set(0, 4);
            property.resolvePath('data').set(1, 5);
            property.resolvePath('data').set(2, 6);
            var expectedPrettyStr =
                'undefined (autodesk.test:test.arrayfloat32-1.0.0):\n' +
                '  data (Array of Float32): [\n' +
                '    0: 4\n' +
                '    1: 5\n' +
                '    2: 6\n' +
                '  ]\n';
            var prettyStr = '';
            property.prettyPrint(function(str) {
                prettyStr += str + '\n';
            });
            expect(prettyStr).to.equal(expectedPrettyStr);
        });

        it('should output a pretty string with string items', function() {
            var property = PropertyFactory.create('autodesk.test:test.arraystring-1.0.0');
            var expectedPrettyStr =
                'undefined (autodesk.test:test.arraystring-1.0.0):\n' +
                '  data (Array of String): [\n' +
                '    0: ""\n' +
                '    1: ""\n' +
                '    2: ""\n' +
                '  ]\n';
            var prettyStr = '';
            property.prettyPrint(function(str) {
                prettyStr += str + '\n';
            });
            expect(prettyStr).to.equal(expectedPrettyStr);
        });

        it('should output a pretty string with custom items', function() {
            var property = PropertyFactory.create('autodesk.test:test.customarray-1.0.0');
            var expectedPrettyStr =
                'undefined (autodesk.test:test.customarray-1.0.0):\n' +
                '  data (Array of autodesk.test:test.string-1.0.0): [\n' +
                '    0: undefined (autodesk.test:test.string-1.0.0):\n' +
                '      data (String): ""\n' +
                '    1: undefined (autodesk.test:test.string-1.0.0):\n' +
                '      data (String): ""\n' +
                '    2: undefined (autodesk.test:test.string-1.0.0):\n' +
                '      data (String): ""\n' +
                '  ]\n';
            var prettyStr = '';
            property.prettyPrint(function(str) {
                prettyStr += str + '\n';
            });
            expect(prettyStr).to.equal(expectedPrettyStr);
        });
    });

    it('should push', function() {
        var array = PropertyFactory.create('String', 'array', [0, 1, 2]);
        array.push(3);
        array.getLength().should.equal(4);
        array.push([4, 5]);
        array.getLength().should.equal(6);
    });
    it('should pop', function() {
        var array = PropertyFactory.create('String', 'array', [0, 1, 2]);
        var element = array.pop();
        element.should.equal(2);
        array.pop();
        array.getLength().should.equal(1);
    });
    // there is no .shiftValue
    // should replace the value with a property
    it.skip('should shift', function() {
        var array = PropertyFactory.create('String', 'array', [0, 1, 2]);
        var element = array.shift();
        element.should.equal(0);
        var elements = array.shift(2);
        array.getLength().should.equal(0);
        elements.length.should.equal(2);
    });
    // there is no .unshiftValue
    // should replace the value with a property
    it.skip('should unshift', function() {
        var array = PropertyFactory.create('String', 'array', [0, 1, 2]);
        array.unshift(3);
        array.getLength().should.equal(4);
        array.unshift([4, 5]);
        array.getLength().should.equal(6);
    });

    it('should support boolean arrays', function() {
        var myBoolArray = PropertyFactory.create('autodesk.test:test.arraybool-1.0.0')._properties.data;
        expect(myBoolArray.length).to.equal(3);

        expect(myBoolArray.get(0)).to.equal(false);
        expect(myBoolArray.get(1)).to.equal(false);
        expect(myBoolArray.get(2)).to.equal(false);
        expect(function() { myBoolArray.get(3); }).to.throw(Error);

        myBoolArray.push(true);
        myBoolArray.push(0);

        expect(myBoolArray.getLength().should.equal(5));
        expect(myBoolArray.get(3)).to.equal(true);
        expect(myBoolArray.get(4)).to.equal(false);

        myBoolArray.pop();
        expect(myBoolArray.getLength().should.equal(4));

        myBoolArray.insert(0, 1);
        expect(myBoolArray.get(0)).to.equal(true);
    });

    it('.set and .get should convert float index to int', function() {
        var myArray = PropertyFactory.create('autodesk.test:test.string-1.0.0', 'array');
        var prop0 = PropertyFactory.create('autodesk.test:test.string-1.0.0', 'single', { data: 'item 0' });
        var prop1 = PropertyFactory.create('autodesk.test:test.string-1.0.0', 'single', { data: 'item 1' });
        var prop2 = PropertyFactory.create('autodesk.test:test.string-1.0.0', 'single', { data: 'item 2' });
        myArray.insertRange(0, [prop0, prop1, prop2]);
        var prop1_2 = PropertyFactory.create('autodesk.test:test.string-1.0.0', 'single', { data: 'item 1.2' });
        myArray.set(1.2, prop1_2);
        expect(myArray.getLength()).to.equal(3);
        expect(myArray.get(1.6)).to.equal(prop1_2);
    });

    it('.set and .get should convert string index to int', function() {
        var myArray = PropertyFactory.create('autodesk.test:test.string-1.0.0', 'array');
        var prop0 = PropertyFactory.create('autodesk.test:test.string-1.0.0', 'single', { data: 'item 0' });
        var prop1 = PropertyFactory.create('autodesk.test:test.string-1.0.0', 'single', { data: 'item 1' });
        var prop2 = PropertyFactory.create('autodesk.test:test.string-1.0.0', 'single', { data: 'item 2' });
        myArray.insertRange(0, [prop0, prop1, prop2]);
        var prop0_3 = PropertyFactory.create('autodesk.test:test.string-1.0.0', 'single', { data: 'item 0.3' });
        myArray.set('0.3', prop0_3);
        expect(myArray.getLength()).to.equal(3);
        expect(myArray.get('0.6')).to.equal(prop0_3);
    });

    it('.set and .get should reject float index that cannot be converted to int', function() {
        var myArray = PropertyFactory.create('autodesk.test:test.string-1.0.0', 'array');
        var prop0 = PropertyFactory.create('autodesk.test:test.string-1.0.0', 'single', { data: 'item 0' });
        var prop1 = PropertyFactory.create('autodesk.test:test.string-1.0.0', 'single', { data: 'item 1' });
        var prop2 = PropertyFactory.create('autodesk.test:test.string-1.0.0', 'single', { data: 'item 2' });
        myArray.insertRange(0, [prop0, prop1, prop2]);
        expect(() => myArray.set(Infinity, prop0)).to.throw(MSG.NOT_NUMBER + 'in_offset');
        expect(() => myArray.get(NaN)).to.throw(MSG.IN_POSITION_MUST_BE_NUMBER);
    });

    it('.setValue and .getValue should reject string index that can not be converted to int', function() {
        var myArray = PropertyFactory.create('autodesk.test:test.string-1.0.0', 'array');
        var prop0 = PropertyFactory.create('autodesk.test:test.string-1.0.0', 'single', { data: 'item 0' });
        var prop1 = PropertyFactory.create('autodesk.test:test.string-1.0.0', 'single', { data: 'item 1' });
        var prop2 = PropertyFactory.create('autodesk.test:test.string-1.0.0', 'single', { data: 'item 2' });
        myArray.insertRange(0, [prop0, prop1, prop2]);
        expect(() => myArray.set('2abc', prop0)).to.throw(MSG.NOT_NUMBER + 'in_offset');
        expect(() => myArray.get('2abc')).to.throw(MSG.IN_POSITION_MUST_BE_NUMBER);
    });
});
