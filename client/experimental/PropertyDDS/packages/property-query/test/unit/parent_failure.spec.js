/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const BranchWriteQueue = require('../../src/materialized_history_service/branch_write_queue');
const { generateGUID } = require('@fluid-experimental/property-common').GuidUtils;
const InMemoryBackend = require('../../src/materialized_history_service/storage_backends/in_memory');
const JSONSerializer = require('../../src/materialized_history_service/serialization/json');
const MaterializedHistoryService = require('../../src/materialized_history_service/materialized_history_service');
const NodeDependencyManager = require('../../src/materialized_history_service/node_dependency_manager');
//const PSSClient = require('../../src/server/pss_client');

const StorageManager = require('../../src/materialized_history_service/storage_backends/storage_manager');

const sinon = require('sinon');
const sandbox = sinon.createSandbox();

describe('Branch write queue parent failure', () => {
  const storage = new InMemoryBackend({});
  const nodeDependencyManager = new NodeDependencyManager(storage);
  const pssClient = {
      getCommitRange: function() {}
  };
  const branchWriteQueue = new BranchWriteQueue({
    pssClient: pssClient
  });
  const storageManager = new StorageManager({
    backend: storage,
    settings: { get: () => undefined },
    serializer: new JSONSerializer()
  });
  const mhService = new MaterializedHistoryService({
    storageManager: storageManager,
    settings: { get: () => undefined },
    systemMonitor: { startSegment: (a, b, aFunction) => aFunction(), addCustomAttributes: () => {} },
    nodeDependencyManager,
    branchWriteQueue,
    serializer: new JSONSerializer()
  });

  describe('failing on an un-waited parent write', () => {

    const branchGuid = generateGUID();
    const commitGuid = generateGUID();
    const parentCommitGuid = generateGUID();
    const headBranchGuid = generateGUID();

    let storageManagerGet = sandbox.stub(storage, 'get');
    let pssClientGetCommitRange = sandbox.stub(pssClient, 'getCommitRange');
    let cmCreateCommit = sandbox.stub(mhService._commitManager, 'createCommit');

    let unhandledRejections = [];

    const rejectionHandler = (reason) => {
      unhandledRejections.push(reason);
    };

    before(() => {
      // Setup a parent commit in the pss client
      storageManagerGet
        .withArgs(`branch:${branchGuid}`, true)
          .resolves(JSON.stringify({
            guid: branchGuid,
            headCommitGuid: headBranchGuid
          }))
        // This will make fail the parent write since the head commit is not found
        .withArgs(`commit:${headBranchGuid}`, undefined)
          .resolves(undefined);

      storageManagerGet.resolves(undefined);

      pssClientGetCommitRange
        .withArgs({
          branchGuid: branchGuid,
          minCommitGuid: headBranchGuid,
          maxCommitGuid: commitGuid,
          limit: 10
        })
          .resolves({
            commits: [{
              guid: parentCommitGuid,
              meta: {},
              changeSet: {}
            },
            {
              guid: commitGuid,
              meta: {},
              changeSet: {}
            }]
          });



      cmCreateCommit.rejects(new Error('OOPS'));

    });

    before(() => {
      process.on('unhandledRejection', rejectionHandler);
    });

    it('should wait for a commit in particular', () =>
      expect(mhService.waitUntilCommitApplied(branchGuid, commitGuid))
        .to.be.rejectedWith(Error, 'Failed applying a parent commit')
    );

    it('should not throw an unhandled promise rejection', () => {
      expect(unhandledRejections.length).to.eql(0);
    });

    it('should have called createCommit for the first commit, with 5 retries', () => {
      expect(cmCreateCommit).to.have.been.calledWith({
        branchGuid: branchGuid,
        changeSet: sinon.match.any,
        guid: parentCommitGuid,
        meta: sinon.match.any,
        parentGuid: sinon.match.any
      });
      expect(cmCreateCommit.callCount).to.eql(5);
    });

    it('should not have called createCommit for the second commit', () =>
      expect(cmCreateCommit).not.to.have.been.calledWith({
        branchGuid: branchGuid,
        changeSet: sinon.match.any,
        guid: commitGuid,
        meta: sinon.match.any,
        parentGuid: sinon.match.any
      })
    );

    after(() => {
      process.off('unhandledRejection', rejectionHandler);
    });

    after(() => sandbox.restore());
  });
});
