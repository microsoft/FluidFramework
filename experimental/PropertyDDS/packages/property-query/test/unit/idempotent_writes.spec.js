/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals PropertyFactory */
/* eslint no-unused-expressions: 0 */
const sinon = require('sinon');
const _ = require('lodash');
const { DeterministicRandomGenerator } = require('@fluid-experimental/property-common');

const settings = require('../test_settings');
const NodeDependencyManager = require('../../src/materialized_history_service/node_dependency_manager');
const MaterializedHistoryService = require('../../src/materialized_history_service/materialized_history_service');
const InMemoryBackend = require('../../src/materialized_history_service/storage_backends/in_memory');
const SerializerFactory = require('../../src/materialized_history_service/serialization/factory');
const BranchWriteQueue = require('../../src/materialized_history_service/branch_write_queue');
const StorageManager = require('../../src/materialized_history_service/storage_backends/storage_manager');

const { generateDeterministicGuid, insertSuccessiveProperties, randomWait } = require('./shared/test_utils');
const SystemMonitor = require('../../src/utils/system_monitor');

describe('Idempotent writes', () => {

  let sandbox, random;
  before(() => {
    sandbox = sinon.createSandbox();
    random = new DeterministicRandomGenerator('fcfaa9c7-8483-85ca-04ee-c20458f86532');
  });

  describe('when writing a commit that has already been written (but fooling MH to believe it was not)', () => {

    let service, storageBackend, root, storedRefs;
    let branchGuid, firstCommitGuid, secondCommitGuid;
    before(async () => {
      storageBackend = new InMemoryBackend({settings});
      const storeFn = storageBackend.store.bind(storageBackend);
      sandbox.stub(storageBackend, 'store').callsFake(async (batch, ref, value) => {
        storedRefs.push(ref);
        storeFn(batch, ref, value);
      });
      const getFn = storageBackend.get.bind(storageBackend);
      sandbox.stub(storageBackend, 'get').callsFake(async (ref) => {
        await randomWait(100);
        return getFn(ref);
      });
      storedRefs = [];
      const sf = new SerializerFactory({settings});
      //const pssClient = new PSSClient();
      const branchWriteQueue = new BranchWriteQueue({
        pssClient: null
      });

      const storageManager = new StorageManager({
        backend: storageBackend,
        settings: settings,
        serializer: sf.getSerializer()
      });

      service = new MaterializedHistoryService({
        settings,
        storageManager,
        serializer: sf.getSerializer(),
        systemMonitor: new SystemMonitor(),
        nodeDependencyManager: new NodeDependencyManager(storageBackend),
        branchWriteQueue
      });

      branchGuid = generateDeterministicGuid(random);
      const rootCommitGuid = generateDeterministicGuid(random);

      await service.createBranch({
        guid: branchGuid,
        meta: {},
        rootCommitGuid
      });

      root = PropertyFactory.create('NodeProperty');
      insertSuccessiveProperties(root, 1000);
      const changeSet = root.serialize({ dirtyOnly: true });
      firstCommitGuid = generateDeterministicGuid(random);
      await service.createCommit({
        guid: firstCommitGuid,
        meta: {},
        branchGuid,
        parentGuid: rootCommitGuid,
        changeSet
      });
    });

    let firstRunNodeRefs, firstRunMV, secondRunNodeRefs, secondRunMV;
    before(async () => {
      // Record the stored node refs for the next commit
      storedRefs = [];

      root.cleanDirty();
      insertSuccessiveProperties(root, 1000, 1000);
      const changeSet = root.serialize({ dirtyOnly: true });
      secondCommitGuid = generateDeterministicGuid(random);
      await service.createCommit({
        guid: secondCommitGuid,
        meta: {},
        branchGuid,
        parentGuid: firstCommitGuid,
        changeSet
      });

      firstRunNodeRefs = storedRefs.slice();
      firstRunMV = await service.getCommitMV({ guid: secondCommitGuid, branchGuid: branchGuid }).changeSet;

      // Here comes the tricky part. Do minimal changes to allow applying the same commit again.
      const branchNode = JSON.parse(await storageBackend.get(`branch:${branchGuid}`));
      branchNode.headCommitGuid = firstCommitGuid;
      await storageBackend.update(undefined, `branch:${branchGuid}`, JSON.stringify(branchNode));
      await storageBackend.delete(`commit:${secondCommitGuid}`);
      await storageBackend.delete(`commitTemplates:${secondCommitGuid}`);
      service._storageManager._cache.reset();

      // Now apply the same commit, once again recording the node references
      storedRefs = [];

      await service.createCommit({
        guid: secondCommitGuid,
        meta: {},
        branchGuid,
        parentGuid: firstCommitGuid,
        changeSet
      });

      secondRunNodeRefs = storedRefs.slice();
      secondRunMV = await service.getCommitMV({ guid: secondCommitGuid, branchGuid: branchGuid }).changeSet;
    });

    it('should generate the same node references', () => {
      expect(firstRunNodeRefs).to.not.be.empty;
      firstRunNodeRefs = _.sortBy(firstRunNodeRefs);
      secondRunNodeRefs = _.sortBy(secondRunNodeRefs);
      expect(firstRunNodeRefs).to.deep.equal(secondRunNodeRefs);
    });

    it('should produce the same materialized view', () => {
      expect(firstRunMV).to.deep.equal(secondRunMV);
    });
  });
});
