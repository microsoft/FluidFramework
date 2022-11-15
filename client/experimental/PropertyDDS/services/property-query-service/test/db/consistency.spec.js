/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint no-unused-expressions: 0 */
const sinon = require('sinon');
const _ = require('lodash');
const { GuidUtils: { generateGUID }, OperationError } = require('@fluid-experimental/property-common');
const PluginManager = require('../../src/plugins/PluginManager');
const { MaterializedHistoryService, BackendFactory, NodeDependencyManager, SerializerFactory, BranchWriteQueue, StorageManager } = require('@fluid-experimental/property-query');
const settings = require('../../src/server/utils/server_settings');
const RepairManager = require('../../tool/repair/repair_manager');
const getExpressApp = require('../utils/get_express_app');


// Empty class for the pssClient, the functionality will be added via sandbox below to stub the tests
class PSSClientStub {
  constructor() { }

  getCommitRange() { }
  getCommit() { }
  getBranch() { }

  init() { }
  stop() { }
};

describe('Branch consistency check', function() {
  this.timeout(20000);

  let branchGuid, rootCommitGuid, parentGuid, commits, branchInfo, startDate;
  let storedRefs, updatedRefs, deletedRefs;
  let mhService, backend, repairManager;
  let sandbox;

  const compareRefSets = (expected, actual) => {
    // US = Unique and Sorted
    let expectedUS, actualUS;

    // We are filtering out HH nodes because they are currently created but not deleted.
    // HH implementation will change, so we are not deleting these nodes. They should not be created.
    expectedUS = expected.filter((ref) => !/^(h:|hi:)/.test(ref));
    actualUS = actual.filter((ref) => !/^(h:|hi:)/.test(ref));
    expectedUS = new Set(expectedUS);
    actualUS = new Set(actualUS);
    expectedUS = [...expectedUS];
    actualUS = [...actualUS];
    expectedUS.sort();
    actualUS.sort();
    expect(actualUS).to.eql(expectedUS);
  };

  const compareTreeNodeRefSets = (expected, actual) => {
    compareRefSets(expected.filter((ref) => /^(l:|i:)/.test(ref)),
      actual.filter((ref) => /^(l:|i:)/.test(ref)));
  };

  const createBranchAndCommits = async () => {
    storedRefs = [];
    updatedRefs = [];
    await mhService._branchManager.createBranch({
      guid: branchGuid,
      meta: {},
      rootCommitGuid
    });
    parentGuid = rootCommitGuid;
    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      await mhService._commitManager.createCommit(_.assign({
        branchGuid,
        parentGuid
      }, commit));
      parentGuid = commit.guid;
    }
  };

  const compareMV = async () => {
    const mvRes = await mhService.getCommitMV({
      guid: _.last(commits).guid,
      branchGuid: branchGuid
    });
    expect(mvRes.changeSet).to.eql({
      insert: {
        String: {
          myString0: 'the value is 0',
          myString1: 'the value is 1'
        }
      }
    });
  };

  const setup = async () => {
    startDate = new Date();
    branchGuid = generateGUID();
    rootCommitGuid = generateGUID();
    commits = [
      {
        guid: generateGUID(),
        meta: {},
        changeSet: {
          insert: {
            String: {
              myString0: 'the value is 0'
            }
          }
        }
      },
      {
        guid: generateGUID(),
        meta: {},
        changeSet: {
          insert: {
            String: {
              myString1: 'the value is 1'
            }
          }
        }
      }
    ];
    for (let i = 0; i < commits.length; i++) {
      commits[i].created = Date.now() + (i + 1) * 10;
    }
    commits[0].parent = { guid: rootCommitGuid };
    commits[1].parent = { guid: commits[0].guid };
    branchInfo = {
      repository: {
        rootCommit: {
          guid: rootCommitGuid
        }
      },
      branch: {
        guid: branchGuid,
        meta: {
          materializedHistory: {
            enabled: true
          }
        },
        head: {
          guid: _.last(commits).guid,
          sequence: commits.length
        }
      }
    };

    // Mock pss client to return a branch with two commits
    sandbox = sinon.createSandbox();
    const factory = new BackendFactory({settings});
    backend = factory.getBackend();
    const hfdmClassicClient = new PSSClientStub();
    const sf = new SerializerFactory({settings});
    sandbox.stub(hfdmClassicClient, 'getCommitRange')
      .callsFake(({ branchGuid: guid, minCommitGuid: min, maxCommitGuid: max, limit: l }) => {
        let minIndex;
        if (min) {
          minIndex = commits.findIndex((c) => c.guid === min);
          if (minIndex === -1 && min !== rootCommitGuid) {
            return Promise.reject(new OperationError('Commit not found', '', 404));
          }
        } else {
          minIndex = 0;
        }
        let maxIndex;
        if (max) {
          maxIndex = commits.findIndex((c) => c.guid === max);
        } else {
          maxIndex = commits.length - 1;
        }
        if (!l) {
          l = commits.length;
        }
        return Promise.resolve({ commits: commits.slice(minIndex + 1, Math.min(l, maxIndex - minIndex + 1)) });
      });
    sandbox.stub(hfdmClassicClient, 'getCommit')
      .callsFake(({ branchGuid: bg, commitGuid }) => {
        const commit = commits.find((c) => c.guid === commitGuid);
        if (commit) {
          return Promise.resolve({ commit });
        } else {
          return Promise.reject(new OperationError('Commit not found', '', 404));
        }
      });
    sandbox.stub(hfdmClassicClient, 'getBranch')
      .withArgs(branchGuid)
      .resolves(branchInfo);
    const storeFn = backend.store.bind(backend);
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
    const branchWriteQueue = new BranchWriteQueue({
      pssClient: hfdmClassicClient
    });
    const storageManager = new StorageManager({
      backend: backend,
      settings: settings,
      serializer: sf.getSerializer()
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
    repairManager = new RepairManager({
      mhService,
      hfdmClassicClient
    });
    await repairManager.init();
  };

  const teardown = async () => {
    await repairManager.stop();
    sandbox.restore();
  };

  describe('when branch does not exist', () => {
    before(async () => {
      await setup();
    });

    after(async () => {
      await teardown();
    });

    before(async () => {
      storedRefs = [];
      updatedRefs = [];
      deletedRefs = [];
      await repairManager._makeBranchConsistent({ branchGuid, since: startDate });
    });

    it('should create it', async () => {
      const branch = await mhService.getBranch(branchGuid);
      expect(branch.headCommitGuid).to.eql(_.last(commits).guid);
    });

    it('should provide a valid MV', async () => {
      await compareMV();
    });
  });

  describe('when branch is ahead', () => {
    before(async () => {
      await setup();
    });

    after(async () => {
      await teardown();
    });

    let commitRefs;
    before(async () => {
      await createBranchAndCommits();

      // Store the new refs for this commit
      storedRefs = [];
      updatedRefs = [];
      await mhService._commitManager.createCommit({
        guid: generateGUID(),
        branchGuid,
        parentGuid,
        meta: {},
        changeSet: {
          insert: {
            String: {
              myStringX: 'the value is X',
              myLargeStringX: 'large string X'.repeat(10000)
            }
          }
        }
      });
      commitRefs = [...storedRefs, ...updatedRefs];
    });

    let consistencyRefs;
    before(async () => {
      updatedRefs = [];
      deletedRefs = [];
      await repairManager._makeBranchConsistent({ branchGuid, since: startDate });
      consistencyRefs = [...updatedRefs, ...deletedRefs];
    });

    it('should roll the head back', async () => {
      const branch = await mhService.getBranch(branchGuid);
      expect(branch.headCommitGuid).to.eql(_.last(commits).guid);
    });

    it('should undo changes of nodes for the extra commits', () => {
      compareRefSets(commitRefs, consistencyRefs);
    });

    it('should provide a valid MV', async () => {
      await compareMV();
    });
  });

  describe('when branch is ahead but the commit node is missing', () => {
    before(async () => {
      await setup();
    });

    after(async () => {
      await teardown();
    });

    let commitNodeRef, commitRefs;
    before(async () => {
      await createBranchAndCommits();

      // Store the new refs for this commit
      storedRefs = [];
      updatedRefs = [];
      await mhService._commitManager.createCommit({
        guid: generateGUID(),
        branchGuid,
        parentGuid,
        meta: {},
        changeSet: {
          insert: {
            String: {
              myStringX: 'the value is X',
              myLargeStringX: 'large string X'.repeat(10000)
            }
          }
        }
      });
      commitRefs = [...storedRefs, ...updatedRefs];

      // Delete the commit node
      commitNodeRef = storedRefs.find((ref) => ref.startsWith('commit:'));
      deletedRefs = [];
      await backend.delete(commitNodeRef);
      mhService._storageManager._cache.reset();
    });

    let consistencyRefs;
    before(async () => {
      updatedRefs = [];
      deletedRefs = [];
      await repairManager._makeBranchConsistent({ branchGuid, since: startDate });
      consistencyRefs = [...updatedRefs, ...deletedRefs];
    });

    it('should roll the head back', async () => {
      const branch = await mhService.getBranch(branchGuid);
      expect(branch.headCommitGuid).to.eql(_.last(commits).guid);
    });

    it('should undo changes to nodes that can be reached', async () => {
      // The repair is expected to skip all extra commits and only update the branch head.
      const branchRef = commitRefs.find((ref) => ref.startsWith('branch:'));
      expect(consistencyRefs).to.eql([branchRef]);
    });

    it('should provide a valid MV', async () => {
      await compareMV();
    });
  });

  describe('when branch is ahead but the commit tree is missing nodes affecting only extra commits', () => {
    before(async () => {
      await setup();
    });

    after(async () => {
      await teardown();
    });

    let leafNodeRef, commitRefs;
    before(async () => {
      await createBranchAndCommits();

      // Store the new refs for this commit
      storedRefs = [];
      updatedRefs = [];
      await mhService._commitManager.createCommit({
        guid: generateGUID(),
        branchGuid,
        parentGuid,
        meta: {},
        changeSet: {
          insert: {
            String: {
              myStringX: 'the value is X',
              myLargeStringX: 'large string X'.repeat(10000)
            }
          }
        }
      });
      commitRefs = [...storedRefs, ...updatedRefs];

      // Delete the leaf node that was created by this commit
      leafNodeRef = storedRefs.find((ref) => ref.startsWith('l:'));
      deletedRefs = [];
      await backend.delete(leafNodeRef);
      mhService._storageManager._cache.reset();
    });

    let consistencyRefs;
    before(async () => {
      updatedRefs = [];
      deletedRefs = [];
      await repairManager._makeBranchConsistent({ branchGuid, since: startDate });
      consistencyRefs = [...updatedRefs, ...deletedRefs];
    });

    it('should roll the head back', async () => {
      const branch = await mhService.getBranch(branchGuid);
      expect(branch.headCommitGuid).to.eql(_.last(commits).guid);
    });

    it('should delete the nodes that can be reached', async () => {
      // This should be all nodes of the extra commit with exception of the leaf node
      commitRefs = commitRefs.filter((ref) => ref !== leafNodeRef);
      compareRefSets(commitRefs, consistencyRefs);
    });

    it('should provide a valid MV', async () => {
      await compareMV();
    });
  });

  describe('when branch is ahead but the commit tree is missing nodes affecting several commits', () => {
    before(async () => {
      await setup();
    });

    after(async () => {
      await teardown();
    });

    let leafNodeRef, commitRefs;
    before(async () => {
      await createBranchAndCommits();

      // Store the refs for all commits
      await mhService._commitManager.createCommit({
        guid: generateGUID(),
        branchGuid,
        parentGuid,
        meta: {},
        changeSet: {
          insert: {
            String: {
              myStringX: 'the value is X'
            }
          }
        }
      });
      commitRefs = [...storedRefs, ...updatedRefs];

      // Delete a leaf node ref that was updated
      leafNodeRef = updatedRefs.find((ref) => ref.startsWith('l:'));
      deletedRefs = [];
      await backend.delete(leafNodeRef);
      mhService._storageManager._cache.reset();
    });

    let consistencyRefs;
    before(async () => {
      storedRefs = [];
      updatedRefs = [];
      deletedRefs = [];
      await repairManager._makeBranchConsistent({ branchGuid, since: startDate });
      consistencyRefs = [...storedRefs, ...updatedRefs, ...deletedRefs];
    });

    it('should roll the head back', async () => {
      const branch = await mhService.getBranch(branchGuid);
      expect(branch.headCommitGuid).to.eql(_.last(commits).guid);
    });

    it('should delete the nodes that can be reached', async () => {
      // In this case, no tree nodes should be deleted
      const treeNodes = commitRefs.filter((ref) => /^(l:|i:)/.test(ref));
      expect(deletedRefs).to.not.have.members(treeNodes);
      // The consistency repair should touch all nodes. The branch is created from scratch.
      compareRefSets(commitRefs, consistencyRefs);
    });

    it('should provide a valid MV', async () => {
      await compareMV();
    });
  });

  describe('when branch is at the same commit but the commit node is missing', () => {
    before(async () => {
      await setup();
    });

    after(async () => {
      await teardown();
    });

    let lastCommitNodeRef, commitNodeRefs, commitRefs;
    before(async () => {
      await createBranchAndCommits();
      commitRefs = [...storedRefs, ...updatedRefs];

      // Delete the last commit node
      commitNodeRefs = storedRefs.filter((ref) => ref.startsWith('commit:'));
      lastCommitNodeRef = commitNodeRefs.pop();
      deletedRefs = [];
      await backend.delete(lastCommitNodeRef);
      mhService._storageManager._cache.reset();
    });

    let consistencyRefs;
    before(async () => {
      storedRefs = [];
      updatedRefs = [];
      await repairManager._makeBranchConsistent({ branchGuid, since: startDate });
      consistencyRefs = [...storedRefs, ...updatedRefs];
    });

    it('should create only the last commit node', () => {
      expect(storedRefs).to.include(lastCommitNodeRef);
      expect(consistencyRefs).to.not.have.members(commitNodeRefs);
    });

    it('should overwrite the last commit tree nodes', () => {
      compareTreeNodeRefSets(commitRefs, consistencyRefs);
    });

    it('should provide a valid MV', async () => {
      await compareMV();
    });
  });

  describe('when branch is at the same commit but the commit tree is missing nodes affecting several commits', () => {
    before(async () => {
      await setup();
    });

    after(async () => {
      await teardown();
    });

    let lastLeafNodeRef, commitNodeRefs, commitRefs;
    before(async () => {
      await createBranchAndCommits();
      commitRefs = [...storedRefs, ...updatedRefs];

      // Delete the last leaf node
      commitNodeRefs = storedRefs.filter((ref) => ref.startsWith('l:'));
      lastLeafNodeRef = commitNodeRefs.pop();
      deletedRefs = [];
      await backend.delete(lastLeafNodeRef);
      mhService._storageManager._cache.reset();
    });

    let consistencyRefs;
    before(async () => {
      storedRefs = [];
      updatedRefs = [];
      await repairManager._makeBranchConsistent({ branchGuid, since: startDate });
      consistencyRefs = [...storedRefs, ...updatedRefs];
    });

    it('should roll back and forward the branch head', () => {
      const branchNodeRefs = updatedRefs.filter((ref) => ref.startsWith('branch:'));
      expect(branchNodeRefs.length).to.eql(3);
    });

    it('should create the missing tree nodes', async () => {
      // The consistency repair should touch all nodes. The branch is created from scratch.
      compareRefSets(commitRefs, consistencyRefs);
    });

    it('should provide a valid MV', async () => {
      await compareMV();
    });
  });

  describe('when branch is at the same commit and the current commit is consistent but the previous is not', () => {
    before(async () => {
      await setup();
    });

    after(async () => {
      await teardown();
    });

    let commitNodeRef, commitNodeRefs;
    before(async () => {
      await createBranchAndCommits();

      // Delete the commit node of the previous to last commit
      commitNodeRefs = storedRefs.filter((ref) => ref.startsWith('commit:'));
      commitNodeRef = commitNodeRefs[commitNodeRefs.length - 2];
      deletedRefs = [];
      await backend.delete(commitNodeRef);
      mhService._storageManager._cache.reset();
    });

    let consistencyRefs;
    before(async () => {
      storedRefs = [];
      updatedRefs = [];
      await repairManager._makeBranchConsistent({ branchGuid, since: startDate });
      consistencyRefs = [...storedRefs, ...updatedRefs];
    });

    it('should repair the previous to last commit', () => {
      expect(consistencyRefs).to.include(commitNodeRef);
    });

    it('should roll back and forward the branch head', () => {
      const branchNodeRefs = updatedRefs.filter((ref) => ref.startsWith('branch:'));
      expect(branchNodeRefs.length).to.eql(3);
    });

    it('should provide a valid MV', async () => {
      await compareMV();
    });
  });

  describe('when branch is at the same commit and there is an inconsistent commit before a bunch of consistent ones',
  () => {
    before(async () => {
      await setup();

      // This test uses a larger commit sequence
      commits = _.times(20, (i) => {
        const result = {
          guid: generateGUID(),
          meta: {},
          changeSet: {
            insert: {
              String: {
              }
            }
          }
        };
        result.changeSet.insert.String[`myString${i}`] = `the value is ${i}`;
        return result;
      });
      commits[0].parent = { guid: rootCommitGuid };
      for (let i = 1; i < commits.length; i++) {
        commits[i].parent = { guid: commits[i - 1].guid };
      }

      branchInfo.branch.head = {
        guid: _.last(commits).guid,
        sequence: commits.length
      };
    });

    after(async () => {
      await teardown();
    });

    let commitNodeRef, commitNodeRefs;
    before(async () => {
      await createBranchAndCommits();

      // Delete the commit node of one of the first commits
      commitNodeRefs = storedRefs.filter((ref) => ref.startsWith('commit:'));
      commitNodeRef = commitNodeRefs[2];
      deletedRefs = [];
      await backend.delete(commitNodeRef);
      mhService._storageManager._cache.reset();
    });

    let consistencyRefs;
    before(async () => {
      storedRefs = [];
      updatedRefs = [];
      await repairManager._makeBranchConsistent({ branchGuid, since: startDate });
      consistencyRefs = [...storedRefs, ...updatedRefs];
    });

    it('should assume the commit chain is consistent enough and not check or repair the inconsistent commit', () => {
      expect(consistencyRefs).to.not.include(commitNodeRef);
    });
  });

  describe('when branch node is missing but commit nodes exist', () => {
    before(async () => {
      await setup();
    });

    after(async () => {
      await teardown();
    });

    let branchNodeRef, commitRefs;
    before(async () => {
      await createBranchAndCommits();
      commitRefs = [...storedRefs, ...updatedRefs];

      // Delete the branch node
      branchNodeRef = storedRefs.find((ref) => ref.startsWith('branch:'));
      deletedRefs = [];
      await backend.delete(branchNodeRef);
      mhService._storageManager._cache.reset();
    });

    let consistencyRefs;
    before(async () => {
      storedRefs = [];
      updatedRefs = [];
      await repairManager._makeBranchConsistent({ branchGuid, since: startDate });
      consistencyRefs = [...storedRefs, ...updatedRefs];
    });

    it('should create the commits again', () => {
      // The consistency repair should touch all nodes. The branch is created from scratch.
      compareRefSets(commitRefs, consistencyRefs);
    });

    it('should provide a valid MV', async () => {
      await compareMV();
    });
  });

  describe('when branch does not have Materialized History enabled', () => {
    before(async () => {
      await setup();
      branchInfo.branch.meta.materializedHistory.enabled = false;
    });

    after(async () => {
      await teardown();
    });

    before(async () => {
      await repairManager._makeBranchConsistent({ branchGuid, since: startDate });
    });

    it('should not create MH for it', async () => {
      let error;
      try {
        await mhService.getBranch(branchGuid);
      } catch (err) {
        error = err;
      }
      expect(error).to.exist;
      expect(error.statusCode).to.equal(404);
      expect(error.message).to.eql('Branch does not exist!');
    });
  });

  describe('when given a list of branches with complicated dependencies', () => {
    before(async () => {
      await setup();
      branchInfo.branch.meta.materializedHistory.enabled = false;
    });

    after(async () => {
      await teardown();
    });

    const shuffle = (array) => {
      for (let i = array.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1)); // random index from 0 to i
        [array[i], array[j]] = [array[j], array[i]]; // swap elements
      }
    };

    it('should correctly create the dependency tree', () => {
      const branches = [
        { guid: 'a', parent: 'z' },
        { guid: 'b', parent: 'a' },
        { guid: 'c', parent: 'b' },
        { guid: 'd', parent: 'b' },
        { guid: 'e', parent: 'd' },
        { guid: 'f', parent: 'a' },
        { guid: 'g', parent: 'y' },
        { guid: 'h', parent: 'g' },
        { guid: 'i', parent: 'h' },
        { guid: 'j', parent: 'i' },
        { guid: 'k', parent: 'j' },
        { guid: 'l', parent: 'j' },
        { guid: 'm', parent: 'j' },
        { guid: 'n', parent: 'h' },
        { guid: 'o', parent: 'n' },
        { guid: 'p', parent: 'x' },
        { guid: 'q', parent: 'w' },
        { guid: 'r', parent: 'q' }
      ];
      const expectedTrees = new Map([
        ['a', new Map([
          ['b', new Map([
            ['c', new Map()],
            ['d', new Map([
              ['e', new Map()]
            ])]])],
          ['f', new Map()]])],
        ['g', new Map([
          ['h', new Map([
            ['i', new Map([
              ['j', new Map([
                ['k', new Map()],
                ['l', new Map()],
                ['m', new Map()]
              ])]
            ])],
            ['n', new Map([
              ['o', new Map()]
            ])]
          ])]
        ])],
        ['p', new Map()],
        ['q', new Map([
          ['r', new Map()]
        ])]
      ]);

      for (let i = 0; i < 100; i++) {
        shuffle(branches);
        const branchTrees = repairManager._createBranchTrees(branches);
        expect(branchTrees).to.eql(expectedTrees);
      }
    });
  });
});
