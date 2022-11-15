/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint no-unused-expressions: 0 */
/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
/* eslint-disable max-nested-callbacks */
/**
 * @fileoverview In this file, we will test typeid_helper functions.
 */

import { expect } from "chai";
import { TypeIdHelper } from '../../helpers/typeidHelper';

(function() {
    describe('Typeid helper', function() {
        var MSG = require('@fluid-experimental/property-common').constants.MSG;

        it('getPrimitiveTypeId() should return all primitive typeids', () => {
            const result = TypeIdHelper.getPrimitiveTypeIds();
            expect(result).to.have.members(['Float32', 'Float64', 'Int8', 'Uint8', 'Int16', 'Uint16', 'Int32',
                'Uint32', 'Bool', 'String', 'Reference', 'Enum', 'Int64', 'Uint64',
            ]);
        });

        it('getReservedTypeId() should return all reserved typeids', () => {
            const result = TypeIdHelper.getReservedTypeIds();

            expect(result).to.have.members(['BaseProperty', 'ContainerProperty', 'NamedProperty', 'NodeProperty',
                'NamedNodeProperty', 'RelationshipProperty',
            ]);
        });

        describe('nativeInheritsFrom() method', function() {
            it('should throw an error if the input is undefine', () => {
                expect(() => { TypeIdHelper.nativeInheritsFrom(undefined, 'BaseProperty'); }).to.throw(MSG.TYPEID_NOT_DEFINED);
                // @ts-ignore
                expect(() => { TypeIdHelper.nativeInheritsFrom('NodeProperty'); }).to.throw(MSG.TYPEID_NOT_DEFINED);
                // @ts-ignore
                expect(() => { TypeIdHelper.nativeInheritsFrom(); }).to.throw(MSG.TYPEID_NOT_DEFINED);
            });

            it('should throw an error if the inputs are not native typeids', () => {
                expect(() => { TypeIdHelper.nativeInheritsFrom('template1', 'BaseProperty'); })
                    .to.throw(MSG.TYPEID_NOT_NATIVE + 'template1');
                expect(() => { TypeIdHelper.nativeInheritsFrom('NodeProperty', 'template1'); })
                    .to.throw(MSG.TYPEID_NOT_NATIVE + 'template1');
            });

            it('should recognize that all the native type inherit from BaseProperty', () => {
                expect(TypeIdHelper.nativeInheritsFrom('Int8', 'BaseProperty')).to.be.true;
                expect(TypeIdHelper.nativeInheritsFrom('Uint8', 'BaseProperty')).to.be.true;
                expect(TypeIdHelper.nativeInheritsFrom('Int16', 'BaseProperty')).to.be.true;
                expect(TypeIdHelper.nativeInheritsFrom('Uint16', 'BaseProperty')).to.be.true;
                expect(TypeIdHelper.nativeInheritsFrom('Int32', 'BaseProperty')).to.be.true;
                expect(TypeIdHelper.nativeInheritsFrom('Uint32', 'BaseProperty')).to.be.true;
                expect(TypeIdHelper.nativeInheritsFrom('Float32', 'BaseProperty')).to.be.true;
                expect(TypeIdHelper.nativeInheritsFrom('Int64', 'BaseProperty')).to.be.true;
                expect(TypeIdHelper.nativeInheritsFrom('Uint64', 'BaseProperty')).to.be.true;
                expect(TypeIdHelper.nativeInheritsFrom('Float64', 'BaseProperty')).to.be.true;
                expect(TypeIdHelper.nativeInheritsFrom('Bool', 'BaseProperty')).to.be.true;
                expect(TypeIdHelper.nativeInheritsFrom('Reference', 'BaseProperty')).to.be.true;
                expect(TypeIdHelper.nativeInheritsFrom('Enum', 'BaseProperty')).to.be.true;
                expect(TypeIdHelper.nativeInheritsFrom('String', 'BaseProperty')).to.be.true;
                expect(TypeIdHelper.nativeInheritsFrom('NodeProperty', 'BaseProperty')).to.be.true;
                expect(TypeIdHelper.nativeInheritsFrom('ContainerProperty', 'BaseProperty')).to.be.true;
                expect(TypeIdHelper.nativeInheritsFrom('NamedProperty', 'BaseProperty')).to.be.true;
                expect(TypeIdHelper.nativeInheritsFrom('NamedNodeProperty', 'BaseProperty')).to.be.true;
                expect(TypeIdHelper.nativeInheritsFrom('RelationshipProperty', 'BaseProperty')).to.be.true;
                expect(TypeIdHelper.nativeInheritsFrom('Reference<NodeProperty>', 'Reference')).to.be.true;
                expect(TypeIdHelper.nativeInheritsFrom('NodeProperty', 'Reference<NodeProperty>')).to.be.false;
            });

            it('should recognize that the Reference<NodeProperty> inherits from BaseProperty', () => {
                const result = TypeIdHelper.nativeInheritsFrom('Reference<NodeProperty>', 'BaseProperty');

                expect(result).to.be.true;
            });

            it('should throw an error if in_typeid is enum<> ', () => {
                expect(() => {
                    TypeIdHelper.nativeInheritsFrom('enum<NodeProperty>', 'BaseProperty');
                }).to.throw(MSG.TYPEID_NOT_NATIVE + 'enum<NodeProperty>');
            });

            it('should throw an error if base_typeid is enum<> ', () => {
                expect(() => {
                    TypeIdHelper.nativeInheritsFrom('NodeProperty', 'enum<NodeProperty>');
                }).to.throw(MSG.TYPEID_NOT_NATIVE + 'enum<NodeProperty>');
            });

            it('should recognize that the Enum inherits from Int32', () => {
                const result = TypeIdHelper.nativeInheritsFrom('Enum', 'Int32');

                expect(result).to.be.true;
            });

            it('should recognize that the NodeProperty inherits from ContainerProperty', () => {
                const result = TypeIdHelper.nativeInheritsFrom('NodeProperty', 'ContainerProperty');

                expect(result).to.be.true;
            });

            it('should recognize that the NamedProperty inherits from ContainerProperty', () => {
                const result = TypeIdHelper.nativeInheritsFrom('NamedProperty', 'ContainerProperty');

                expect(result).to.be.true;
            });

            it('should recognize that the String inherits from ContainerProperty', () => {
                const result = TypeIdHelper.nativeInheritsFrom('String', 'ContainerProperty');

                expect(result).to.be.true;
            });

            it('should recognize that the NamedNodeProperty inherits from NamedProperty', () => {
                const result = TypeIdHelper.nativeInheritsFrom('NamedNodeProperty', 'NamedProperty');

                expect(result).to.be.true;
            });

            it('should recognize that the NamedNodeProperty inherits from NodeProperty', () => {
                const result = TypeIdHelper.nativeInheritsFrom('NamedNodeProperty', 'NodeProperty');

                expect(result).to.be.true;
            });

            it('should recognize that the RelationshipProperty inherits from NodeProperty and NamedProperty', () => {
                expect(TypeIdHelper.nativeInheritsFrom('RelationshipProperty', 'NodeProperty')).to.be.true;
                expect(TypeIdHelper.nativeInheritsFrom('RelationshipProperty', 'NamedProperty')).to.be.true;
            });
        });
    });
})();
