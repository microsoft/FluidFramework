/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const path = require('path');
const BranchManager = require('../../src/materialized_history_service/branch_manager');
const BTreeManager = require('../../src/materialized_history_service/btree_manager');
const NodeDependencyManager = require('../../src/materialized_history_service/node_dependency_manager');
const { generateGUID } = require('@fluid-experimental/property-common').GuidUtils;
const settings = require('../test_settings');

const sinon = require('sinon');
const sandbox = sinon.createSandbox();

//let settings = new Settings([path.join(__dirname, '..', '..', 'config', 'settings.json')]);

describe('Branch Manager', () => {
  let aBranchManager;

  let mockStorageManager = {
    startWriteBatch: () => {},
    finishWriteBatch: () => {},
    get: () => {},
    store: () => {},
    update: () => {}
  };

  before(() => {
    aBranchManager = new BranchManager({
      storageManager: mockStorageManager,
      btreeManager: new BTreeManager({
        storageManager: mockStorageManager,
        nodeDependencyManager: new NodeDependencyManager()
      }),
      settings
    });
  });

  describe('Creating a branch without a parent', () => {
    let branchGuid = generateGUID();
    let createdBranchPayload;

    const expectedBtreeParameters = {
      chunkSize: settings.get('mh:chunkSize'),
      initialChunkSizeFactor: settings.get('mh:initialChunkSizeFactor'),
      splitLimitFactor: settings.get('mh:splitLimitFactor'),
      mergeLimitFactor: settings.get('mh:mergeLimitFactor'),
      maxNodeSizeFactor: settings.get('mh:maxNodeSizeFactor'),
      maxNodeSubEntries: settings.get('mh:maxNodeSubEntries'),
      bTreeOrder: settings.get('mh:bTreeOrder'),
      nodesPerHierarchicalHistoryLevel: settings.get('mh:nodesPerHierarchicalHistoryLevel')
    };

    before(() => {
      sandbox.stub(mockStorageManager, 'get')
        .withArgs(`branch:${branchGuid}`)
        .resolves(undefined);

      sandbox.stub(mockStorageManager, 'store')
        .callsFake((b, k, v) => {
          if (k === `branch:${branchGuid}`) {
            createdBranchPayload = v;
          }
        });
    });

    before(() =>
      aBranchManager.createBranch({
        guid: branchGuid,
        meta: {},
        rootCommitGuid: generateGUID(),
        created: Date.now()
      })
    );

    it('should populate the branch data with the configured BTree parameters', () =>
      expect(createdBranchPayload.bTreeParameters).to.eql(expectedBtreeParameters)
    );

    after(() => sandbox.restore());
  });

  describe('Creating a branch on top of a branch', () => {
    let parentBranchGuid = generateGUID();
    let branchGuid = generateGUID();
    let createdBranchPayload;

    const parentBTreeParameters = {
      chunkSize: 123,
      initialChunkSizeFactor: 0.1,
      splitLimitFactor: 0.7,
      mergeLimitFactor: 0.3,
      maxNodeSizeFactor: 2,
      maxNodeSubEntries: 24,
      bTreeOrder: 27,
      nodesPerHierarchicalHistoryLevel: 5
    };

    before(() => {
      sandbox.stub(mockStorageManager, 'get')
        .withArgs(`branch:${branchGuid}`)
          .resolves(undefined)
        .withArgs(`branch:${parentBranchGuid}`)
          .resolves({
            guid: parentBranchGuid,
            meta: {},
            rootCommitGuid: generateGUID(),
            headCommitGuid: generateGUID(),
            headSequenceNumber: 0,
            created: '2019-07-04T17:24:58.191Z',
            bTreeParameters: parentBTreeParameters
          });

      sandbox.stub(mockStorageManager, 'store')
        .callsFake((b, k, v) => {
          if (k === `branch:${branchGuid}`) {
            createdBranchPayload = v;
          }
        });
    });

    before(() =>
      aBranchManager.createBranch({
        guid: branchGuid,
        meta: {},
        rootCommitGuid: generateGUID(),
        created: Date.now(),
        parentBranchGuid: parentBranchGuid
      })
    );

    it('should add the BTree parameters from the parent branch to the branch data', () =>
      expect(createdBranchPayload.bTreeParameters).to.eql(parentBTreeParameters)
    );
  });
});
