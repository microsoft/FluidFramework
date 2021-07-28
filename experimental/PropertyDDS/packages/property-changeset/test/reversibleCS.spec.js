/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-unused-expressions*/
/**
 * @fileoverview In this file, we will test the path helper
 *    functions described in /src/properties/path_helper.js
 */
const ChangeSet = require('../src/changeset');
const _ = require('lodash');

describe('Reversible ChangeSets', function() {
    it('Inverting a string map insert', () => {
        let originalCS = {
            "map<String>": {
                "selections": {
                    "insert": {
                        "target": "c6e96078-d1eb-8d41-219f-6f935794c453"
                    }
                }
            }
        };
        let invertedCS = new ChangeSet(_.cloneDeep(originalCS));
        invertedCS._toInverseChangeSet();

        let combined = new ChangeSet(originalCS);
        combined.applyChangeSet(invertedCS);
    });

    it('Inverting a string map remove', () => {
        let originalCS = {
            "map<String>": {
                "selections": {
                    "remove": {
                        "target": "c6e96078-d1eb-8d41-219f-6f935794c453"
                    }
                }
            }
        };
        let invertedCS = new ChangeSet(_.cloneDeep(originalCS));
        invertedCS._toInverseChangeSet();

        let combined = new ChangeSet(originalCS);
        combined.applyChangeSet(invertedCS);
    });

});