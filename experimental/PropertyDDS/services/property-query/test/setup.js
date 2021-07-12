/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// Export modules to global scope as necessary (only for testing)
const path = require('path');
const fs = require('fs');
const asyncEach = require('async').each;
//const waitForRoute = require('hfdm-private-tools').waitForRoute;
const waitForDeps = function(urls, done) {
  asyncEach(
    urls,
    (url, cb) => { waitForRoute(`${url}/health`, 20000, true, cb); },
    (err) => {
      if (err) {
        console.error(`Error: failed witing for: ${JSON.stringify(urls)}`);
      } else {
        console.log(`Done waiting for: ${JSON.stringify(urls)}`);
      }
      done(err);
    }
  );
};

require('./setup_common');

before(function(done) {
  done();
});
