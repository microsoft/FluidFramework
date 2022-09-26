/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview In this file, we will test the functions related Container property object
 * this will also tests parts of Property Factory that creates Container property
 */

const MSG = require('@fluid-experimental/property-common').constants.MSG;
const PropertyFactory = require('../..').PropertyFactory;

describe('ContainerProperty', function() {
    beforeEach(() => {
        PropertyFactory._clear();
    });

    describe('Changeset', function() {
        it('should not add created properties to the changeset on creation', function() {
            const DefaultPrimitive = {
                typeid: 'SimpleTest:OptionalPrimitive-1.0.0',
                properties: [
                    { id: 'num', typeid: 'Uint32' },
                    { id: 'bool', typeid: 'Bool' },
                    { id: 'string', typeid: 'String' },
                ],
            };

            const changeset = {
                Uint32: { num: 0 },
                Bool: { bool: false },
                String: { string: '' },
            };

            PropertyFactory._reregister(DefaultPrimitive);
            const instance = PropertyFactory.create('SimpleTest:OptionalPrimitive-1.0.0');

            expect(instance._serialize(false, false)).to.deep.equal(changeset);
            expect(instance._serialize(true, false)).to.be.empty;
        });

        it('should add optional properties that have default values to the changeset on creation', function() {
            const DefaultPrimitive = {
                typeid: 'SimpleTest:OptionalPrimitive-1.0.0',
                properties: [
                    { id: 'num', typeid: 'Uint32', value: 111, optional: true },
                    { id: 'bool', typeid: 'Bool', value: true, optional: true },
                    { id: 'string', typeid: 'String', value: 'basic', optional: true },
                ],
            };

            const changeset = {
                insert: {
                    Uint32: { num: 111 },
                    Bool: { bool: true },
                    String: { string: 'basic' },
                },
            };

            PropertyFactory._reregister(DefaultPrimitive);
            const instance = PropertyFactory.create('SimpleTest:OptionalPrimitive-1.0.0');

            expect(instance._serialize(true, false)).to.deep.equal(changeset);
        });

        it('should not add optional properties that do not have default values to the changeset on creation', function() {
            const DefaultPrimitive = {
                typeid: 'SimpleTest:OptionalPrimitive-1.0.0',
                properties: [
                    { id: 'num', typeid: 'Uint32', optional: true },
                    { id: 'bool', typeid: 'Bool', optional: true },
                    { id: 'string', typeid: 'String', optional: true },
                ],
            };

            PropertyFactory._reregister(DefaultPrimitive);
            const instance = PropertyFactory.create('SimpleTest:OptionalPrimitive-1.0.0');

            expect(instance._serialize(true, false)).to.be.empty;
        });
    });

    describe('Optional Properties', function() {
        it('should not exist on creation if no value is specified', function() {
            const DefaultPrimitive = {
                typeid: 'SimpleTest:OptionalPrimitive-1.0.0',
                properties: [
                    { id: 'num', typeid: 'Uint32', optional: true },
                    { id: 'bool', typeid: 'Bool', optional: true },
                    { id: 'string', typeid: 'String', optional: true },
                ],
            };

            PropertyFactory._reregister(DefaultPrimitive);

            const instance = PropertyFactory.create('SimpleTest:OptionalPrimitive-1.0.0');
            expect(instance.get('num')).to.be.undefined;
            expect(instance.get('bool')).to.be.undefined;
            expect(instance.get('string')).to.be.undefined;
        });

        it('should exist on creation if value is specified', function() {
            const DefaultPrimitive = {
                typeid: 'SimpleTest:OptionalPrimitive-1.0.0',
                properties: [
                    { id: 'num', typeid: 'Uint32', value: 111, optional: true },
                    { id: 'bool', typeid: 'Bool', value: true, optional: true },
                    { id: 'string', typeid: 'String', value: 'basic', optional: true },
                ],
            };

            PropertyFactory._reregister(DefaultPrimitive);

            const instance = PropertyFactory.create('SimpleTest:OptionalPrimitive-1.0.0');
            expect(instance.get('num').getValue()).to.equal(111);
            expect(instance.get('bool').getValue()).to.equal(true);
            expect(instance.get('string').getValue()).to.equal('basic');
        });

        it('can be inserted', function() {
            const DefaultPrimitive = {
                typeid: 'SimpleTest:OptionalPrimitive-1.0.0',
                properties: [
                    { id: 'num', typeid: 'Uint32', optional: true },
                    { id: 'bool', typeid: 'Bool', optional: true },
                    { id: 'string', typeid: 'String', optional: true },
                ],
            };

            PropertyFactory._reregister(DefaultPrimitive);

            const instance = PropertyFactory.create('SimpleTest:OptionalPrimitive-1.0.0');

            const num = PropertyFactory.create('Uint32');
            num.setValue(111);

            const string = PropertyFactory.create('String');
            string.setValue('basic');

            const bool = PropertyFactory.create('Bool');
            bool.setValue(true);

            instance.insert('num', num);
            instance.insert('bool', bool);
            instance.insert('string', string);

            expect(instance.get('num').getValue()).to.equal(111);
            expect(instance.get('bool').getValue()).to.equal(true);
            expect(instance.get('string').getValue()).to.equal('basic');
        });

        it('can be removed', function() {
            const DefaultPrimitive = {
                typeid: 'SimpleTest:OptionalPrimitive-1.0.0',
                properties: [
                    { id: 'num', typeid: 'Uint32', value: 111, optional: true },
                    { id: 'bool', typeid: 'Bool', value: true, optional: true },
                    { id: 'string', typeid: 'String', value: 'basic', optional: true },
                ],
            };

            PropertyFactory._reregister(DefaultPrimitive);

            const instance = PropertyFactory.create('SimpleTest:OptionalPrimitive-1.0.0');

            instance.remove('num');
            instance.remove('bool');
            instance.remove('string');

            expect(instance.get('num')).to.be.undefined;
            expect(instance.get('bool')).to.be.undefined;
            expect(instance.get('string')).to.be.undefined;
        });

        it('throws error if inserted property has unknown id', function() {
            const DefaultPrimitive = {
                typeid: 'SimpleTest:OptionalPrimitive-1.0.0',
                properties: [
                    { id: 'num', typeid: 'Uint32', value: 111, optional: true },
                    { id: 'bool', typeid: 'Bool', value: true, optional: true },
                    { id: 'string', typeid: 'String', value: 'basic', optional: true },
                ],
            };

            PropertyFactory._reregister(DefaultPrimitive);

            const instance = PropertyFactory.create('SimpleTest:OptionalPrimitive-1.0.0');
            const prop = PropertyFactory.create('String');

            expect(() => { instance.insert('badId', prop); }).to.throw(MSG.CANNOT_INSERT_UNKNOWN_PROPERTY + 'badId');
        });

        it('throws error if inserted property typeid does not match corresponding typeid', function() {
            const DefaultPrimitive = {
                typeid: 'SimpleTest:OptionalPrimitive-1.0.0',
                properties: [
                    { id: 'num', typeid: 'Uint32', optional: true },
                    { id: 'bool', typeid: 'Bool', optional: true },
                    { id: 'string', typeid: 'String', optional: true },
                ],
            };

            PropertyFactory._reregister(DefaultPrimitive);

            const instance = PropertyFactory.create('SimpleTest:OptionalPrimitive-1.0.0');
            const prop = PropertyFactory.create('String');

            expect(() => { instance.insert('num', prop); }).to.throw(MSG.MISMATCHING_PROPERTY_TYPEID);
        });

        it('throws error if attempting to remove a not optional property', function() {
            const DefaultPrimitive = {
                typeid: 'SimpleTest:OptionalPrimitive-1.0.0',
                properties: [
                    { id: 'num', typeid: 'Uint32', value: 111 },
                    { id: 'bool', typeid: 'Bool', value: true, optional: true },
                    { id: 'string', typeid: 'String', value: 'basic', optional: true },
                ],
            };

            PropertyFactory._reregister(DefaultPrimitive);

            const instance = PropertyFactory.create('SimpleTest:OptionalPrimitive-1.0.0');

            expect(() => { instance.remove('num'); }).to.throw(MSG.CANNOT_REMOVE_NONE_OPTIONAL_PROP + 'num');
        });
    });
});
