/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-unused-expressions */
const sinon = require('sinon');
const _ = require('lodash');
const { generateGUID } = require('@fluid-experimental/property-common').GuidUtils;
const PluginManager = require('../../src/plugins/PluginManager');
const settings = require('../../src/server/utils/server_settings');
const { BackendFactory, StorageManager, BranchWriteQueue,
     NodeDependencyManager, MaterializedHistoryService, SerializerFactory } = require('@fluid-experimental/property-query');
const getExpressApp = require('../utils/get_express_app');

describe('Backwards compatibility tests', () => {

  let storageManager, mhService;
  before(() => {
    const factory = new BackendFactory({settings});
    const backend = factory.getBackend();
    const sf = new SerializerFactory({settings});
    storageManager = new StorageManager({
      backend,
      settings,
      serializer: sf.getSerializer()
    });
    const branchWriteQueue = new BranchWriteQueue({
      pssClient: {}
    });
    mhService = new MaterializedHistoryService({
      app: getExpressApp(),
      settings,
      serializer: sf.getSerializer(),
      systemMonitor: PluginManager.instance.systemMonitor,
      storageManager: storageManager,
      nodeDependencyManager: new NodeDependencyManager(backend),
      branchWriteQueue
    });
    return mhService.init();
  });

  after(() => {
    mhService.stop();
  });

  let branchGuid, refs;
  const importBranch = async (data) => {
    const batchId = storageManager.startWriteBatch();
    refs = [];
    _.each(data, (value, ref) => {
      if (ref.startsWith('branch:')) {
        branchGuid = ref.split(':')[1];
      }
      storageManager.store(batchId, ref, value);
      refs.push(ref);
    });
    await storageManager.finishWriteBatch(batchId);
  };

  describe('when using a branch without template information', () => {

    before(async () => {
      const branchData = require('./data/backwards_compatibility/no_template_info');
      await importBranch(branchData);
    });

    let branch;
    before(async () => {
      branch = await mhService.getBranch(branchGuid);
    });

    it('should gracefully fail when requesting an MV with schema definitions', async () => {
      await expect(mhService.getCommitMV({
        guid: branch.headCommitGuid,
        branchGuid,
        fetchSchemas: true
      })).to.be.rejectedWith('Branch does not define template information');
    });

    it('should work when requesting an MV without schema definitions', async () => {
      await expect(mhService.getCommitMV({
        guid: branch.headCommitGuid,
        branchGuid,
        fetchSchemas: false
      })).to.eventually.exist;
    });

    it('should gracefully fail when applying a commit', async () => {
      await expect(mhService.createCommit({
        guid: generateGUID(),
        branchGuid,
        meta: {},
        parentGuid: branch.headCommitGuid,
        changeSet: {
          insert: {
            'my:testtemplate-1.0.0': {
              myProp: {
                number: 1234
              }
            }
          },
          insertTemplates: {
            'my:testtemplate-1.0.0': {
              typeid: 'my:testtemplate-1.0.0',
              properties: [
                { id: 'number', typeid: 'Int32' }
              ]
            }
          }
        }
      })).to.be.rejectedWith('Branch does not define template information');
    });

    it('should be possible to delete it entirely', async () => {
      let deletedRefs = [];
      const sandbox = sinon.createSandbox();
      const deleteFn = storageManager.delete.bind(storageManager);
      sandbox.stub(storageManager, 'delete').callsFake((ref) => {
        deletedRefs.push(ref);
        return deleteFn(ref);
      });

      try {
        const [, promise] = await mhService.createDeleteBranchTask({
          branchGuids: [branchGuid],
          taskUrl: 'whatever',
          taskGuid: generateGUID()
        });
        await promise;
      } finally {
        sandbox.restore();
      }

      deletedRefs = deletedRefs.filter((ref) => !ref.startsWith('delete:'));
      expect(new Set(deletedRefs)).to.eql(new Set(refs));
    });

  });

  describe('when using a branch with nodes that do not define branchGuid', () => {

    before(async () => {
      const branchData = require('./data/backwards_compatibility/no_branch_guid_in_nodes');
      await importBranch(branchData);
    });

    let branch;
    before(async () => {
      branch = await mhService.getBranch(branchGuid);
    });

    it('should gracefully fail when committing after branching', async () => {
      const newBranchGuid = generateGUID();
      await mhService.createBranch({
        guid: newBranchGuid,
        rootCommitGuid: branch.headCommitGuid,
        parentBranchGuid: branchGuid
      });
      await expect(mhService.createCommit({
        guid: generateGUID(),
        branchGuid,
        meta: {},
        parentGuid: branch.headCommitGuid,
        changeSet: {
          insert: {
            String: {
              myProp: 'Hello'
            }
          }
        }
      })).to.be.rejectedWith('Node owning branch cannot be determined. Commit cannot be safely applied.');
    });

  });

});
