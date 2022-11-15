/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
var net = require('net');

/**
 * Promise resolves if the port is available, otherwise throws an error
 * @param {number} port The port you would like to test, duh
 * @return {Promise} Resolves if the port is free, rejects if it isn't
 */
var isPortFree = function(port) {
  var tester = net.createServer();
  return new Promise(function(resolve, reject) {
    tester.once('error', function(error) {
      if (error.code === 'EADDRINUSE') {
        reject(new Error('Port in use: ' + port));
      } else {
        reject(error);
      }
    });
    tester.once('listening', function() {
      tester.once('close', function() {
        resolve();
      });
      tester.close();
    });
    tester.listen(port);
  });
};

module.exports = isPortFree;
