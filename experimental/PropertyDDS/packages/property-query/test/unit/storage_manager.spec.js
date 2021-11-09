/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint no-unused-expressions: 0 */
const sinon = require('sinon');
const sandbox = sinon.createSandbox();

const StorageManager = require('../../src/materialized_history_service/storage_backends/storage_manager');
const JsonSerializer = require('../../src/materialized_history_service/serialization/json');
const settings = require('../test_settings');

const generateGUID = require('@fluid-experimental/property-common').GuidUtils.generateGUID;

const delay = async (time) => {
  return new Promise((res) => {
    setTimeout(res, time);
  });
};

describe('Storage Manager', () => {
  let aStorageManager;
  let mockBackend;

  let mockBackendGet, mockStartWriteBatch;

  before(() => {
    mockBackend = {
      startWriteBatch: () => {},
      finishWriteBatch: () => {},
      get: () => {},
      update: () => {},
      store: () => {}
    };

    aStorageManager = new StorageManager({
      backend: mockBackend,
      settings: settings,
      serializer: new JsonSerializer()
    });
  });

  describe('A consistent read that ends up yielding no result', () => {
    let callCount = 0;
    let callCountAfter;

    before(() => {
      mockBackendGet = sandbox.stub(mockBackend, 'get')
        .callsFake(() => {
          callCount++;
          return Promise.resolve(undefined);
        });
    });

    it('should return undefined', async function() {
      this.timeout(settings.get('materializedHistory:consistencyWait') + 100);
      await expect(aStorageManager.get('this-will-never-exist', true)).to.eventually.eql(undefined);
      callCountAfter = callCount;
    });

    it('should wait a little bit', (done) => {
      setTimeout(done, 1000);
    });

    it('should have stopped calling the get from the backend', () => {
      expect(callCount).to.eql(callCountAfter);
    });

    after(() => {
      sandbox.reset();
    });
  });

  describe('A long batch where an item falls off the LRU before the write is completed', () => {
    let aBatch;

    before(() => {
      mockStartWriteBatch = sandbox.stub(mockBackend, 'startWriteBatch')
        .returns({ guid: 'my-mock-batch'});

      mockBackendGet
        .withArgs('aKey:aSubId')
        .returns(Promise.resolve(JSON.stringify({a: 'valueFromDb'})));
    });

    it('should start a batch', () => {
      aBatch = aStorageManager.startWriteBatch();
    });

    it('should write an entry', () => {
      aStorageManager.store(aBatch, 'aKey:aSubId', {a: 'value'});
    });

    it('should be evicted from the cache (for the test purposes)', () => {
      aStorageManager._cache.reset();
    });

    it('should keep the node in a special cache until the batch is committed', () =>
      expect(aStorageManager.get('aKey:aSubId')).to.eventually.eql({a: 'value'})
    );

    it('should finish the batch', () =>
      aStorageManager.finishWriteBatch(aBatch)
    );

    it('should be deleted from the special cache and read from the backend', () =>
      expect(aStorageManager.get('aKey:aSubId')).to.eventually.eql({a: 'valueFromDb'})
    );

    after(() => {
      sandbox.reset();
    });
  });

  describe('A concurrent read and write where the backend read ends after the write begins', () => {
    let aBatch, getPromise;

    const theKey = 'l:aKey';
    const valueFromDb = {an: 'olderValueFromDb'};
    const valueWritten = {a: 'value'};

    before(() => {
      mockStartWriteBatch
        .returns({ guid: 'my-mock-batch'});

      mockBackendGet
        .callsFake(async () => {
          await delay(100);
          return JSON.stringify(valueFromDb);
        });
    });

    it('should start a batch', () => {
      aBatch = aStorageManager.startWriteBatch();
    });

    it('should trigger a long read', () => {
      getPromise = aStorageManager.get(theKey);
    });

    it('should write an entry', () =>
      aStorageManager.store(aBatch, theKey, valueWritten)
    );

    it('should have resolved the read', () =>
      expect(getPromise).to.eventually.eql(valueWritten)
    );

    it('should finish the batch', () =>
      aStorageManager.finishWriteBatch(aBatch)
    );

    it('should wait for the db read to finish', () => delay(100));

    it('should keep the set value in the cache', () =>
      expect(aStorageManager.get(theKey)).to.eventually.eql(valueWritten)
    );

    after(() => {
      sandbox.reset();
    });
  });

  describe('Flushing the cache for a branch', () => {
    let branchGuid = generateGUID();
    let anotherGuid = generateGUID();

    before(async () => {
      mockStartWriteBatch.returns({ guid: 'my-mock-batch'});

      let batch = await aStorageManager.startWriteBatch();
      aStorageManager.store(batch, `branch:${branchGuid}`, {a: 'something', guid: branchGuid});
      aStorageManager.store(batch, `l:${anotherGuid}`, {a: 'something', branchGuid: branchGuid});

      return aStorageManager.finishWriteBatch(batch);
    });

    it('should remove the items', () => {
      aStorageManager.clearCacheForBranch(branchGuid);
    });

    it('should be out of cache', () => {
      let asmCache = aStorageManager._cache;
      expect(asmCache.get(`branch:${branchGuid}`)).to.be.undefined;
      expect(asmCache.get(`l:${anotherGuid}`)).to.be.undefined;
    });

    it('should clear the entriesPerBranch structure', () => {
      expect(aStorageManager._entriesPerBranch.get(branchGuid)).to.be.undefined;
    });
  });
});
