/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require('fs');

// destination.txt will be created or overwritten by default.
fs.copyFile('./src/style.css', './dist/style.css', (err) => {
  if (err) throw err;
  console.log('style.css was copied to style.css');
});