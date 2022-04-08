/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint no-unused-expressions: 0 */
/* eslint max-nested-callbacks: 0 */
/* globals targets */
const Fixtures = require('./fixtures');
const generateGUID = require('@fluid-experimental/property-common').GuidUtils.generateGUID;
const MHServer = require('../../src/server/server');
const getPort = require('get-port');
const PluginManager = require('../../src/plugins/PluginManager');

const sinon = require('sinon');
const { MaterializedHistoryService, BackendFactory, SerializerFactory, BranchWriteQueue, StorageManager, NodeDependencyManager } = require('@fluid-experimental/property-query');
const settings = require('../../src/server/utils/server_settings');
const PSSClient = require('../../src/server/pss_client');
const getExpressApp = require('../utils/get_express_app');

describe('Branch deletion integration test', function() {
  this.timeout(20000);

  const LARGE_STRING_SIZE = 32768;

  let createdBranchGuid = generateGUID();
  let secondCreatedBranchGuid = generateGUID();
  let thirdCreatedBranchGuid = generateGUID();
  let conflictCreatedBranchGuid = generateGUID();
  let rootCommitGuid = generateGUID();
  let firstCommitGuid = generateGUID();
  let secondCommitGuid = generateGUID();
  let server;
  let savedSettings = {};
  let changeSetting = function(key, value) {
    settings.set(key, value);
    savedSettings[key] = settings.get(key);
  }


  let port;

  before(async () => {
    port = await getPort();
    changeSetting('materializedHistoryService:enableRequestSigning', true);

    targets.mhServerUrl = `http://127.0.0.1:${port}`;
    server = new MHServer({
      app: getExpressApp(),
      port,
      systemMonitor: PluginManager.instance.systemMonitor
    });
    await server.start();
  });

  after(() => {
    server.stop();
    // Restore the settings
    for (let [key, value] of Object.entries(savedSettings)) {
      settings.set(key, value);
    }
  });

  const firstChangeSet = {
    insert: {
      String: {
        aFirstString: 'Ground Control To Major Tom',
        aSecondString: 'Take your protein pills and put',
        aThirdString: 'Your helmet on',
        aLargeString: Array(LARGE_STRING_SIZE).fill('a').join(''),
        aSecondLargeString: Array(LARGE_STRING_SIZE).fill('b').join('')
      },
      'Reference<String>': {
        aFirstReference: '/aFirstString'
      },
      'mysample:point2d-1.0.0': {
        aPoint: {
          Float64: {
            x: 3.14,
            y: 2.72
          }
        }
      }
    },
    insertTemplates: {
      'mysample:point2d-1.0.0': {
        typeid: 'mysample:point2d-1.0.0',
        inherits: 'NamedProperty',
        properties: [
          { id: 'x', typeid: 'Float64' },
          { id: 'y', typeid: 'Float64' }
        ]
      }
    }
  };

  for (let i = 0; i < 1000; i++) {
    firstChangeSet.insert.String['aString' + i] = Array(1024).fill('a').join('');
  }

  const secondChangeSet = {
    insert: {
      String: {
        aFourthString: 'Commencing countdown, engines on',
        aThirdLargeString: Array(LARGE_STRING_SIZE).fill('d').join('')
      },
      'mysample:fullname-1.0.0': {
        davidBowie: {
          String: {
            first: 'David',
            last: 'Bowie'
          }
        }
      }
    },
    remove: ['aSecondLargeString'],
    modify: {
      String: {
        aLargeString: Array(LARGE_STRING_SIZE).fill('c').join('')
      }
    },
    insertTemplates: {
      'mysample:fullname-1.0.0': {
        typeid: 'mysample:fullname-1.0.0',
        inherits: 'NamedProperty',
        properties: [
          { id: 'first', typeid: 'String' },
          { id: 'last', typeid: 'String' }
        ]
      }
    }
  };

  describe('Successful deletion', () => {
    describe('On a properly created branch', () => {
      before(async () => {
        let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
        await Fixtures.createBranch(headers, {
          guid: createdBranchGuid,
          rootCommitGuid: rootCommitGuid,
          meta: {},
          created: Date.now()
        });
      });

      describe('with two commits', () => {

        before(async function() {
          let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
          return Fixtures.createCommit(createdBranchGuid, headers, {
            guid: firstCommitGuid,
            parentGuid: rootCommitGuid,
            branchGuid: createdBranchGuid,
            changeSet: JSON.stringify(firstChangeSet),
            meta: {},
            created: Date.now()
          });
        });

        before(async function() {
          let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
          return Fixtures.createCommit(createdBranchGuid, headers, {
            guid: secondCommitGuid,
            parentGuid: firstCommitGuid,
            branchGuid: createdBranchGuid,
            changeSet: JSON.stringify(secondChangeSet),
            meta: {},
            created: Date.now()
          });
        });

        describe('with an invalid request signature', () => {
          it('should reject the creation request', () =>
            expect(Fixtures.deleteBranches([createdBranchGuid], {}))
              .to.be.rejectedWith(Error, 'Request signature algorithm not supported')
          );
        });

        describe('Branch deletion', () => {
          let taskInfo;

          it('should call the branch deletion', async () => {
            let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
            taskInfo = await Fixtures.deleteBranches([createdBranchGuid], headers);
          });

          it('should poll the task until completion', async () => {
            do {
              let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
              taskInfo = await Fixtures.fetchDeleteTask(taskInfo.taskUrl, headers);
              expect(taskInfo.status).not.to.eql('FAILED', 'task was failed: ' + taskInfo.error);
            } while (taskInfo.status !== 'COMPLETED');
          });

          it('should reject the poll without a signature', () =>
            expect(Fixtures.fetchDeleteTask(taskInfo.taskUrl, {}))
              .to.be.rejectedWith(Error, 'Request signature algorithm not supported')
          );

          it('should return a 404 when trying to fetch the branch', function() {
            let headers = Fixtures.getRequestSignatureHeaders(createdBranchGuid);
            return expect(Fixtures.fetchBranch(createdBranchGuid, headers))
              .to.be.rejectedWith(Error, 'Not Found');
          });
        });
      });
    });
  });

  describe('For a branch not existing', () => {
    let branchGuid = generateGUID();

    describe('Branch deletion', () => {
      let taskInfo;

      it('should call the branch deletion', async () => {
        let headers = Fixtures.getRequestSignatureHeaders(branchGuid);
        taskInfo = await Fixtures.deleteBranches([branchGuid], headers);
      });

      it('should poll the task until completion', async () => {
        do {
          let headers = Fixtures.getRequestSignatureHeaders(branchGuid);
          taskInfo = await Fixtures.fetchDeleteTask(taskInfo.taskUrl, headers);
          expect(taskInfo.status).not.to.eql('FAILED', 'task was failed: ' + taskInfo.error);
        } while (taskInfo.status !== 'COMPLETED');
      });

      it('should reject the poll without a signature', () =>
        expect(Fixtures.fetchDeleteTask(taskInfo.taskUrl, {}))
          .to.be.rejectedWith(Error, 'Request signature algorithm not supported')
      );

      it('should return a 404 when trying to fetch the branch', function() {
        let headers = Fixtures.getRequestSignatureHeaders(branchGuid);
        return expect(Fixtures.fetchBranch(branchGuid, headers))
          .to.be.rejectedWith(Error, 'Not Found');
      });
    });
  });

  describe('With an existing branch but no existing commit', () => {
    let branchGuid = generateGUID();
    describe('On a properly created branch', () => {
      before(async () => {
        let headers = Fixtures.getRequestSignatureHeaders(branchGuid);
        await Fixtures.createBranch(headers, {
          guid: branchGuid,
          rootCommitGuid: rootCommitGuid,
          meta: {},
          created: Date.now()
        });
      });

      describe('Branch deletion', () => {
        let taskInfo;

        it('should modify the branch to a non-existent head commit', async () => {
          let storageManager = server._materializedHistoryService._storageManager;
          let batch = storageManager.startWriteBatch();
          let branch = await storageManager.get(`branch:${branchGuid}`);
          branch.headCommitGuid = generateGUID();
          storageManager.update(batch, `branch:${branchGuid}`, branch);
          await storageManager.finishWriteBatch(batch);
        });

        it('should call the branch deletion', async () => {
          let headers = Fixtures.getRequestSignatureHeaders(branchGuid);
          taskInfo = await Fixtures.deleteBranches([branchGuid], headers);
        });

        it('should poll the task until completion', async () => {
          do {
            let headers = Fixtures.getRequestSignatureHeaders(branchGuid);
            taskInfo = await Fixtures.fetchDeleteTask(taskInfo.taskUrl, headers);
            expect(taskInfo.status).not.to.eql('FAILED', 'task was failed: ' + taskInfo.error);
          } while (taskInfo.status !== 'COMPLETED');
        });

        it('should return a 404 when trying to fetch the branch', function() {
          let headers = Fixtures.getRequestSignatureHeaders(branchGuid);
          return expect(Fixtures.fetchBranch(branchGuid, headers))
            .to.be.rejectedWith(Error, 'Not Found');
        });
      });
    });
  });

  describe('With an existing task for a branch', () => {
    describe('On a properly created branch', () => {
      before(async () => {
        let headers = Fixtures.getRequestSignatureHeaders(conflictCreatedBranchGuid);
        await Fixtures.createBranch(headers, {
          guid: conflictCreatedBranchGuid,
          rootCommitGuid: rootCommitGuid,
          meta: {},
          created: Date.now()
        });
      });

      describe('with two commits', () => {

        before(async function() {
          let headers = Fixtures.getRequestSignatureHeaders(conflictCreatedBranchGuid);
          return Fixtures.createCommit(conflictCreatedBranchGuid, headers, {
            guid: firstCommitGuid,
            parentGuid: rootCommitGuid,
            branchGuid: conflictCreatedBranchGuid,
            changeSet: JSON.stringify(firstChangeSet),
            meta: {},
            created: Date.now()
          });
        });

        before(async function() {
          let headers = Fixtures.getRequestSignatureHeaders(conflictCreatedBranchGuid);
          return Fixtures.createCommit(conflictCreatedBranchGuid, headers, {
            guid: secondCommitGuid,
            parentGuid: firstCommitGuid,
            branchGuid: conflictCreatedBranchGuid,
            changeSet: JSON.stringify(secondChangeSet),
            meta: {},
            created: Date.now()
          });
        });

        describe('Branch deletion', () => {
          let existingTasks;
          let taskInfo;
          let taskGuid = generateGUID();
          let theFailedTask = {
            taskGuid: taskGuid,
            status: 'FAILED',
            branchGuids: [ conflictCreatedBranchGuid ],
            taskUrl: `http://127.0.0.1:${port}/v1/branchDeletion/${taskGuid}`
          };

          it('should populate a task object in DynamoDB', async () => {
            let deletionManager = server._materializedHistoryService._deletionManager;
            await deletionManager._writeTaskStatus(theFailedTask);
            await deletionManager._writeTaskPerBranch(theFailedTask);
          });

          it('should call the branch deletion', async () => {
            let headers = Fixtures.getRequestSignatureHeaders(conflictCreatedBranchGuid);
            existingTasks = await Fixtures.deleteBranches([conflictCreatedBranchGuid], headers);
          });

          it('should restart the task', async () => {
            let headers = Fixtures.getRequestSignatureHeaders(conflictCreatedBranchGuid);
            taskInfo = await Fixtures.retryBranchDeletion(existingTasks.existingTasks[0].taskGuid, headers);
          });

          it('should poll the task until completion', async () => {
            do {
              let headers = Fixtures.getRequestSignatureHeaders(conflictCreatedBranchGuid);
              taskInfo = await Fixtures.fetchDeleteTask(taskInfo.taskUrl, headers);
              expect(taskInfo.status).not.to.eql('FAILED', 'task was failed: ' + taskInfo.error);
            } while (taskInfo.status !== 'COMPLETED');
          });

          it('should return a 404 when trying to fetch the branch', function() {
            let headers = Fixtures.getRequestSignatureHeaders(conflictCreatedBranchGuid);
            return expect(Fixtures.fetchBranch(conflictCreatedBranchGuid, headers))
              .to.be.rejectedWith(Error, 'Not Found');
          });
        });
      });
    });
  });

  describe('Failure before the deletion phase', () => {
    describe('On a properly created branch', () => {
      before(async () => {
        let headers = Fixtures.getRequestSignatureHeaders(secondCreatedBranchGuid);
        await Fixtures.createBranch(headers, {
          guid: secondCreatedBranchGuid,
          rootCommitGuid: rootCommitGuid,
          meta: {},
          created: Date.now()
        });
      });

      describe('with two commits', () => {

        before(async function() {
          let headers = Fixtures.getRequestSignatureHeaders(secondCreatedBranchGuid);
          return Fixtures.createCommit(secondCreatedBranchGuid, headers, {
            guid: firstCommitGuid,
            parentGuid: rootCommitGuid,
            branchGuid: secondCreatedBranchGuid,
            changeSet: JSON.stringify(firstChangeSet),
            meta: {},
            created: Date.now()
          });
        });

        before(async function() {
          let headers = Fixtures.getRequestSignatureHeaders(secondCreatedBranchGuid);
          return Fixtures.createCommit(secondCreatedBranchGuid, headers, {
            guid: secondCommitGuid,
            parentGuid: firstCommitGuid,
            branchGuid: secondCreatedBranchGuid,
            changeSet: JSON.stringify(secondChangeSet),
            meta: {},
            created: Date.now()
          });
        });

        describe('Branch deletion retry', () => {
          let taskInfo;
          let theFailedTask;

          it('should populate a task object in DynamoDB', async () => {
            let taskGuid = generateGUID();
            theFailedTask = {
              taskGuid: taskGuid,
              status: 'FAILED',
              branchGuids: [ secondCreatedBranchGuid ],
              taskUrl: `http://127.0.0.1:${port}/v1/branchDeletion/${taskGuid}`
            };

            let storageManager = server._materializedHistoryService._storageManager;
            const batch = storageManager.startWriteBatch();
            storageManager.store(batch, `deleteTask:${taskGuid}`, theFailedTask);
            return storageManager.finishWriteBatch(batch);
          });

          it('should reject the retry without a signature', () =>
            expect(Fixtures.retryBranchDeletion(theFailedTask.taskGuid, {}))
              .to.be.rejectedWith(Error, 'Request signature algorithm not supported')
          );

          it('should call the branch deletion retry', async function() {
            let headers = Fixtures.getRequestSignatureHeaders(secondCreatedBranchGuid);
            taskInfo = await Fixtures.retryBranchDeletion(theFailedTask.taskGuid, headers);
          });

          it('should poll the task until completion', async () => {
            do {
              let headers = Fixtures.getRequestSignatureHeaders(secondCreatedBranchGuid);
              taskInfo = await Fixtures.fetchDeleteTask(taskInfo.taskUrl, headers);
              expect(taskInfo.status).not.to.eql('FAILED', 'task was failed: ' + taskInfo.error);
            } while (taskInfo.status !== 'COMPLETED');
          });

          it('should return a 404 when trying to fetch the branch', function() {
            let headers = Fixtures.getRequestSignatureHeaders(secondCreatedBranchGuid);
            return expect(Fixtures.fetchBranch(secondCreatedBranchGuid, headers))
              .to.be.rejectedWith(Error, 'Not Found');
          });
        });
      });
    });
  });

  // This test simulates a failure that happens mid-deletion phase
  describe('Failure during the deletion phase', () => {
    describe('On a properly created branch', () => {
      before(async () => {
        let headers = Fixtures.getRequestSignatureHeaders(thirdCreatedBranchGuid);
        await Fixtures.createBranch(headers, {
          guid: thirdCreatedBranchGuid,
          rootCommitGuid: rootCommitGuid,
          meta: {},
          created: Date.now()
        });
      });

      describe('with two commits', () => {

        before(async function() {
          let headers = Fixtures.getRequestSignatureHeaders(thirdCreatedBranchGuid);
          return Fixtures.createCommit(thirdCreatedBranchGuid, headers, {
            guid: firstCommitGuid,
            parentGuid: rootCommitGuid,
            branchGuid: thirdCreatedBranchGuid,
            changeSet: JSON.stringify(firstChangeSet),
            meta: {},
            created: Date.now()
          });
        });

        before(async function() {
          let headers = Fixtures.getRequestSignatureHeaders(thirdCreatedBranchGuid);
          return Fixtures.createCommit(thirdCreatedBranchGuid, headers, {
            guid: secondCommitGuid,
            parentGuid: firstCommitGuid,
            branchGuid: thirdCreatedBranchGuid,
            changeSet: JSON.stringify(secondChangeSet),
            meta: {},
            created: Date.now()
          });
        });

        describe('Branch deletion retry', () => {
          let taskGuid = generateGUID();
          let taskInfo;
          let theFailedTask = {
            taskGuid: taskGuid,
            status: 'FAILED',
            branchGuids: [ thirdCreatedBranchGuid ],
            nodesToDelete: [],
            taskUrl: `http://127.0.0.1:${port}/v1/branchDeletion/${taskGuid}`
          };

          it('should scan the nodes', async () => {
            let deletionManager = server._materializedHistoryService._deletionManager;
            await deletionManager._scanNodes(theFailedTask);
          });

          it('should have some of the nodes already deleted', async () => {
            let storageManager = server._materializedHistoryService._storageManager;
            let deletePromises = theFailedTask.nodesToDelete.slice(0, 10).map((nodeRef) =>
              storageManager.delete(nodeRef)
            );
            return Promise.all(deletePromises);
          });

          it('should populate a task object in DynamoDB', async () => {
            let storageManager = server._materializedHistoryService._storageManager;
            const batch = storageManager.startWriteBatch();
            storageManager.store(batch, `deleteTask:${taskGuid}`, theFailedTask);
            return storageManager.finishWriteBatch(batch);
          });

          it('should call the branch deletion retry', async function() {
            let headers = Fixtures.getRequestSignatureHeaders(thirdCreatedBranchGuid);
            taskInfo = await Fixtures.retryBranchDeletion(theFailedTask.taskGuid, headers);
          });

          it('should poll the task until completion', async () => {
            do {
              let headers = Fixtures.getRequestSignatureHeaders(thirdCreatedBranchGuid);
              taskInfo = await Fixtures.fetchDeleteTask(taskInfo.taskUrl, headers);
              expect(taskInfo.status).not.to.eql('FAILED', 'task was failed: ' + taskInfo.error);
            } while (taskInfo.status !== 'COMPLETED');
          });

          it('should return a 404 when trying to fetch the branch', function() {
            let headers = Fixtures.getRequestSignatureHeaders(thirdCreatedBranchGuid);
            return expect(Fixtures.fetchBranch(thirdCreatedBranchGuid, headers))
              .to.be.rejectedWith(Error, 'Not Found');
          });

          it('should have deleted all the nodes', () => {
            let storageManager = server._materializedHistoryService._storageManager;
            let fetchPromises = theFailedTask.nodesToDelete.map((nodeRef) =>
              expect(storageManager.get(nodeRef)).to.eventually.eql(undefined)
            );
            return Promise.all(fetchPromises);
          });
        });
      });
    });
  });

  describe('with a missing task', () => {
    it('should reject the poll of a non-existing task', function() {
      let headers = Fixtures.getRequestSignatureHeaders(thirdCreatedBranchGuid);
      return expect(Fixtures.fetchDeleteTask(
        `http://127.0.0.1:${port}/v1/branchDeletion/anyweirdtask`, headers)
      ).to.be.rejectedWith(Error, 'Not found');
    });

    it('should reject the retrial of a non-existing task', function() {
      let headers = Fixtures.getRequestSignatureHeaders(thirdCreatedBranchGuid);
      return expect(Fixtures.retryBranchDeletion('wrongTaskGuid', headers))
        .to.be.rejectedWith(Error, 'Not found');
    });
  });

  describe('when taking a closer look at what actually gets deleted', () => {
    const compareRefSets = (expected, actual) => {
      // US = Unique and Sorted
      let expectedUS, actualUS;
      expectedUS = new Set(expected.filter((ref) => !ref.startsWith('delete')));
      actualUS = new Set(actual);
      expectedUS = [...expectedUS];
      actualUS = [...actualUS];
      expectedUS.sort();
      actualUS.sort();
      expect(actualUS).to.eql(expectedUS);
    };

    let storedRefs, updatedRefs, deletedRefs;
    let mhService, backend;
    let sandbox;
    before(() => {
      const factory = new BackendFactory({settings});
      backend = factory.getBackend();
      const sf = new SerializerFactory({settings});
      const storeFn = backend.store.bind(backend);
      sandbox = sinon.createSandbox();
      sandbox.stub(backend, 'store').callsFake(async (batch, ref, value) => {
        storedRefs.push(ref);
        storeFn(batch, ref, value);
      });
      const updateFn = backend.update.bind(backend);
      sandbox.stub(backend, 'update').callsFake((batch, ref, value, extra) => {
        updatedRefs.push(ref);
        updateFn(batch, ref, value, extra);
      });
      const deleteFn = backend.delete.bind(backend);
      sandbox.stub(backend, 'delete').callsFake((ref) => {
        deletedRefs.push(ref);
        return deleteFn(ref);
      });
      const pssClient = new PSSClient();
      const branchWriteQueue = new BranchWriteQueue({
        pssClient
      });
      const storageManager = new StorageManager({
        backend: backend,
        settings: settings,
        serializer: sf.getSerializer()
      });
      mhService = new MaterializedHistoryService({
        settings,
        serializer: sf.getSerializer(),
        systemMonitor: PluginManager.instance.systemMonitor,
        storageManager: storageManager,
        nodeDependencyManager: new NodeDependencyManager(backend),
        branchWriteQueue
      });
      return mhService.init();
    });

    let branchGuid;
    before(async () => {
      storedRefs = [];
      updatedRefs = [];

      branchGuid = generateGUID();
      rootCommitGuid = generateGUID();
      await mhService.createBranch({
        guid: branchGuid,
        meta: {
          materializedHistory: {
            enabled: true
          }
        },
        rootCommitGuid
      });
      firstCommitGuid = generateGUID();
      await mhService.createCommit({
        guid: firstCommitGuid,
        meta: {},
        branchGuid,
        parentGuid: rootCommitGuid,
        changeSet: firstChangeSet
      });
      secondCommitGuid = generateGUID();
      await mhService.createCommit({
        guid: secondCommitGuid,
        meta: {},
        branchGuid,
        parentGuid: firstCommitGuid,
        changeSet: secondChangeSet
      });
    });

    before(async () => {
      deletedRefs = [];

      const [, promise] = await mhService.createDeleteBranchTask({
        branchGuids: [branchGuid],
        taskUrl: 'whatever',
        taskGuid: generateGUID()
      });

      await promise;
    });

    after(() => {
      mhService.stop();
      sandbox.restore();
    });

    it('should delete all created nodes', () => {
      compareRefSets([...storedRefs, ...updatedRefs], deletedRefs);
    });
  });
});
