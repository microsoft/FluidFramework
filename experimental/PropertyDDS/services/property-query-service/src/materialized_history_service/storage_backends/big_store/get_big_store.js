/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Initializes the BigStore based on configuration. Prioritizes ResilientS3Store over
 * S3Store over FileStore.
 * @param {object} settings The settings instance that includes configuration information
 *                          for one or more BigStore types.
 * @return {BigStore} An initialized BigStore implementation
 */
function getBigStore(settings) {
  let FileStore = require('./file_store');
  let S3Store = require('./s3_store');
  let ResilientS3Store = require('./resilient_s3_store');

  let resilientS3StoreSettings = settings.get('resilientS3Store');
  if (resilientS3StoreSettings) {
    return new ResilientS3Store(resilientS3StoreSettings);
  }

  let s3StoreSettings = settings.get('s3Store');
  if (s3StoreSettings) {
    return new S3Store(s3StoreSettings);
  }

  let fileStoreSettings = settings.get('fileStore');
  return new FileStore(fileStoreSettings);
}

module.exports = getBigStore;
