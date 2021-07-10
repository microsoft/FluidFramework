/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const ChangeSet = require('./changeset');
const _ = require('lodash');

function SyncPromise(x) {
  if (!(this instanceof SyncPromise)) { return new SyncPromise(x); }
  if (x instanceof SyncPromise) { x = x.value };
  this.value = x;
}

SyncPromise.prototype.then = function (fn) {
  this.value = SyncPromise(fn(this.value)).value;
  return this;
}


function loop(promise, fn, makePromise) {
  return promise.then(fn).then(function (result) {
    return result === null ? result : loop(makePromise(result), fn, makePromise);
  });
}

function rebaseToRemoteChanges(change, getUnrebasedChange, getRebasedChanges, isAsync = false) {
  const makePromise = isAsync ? Promise.resolve.bind(Promise) : SyncPromise;
  let mainPromise = makePromise();

  const commitsOnOtherLocalBranch = {};
  let rebaseBaseChangeSet = new ChangeSet({});
  const changesOnOtherLocalBranch = [];
  if (change.referenceGuid !== change.remoteHeadGuid) {
    // Extract all changes between the remoteHeadGuid and the referenceGuid
    let currentGuid = change.referenceGuid;
    mainPromise = loop(
      makePromise(getUnrebasedChange(currentGuid)),
      (currentChange) => {
        if (currentChange === undefined) {
          throw new Error("Received change that references a non-existing parent change");
        }
        changesOnOtherLocalBranch.unshift(currentChange);
        commitsOnOtherLocalBranch[currentGuid] = currentChange;
        if (currentGuid === change.localBranchStart) {
          return null;
        }
        currentGuid = currentChange.referenceGuid;
        return getUnrebasedChange(currentGuid);
      },
      makePromise
    );

    // Now we extract all changes until we arrive at a change that is relative to a remote change
    let alreadyRebasedChanges = [];

    mainPromise = mainPromise.then(() =>
      loop(makePromise(getUnrebasedChange(change.localBranchStart)),
        (currentRebasedChange) => {
          if (currentRebasedChange.remoteHeadGuid === currentRebasedChange.referenceGuid) {
            return null;
          }
          return makePromise(getUnrebasedChange(currentRebasedChange.referenceGuid))
            .then(rebaseChange => {
              alreadyRebasedChanges.unshift(rebaseChange);
              if (rebaseChange === undefined) {
                throw new Error("Received change that references a non-existing parent change");
              }
              return rebaseChange;
            });
        },
        makePromise
      )
    )

    // Compute the base Changeset to rebase the changes on the branch that was still the local branch
    // when the incoming change was created

    mainPromise = mainPromise
      .then(() => {
        // First invert all changes on the previous local branch
        const startGuid = alreadyRebasedChanges.length > 0 ?
          alreadyRebasedChanges[0].referenceGuid :
          changesOnOtherLocalBranch[0].referenceGuid;

        // Then apply all changes on the local remote branch
        const endGuid = change.remoteHeadGuid;
        return getRebasedChanges(startGuid, endGuid)
      })
      .then((relevantRemoteChanges) => {
        let rebaseBaseChangeSetForAlreadyRebasedChanges = new ChangeSet({});

        if (relevantRemoteChanges.length > 0) {
            for (const c of relevantRemoteChanges) {
                let changeset = c.changeSet;
                let applyAfterMetaInformation;

                if (alreadyRebasedChanges[0] !== undefined && alreadyRebasedChanges[0].guid === c.guid) {
                    const invertedChange = new ChangeSet(_.cloneDeep(alreadyRebasedChanges[0].changeSet));
                    invertedChange._toInverseChangeSet();
                    invertedChange.applyChangeSet(rebaseBaseChangeSetForAlreadyRebasedChanges);
                    applyAfterMetaInformation = new Map();
                    const conflicts2 = [];
                    changeset = _.cloneDeep(alreadyRebasedChanges[0].changeSet);
                    rebaseBaseChangeSetForAlreadyRebasedChanges._rebaseChangeSet(changeset, conflicts2, {
                        applyAfterMetaInformation,
                    });

                    rebaseBaseChangeSetForAlreadyRebasedChanges = invertedChange;
                    alreadyRebasedChanges.shift();
                }
                rebaseBaseChangeSetForAlreadyRebasedChanges.applyChangeSet(changeset, { applyAfterMetaInformation });
            }

            // Now we have to rebase all changes from the remote local branch with respect to this base changeset
            rebaseChangeArrays(rebaseBaseChangeSetForAlreadyRebasedChanges, changesOnOtherLocalBranch);
        }

        // Update the reference for the rebased changes to indicate that they are now with respect to the
        // new remoteHeadGuid
        if (changesOnOtherLocalBranch.length > 0) {
          changesOnOtherLocalBranch[0].remoteHeadGuid = change.remoteHeadGuid;
          changesOnOtherLocalBranch[0].referenceGuid = change.remoteHeadGuid;
        }
      })
  }

  return mainPromise
    .then(() => makePromise(getRebasedChanges(change.remoteHeadGuid)))
    .then((remoteChanges) => {
      const conflicts = [];
      if (!_.isEqual(changesOnOtherLocalBranch.map((change) => change.guid),
                     remoteChanges.map((change) => change.guid))) {
        for (const remoteChange of remoteChanges) {
            let applyAfterMetaInformation =
            commitsOnOtherLocalBranch[remoteChange.guid] !== undefined
                ? remoteChange.rebaseMetaInformation
                : undefined;

            let changeset = remoteChange.changeSet;
            if (changesOnOtherLocalBranch[0] !== undefined && changesOnOtherLocalBranch[0].guid === remoteChange.guid) {
                const invertedChange = new ChangeSet(_.cloneDeep(changesOnOtherLocalBranch[0].changeSet));
                invertedChange._toInverseChangeSet();
                invertedChange.applyChangeSet(rebaseBaseChangeSet);

                applyAfterMetaInformation = new Map();
                changeset = _.cloneDeep(changesOnOtherLocalBranch[0].changeSet);
                rebaseBaseChangeSet._rebaseChangeSet(changeset, conflicts, { applyAfterMetaInformation });

                // This is disabled for performance reasons. Only used during debugging
                // assert(_.isEqual(changeset,this.remoteChanges[i].changeSet),
                //                 "Failed Rebase in rebaseToRemoteChanges");
                rebaseBaseChangeSet = invertedChange;
                changesOnOtherLocalBranch.shift();
            }

            rebaseBaseChangeSet.applyChangeSet(changeset, {
                applyAfterMetaInformation,
            });
        }
      }

      change.rebaseMetaInformation = new Map();
      rebaseBaseChangeSet._rebaseChangeSet(change.changeSet, conflicts, {
        applyAfterMetaInformation: change.rebaseMetaInformation,
      });
    })
}

function rebaseChangeArrays(baseChangeSet, changesToRebase) {
  let rebaseBaseChangeSet = baseChangeSet;
  for (const change of changesToRebase) {
    const copiedChangeSet = new ChangeSet(_.cloneDeep(change.changeSet));
    copiedChangeSet._toInverseChangeSet();

    const conflicts = [];
    change.rebaseMetaInformation = new Map();
    rebaseBaseChangeSet._rebaseChangeSet(change.changeSet, conflicts, {
      applyAfterMetaInformation: change.rebaseMetaInformation,
    });

    copiedChangeSet.applyChangeSet(rebaseBaseChangeSet);
    copiedChangeSet.applyChangeSet(change.changeSet, {
      applyAfterMetaInformation: change.rebaseMetaInformation,
    });
    rebaseBaseChangeSet = copiedChangeSet;
  }
}

module.exports = {
  rebaseToRemoteChanges
};
