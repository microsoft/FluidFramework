/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint no-unused-expressions: 0*/
const generateGUID = require('@fluid-experimental/property-common').GuidUtils.generateGUID;
const HTTPStatus = require('http-status');
const OperationError = require('@fluid-experimental/property-common').OperationError;
const sinon = require('sinon');
const sandbox = sinon.createSandbox();
const _ = require('lodash');

const BranchWriteQueue = require('../../src/materialized_history_service//branch_write_queue');

const SUCCESS_COMMIT_CREATE_RESPONSE = { status: 'ok'};
const SUCCESS_COMMIT_EXISTING_RESPONSE = { status: 'existing'};

const delay = async (time) => {
  return new Promise((res) => {
    setTimeout(res, time);
  });
};

describe('Branch write queue', () => {
  let branchWriteQueue;
  const mockCommitManager = {
    getCommit: () => {},
    createCommit: () => {}
  };
  const mockBranchManager = {
    getBranch: () => {},
    createBranch: () => {}
  };
  const mockPssClient = {
    getCommit: () => {},
    getCommitRange: () => {},
    getBranch: () => {}
  };

  before(() => {
    branchWriteQueue = new BranchWriteQueue({
      commitManager: mockCommitManager,
      branchManager: mockBranchManager,
      pssClient: mockPssClient
    });
  });

  describe('A commit, in-band, without other commit queued, on tip of the branch', () => {
    const branchGuid = generateGUID();
    const commitGuid = generateGUID();
    const parentGuid = generateGUID();

    let getBranchStub, createCommitStub, getCommitStub;

    const theCommit = {
      guid: commitGuid,
      parentGuid: parentGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    before(() => {
      getBranchStub = sandbox.stub(mockBranchManager, 'getBranch').withArgs(branchGuid)
        .resolves({
          guid: branchGuid,
          headCommitGuid: parentGuid
        });

      createCommitStub = sandbox.stub(mockCommitManager, 'createCommit')
        .callsFake(async () => {
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });

      getCommitStub = sandbox.stub(mockCommitManager, 'getCommit').withArgs(commitGuid)
        .rejects(new OperationError(
          `Commit ${commitGuid} not found!`, '_fetchAndQueue',
          HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET)
        );
    });

    it('should resolve the promise with a success response', () =>
      expect(branchWriteQueue.queueCommitGracefully(theCommit)).to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE)
    );

    it('should check the branch state for the head', () =>
      expect(getBranchStub).to.have.been.calledWith(branchGuid)
    );

    it('should check that the commit doesn\'t already exist', () =>
      expect(getCommitStub).to.have.been.calledWith(commitGuid)
    );

    it('should create the commit', () =>
      expect(createCommitStub).to.have.been.calledWith(theCommit)
    );

    after(() => sandbox.restore());
  });

  describe('A commit, in-band, with the same commit queued, on tip of the branch', () => {
    const branchGuid = generateGUID();
    const commitGuid = generateGUID();
    const parentGuid = generateGUID();

    let getBranchStub, createCommitStub, getCommitStub;

    const theCommit = {
      guid: commitGuid,
      parentGuid: parentGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    before(() => {
      getBranchStub = sandbox.stub(mockBranchManager, 'getBranch').withArgs(branchGuid)
        .resolves({
          guid: branchGuid,
          headCommitGuid: parentGuid
        });

      createCommitStub = sandbox.stub(mockCommitManager, 'createCommit')
        .resolves(SUCCESS_COMMIT_CREATE_RESPONSE);

      getCommitStub = sandbox.stub(mockCommitManager, 'getCommit').withArgs(commitGuid)
        .rejects(new OperationError(
          `Commit ${commitGuid} not found!`, 'somewhere',
          HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET)
        );
    });

    it('should resolve the promise with success for both', () =>
      Promise.all([
        expect(branchWriteQueue.queueCommitGracefully(theCommit)).to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE),
        expect(branchWriteQueue.queueCommitGracefully(theCommit)).to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE)
      ])
    );

    it('should check the branch state for the head only once', () =>
      expect(getBranchStub.withArgs(branchGuid)).to.have.been.calledOnce
    );

    it('should check that the commit doesn\'t already exist only once', () =>
      expect(getCommitStub.withArgs(commitGuid)).to.have.been.calledOnce
    );

    it('should create the commit only once', () =>
      expect(createCommitStub.withArgs(theCommit)).to.have.been.calledOnce
    );

    after(() => sandbox.restore());
  });

  describe('A commit, in-band, alone in the queue, already existing the database', () => {
    const branchGuid = generateGUID();
    const commitGuid = generateGUID();
    const parentGuid = generateGUID();

    let createCommitStub, getCommitStub;

    const theCommit = {
      guid: commitGuid,
      parentGuid: parentGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    before(() => {
      createCommitStub = sandbox.stub(mockCommitManager, 'createCommit')
        .resolves(SUCCESS_COMMIT_CREATE_RESPONSE);

      getCommitStub = sandbox.stub(mockCommitManager, 'getCommit').withArgs(commitGuid)
        .resolves({
          guid: commitGuid,
          branchGuid: branchGuid
        });
    });

    it('should resolve the promise with an existing response', () =>
      expect(branchWriteQueue.queueCommitGracefully(theCommit)).to.eventually.eql(SUCCESS_COMMIT_EXISTING_RESPONSE),
    );

    it('should check that the commit already exists', () =>
      expect(getCommitStub.withArgs(commitGuid)).to.have.been.calledOnce
    );

    it('should not create the commit', () =>
      expect(createCommitStub.withArgs(theCommit)).not.to.have.been.called
    );

    after(() => sandbox.restore());
  });

  describe('Two commits, respecting the commit topology, getting queued together', () => {
    const branchGuid = generateGUID();
    const firstCommitGuid = generateGUID();
    const secondCommitGuid = generateGUID();
    const parentGuid = generateGUID();

    let getBranchStub, createCommitStub, getCommitStub;

    const theFirstCommit = {
      guid: firstCommitGuid,
      parentGuid: parentGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    const theSecondCommit = {
      guid: secondCommitGuid,
      parentGuid: firstCommitGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    before(() => {
      getBranchStub = sandbox.stub(mockBranchManager, 'getBranch').withArgs(branchGuid)
        .resolves({
          guid: branchGuid,
          headCommitGuid: parentGuid
        });

      createCommitStub = sandbox.stub(mockCommitManager, 'createCommit')
        .resolves(SUCCESS_COMMIT_CREATE_RESPONSE);

      getCommitStub = sandbox.stub(mockCommitManager, 'getCommit')
        .withArgs(firstCommitGuid)
          .rejects(new OperationError(
            `Commit ${firstCommitGuid} not found!`, 'somewhere',
            HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET)
          )
        .withArgs(secondCommitGuid)
          .rejects(new OperationError(
            `Commit ${secondCommitGuid} not found!`, 'somewhere',
            HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET)
          );
    });

    it('should resolve the promise with success for both', () =>
      Promise.all([
        expect(branchWriteQueue.queueCommitGracefully(theFirstCommit))
          .to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE),
        expect(branchWriteQueue.queueCommitGracefully(theSecondCommit))
          .to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE)
      ])
    );

    it('should check the branch state for the head only once', () =>
      expect(getBranchStub.withArgs(branchGuid)).to.have.been.calledOnce
    );

    it('should check that the commits doesn\'t already exist', () =>
      Promise.all([
        expect(getCommitStub.withArgs(firstCommitGuid)).to.have.been.calledOnce,
        expect(getCommitStub.withArgs(secondCommitGuid)).to.have.been.calledOnce
      ])
    );

    it('should create each commit', () =>
      Promise.all([
        expect(createCommitStub.withArgs(theFirstCommit)).to.have.been.calledOnce,
        expect(createCommitStub.withArgs(theSecondCommit)).to.have.been.calledOnce
      ])
    );

    after(() => sandbox.restore());
  });

  describe('Two commits, respecting the commit topology, and the first one again getting queued together', () => {
    const branchGuid = generateGUID();
    const firstCommitGuid = generateGUID();
    const secondCommitGuid = generateGUID();
    const parentGuid = generateGUID();

    let getBranchStub, createCommitStub, getCommitStub;

    const theFirstCommit = {
      guid: firstCommitGuid,
      parentGuid: parentGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    const theSecondCommit = {
      guid: secondCommitGuid,
      parentGuid: firstCommitGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    before(() => {
      getBranchStub = sandbox.stub(mockBranchManager, 'getBranch').withArgs(branchGuid)
        .resolves({
          guid: branchGuid,
          headCommitGuid: parentGuid
        });

      createCommitStub = sandbox.stub(mockCommitManager, 'createCommit')
        .resolves(SUCCESS_COMMIT_CREATE_RESPONSE);

      getCommitStub = sandbox.stub(mockCommitManager, 'getCommit')
        .withArgs(firstCommitGuid)
          .rejects(new OperationError(
            `Commit ${firstCommitGuid} not found!`, 'somewhere',
            HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET)
          )
        .withArgs(secondCommitGuid)
          .rejects(new OperationError(
            `Commit ${secondCommitGuid} not found!`, 'somewhere',
            HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET)
          );
    });

    it('should resolve the promise with success for both', () =>
      Promise.all([
        expect(branchWriteQueue.queueCommitGracefully(theFirstCommit))
          .to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE),
        expect(branchWriteQueue.queueCommitGracefully(theSecondCommit))
          .to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE),
        expect(branchWriteQueue.queueCommitGracefully(theFirstCommit))
          .to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE)
      ])
    );

    it('should check the branch state for the head only once', () =>
      expect(getBranchStub.withArgs(branchGuid)).to.have.been.calledOnce
    );

    it('should check that the commits doesn\'t already exist', () =>
      Promise.all([
        expect(getCommitStub.withArgs(firstCommitGuid)).to.have.been.calledOnce,
        expect(getCommitStub.withArgs(secondCommitGuid)).to.have.been.calledOnce
      ])
    );

    it('should create each commit', () =>
      Promise.all([
        expect(createCommitStub.withArgs(theFirstCommit)).to.have.been.calledOnce,
        expect(createCommitStub.withArgs(theSecondCommit)).to.have.been.calledOnce
      ])
    );

    after(() => sandbox.restore());
  });


  describe('Three commits out-of-order, all in the queue', () => {
    const branchGuid = generateGUID();
    const firstCommitGuid = generateGUID();
    const secondCommitGuid = generateGUID();
    const thirdCommitGuid = generateGUID();
    const parentGuid = generateGUID();

    let getBranchStub, createCommitStub, getCommitStub;

    const theFirstCommit = {
      guid: firstCommitGuid,
      parentGuid: parentGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    const theSecondCommit = {
      guid: secondCommitGuid,
      parentGuid: firstCommitGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    const theThirdCommit = {
      guid: thirdCommitGuid,
      parentGuid: secondCommitGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    let callTimes = {};

    before(() => {
      getBranchStub = sandbox.stub(mockBranchManager, 'getBranch').withArgs(branchGuid)
        .resolves({
          guid: branchGuid,
          headCommitGuid: parentGuid
        });

      createCommitStub = sandbox.stub(mockCommitManager, 'createCommit')
        .callsFake((commitTask) => {
          let hrTime = process.hrtime();
          callTimes[commitTask.guid] = hrTime[0] * 1000000 + hrTime[1] / 1000;
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });

      getCommitStub = sandbox.stub(mockCommitManager, 'getCommit')
        .withArgs(firstCommitGuid)
          .rejects(new OperationError(
            `Commit ${firstCommitGuid} not found!`, 'somewhere',
            HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET)
          )
        .withArgs(secondCommitGuid)
          .rejects(new OperationError(
            `Commit ${secondCommitGuid} not found!`, 'somewhere',
            HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET)
          )
        .withArgs(thirdCommitGuid)
          .rejects(new OperationError(
            `Commit ${secondCommitGuid} not found!`, 'somewhere',
            HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET)
          );
    });

    it('should resolve the promise with success for both', () =>
      Promise.all([
        expect(branchWriteQueue.queueCommitGracefully(theThirdCommit))
          .to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE),
        expect(branchWriteQueue.queueCommitGracefully(theFirstCommit))
          .to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE),
        expect(branchWriteQueue.queueCommitGracefully(theSecondCommit))
          .to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE)
      ])
    );

    it('should check the branch state for the head only once', () =>
      expect(getBranchStub.withArgs(branchGuid)).to.have.been.calledOnce
    );

    it('should check that the third commit doesn\'t already exist', () =>
      expect(getCommitStub.withArgs(thirdCommitGuid)).to.have.been.calledOnce
    );

    it('should create each commit', () =>
      Promise.all([
        expect(createCommitStub.withArgs(theFirstCommit)).to.have.been.calledOnce,
        expect(createCommitStub.withArgs(theSecondCommit)).to.have.been.calledOnce,
        expect(createCommitStub.withArgs(theThirdCommit)).to.have.been.calledOnce
      ])
    );

    it('should have created the commits in the right order', () => {
      expect(callTimes[firstCommitGuid]).to.be.below(callTimes[secondCommitGuid]);
      expect(callTimes[firstCommitGuid]).to.be.below(callTimes[thirdCommitGuid]);
      expect(callTimes[secondCommitGuid]).to.be.below(callTimes[thirdCommitGuid]);
    });

    after(() => sandbox.restore());
  });

  describe('Four commits out-of-order, with a hole', () => {
    const branchGuid = generateGUID();
    const firstCommitGuid = generateGUID();
    const secondCommitGuid = generateGUID();
    const thirdCommitGuid = generateGUID();
    const fourthCommitGuid = generateGUID();
    const parentGuid = generateGUID();

    let getBranchStub, createCommitStub, getCommitStub, getCommitRangeStub;

    const theFirstCommit = {
      guid: firstCommitGuid,
      parentGuid: parentGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    const theSecondCommit = {
      guid: secondCommitGuid,
      parentGuid: firstCommitGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    const theThirdCommit = {
      guid: thirdCommitGuid,
      parentGuid: secondCommitGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    const theFourthCommit = {
      guid: fourthCommitGuid,
      parentGuid: thirdCommitGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    let callTimes = {};

    before(() => {
      getBranchStub = sandbox.stub(mockBranchManager, 'getBranch').withArgs(branchGuid)
        .resolves({
          guid: branchGuid,
          headCommitGuid: parentGuid
        });

      createCommitStub = sandbox.stub(mockCommitManager, 'createCommit')
        .callsFake((commitTask) => {
          let hrTime = process.hrtime();
          callTimes[commitTask.guid] = hrTime[0] * 1000000 + hrTime[1] / 1000;
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });

      getCommitStub = sandbox.stub(mockCommitManager, 'getCommit')
        .withArgs(firstCommitGuid)
          .rejects(new OperationError(
            `Commit ${firstCommitGuid} not found!`, 'somewhere',
            HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET)
          )
        .withArgs(secondCommitGuid)
          .rejects(new OperationError(
            `Commit ${secondCommitGuid} not found!`, 'somewhere',
            HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET)
          )
        .withArgs(thirdCommitGuid)
          .rejects(new OperationError(
            `Commit ${thirdCommitGuid} not found!`, 'somewhere',
            HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET)
          )
        .withArgs(fourthCommitGuid)
          .rejects(new OperationError(
            `Commit ${fourthCommitGuid} not found!`, 'somewhere',
            HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET)
          );

      getCommitRangeStub = sandbox.stub(mockPssClient, 'getCommitRange')
        .withArgs({
          branchGuid: branchGuid,
          minCommitGuid: parentGuid,
          maxCommitGuid: secondCommitGuid,
          limit: 10
        })
        .resolves({
          commits: [{
            guid: firstCommitGuid,
            meta: {},
            changeSet: {}
          },
          {
            guid: secondCommitGuid,
            meta: {},
            changeSet: {}
          }]
        });
    });

    it('should resolve the promise with success for all', () =>
      Promise.all([
        expect(branchWriteQueue.queueCommitGracefully(theFourthCommit))
          .to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE),
        expect(branchWriteQueue.queueCommitGracefully(theThirdCommit))
          .to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE),
        expect(branchWriteQueue.queueCommitGracefully(theFirstCommit)).to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE)
      ])
    );

    it('should call getCommitRange', () =>
      expect(getCommitRangeStub.withArgs({
        branchGuid: branchGuid,
        minCommitGuid: parentGuid,
        maxCommitGuid: secondCommitGuid,
        limit: 10
      })).to.have.been.calledOnce
    );

    it('should check the branch state for the head only once', () =>
      expect(getBranchStub.withArgs(branchGuid)).to.have.been.calledOnce
    );

    it('should check that the fourth commit doesn\'t already exist', () =>
      expect(getCommitStub.withArgs(fourthCommitGuid)).to.have.been.calledOnce
    );

    it('should create each commit', () =>
      Promise.all([
        expect(createCommitStub.withArgs(theFirstCommit)).to.have.been.calledOnce,
        expect(createCommitStub.withArgs(theSecondCommit)).to.have.been.calledOnce,
        expect(createCommitStub.withArgs(theThirdCommit)).to.have.been.calledOnce,
        expect(createCommitStub.withArgs(theFourthCommit)).to.have.been.calledOnce
      ])
    );

    it('should have created the commits in the right order', () => {
      expect(callTimes[firstCommitGuid]).to.be.below(callTimes[secondCommitGuid]);
      expect(callTimes[firstCommitGuid]).to.be.below(callTimes[thirdCommitGuid]);
      expect(callTimes[firstCommitGuid]).to.be.below(callTimes[fourthCommitGuid]);
      expect(callTimes[secondCommitGuid]).to.be.below(callTimes[thirdCommitGuid]);
      expect(callTimes[secondCommitGuid]).to.be.below(callTimes[fourthCommitGuid]);
      expect(callTimes[thirdCommitGuid]).to.be.below(callTimes[fourthCommitGuid]);
    });

    after(() => sandbox.restore());
  });

  describe('Compensation fetching multiple pages', () => {
    let getBranchStub, createCommitStub, getCommitStub, getCommitRangeStub;

    let branchGuid = generateGUID();
    let parentGuid = generateGUID();
    let commitGuids = _.times(16, () => generateGUID());
    let callTimes = {};

    let commits = commitGuids.map((v, i) => {
      return {
        guid: commitGuids[i],
        parentGuid: i === 0 ? parentGuid : commitGuids[i - 1],
        branchGuid: branchGuid,
        meta: {},
        changeSet: {}
      };
    });

    before(() => {
      getBranchStub = sandbox.stub(mockBranchManager, 'getBranch').withArgs(branchGuid)
      .resolves({
        guid: branchGuid,
        headCommitGuid: parentGuid
      });

      createCommitStub = sandbox.stub(mockCommitManager, 'createCommit')
        .callsFake((commitTask) => {
          let hrTime = process.hrtime();
          callTimes[commitTask.guid] = hrTime[0] * 1000000 + hrTime[1] / 1000;
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });

      getCommitStub = sandbox.stub(mockCommitManager, 'getCommit');

      commitGuids.forEach((cg) => {
        getCommitStub.withArgs(cg)
          .rejects(new OperationError(
            `Commit ${cg} not found!`, 'somewhere',
            HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET)
          );
      });

      getCommitRangeStub = sandbox.stub(mockPssClient, 'getCommitRange')
        .withArgs({
          branchGuid: branchGuid,
          minCommitGuid: parentGuid,
          maxCommitGuid: commitGuids[13],
          limit: 10
        })
        .resolves({
          commits: commitGuids.slice(0, 10).map((cg, i) => {
            return {
              guid: cg,
              meta: {},
              changeSet: {}
            };
          })
        })
        .withArgs({
          branchGuid: branchGuid,
          minCommitGuid: commitGuids[9],
          maxCommitGuid: commitGuids[13],
          limit: 10
        })
        .resolves({
          commits: commitGuids.slice(10, 14).map((cg, i) => {
            return {
              guid: cg,
              meta: {},
              changeSet: {}
            };
          })
        });
    });

    it('should resolve the promise with success for all', () =>
      Promise.all([
        expect(branchWriteQueue.queueCommitGracefully(commits[14])).to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE),
        expect(branchWriteQueue.queueCommitGracefully(commits[15])).to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE)
      ])
    );

    it('should call getCommitRange twice', () =>
      Promise.all([
        expect(getCommitRangeStub.withArgs({
          branchGuid: branchGuid,
          minCommitGuid: parentGuid,
          maxCommitGuid: commitGuids[13],
          limit: 10
        })).to.have.been.calledOnce,
        expect(getCommitRangeStub.withArgs({
          branchGuid: branchGuid,
          minCommitGuid: commitGuids[9],
          maxCommitGuid: commitGuids[13],
          limit: 10
        })).to.have.been.calledOnce
      ])
    );

    it('should check the branch state for the head only once', () =>
      expect(getBranchStub.withArgs(branchGuid)).to.have.been.calledOnce
    );

    it('should check that the last commit doesn\'t already exist', () =>
      Promise.all([
        expect(getCommitStub.withArgs(commitGuids[14])).to.have.been.calledOnce,
        expect(getCommitStub.withArgs(commitGuids[15])).to.have.been.calledOnce
      ])
    );

    it('should create each commit', () =>
      Promise.all(
        commits.map((c) =>
          expect(createCommitStub.withArgs(c)).to.have.been.calledOnce
        ))
    );

    it('should have created the commits in the right order', () => {
      for (let i = 0; i < commitGuids.length - 1; i++) {
        for (let j = i + 1; j < commitGuids.length; j++) {
          expect(callTimes[commitGuids[i]]).to.be.below(callTimes[commitGuids[j]]);
        }
      }
    });

    after(() => sandbox.restore());
  });

  describe('An out-of-band commit that needs to be fetched', () => {
    const branchGuid = generateGUID();
    const commitGuid = generateGUID();
    const parentGuid = generateGUID();

    let getBranchStub, createCommitStub, getCommitStub, getPssCommitStub;

    const theCommit = {
      guid: commitGuid,
      parentGuid: parentGuid,
      branchGuid: branchGuid,
      meta: {}
    };

    before(() => {
      getBranchStub = sandbox.stub(mockBranchManager, 'getBranch').withArgs(branchGuid)
        .resolves({
          guid: branchGuid,
          headCommitGuid: parentGuid
        });

      createCommitStub = sandbox.stub(mockCommitManager, 'createCommit')
        .callsFake(async () => {
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });

      getCommitStub = sandbox.stub(mockCommitManager, 'getCommit')
        .withArgs(commitGuid)
          .rejects(new OperationError(
            `Commit ${commitGuid} not found!`, '_fetchAndQueue',
            HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET)
          );

      getPssCommitStub = sandbox.stub(mockPssClient, 'getCommit')
        .withArgs({
          branchGuid: branchGuid,
          commitGuid: commitGuid
        })
        .resolves({
          commit: {
            guid: commitGuid,
            changeSet: {}
          }
        });
    });

    it('should resolve the promise with a success response', () =>
      expect(branchWriteQueue.queueCommitGracefully(theCommit)).to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE)
    );

    it('should check the branch state for the head', () =>
      expect(getBranchStub).to.have.been.calledWith(branchGuid)
    );

    it('should check that the commit doesn\'t already exist', () =>
      expect(getCommitStub).to.have.been.calledWith(commitGuid)
    );

    it('should have called the getCommit from the PSS', () =>
      expect(getPssCommitStub).to.have.been.calledWith({
        branchGuid: branchGuid,
        commitGuid: commitGuid
      })
    );

    it('should create the commit', () =>
      expect(createCommitStub).to.have.been.calledWith({
        guid: commitGuid,
        parentGuid: parentGuid,
        branchGuid: branchGuid,
        meta: {},
        changeSet: {}
      })
    );

    after(() => sandbox.restore());
  });

  describe('Awaiting for a commit applied, already in the database', () => {
    let branchGuid = generateGUID();
    let commitGuid = generateGUID();

    let getCommitStub;

    before(() => {
      getCommitStub = sandbox.stub(mockCommitManager, 'getCommit')
      .withArgs(commitGuid)
        .resolves({});
    });

    it('should resolve', () =>
      expect(branchWriteQueue.waitUntilCommitApplied(branchGuid, commitGuid))
        .to.eventually.eql({status: 'existing'})
    );

    it('should have called getCommit', () => {
      expect(getCommitStub).to.have.been.calledWith(commitGuid);
    });

    after(() => sandbox.restore());
  });

  describe('Waiting for a commit in concurrency with creating it', () => {
    const branchGuid = generateGUID();
    const commitGuid = generateGUID();
    const parentGuid = generateGUID();

    let getBranchStub, createCommitStub, getCommitStub;

    const theCommit = {
      guid: commitGuid,
      parentGuid: parentGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    before(() => {
      getBranchStub = sandbox.stub(mockBranchManager, 'getBranch').withArgs(branchGuid)
        .resolves({
          guid: branchGuid,
          headCommitGuid: parentGuid
        });

      createCommitStub = sandbox.stub(mockCommitManager, 'createCommit')
        .callsFake(async () => {
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });

      getCommitStub = sandbox.stub(mockCommitManager, 'getCommit').withArgs(commitGuid)
        .rejects(new OperationError(
          `Commit ${commitGuid} not found!`, '_fetchAndQueue',
          HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET)
        );
    });

    it('should resolve the promise with a success response', () =>
      Promise.all([
        expect(branchWriteQueue.queueCommitGracefully(theCommit)).to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE),
        expect(branchWriteQueue.waitUntilCommitApplied(branchGuid, commitGuid))
          .to.eventually.eql({status: 'ok'})
      ])
    );

    it('should check the branch state for the head', () =>
      expect(getBranchStub).to.have.been.calledWith(branchGuid)
    );

    it('should check that the commit doesn\'t already exist', () =>
      expect(getCommitStub).to.have.been.calledWith(commitGuid)
    );

    it('should create the commit', () =>
      expect(createCommitStub).to.have.been.calledWith(theCommit)
    );

    after(() => sandbox.restore());
  });

  describe('Waiting for a commit that doesn\'t exist in the PSS', () => {
    let branchGuid = generateGUID();
    let commitGuid = generateGUID();
    let parentGuid = generateGUID();

    let getCommitStub, getPssCommitStub, getBranchStub;

    before(() => {
      getCommitStub = sandbox.stub(mockCommitManager, 'getCommit')
      .rejects(new OperationError(
        `Commit ${commitGuid} not found!`, 'testSuite',
        HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET)
      );

      getBranchStub = sandbox.stub(mockBranchManager, 'getBranch').withArgs(branchGuid)
        .resolves({
          guid: branchGuid,
          headCommitGuid: parentGuid
        });

      getPssCommitStub = sandbox.stub(mockPssClient, 'getCommitRange')
        .withArgs({
          branchGuid: branchGuid,
          minCommitGuid: parentGuid,
          maxCommitGuid: commitGuid,
          limit: 10
        })
        .resolves({
          commits: []
        });
    });

    it('should be rejected with not found', () =>
      expect(branchWriteQueue.waitUntilCommitApplied(branchGuid, commitGuid))
        .to.be.rejectedWith(Error, `Commit ${commitGuid} not found!`)
    );

    it('should have called getCommit', () => {
      expect(getCommitStub).to.have.been.calledWith(commitGuid);
    });

    it('should have called getCommit on the PSS', () => {
      expect(getPssCommitStub).to.have.been.calledWith({
        branchGuid: branchGuid,
        minCommitGuid: parentGuid,
        maxCommitGuid: commitGuid,
        limit: 10
      });
    });

    it('should have called getBranch', () =>
      expect(getBranchStub.withArgs(branchGuid)).to.have.been.called
    );

    after(() => sandbox.restore());
  });

  describe('Waiting for a commit that exists in the PSS', () => {
    let branchGuid = generateGUID();
    let commitGuid = generateGUID();
    let parentGuid = generateGUID();

    let getCommitStub, getPssCommitStub, createCommitStub, getBranchStub;

    before(() => {
      getCommitStub = sandbox.stub(mockCommitManager, 'getCommit')
        .rejects(new OperationError(
          `Commit ${commitGuid} not found!`, 'testSuite',
          HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET)
        );

      getBranchStub = sandbox.stub(mockBranchManager, 'getBranch').withArgs(branchGuid)
        .resolves({
          guid: branchGuid,
          headCommitGuid: parentGuid
        });

      getPssCommitStub = sandbox.stub(mockPssClient, 'getCommitRange')
        .withArgs({
          branchGuid: branchGuid,
          minCommitGuid: parentGuid,
          maxCommitGuid: commitGuid,
          limit: 10
        })
        .resolves({
          commits: [{
            guid: commitGuid,
            meta: {},
            changeSet: {}
          }]
        });

      createCommitStub = sandbox.stub(mockCommitManager, 'createCommit')
        .callsFake(async () => {
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });
    });

    it('should be resolved', () =>
      expect(branchWriteQueue.waitUntilCommitApplied(branchGuid, commitGuid))
        .to.eventually.eql({status: 'ok'})
    );

    it('should have called getCommit', () => {
      expect(getCommitStub).to.have.been.calledWith(commitGuid);
    });

    it('should have called getCommitRange on the PSS', () => {
      expect(getPssCommitStub).to.have.been.calledWith({
        branchGuid: branchGuid,
        minCommitGuid: parentGuid,
        maxCommitGuid: commitGuid,
        limit: 10
      });
    });

    it('should have called createCommit', () =>
      expect(createCommitStub).to.have.been.calledOnce
    );

    it('should have called getBranch', () =>
      expect(getBranchStub.withArgs(branchGuid)).to.have.been.called
    );

    after(() => sandbox.restore());
  });

  describe('Creating a commit, with a hole, replied with a 403 by the pss', () => {
    let branchGuid = generateGUID();
    let commitGuid = generateGUID();
    let parentGuid = generateGUID();
    let preParentGuid = generateGUID();
    let getCommitStub, getPssCommitStub, createCommitStub, getBranchStub;

    const theCommit = {
      guid: commitGuid,
      parentGuid: parentGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    before(() => {
      getCommitStub = sandbox.stub(mockCommitManager, 'getCommit')
        .rejects(new OperationError(
          `Commit ${commitGuid} not found!`, 'testSuite',
          HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET)
        );

      getBranchStub = sandbox.stub(mockBranchManager, 'getBranch').withArgs(branchGuid)
        .resolves({
          guid: branchGuid,
          headCommitGuid: preParentGuid
        });

      getPssCommitStub = sandbox.stub(mockPssClient, 'getCommitRange')
        .rejects(new OperationError(
          `Authorization failed.`, 'testSuite',
          HTTPStatus.FORBIDDEN, OperationError.FLAGS.QUIET));

      createCommitStub = sandbox.stub(mockCommitManager, 'createCommit')
        .callsFake(async () => {
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });
    });

    it('should be rejected', () =>
      expect(branchWriteQueue.queueCommitGracefully(theCommit))
        .to.be.rejectedWith(OperationError, 'Authorization failed.'),
    );

    it('should have called getCommit', () => {
      expect(getCommitStub).to.have.been.calledWith(commitGuid);
    });

    it('should not have called createCommit', () =>
      expect(createCommitStub).not.to.have.been.called
    );

    it('should have called getBranch', () =>
      expect(getBranchStub.withArgs(branchGuid)).to.have.been.called
    );

    describe('when retrying', () => {
      before(() => {
        getPssCommitStub
          .withArgs({
            branchGuid: branchGuid,
            minCommitGuid: preParentGuid,
            maxCommitGuid: parentGuid,
            limit: 10
          })
          .resolves({
            commits: [{
              guid: parentGuid,
              meta: {},
              changeSet: {}
            }]
          });
      });

      it('should resolve', () =>
        expect(branchWriteQueue.queueCommitGracefully(theCommit))
          .to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE),
      );

      it('should have created the 2 commits', () => {
        expect(createCommitStub).to.have.been.calledWith({
          branchGuid: branchGuid,
          changeSet: { },
          guid: parentGuid,
          meta: { },
          parentGuid: preParentGuid
        });
        expect(createCommitStub).to.have.been.calledWith({
          branchGuid: branchGuid,
          changeSet: { },
          guid: commitGuid,
          meta: { },
          parentGuid: parentGuid,
          previouslyCompleted: sinon.match.any
        });
        expect(createCommitStub).to.have.been.calledTwice;
      });
    });

    after(() => sandbox.restore());
  });

  describe('Creating a commit, with a hole, replied with an empty list by the pss', () => {
    let branchGuid = generateGUID();
    let commitGuid = generateGUID();
    let parentGuid = generateGUID();
    let preParentGuid = generateGUID();
    let getCommitStub, getPssCommitStub, createCommitStub, getBranchStub;

    const theCommit = {
      guid: commitGuid,
      parentGuid: parentGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    before(() => {
      getCommitStub = sandbox.stub(mockCommitManager, 'getCommit')
        .rejects(new OperationError(
          `Commit ${commitGuid} not found!`, 'testSuite',
          HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET)
        );

      getBranchStub = sandbox.stub(mockBranchManager, 'getBranch').withArgs(branchGuid)
        .resolves({
          guid: branchGuid,
          headCommitGuid: preParentGuid
        });

      getPssCommitStub = sandbox.stub(mockPssClient, 'getCommitRange')
        .resolves({
          commits: []
        });

      createCommitStub = sandbox.stub(mockCommitManager, 'createCommit')
        .callsFake(async () => {
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });
    });

    it('should be rejected', () =>
      expect(branchWriteQueue.queueCommitGracefully(theCommit))
        .to.be.rejectedWith(OperationError, `Commit ${parentGuid} not found!`),
    );

    it('should have called getCommit', () => {
      expect(getCommitStub).to.have.been.calledWith(commitGuid);
    });

    it('should not have called createCommit', () =>
      expect(createCommitStub).not.to.have.been.called
    );

    it('should have called getBranch', () =>
      expect(getBranchStub.withArgs(branchGuid)).to.have.been.called
    );

    describe('when retrying', () => {
      before(() => {
        getPssCommitStub
          .withArgs({
            branchGuid: branchGuid,
            minCommitGuid: preParentGuid,
            maxCommitGuid: parentGuid,
            limit: 10
          })
          .resolves({
            commits: [{
              guid: parentGuid,
              meta: {},
              changeSet: {}
            }]
          });
      });

      it('should resolve', () =>
        expect(branchWriteQueue.queueCommitGracefully(theCommit))
          .to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE),
      );

      it('should have created the 2 commits', () => {
        expect(createCommitStub).to.have.been.calledWith({
          branchGuid: branchGuid,
          changeSet: { },
          guid: parentGuid,
          meta: { },
          parentGuid: preParentGuid
        });
        expect(createCommitStub).to.have.been.calledWith({
          branchGuid: branchGuid,
          changeSet: { },
          guid: commitGuid,
          meta: { },
          parentGuid: parentGuid,
          previouslyCompleted: sinon.match.any
        });
        expect(createCommitStub).to.have.been.calledTwice;
      });
    });

    after(() => sandbox.restore());
  });

  describe('Waiting for a commit that exists in the PSS, twice concurrently', () => {
    let branchGuid = generateGUID();
    let commitGuid = generateGUID();
    let parentGuid = generateGUID();

    let getCommitStub, getPssCommitStub, createCommitStub, getBranchStub;

    before(() => {
      getCommitStub = sandbox.stub(mockCommitManager, 'getCommit')
        .rejects(new OperationError(
          `Commit ${commitGuid} not found!`, 'testSuite',
          HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET)
        );

      getBranchStub = sandbox.stub(mockBranchManager, 'getBranch').withArgs(branchGuid)
        .resolves({
          guid: branchGuid,
          headCommitGuid: parentGuid
        });

      getPssCommitStub = sandbox.stub(mockPssClient, 'getCommitRange')
        .withArgs({
          branchGuid: branchGuid,
          minCommitGuid: parentGuid,
          maxCommitGuid: commitGuid,
          limit: 10
        })
        .resolves({
          commits: [{
            guid: commitGuid,
            meta: {},
            changeSet: {}
          }]
        });

      createCommitStub = sandbox.stub(mockCommitManager, 'createCommit')
        .callsFake(async () => {
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });
    });

    it('should be resolved', () =>
      Promise.all([
        expect(branchWriteQueue.waitUntilCommitApplied(branchGuid, commitGuid))
          .to.eventually.eql({status: 'ok'}),
        expect(branchWriteQueue.waitUntilCommitApplied(branchGuid, commitGuid))
          .to.eventually.eql({status: 'ok'})
      ])
    );

    it('should have called getCommit', () => {
      expect(getCommitStub).to.have.been.calledWith(commitGuid);
    });

    it('should have called getCommitRange on the PSS', () => {
      expect(getPssCommitStub).to.have.been.calledWith({
        branchGuid: branchGuid,
        minCommitGuid: parentGuid,
        maxCommitGuid: commitGuid,
        limit: 10
      });
    });

    it('should have called createCommit', () =>
      expect(createCommitStub).to.have.been.calledOnce
    );

    it('should have called getBranch', () =>
      expect(getBranchStub.withArgs(branchGuid)).to.have.been.called
    );

    after(() => sandbox.restore());
  });


  describe('Waiting for a commit that exists in the PSS, concurrently with ingesting its parent', () => {
    let branchGuid = generateGUID();
    let commitGuid = generateGUID();
    let secondCommitGuid = generateGUID();
    let thirdCommitGuid = generateGUID();
    let parentGuid = generateGUID();

    let getCommitStub, createCommitStub, getBranchStub;

    const theCommit = {
      guid: commitGuid,
      parentGuid: parentGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    const theSecondCommit = {
      guid: secondCommitGuid,
      parentGuid: commitGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    let createdCommits = {};
    let lastPersistedGuid = parentGuid;

    before(() => {

      getCommitStub = sandbox.stub(mockCommitManager, 'getCommit')
        .callsFake(async (p) => {
          if (createdCommits[p.guid]) {
            return Promise.resolve();
          } else {
            await delay(Math.round(Math.random() * 1000));
            return Promise.reject(new OperationError(
              `Commit ${p.guid} not found!`, 'testSuite',
              HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET));
          }
        });

      getBranchStub = sandbox.stub(mockBranchManager, 'getBranch').withArgs(branchGuid)
        .callsFake(() => {
          return {
            guid: branchGuid,
            headCommitGuid: lastPersistedGuid
          };
        });

      sandbox.stub(mockPssClient, 'getCommitRange')
        .withArgs({
          branchGuid: branchGuid,
          minCommitGuid: parentGuid,
          maxCommitGuid: thirdCommitGuid,
          limit: 10
        })
          .resolves({
            commits: [{
              guid: commitGuid,
              meta: {},
              changeSet: {}
            },
            {
              guid: secondCommitGuid,
              meta: {},
              changeSet: {}
            },
            {
              guid: thirdCommitGuid,
              meta: {},
              changeSet: {}
            }]
          })
        .withArgs({
          branchGuid: branchGuid,
          minCommitGuid: secondCommitGuid,
          maxCommitGuid: thirdCommitGuid,
          limit: 10
        })
          .resolves({
            commits: [{
              guid: thirdCommitGuid,
              meta: {},
              changeSet: {}
            }]
          })
        .withArgs({
          branchGuid: branchGuid,
          minCommitGuid: parentGuid,
          maxCommitGuid: secondCommitGuid,
          limit: 10
        })
          .resolves({
            commits: [
              {
                guid: commitGuid,
                meta: {},
                changeSet: {}
              },
              {
                guid: secondCommitGuid,
                meta: {},
                changeSet: {}
              }
            ]
          })
        .withArgs({
          branchGuid: branchGuid,
          minCommitGuid: parentGuid,
          maxCommitGuid: commitGuid,
          limit: 10
        })
          .resolves({
            commits: [
              {
                guid: commitGuid,
                meta: {},
                changeSet: {}
              }
            ]
          })
        .withArgs({
          branchGuid: branchGuid,
          minCommitGuid: commitGuid,
          maxCommitGuid: secondCommitGuid,
          limit: 10
        })
          .resolves({
            commits: [
              {
                guid: secondCommitGuid,
                meta: {},
                changeSet: {}
              }
            ]
          })
        .withArgs({
          branchGuid: branchGuid,
          minCommitGuid: secondCommitGuid,
          maxCommitGuid: parentGuid,
          limit: 10
        })
          .resolves({
            commits: []
          })
        .withArgs({
          branchGuid: branchGuid,
          minCommitGuid: commitGuid,
          maxCommitGuid: parentGuid,
          limit: 10
        })
          .resolves({
            commits: []
          })
        .withArgs({
          branchGuid: branchGuid,
          minCommitGuid: secondCommitGuid,
          maxCommitGuid: commitGuid,
          limit: 10
        })
          .resolves({
            commits: []
          })
        .withArgs({
          branchGuid: branchGuid,
          minCommitGuid: commitGuid,
          maxCommitGuid: thirdCommitGuid,
          limit: 10
        })
          .resolves({
            commits: [
              {
                guid: commitGuid,
                meta: {},
                changeSet: {}
              },
              {
                guid: secondCommitGuid,
                meta: {},
                changeSet: {}
              },
              {
                guid: thirdCommitGuid,
                meta: {},
                changeSet: {}
              }
            ]
          })
        ;

      createCommitStub = sandbox.stub(mockCommitManager, 'createCommit')
        .callsFake(async (c) => {
          await delay(Math.round(Math.random() * 1000));
          createdCommits[c.guid] = true;
          lastPersistedGuid = c.guid;
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });
    });

    it('should be resolved', function() {
      this.timeout(10000);
      return Promise.all([
        expect(branchWriteQueue.queueCommitGracefully(theCommit)).to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE),
        expect(branchWriteQueue.queueCommitGracefully(theSecondCommit))
          .to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE),
        expect(branchWriteQueue.waitUntilCommitApplied(branchGuid, thirdCommitGuid))
          .to.eventually.eql({status: 'ok'})
      ]);
    });

    it('should have called getCommit', () =>
      expect(getCommitStub).to.have.been.called
    );

    it('should have called createCommit', () =>
      Promise.all([
        expect(createCommitStub.withArgs({
          guid: commitGuid,
          parentGuid: parentGuid,
          branchGuid: branchGuid,
          meta: {},
          changeSet: {}
        })).to.have.been.calledOnce,
        expect(createCommitStub.withArgs({
          guid: secondCommitGuid,
          parentGuid: commitGuid,
          branchGuid: branchGuid,
          meta: {},
          changeSet: {}
        })).to.have.been.calledOnce,
        expect(createCommitStub.withArgs({
          guid: thirdCommitGuid,
          parentGuid: secondCommitGuid,
          branchGuid: branchGuid,
          meta: {},
          changeSet: {}
        })).to.have.been.calledOnce
      ])
    );

    it('should have called getBranch', () =>
      expect(getBranchStub.withArgs(branchGuid)).to.have.been.called
    );

    after(() => sandbox.restore());
  });

  describe('Queuing two branches concurrently', () => {
    const branchGuid = generateGUID();
    const rootCommitGuid = generateGUID();

    let createBranchStub;

    const theBranch = {
      guid: branchGuid,
      rootCommitGuid: rootCommitGuid,
      meta: {},
      created: Date.now()
    };

    before(() => {
      sandbox.stub(mockBranchManager, 'getBranch')
        .withArgs(branchGuid)
          .rejects(new OperationError(
            `Branch ${branchGuid} not found!`, '_fetchAndQueue',
            HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET));

      createBranchStub = sandbox.stub(mockBranchManager, 'createBranch')
        .callsFake(async () => {
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });
    });

    it('should resolve all calls with success', () =>
      Promise.all([
        expect(branchWriteQueue.queueBranchGracefully(theBranch)).to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE),
        expect(branchWriteQueue.queueBranchGracefully(theBranch)).to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE)
      ])
    );

    it('should create the branch once', () =>
      expect(createBranchStub.withArgs(theBranch)).to.have.been.calledOnce
    );

    after(() => sandbox.restore());
  });

  describe('A branch, on top of a missing commit', () => {
    const branchGuid = generateGUID();
    const preParentGuid = generateGUID();
    const parentGuid = generateGUID();
    const parentBranchGuid = generateGUID();

    let createCommitStub, createBranchStub, getCommitRangeStub;

    const theBranch = {
      guid: branchGuid,
      rootCommitGuid: parentGuid,
      meta: {},
      created: Date.now(),
      parentBranchGuid: parentBranchGuid
    };

    before(() => {
      sandbox.stub(mockCommitManager, 'getCommit')
        .withArgs(parentGuid)
          .rejects(new OperationError(
            `Commit ${parentGuid} not found!`, 'testSuite',
            HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET));

      sandbox.stub(mockBranchManager, 'getBranch')
        .withArgs(parentBranchGuid)
          .resolves({
            guid: parentBranchGuid,
            headCommitGuid: preParentGuid
          })
        .withArgs(branchGuid)
          .rejects(new OperationError(
            `Branch ${branchGuid} not found!`, '_fetchAndQueue',
            HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET));

      createCommitStub = sandbox.stub(mockCommitManager, 'createCommit')
        .callsFake(async () => {
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });

      createBranchStub = sandbox.stub(mockBranchManager, 'createBranch')
        .callsFake(async () => {
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });

      getCommitRangeStub = sandbox.stub(mockPssClient, 'getCommitRange')
        .withArgs({
          branchGuid: parentBranchGuid,
          minCommitGuid: preParentGuid,
          maxCommitGuid: parentGuid,
          limit: 10
        })
          .resolves({
            commits: [{
              guid: parentGuid,
              meta: {},
              changeSet: {}
            }]
          });
    });

    it('should resolve the promise with a success response', () =>
      expect(branchWriteQueue.queueBranchGracefully(theBranch))
        .to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE)
    );

    it('should fetch the missing commits in parent branch', () =>
      expect(getCommitRangeStub).to.have.been.calledWith({
        branchGuid: parentBranchGuid,
        minCommitGuid: preParentGuid,
        maxCommitGuid: parentGuid,
        limit: 10
      })
    );

    it('should have created the parent commit', () => {
      expect(createCommitStub).to.have.been.calledWith({
        branchGuid: parentBranchGuid,
        changeSet: { },
        guid: parentGuid,
        meta: { },
        parentGuid: preParentGuid
      });
    });

    it('should create the theBranch', () =>
      expect(createBranchStub).to.have.been.calledWith(theBranch)
    );

    after(() => sandbox.restore());
  });

  describe('A commit on top of a missing branch, concurrently', () => {
    let branchGuid = generateGUID();
    let commitGuid = generateGUID();
    let branchParentGuid = generateGUID();
    let parentGuid = generateGUID();

    let createCommitStub, createBranchStub;

    const theCommit = {
      guid: commitGuid,
      parentGuid: parentGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    const theBranch = {
      guid: branchGuid,
      rootCommitGuid: branchParentGuid,
      meta: {},
      created: Date.now()
    };

    before(() => {
      let branchCreated = false;
      sandbox.stub(mockBranchManager, 'getBranch')
        .callsFake(() => {
          if (!branchCreated) {
            return Promise.reject(new OperationError(
              `Branch ${branchGuid} not found!`, '_fetchAndQueue',
              HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET));
          }
          return Promise.resolve({
            guid: branchGuid,
            headCommitGuid: parentGuid
          });
        });

      sandbox.stub(mockCommitManager, 'getCommit')
        .withArgs(parentGuid)
          .resolves({})
        .withArgs(commitGuid)
          .rejects(new OperationError(
            `Commit ${commitGuid} not found!`, '_fetchAndQueue',
            HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET));

      createBranchStub = sandbox.stub(mockBranchManager, 'createBranch')
        .callsFake(async () => {
          await delay(100);
          branchCreated = true;
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });

      createCommitStub = sandbox.stub(mockCommitManager, 'createCommit')
        .callsFake(async () => {
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });
    });

    it('should be resolved', () =>
      Promise.all([
        expect(branchWriteQueue.queueCommitGracefully(theCommit)).to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE),
        expect(branchWriteQueue.queueBranchGracefully(theBranch)).to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE)
      ])
    );

    it('should have created createCommit', () => {
      expect(createCommitStub).to.have.been.calledWith(theCommit);
    });

    it('should have called createBranch', () => {
      expect(createBranchStub).to.have.been.calledWith(theBranch);
    });

    after(() => sandbox.restore());
  });

  describe('Waiting for an existing branch', () => {
    let branchGuid = generateGUID();
    let headCommitGuid = generateGUID();

    before(() => {
      sandbox.stub(mockBranchManager, 'getBranch')
        .resolves({
          guid: branchGuid,
          headCommitGuid: headCommitGuid
        });
    });

    it('should be resolved', () =>
      expect(branchWriteQueue.waitUntilBranchCreated(branchGuid)).to.eventually.eql(SUCCESS_COMMIT_EXISTING_RESPONSE),
    );

    after(() => sandbox.restore());
  });

  describe('A commit on top of a missing branch, with branch repair', () => {
    let branchGuid = generateGUID();
    let commitGuid = generateGUID();
    let parentGuid = generateGUID();

    let createCommitStub, createBranchStub;

    const theCommit = {
      guid: commitGuid,
      parentGuid: parentGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    before(() => {
      let branchCreated = false;
      sandbox.stub(mockBranchManager, 'getBranch')
        .callsFake(() => {
          if (!branchCreated) {
            return Promise.reject(new OperationError(
              `Branch ${branchGuid} not found!`, '_fetchAndQueue',
              HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET));
          }
          return Promise.resolve({
            guid: branchGuid,
            headCommitGuid: parentGuid
          });
        });

      sandbox.stub(mockCommitManager, 'getCommit')
        .withArgs(parentGuid)
          .resolves({})
        .withArgs(commitGuid)
          .rejects(new OperationError(
            `Commit ${commitGuid} not found!`, '_fetchAndQueue',
            HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET));

      createBranchStub = sandbox.stub(mockBranchManager, 'createBranch')
        .callsFake(async () => {
          await delay(100);
          branchCreated = true;
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });

      createCommitStub = sandbox.stub(mockCommitManager, 'createCommit')
        .callsFake(async () => {
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });

      sandbox.stub(mockPssClient, 'getBranch')
        .withArgs(branchGuid)
          .resolves({
            repository: {
              rootCommit: {
                guid: parentGuid
              }
            },
            branch: {
              meta: {
                materializedHistory: {
                  enabled: true
                }
              }
            }
          });
    });

    it('should be resolved', () =>
      expect(branchWriteQueue.queueCommitGracefully(theCommit)).to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE),
    );

    it('should have created createCommit', () => {
      expect(createCommitStub).to.have.been.calledWith(theCommit);
    });

    it('should have called createBranch', () => {
      expect(createBranchStub).to.have.been.calledWith({
        guid: branchGuid,
        meta: { materializedHistory: { enabled: true } },
        rootCommitGuid: parentGuid
      });
    });

    after(() => sandbox.restore());
  });

  describe('A commit on top of a missing branch, opted-out, with branch repair', () => {
    let branchGuid = generateGUID();
    let commitGuid = generateGUID();
    let parentGuid = generateGUID();

    const theCommit = {
      guid: commitGuid,
      parentGuid: parentGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    before(() => {
      let branchCreated = false;
      sandbox.stub(mockBranchManager, 'getBranch')
        .callsFake(() => {
          if (!branchCreated) {
            return Promise.reject(new OperationError(
              `Branch ${branchGuid} not found!`, '_fetchAndQueue',
              HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET));
          }
          return Promise.resolve({
            guid: branchGuid,
            headCommitGuid: parentGuid
          });
        });

      sandbox.stub(mockCommitManager, 'getCommit')
        .withArgs(parentGuid)
          .resolves({})
        .withArgs(commitGuid)
          .rejects(new OperationError(
            `Commit ${commitGuid} not found!`, '_fetchAndQueue',
            HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET));

      sandbox.stub(mockBranchManager, 'createBranch')
        .callsFake(async () => {
          await delay(100);
          branchCreated = true;
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });

      sandbox.stub(mockCommitManager, 'createCommit')
        .callsFake(async () => {
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });

      sandbox.stub(mockPssClient, 'getBranch')
        .withArgs(branchGuid)
          .resolves({
            branch: {
              meta: {}
            }
          });
    });

    it('should be rejected', () =>
      expect(branchWriteQueue.queueCommitGracefully(theCommit))
        .to.be.eventually.rejectedWith(Error, 'Waiting for a branch not opted-in for MHS')
    );

    after(() => sandbox.restore());
  });

  describe('waiting for a commit on top of a missing branch', () => {
    let missingCommitGuid = generateGUID();
    let missingParentBranchGuid = generateGUID();
    let missingBranchRootCommitGuid = generateGUID();
    let parentGuid = generateGUID();

    let createBranchStub, createCommitStub;

    before(async () => {
      let branchCreated = false;
      sandbox.stub(mockBranchManager, 'getBranch')
        .callsFake(() => {
          if (!branchCreated) {
            return Promise.reject(new OperationError(
              `Branch ${missingParentBranchGuid} not found!`, '_fetchAndQueue',
              HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET));
          }
          return Promise.resolve({
            guid: missingParentBranchGuid,
            headCommitGuid: parentGuid
          });
        });

      createBranchStub = sandbox.stub(mockBranchManager, 'createBranch')
        .callsFake(() => {
          branchCreated = true;
          return Promise.resolve(SUCCESS_COMMIT_CREATE_RESPONSE);
        });

      createCommitStub = sandbox.stub(mockCommitManager, 'createCommit')
        .callsFake(async () => {
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });

      sandbox.stub(mockPssClient, 'getBranch')
        .withArgs(missingParentBranchGuid)
          .resolves({
            branch: {
              meta: {
                materializedHistory: {
                  enabled: true
                }
              },
              parent: {
                commit: {
                  guid: missingBranchRootCommitGuid
                }
              }
            }
          });

      sandbox.stub(mockPssClient, 'getCommitRange')
        .withArgs({
          branchGuid: missingParentBranchGuid,
          minCommitGuid: parentGuid,
          maxCommitGuid: missingCommitGuid,
          limit: 10
        })
          .resolves({
            commits: [{
              guid: missingCommitGuid,
              meta: {},
              changeSet: {}
            }]
          });

      sandbox.stub(mockCommitManager, 'getCommit')
        .withArgs(missingCommitGuid)
          .rejects(new OperationError(
            `Commit ${missingCommitGuid} not found!`, '_fetchAndQueue',
            HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET));
    });

    it('should succeed', () =>
      expect(branchWriteQueue.waitUntilCommitApplied(missingParentBranchGuid, missingCommitGuid))
        .to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE)
    );

    it('should have created the branch', () =>
      expect(createBranchStub).to.have.been.calledWith({
        guid: missingParentBranchGuid,
        meta: { materializedHistory: { enabled: true } },
        rootCommitGuid: missingBranchRootCommitGuid
      })
    );

    it('should have created the commit', () =>
      expect(createCommitStub).to.have.been.calledWith({
        branchGuid: missingParentBranchGuid,
        changeSet: {  },
        guid: missingCommitGuid,
        meta: {  },
        parentGuid: parentGuid
      })
    );

    after(() => sandbox.restore());
  });

  describe('Waiting for a commit while a branch is locked for deletion', () => {

    let branchGuid = generateGUID();
    let commitGuid = generateGUID();

    before(() => branchWriteQueue.lockQueuesForDeletion([branchGuid]));

    it('should reject the create commit', () =>
      expect(branchWriteQueue.waitUntilCommitApplied(branchGuid, commitGuid))
        .to.be.rejectedWith(`Branch ${branchGuid} locked for deletion`)
    );

    after(() => branchWriteQueue.clearQueuesForDeletion([branchGuid]));
  });

  describe('Waiting for a branch while a branch is locked for deletion', () => {

    let branchGuid = generateGUID();

    before(() => branchWriteQueue.lockQueuesForDeletion([branchGuid]));

    it('should reject the create commit', () =>
      expect(branchWriteQueue.waitUntilBranchCreated(branchGuid))
        .to.be.rejectedWith(`Branch ${branchGuid} locked for deletion`)
    );

    after(() => branchWriteQueue.clearQueuesForDeletion([branchGuid]));
  });

  describe('Creating a branch while queued for deletion', () => {
    let branchGuid = generateGUID();

    before(() => branchWriteQueue.lockQueuesForDeletion([branchGuid]));

    it('should reject the branch creation', () =>
      expect(branchWriteQueue.queueBranchGracefully({guid: branchGuid}))
        .to.be.rejectedWith(`Branch ${branchGuid} locked for deletion`)
    );

    after(() => branchWriteQueue.clearQueuesForDeletion([branchGuid]));
  });

  describe('Committing on a branch locked for deletion', () => {
    let branchGuid = generateGUID();
    let commitGuid = generateGUID();

    before(() => branchWriteQueue.lockQueuesForDeletion([branchGuid]));

    it('should reject the branch creation', () =>
      expect(branchWriteQueue.queueCommitGracefully({
        guid: commitGuid,
        branchGuid: branchGuid
      }))
        .to.be.rejectedWith(`Branch ${branchGuid} locked for deletion`)
    );

    after(() => branchWriteQueue.clearQueuesForDeletion([branchGuid]));
  });

  describe('Locking a branch while it is applying commits', () => {
    const branchGuid = generateGUID();
    const commitGuid = generateGUID();
    const parentGuid = generateGUID();
    const secondCommitGuid = generateGUID();

    let lockPromise;

    const theCommit = {
      guid: commitGuid,
      parentGuid: parentGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    const theSecondCommit = {
      guid: secondCommitGuid,
      parentGuid: commitGuid,
      branchGuid: branchGuid,
      meta: {},
      changeSet: {}
    };

    before(() => {
      sandbox.stub(mockBranchManager, 'getBranch').withArgs(branchGuid)
        .callsFake(async () => {
          await delay(100);
          return {
            guid: branchGuid,
            headCommitGuid: parentGuid
          };
        });

      sandbox.stub(mockCommitManager, 'createCommit')
        .callsFake(async () => {
          lockPromise = branchWriteQueue.lockQueuesForDeletion([branchGuid]);
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });

      sandbox.stub(mockCommitManager, 'getCommit')
        .rejects(new OperationError(
          `Commit ${commitGuid} not found!`, '_fetchAndQueue',
          HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET)
        );
    });

    it('should resolve the first commit, reject the second one', () =>
      Promise.all([
        expect(branchWriteQueue.queueCommitGracefully(theCommit))
          .to.eventually.eql(SUCCESS_COMMIT_CREATE_RESPONSE),
        expect(branchWriteQueue.queueCommitGracefully(theSecondCommit))
          .to.be.rejectedWith(`Branch ${branchGuid} locked for deletion`)
      ])
    );

    it('should eventually have resolved the lock promise', () =>
      expect(lockPromise).to.eventually.eql([ undefined ])
    );

    after(() => sandbox.restore());
  });

  describe('A branch, on top of a missing commit, while the branches gets locked', () => {
    const branchGuid = generateGUID();
    const preParentGuid = generateGUID();
    const parentGuid = generateGUID();
    const parentBranchGuid = generateGUID();

    let createCommitStub, createBranchStub, getCommitRangeStub;

    const theBranch = {
      guid: branchGuid,
      rootCommitGuid: parentGuid,
      meta: {},
      created: Date.now(),
      parentBranchGuid: parentBranchGuid
    };

    let lockPromise;

    before(() => {
      sandbox.stub(mockCommitManager, 'getCommit')
        .withArgs(parentGuid)
          .rejects(new OperationError(
            `Commit ${parentGuid} not found!`, 'testSuite',
            HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET));

      sandbox.stub(mockBranchManager, 'getBranch')
        .withArgs(parentBranchGuid)
          .resolves({
            guid: parentBranchGuid,
            headCommitGuid: preParentGuid
          })
        .withArgs(branchGuid)
          .rejects(new OperationError(
            `Branch ${branchGuid} not found!`, '_fetchAndQueue',
            HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET));

      createCommitStub = sandbox.stub(mockCommitManager, 'createCommit')
        .callsFake(async () => {
          lockPromise = branchWriteQueue.lockQueuesForDeletion([branchGuid]);
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });

      getCommitRangeStub = sandbox.stub(mockPssClient, 'getCommitRange')
        .withArgs({
          branchGuid: parentBranchGuid,
          minCommitGuid: preParentGuid,
          maxCommitGuid: parentGuid,
          limit: 10
        })
          .resolves({
            commits: [{
              guid: parentGuid,
              meta: {},
              changeSet: {}
            }]
          });

      createBranchStub = sandbox.stub(mockBranchManager, 'createBranch')
        .callsFake(async () => {
          return SUCCESS_COMMIT_CREATE_RESPONSE;
        });
    });

    it('should reject the promise with a locked response', () =>
      expect(branchWriteQueue.queueBranchGracefully(theBranch))
      .to.be.rejectedWith(`Branch ${branchGuid} locked for deletion`)
    );

    it('should fetch the missing commits in parent branch', () =>
      expect(getCommitRangeStub).to.have.been.calledWith({
        branchGuid: parentBranchGuid,
        minCommitGuid: preParentGuid,
        maxCommitGuid: parentGuid,
        limit: 10
      })
    );

    it('should have created the parent commit', () => {
      expect(createCommitStub).to.have.been.calledWith({
        branchGuid: parentBranchGuid,
        changeSet: { },
        guid: parentGuid,
        meta: { },
        parentGuid: preParentGuid
      });
    });

    it('should not have created the branch', () =>
      expect(createBranchStub).not.to.have.been.called
    );

    it('should eventually have resolved the lock promise', () =>
      expect(lockPromise).to.eventually.eql([ undefined ])
    );

    after(() => sandbox.restore());
  });
});
