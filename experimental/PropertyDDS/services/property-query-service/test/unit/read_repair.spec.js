/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint no-unused-expressions: 0 */
const sinon = require('sinon');
const sandbox = sinon.createSandbox();
const generateGUID = require('@fluid-experimental/property-common').GuidUtils.generateGUID;

const BranchesController = require('../../src/server/controllers/branches_controller');
const { MaterializedHistoryService, StorageManager, BranchWriteQueue, NodeDependencyManager } = require('@fluid-experimental/property-query');
const DynamoDBBackend = require('../../src/materialized_history_service/storage_backends/dynamodb');
const PSSClient = require('../../src/server/pss_client');

describe('Read repair', () => {

  let branchGuid, existingCommitGuid, nonExistingCommitGuid;
  let controller, createCommitStub, getCommitRangeStub;
  before(() => {
    branchGuid = generateGUID();
    existingCommitGuid = generateGUID();
    nonExistingCommitGuid = generateGUID();

    const headCommitGuid = generateGUID();

    const storage = new DynamoDBBackend({ settings: {} });
    const nodeDependencyManager = new NodeDependencyManager(storage);
    const pssClient = new PSSClient();
    const branchWriteQueue = new BranchWriteQueue({
      pssClient
    });
    const storageManager = new StorageManager({
      backend: storage,
      settings: { get: () => {}}
    });
    const mhService = new MaterializedHistoryService({
      storageManager: storageManager,
      settings: { get: () => undefined },
      systemMonitor: { startSegment: (a, b, aFunction) => aFunction() },
      nodeDependencyManager,
      branchWriteQueue
    });
    controller = new BranchesController({
      materializedHistoryService: mhService,
      app: { post: () => undefined, get: () => undefined },
      requestSignatureValidator: { validateSignature: () => {} }
    });

    sandbox.stub(mhService._branchManager, 'getBranch').withArgs(
      branchGuid
    ).resolves({
      guid: branchGuid,
      headCommitGuid
    });
    getCommitRangeStub = sandbox.stub(pssClient, 'getCommitRange')
      .resolves({
        commits: [
          {
            guid: nonExistingCommitGuid,
            changeSet: {}
          }
        ]
      });
    createCommitStub = sandbox.stub(mhService._commitManager, 'createCommit')
      .resolves({});
    sandbox.stub(storage, 'get')
      .withArgs('commit:' + nonExistingCommitGuid).resolves(undefined)
      .withArgs('commit:' + existingCommitGuid).resolves({
        guid: existingCommitGuid,
        branchGuid
      });
  });

  afterEach(() => {
    sandbox.reset();
  });

  after(() => {
    sandbox.restore();
  });

  it('should trigger when the commit is not found', async () => {
    const req = {
      query: {},
      params: {
        branchGuid,
        commitGuid: nonExistingCommitGuid
      }
    };
    try {
      await controller.getCommitMV(req);
    } catch (err) {
      // Ignored. Mocking the entire behavior of getCommitMV is not needed.
    }
    expect(createCommitStub).to.have.been.calledOnce;
    expect(getCommitRangeStub).to.have.been.calledOnce;
  });

  it('should not trigger for an existing commit', async () => {
    const req = {
      query: {},
      params: {
        branchGuid,
        commitGuid: existingCommitGuid
      }
    };
    try {
      await controller.getCommitMV(req);
    } catch (err) {
      // Ignored. Mocking the entire behavior of getCommitMV is not needed.
    }
    expect(createCommitStub).to.not.have.been.called;
    expect(getCommitRangeStub).to.not.have.been.called;
  });
});
