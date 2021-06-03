/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const loaderUtils = require('loader-utils');

module.exports = function blobUrl(source) {
  const { type } = loaderUtils.getOptions(this) || {};
  return `module.exports = URL.createObjectURL(new Blob([${JSON.stringify(source)}]${type ? `, { type: ${JSON.stringify(type)} }` : ''}));`;
};