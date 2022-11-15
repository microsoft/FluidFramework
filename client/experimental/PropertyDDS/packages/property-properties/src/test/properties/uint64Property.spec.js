/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview In this file, we will test the functions of 64 bit Uinteger properties described in
 * /src/shared/property_sets/properties/int_property.js
 */

const { MSG } = require('@fluid-experimental/property-common').constants;
const { Uint64 } = require('@fluid-experimental/property-common');
const { PropertyFactory } = require('../..');

describe('Test Uint64Property', function() {
    it('should correctly setValue when passed a number', function() {
        const prop = PropertyFactory.create('Uint64');
        const value = 123;
        prop.setValue(value);
        expect(prop.getValueLow()).to.equal(value);
        expect(prop.getValueHigh()).to.equal(0);
        expect(prop.toString()).to.equal(value.toString());
    });

    it('should throw when setValue is passed a negative number', function() {
        const prop = PropertyFactory.create('Uint64');
        const value = -123;
        expect(() => { prop.setValue(value); }).to.throw();
    });

    it('should correctly setValue when passed a large number ( larger than 2^53)', function() {
        const prop = PropertyFactory.create('Int64');
        const value = Math.pow(2, 64) - 1000;
        prop.setValue(value);
        expect(prop.getValueLow()).to.equal(384);
        expect(prop.getValueHigh()).to.equal(4294967296);
        expect(prop.toString()).to.equal(value.toString());
    });

    it('should correctly setValue when passed a string', function() {
        const prop = PropertyFactory.create('Uint64');
        const value = '1234567890';
        prop.setValue(value);
        expect(prop.getValueLow()).to.equal(1234567890);
        expect(prop.getValueHigh()).to.equal(0);
        expect(prop.toString()).to.equal('1234567890');
    });

    it('should throw error when passed a string with non numbers', function() {
        const prop = PropertyFactory.create('Uint64');
        expect(prop.setValue.bind(prop, 'error')).to.throw(MSG.CANNOT_PARSE_INVALID_CHARACTERS + 'error');
    });

    it('should correctly convert to string', function() {
        const prop = PropertyFactory.create('Uint64');

        prop.value = new Uint64(845094001, 1810905006);
        expect(prop.toString()).to.be.equal('7777777777777777777');

        prop.value = new Uint64(0, 0xFFFFFFFF);
        expect(prop.toString()).to.be.equal('18446744069414584320');

        prop.value = new Uint64(0xFFFFFFFF, 0xFFFFFFFF);
        expect(prop.toString()).to.be.equal('18446744073709551615');
    });

    it('should work correctly when explicitly set fromString', function() {
        const prop = PropertyFactory.create('Uint64');

        expect(function() { prop.fromString('-1'); }).to.throw();
        expect(function() { prop.fromString('abcd'); }).to.throw();

        expect(function() { prop.fromString('22545455', 37); }).to.throw();
        expect(function() { prop.fromString('22545455', 1); }).to.throw();

        prop.fromString('1a2b3c4d5e6f', 16);
        expect(prop.toString(16)).to.be.equal('1a2b3c4d5e6f');

        var maxUintString = new Array(65).join('1');
        prop.fromString(maxUintString, 2);
        expect(prop.toString(2)).to.be.equal(maxUintString);
    });

    it('should correctly dirty on set', function() {
        const prop = PropertyFactory.create('Uint64');
        prop.cleanDirty();
        expect(prop.isDirty()).to.be.false;
        prop.value = new Uint64(32, 42);
        expect(prop.isDirty()).to.be.true;

        prop.cleanDirty();
        expect(prop.isDirty()).to.be.false;
        prop.setValueHigh(66);
        expect(prop.isDirty()).to.be.true;
        prop.cleanDirty();
        prop.setValueHigh(66);
        expect(prop.isDirty()).to.be.false;

        prop.cleanDirty();
        expect(prop.isDirty()).to.be.false;
        prop.setValueLow(33);
        expect(prop.isDirty()).to.be.true;
        prop.cleanDirty();
        prop.setValueLow(33);
        expect(prop.isDirty()).to.be.false;
    });
});
