/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-unused-expressions */
/**
 * @fileoverview In this file, we will test the relationship property
 *   added to /src/property_factory.js
 */
const { PropertyFactory } = require('../..');

describe('RelationshipProperty', function() {
    it('should be able to add a relationship property whithin a schema', function() {
        const assetSchema = {
            typeid: 'foo:bar-1.0.0',
            inherits: ['NodeProperty'],
            properties: [
                {
                    id: 'relationship',
                    typeid: 'RelationshipProperty',
                },
            ],
        };
        PropertyFactory.register(assetSchema);
        let str = PropertyFactory.create('String');
        str.setValue('BAR');
        let foo = PropertyFactory.create(assetSchema.typeid);
        foo.insert('str', str);
        let relation = foo.get('relationship');
        expect(relation.get('guid').getValue()).to.be.a('string');
        expect(relation.resolvePath('to')).to.not.exist;
        relation.resolvePath('to*').setValue('/str');
        expect(relation.resolvePath('to')).to.exist;
        expect(relation.resolvePath('to').getValue()).to.equal('BAR');
    });
});
