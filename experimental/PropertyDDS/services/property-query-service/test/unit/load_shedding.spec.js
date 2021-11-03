/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint no-unused-expressions: 0 */
const _ = require('lodash');
const sinon = require('sinon');
const sandbox = sinon.createSandbox();
const BranchAssignations = require('../../src/server/redis_client/redis_branch_assignations_mh');
const LoadManager = require('../../src/server/load_manager');
const BranchTracker = require('../../src/server/branch_tracker');
const settings = require('../../src/server/utils/server_settings');
const EventEmitter = require('events');
const { StorageManager, BranchWriteQueue }  = require('@fluid-experimental/property-query');

describe('Load shedding', () => {

  const loadUpdateIntervalMs = 50;
  const inactivityTimeoutMs = 500;

  let loadManager, branchAssignations, branchTracker, branchWriteQueue, storageManager;
  let loadSheddingSettings;
  let calculateLoadStub, removeMhInstanceForBranchStub, resetCooldownSpy, fakeNodeEventEmitter, clearCacheForBranchStub;
  let assignedActiveBranches = ['somewhatActive', 'quiteActive', 'mostActive'];
  let assignedInactiveBranches = ['inactive1', 'inactive2', 'inactive3'];
  before(() => {
    loadSheddingSettings = settings.get('mh:loadShedding');
    storageManager = new StorageManager({
      settings: { get: () => {}}
    });
    branchAssignations = new BranchAssignations({
      redisSettings: _.defaults(
        settings.get('hfdmRedis') || {}
      )
    });
    // isProcessing will always return false
    branchWriteQueue = new BranchWriteQueue({});
    fakeNodeEventEmitter = new EventEmitter();
    branchTracker = new BranchTracker({ writeQueue: branchWriteQueue, nodeEventEmitter: fakeNodeEventEmitter });
    removeMhInstanceForBranchStub = sandbox.stub(branchAssignations, 'removeMhInstanceForBranch');
    sandbox.stub(branchAssignations, 'removeMhInstance');
    sandbox.stub(branchAssignations, 'upsertMhInstance');
    clearCacheForBranchStub = sandbox.stub(storageManager, 'clearCacheForBranch');

    loadManager = new LoadManager({
      myHost: 'me',
      branchAssignations,
      loadUpdateIntervalMs,
      inactivityTimeoutMs,
      branchTracker,
      loadShedding: loadSheddingSettings,
      storageManager
    });
    resetCooldownSpy = sandbox.spy(loadManager, '_resetLoadShedCooldown');
  });

  const commonSetup = async () => {
    loadManager._loadMeasures = [];

    branchTracker._branchUsage = {};
    let usageCount = 1;
    for (const branchGuid of assignedActiveBranches) {
      branchTracker._branchUsage[branchGuid] = [Date.now() - inactivityTimeoutMs];
      for (let i = 0; i < usageCount; i++) {
        branchTracker._branchUsage[branchGuid].push(Date.now());
      }
      usageCount++;
    }
    for (const branchGuid of assignedInactiveBranches) {
      branchTracker._branchUsage[branchGuid] = [Date.now() - inactivityTimeoutMs];
    }

    await loadManager.init();
  };

  after(() => {
    sandbox.restore();
  });

  describe('when load is consistently high', () => {

    before(() => commonSetup());

    before(() => {
      loadManager._loadShedCooldown = 0;
      calculateLoadStub = sandbox.stub(loadManager, '_calculateLoad')
        .returns(loadSheddingSettings.cpuThreshold + 10);
    });

    before(async () => {
      await new Promise((resolve) => setTimeout(resolve, loadUpdateIntervalMs * (loadSheddingSettings.windowSize + 1)));
    });

    after(() => {
      calculateLoadStub.restore();
      removeMhInstanceForBranchStub.reset();
      clearCacheForBranchStub.reset();
    });

    after(async () => {
      await loadManager.tearDown();
    });

    it('should unassign at least one active server', () => {
      expect(removeMhInstanceForBranchStub).to.have.been.calledWith(sinon.match((branchGuid) => {
        return assignedActiveBranches.includes(branchGuid);
      }, 'an active branch'));

      expect(clearCacheForBranchStub).to.have.been.calledWith(sinon.match((branchGuid) => {
        return assignedActiveBranches.includes(branchGuid);
      }, 'an active branch'));
    });

    it('should not unassign the most active server', () => {
      expect(clearCacheForBranchStub).not.to.not.have.been.calledWith('mostActive');
      expect(removeMhInstanceForBranchStub).to.not.have.been.calledWith('mostActive');
    });

    it('should have activated cooldown', () => {
      expect(resetCooldownSpy).to.have.been.called;
    });

    it('should unassign all inactive servers', () => {
      for (const branchGuid of assignedInactiveBranches) {
        expect(clearCacheForBranchStub).to.have.been.calledWith(branchGuid);
        expect(removeMhInstanceForBranchStub).to.have.been.calledWith(branchGuid);
      }
    });

    it('should trim old usages for active servers', () => {
      for (let i = 0; i < assignedActiveBranches.length; i++) {
        const branchGuid = assignedActiveBranches[i];
        expect(branchTracker._branchUsage[branchGuid].length).to.eql(i + 1);
      }
    });
  });

  describe('when load is consistently low', () => {

    before(() => commonSetup());

    before(() => {
      loadManager._loadShedCooldown = 0;
      calculateLoadStub = sandbox.stub(loadManager, '_calculateLoad')
        .returns(loadSheddingSettings.cpuThreshold - 20);
    });

    before(async () => {
      await new Promise((resolve) => setTimeout(resolve, loadUpdateIntervalMs * (loadSheddingSettings.windowSize + 1)));
    });

    after(() => {
      calculateLoadStub.restore();
      removeMhInstanceForBranchStub.reset();
      clearCacheForBranchStub.reset();
    });

    after(async () => {
      await loadManager.tearDown();
    });

    it('should not unassign any active servers', () => {
      expect(removeMhInstanceForBranchStub).to.not.have.been.calledWith(sinon.match((branchGuid) => {
        return assignedActiveBranches.includes(branchGuid);
      }, 'an active branch'));
      expect(clearCacheForBranchStub).not.to.have.been.calledWith(sinon.match((branchGuid) => {
        return assignedActiveBranches.includes(branchGuid);
      }, 'an active branch'));
    });

    it('should unassign all inactive servers', () => {
      for (const branchGuid of assignedInactiveBranches) {
        expect(clearCacheForBranchStub).to.have.been.calledWith(branchGuid);
        expect(removeMhInstanceForBranchStub).to.have.been.calledWith(branchGuid);
      }
    });

    it('should trim old usages for active servers', () => {
      for (let i = 0; i < assignedActiveBranches.length; i++) {
        const branchGuid = assignedActiveBranches[i];
        expect(branchTracker._branchUsage[branchGuid].length).to.eql(i + 1);
      }
    });
  });

  describe('when load is spiky', () => {

    before(() => commonSetup());

    before(() => {
      loadManager._loadShedCooldown = 0;
      let i = 0;
      calculateLoadStub = sandbox.stub(loadManager, '_calculateLoad').callsFake(() => {
        let load = loadSheddingSettings.cpuThreshold;
        if (i % 2 === 0) {
          load += 10;
        } else {
          load -= 20;
        }
        i++;
        return load;
      });
    });

    before(async () => {
      await new Promise((resolve) => setTimeout(resolve, loadUpdateIntervalMs * (loadSheddingSettings.windowSize + 1)));
    });

    after(() => {
      calculateLoadStub.restore();
      removeMhInstanceForBranchStub.reset();
      clearCacheForBranchStub.reset();
    });

    after(async () => {
      await loadManager.tearDown();
    });

    it('should not unassign any active servers', () => {
      expect(removeMhInstanceForBranchStub).to.not.have.been.calledWith(sinon.match((branchGuid) => {
        return assignedActiveBranches.includes(branchGuid);
      }, 'an active branch'));
      expect(clearCacheForBranchStub).not.to.have.been.calledWith(sinon.match((branchGuid) => {
        return assignedActiveBranches.includes(branchGuid);
      }, 'an active branch'));
    });

    it('should unassign all inactive servers', () => {
      for (const branchGuid of assignedInactiveBranches) {
        expect(clearCacheForBranchStub).to.have.been.calledWith(branchGuid);
        expect(removeMhInstanceForBranchStub).to.have.been.calledWith(branchGuid);
      }
    });

    it('should trim old usages for active servers', () => {
      for (let i = 0; i < assignedActiveBranches.length; i++) {
        const branchGuid = assignedActiveBranches[i];
        expect(branchTracker._branchUsage[branchGuid].length).to.eql(i + 1);
      }
    });
  });

  describe('when cooling down with consistenly high load', () => {

    before(() => commonSetup());

    before(() => {
      loadManager._loadShedCooldown = loadSheddingSettings.cooldownFactor * loadSheddingSettings.windowSize;
      calculateLoadStub = sandbox.stub(loadManager, '_calculateLoad')
        .returns(loadSheddingSettings.cpuThreshold + 10);
    });

    before(async () => {
      await new Promise((resolve) => setTimeout(resolve, loadUpdateIntervalMs * (loadSheddingSettings.windowSize + 1)));
    });

    after(() => {
      calculateLoadStub.restore();
      removeMhInstanceForBranchStub.reset();
    });

    after(async () => {
      await loadManager.tearDown();
    });

    it('should not unassign any active servers', () => {
      expect(removeMhInstanceForBranchStub).to.not.have.been.calledWith(sinon.match((branchGuid) => {
        return assignedActiveBranches.includes(branchGuid);
      }, 'an active branch'));
    });

    it('should unassign all inactive servers', () => {
      for (const branchGuid of assignedInactiveBranches) {
        expect(removeMhInstanceForBranchStub).to.have.been.calledWith(branchGuid);
      }
    });

    it('should trim old usages for active servers', () => {
      for (let i = 0; i < assignedActiveBranches.length; i++) {
        const branchGuid = assignedActiveBranches[i];
        expect(branchTracker._branchUsage[branchGuid].length).to.eql(i + 1);
      }
    });
  });

  describe('when emitting usage from several branches and overload is very high', () => {

    before(async () => {
      loadManager._loadMeasures = [];
      branchTracker._branchUsage = {};
    });

    before(() => {
      calculateLoadStub = sandbox.stub(loadManager, '_calculateLoad')
        .returns(loadSheddingSettings.cpuThreshold + 80);
    });

    let interval;
    before(() => {
      let i = 0;
      interval = setInterval(() => {
        if (i % 5 === 0) {
          fakeNodeEventEmitter.emit('sessionEventQueued', { branchGuid: 'somewhatActive' });
        }
        if (i % 3 === 0) {
          fakeNodeEventEmitter.emit('sessionEventQueued', { branchGuid: 'quiteActive' });
        }
        fakeNodeEventEmitter.emit('sessionEventQueued', { branchGuid: 'mostActive' });
        i++;
      }, loadUpdateIntervalMs);
    });

    before(async () => {
      await new Promise((resolve) => setTimeout(resolve, loadUpdateIntervalMs * (loadSheddingSettings.windowSize + 1)));
      loadManager._loadShedCooldown = loadSheddingSettings.windowSize;
      await loadManager.init();
      await new Promise((resolve) => setTimeout(resolve, loadUpdateIntervalMs * (loadSheddingSettings.windowSize + 1)));
    });

    after(() => {
      clearInterval(interval);
    });

    after(() => {
      calculateLoadStub.restore();
      removeMhInstanceForBranchStub.reset();
    });

    after(async () => {
      await loadManager.tearDown();
    });

    it('should unassign all branches except the most active', () => {
      expect(removeMhInstanceForBranchStub).to.have.been.calledWith('somewhatActive');
      expect(removeMhInstanceForBranchStub).to.have.been.calledWith('quiteActive');
      expect(removeMhInstanceForBranchStub).to.not.have.been.calledWith('mostActive');
    });
  });
});
