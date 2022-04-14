/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint no-unused-vars: 0, no-undef: 0 */
sdk = false;

// Export modules to global scope as necessary (only for testing)
if (typeof process === 'object' && Object.prototype.toString.call(process) === '[object process]') {
    // We are in node. Require modules.
    chai = require('chai');
    expect = chai.expect;
    assert = chai.assert;
    nock = require('nock');
    sinon = require('sinon');
    should = chai.should();
    _ = require('lodash');
    isBrowser = false;
} else {
    // We are in the browser. Set up variables like above using served js files.
    expect = chai.expect;
    assert = chai.assert;
    isBrowser = true;
}
