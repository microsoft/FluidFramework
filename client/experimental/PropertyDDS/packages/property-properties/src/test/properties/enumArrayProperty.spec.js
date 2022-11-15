/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview In this file, we will test the functions of a EnumArrayProperty object
 * described in /src/properties/enumArrayProperty.js
 */
var PropertyFactory, MSG;

describe('EnumArrayProperty', function() {
    /**
     * Get all the objects we need in this test here.
     */
    before(function() {
        MSG = require('@fluid-experimental/property-common').constants.MSG;
        PropertyFactory = require('../..').PropertyFactory;
        const enumUnoDosTresSchema = {
            inherits: 'Enum',
            properties: [
                { id: 'uno', value: 1 },
                { id: 'dos', value: 2 },
                { id: 'tres', value: 3 },
            ],
            typeid: 'autodesk.enum:unoDosTres-1.0.0',
        };

        const enumAndEnumArraySchema = {
            properties: [
                {
                    context: 'array',
                    id: 'enumArray',
                    typeid: 'autodesk.enum:unoDosTres-1.0.0',
                    value: [2, 1, 2],
                },
            ],
            typeid: 'autodesk.enum:enums-1.0.0',
        };

        PropertyFactory._reregister(enumUnoDosTresSchema);
        PropertyFactory._reregister(enumAndEnumArraySchema);
    });

    it('Should be able to get a value', function() {
        let property = PropertyFactory.create('autodesk.enum:enums-1.0.0');

        expect(property.get('enumArray').get(0)).to.equal(2);
        expect(property.get('enumArray').getEnumString(0)).to.equal('dos');
    });

    it('Should be able to getValues', function() {
        let property = PropertyFactory.create('autodesk.enum:enums-1.0.0');

        expect(property.get('enumArray').getValues()).to.deep.equal([2, 1, 2]);
    });

    it('Should be able to getEnumStrings', function() {
        let property = PropertyFactory.create('autodesk.enum:enums-1.0.0');

        expect(property.get('enumArray').getEnumStrings(0, 3)).to.deep.equal(['dos', 'uno', 'dos']);
    });

    it('Should be able to set a value using an Enum number', function() {
        let property = PropertyFactory.create('autodesk.enum:enums-1.0.0');

        expect(property.get('enumArray').get(0)).to.equal(2);
        property.get('enumArray').set(0, 1);
        expect(property.get('enumArray').get(0)).to.equal(1);
    });

    it('Should throw on setting invalid Enum number', function() {
        let property = PropertyFactory.create('autodesk.enum:enums-1.0.0');
        expect(function() {
            property.get('enumArray').set(0, -100);
        }).to.throw(MSG.UNKNOWN_ENUM);
    });

    it('Should be able to set a value using an Enum string', function() {
        let property = PropertyFactory.create('autodesk.enum:enums-1.0.0');

        expect(property.get('enumArray').get(0)).to.equal(2);
        property.get('enumArray').set(0, 'uno');
        expect(property.get('enumArray').get(0)).to.equal(1);
    });

    it('Should throw on setting invalid Enum string', function() {
        let property = PropertyFactory.create('autodesk.enum:enums-1.0.0');
        expect(function() {
            property.get('enumArray').set(0, 'badString');
        }).to.throw(MSG.UNKNOWN_ENUM);
    });

    it('Should be able to insert a value using an Enum number', function() {
        let property = PropertyFactory.create('autodesk.enum:enums-1.0.0');

        property.get('enumArray').insertRange(2, [1]);
        expect(property.get('enumArray').getValues()).to.deep.equal([2, 1, 1, 2]);
    });

    it('Should throw on inserting invalid Enum number', function() {
        let property = PropertyFactory.create('autodesk.enum:enums-1.0.0');
        expect(function() {
            property.get('enumArray').insertRange(0, [-100]);
        }).to.throw(MSG.UNKNOWN_ENUM);
    });

    it('Should be able to insert a value using an Enum string', function() {
        let property = PropertyFactory.create('autodesk.enum:enums-1.0.0');

        property.get('enumArray').insertRange(2, ['uno']);
        expect(property.get('enumArray').getValues()).to.deep.equal([2, 1, 1, 2]);
    });

    it('Should throw on inserting invalid Enum string', function() {
        let property = PropertyFactory.create('autodesk.enum:enums-1.0.0');
        expect(function() {
            property.get('enumArray').insertRange(0, ['badString']);
        }).to.throw(MSG.UNKNOWN_ENUM);
    });

    it('Should be able to overide default values on creation with initialValues', function() {
        let initialValues = { 'enumArray': [3, 2, 3] };
        let property = PropertyFactory.create('autodesk.enum:enums-1.0.0', null, initialValues);

        expect(property.get('enumArray').getValues()).to.deep.equal([3, 2, 3]);
        expect(property.get('enumArray').getEnumStrings(0, 3)).to.deep.equal(['tres', 'dos', 'tres']);
    });

    it('.getValidEnumList should return expected enum list', function() {
        var property = PropertyFactory.create('autodesk.enum:enums-1.0.0');
        var enumList = property.get('enumArray').getValidEnumList();
        expect(enumList).to.have.nested.property('uno.value', 1);
        expect(enumList).to.have.nested.property('dos.value', 2);
        expect(enumList).to.have.nested.property('tres.value', 3);
    });
});
