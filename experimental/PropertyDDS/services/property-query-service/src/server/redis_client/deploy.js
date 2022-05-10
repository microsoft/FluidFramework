/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @return {boolean} true is running in green mode, false otherwise
 */
function isGreen() {
  return process.env.HFDM_GREEN === 'true';
}

module.exports = {isGreen};
