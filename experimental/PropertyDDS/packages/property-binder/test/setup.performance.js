/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint no-unused-vars: 0, no-undef: 0 */
// the testem runner expects these to be available globally
expect = chai.expect;
should = chai.should();
assert = chai.assert;
// Export modules to global scope as necessary (only for testing) - but only
// those in the performance folder (using negative look behind).
const tests = require.context('.', true, /(?<=\/performance\/.*)\.spec\.jsx?$/);
tests.keys().forEach(tests);

const sources = require.context('../src/', true, /\.js$/);
sources.keys().forEach(sources);
