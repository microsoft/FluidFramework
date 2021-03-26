

import { ChangeSet } from "@fluid-experimental/property-changeset";
import { PropertyFactory, BaseProperty, NodeProperty } from "@fluid-experimental/property-properties";

import { v4 as uuidv4 } from "uuid";
import _ from "lodash";
import { EventEmitter } from 'events';



export type SerializedChangeSet = any;

const enum OpKind {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  ChangeSet = 0,
}

interface IPropertyTreeMessage {
  op: OpKind;
  changeSet: SerializedChangeSet;
  guid: string;
  referenceGuid: string;
  remoteHeadGuid: string;
  localBranchStart: string | undefined;
  rebaseMetaInformation?: Map<any, any>;
  useMH?: boolean;
}

/**
 * Silly DDS example that models a six sided die.
 *
 * Unlike the typical 'Dice Roller' example where clients clobber each other's last roll in a
 * SharedMap, this 'SharedDie' DDS works by advancing an internal PRNG each time it sees a 'roll'
 * operation.
 *
 * Because all clients are using the same PRNG starting in the same state, they arrive at
 * consensus by simply applying the same number of rolls.  (A fun addition would be logging
 * who received which roll, which would need to change as clients learn how races are resolved
 * in the total order)
 */
export class SharedPropertyTree extends EventEmitter {
  // Initial state of the PRNG.  Must not be zero.  (See `advance()` below for details.)
  tipView: SerializedChangeSet = {};
  remoteTipView: SerializedChangeSet = {};
  localChanges: IPropertyTreeMessage[] = [];
  remoteChanges: IPropertyTreeMessage[] = [];
  unrebasedRemoteChanges: Record<string, IPropertyTreeMessage> = {};
  transmissionsHaveBeenStopped = false;
  enqueuedMessages: IPropertyTreeMessage[] = [];
  notificationDelayScope: number = 0;
  _root: any = PropertyFactory.create("NodeProperty");
  skipSequenceNumber: number = -1;
  headCommitGuid: string = "";
  useMH: boolean = false;

  public constructor() {
    super();
    this.root.getWorkspace = () => this;
    // this.root._getCheckoutView = () => undefined;

    // Quick hack to let HFDM root be aware of the DDS hosting it.
    this._root._tree = this;
  }



  public _reportDirtinessToView() {
    const changes = this._root._serialize(true, false, BaseProperty.MODIFIED_STATE_FLAGS.DIRTY);
    const _changeSet = new ChangeSet(changes);
    if (!_.isEmpty(_changeSet.getSerializedChangeSet())) {
      this.emit("modified", _changeSet);
    }
    this._root.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY);
  }

  public get changeSet() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.tipView;
  }

  public get root(): NodeProperty {
    return this._root as NodeProperty;
  }

  public commit() {
    const changes = this._root._serialize(true, false, BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
    this.applyChangeSet(changes);
    this.root.cleanDirty();
  }

  private applyChangeSet(changeSet: SerializedChangeSet) {
    const _changeSet = new ChangeSet(changeSet);
    _changeSet._toReversibleChangeSet(this.tipView);

    const remoteHeadGuid =
      this.remoteChanges.length > 0
        ? this.remoteChanges[this.remoteChanges.length - 1].guid
        : this.headCommitGuid;
    const change = {
      op: OpKind.ChangeSet,
      changeSet,
      guid: uuidv4(),
      remoteHeadGuid,
      referenceGuid:
        this.localChanges.length > 0 ? this.localChanges[this.localChanges.length - 1].guid : remoteHeadGuid,
      localBranchStart: this.localChanges.length > 0 ? this.localChanges[0].guid : undefined,
      useMH: this.useMH,
    };
    this._applyChangeSet(change, true);
  }

  /**
   * Delays notifications until popNotificationDelayScope has been called the same number of times as
   * pushNotificationDelayScope.
   */
  public pushNotificationDelayScope() {
    // set the scope counter
    this.notificationDelayScope++;

    // If we reach 0, we have to report unreported changes
    if (this.notificationDelayScope === 0) {
      this._root._reportDirtinessToView();
    }
  }

  /**
   * Re-enables notifications when popNotificationDelayScope has been called the same number of times as
   * pushNotificationDelayScope.
   */
  public popNotificationDelayScope() {
    if (this.notificationDelayScope === 0) {
      console.error("Unbalanced push/pop calls.");
    }
    this.notificationDelayScope--;
    this._root._reportDirtinessToView();
  }

  private _applyChangeSet(change: IPropertyTreeMessage, localChange: boolean) {
    if (localChange) {
      const changeSetWrapper = new ChangeSet(this.tipView);
      changeSetWrapper.applyChangeSet(change.changeSet);

      this.localChanges.push(change);
    } else {
      // Rebase the commit with respect to the remote changes
      this.rebaseToRemoteChanges(change);

      this.remoteChanges.push(change);

      // Apply the remote change set to the remote tip view
      const remoteChangeSetWrapper = new ChangeSet(this.remoteTipView);
      remoteChangeSetWrapper.applyChangeSet(change.changeSet);

      // Rebase the local changes
      const pendingChanges = this._root._serialize(true, false, BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
      new ChangeSet(pendingChanges)._toReversibleChangeSet(this.tipView);

      const changesToTip: SerializedChangeSet = {};
      const changesNeeded = this.rebaseLocalChanges(change, pendingChanges, changesToTip);

      if (changesNeeded) {
        this.pushNotificationDelayScope();
        // Checkout the new tip
        this._root.applyChangeSet(changesToTip);
        this._root.cleanDirty(BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
        this._root.applyChangeSet(pendingChanges);
        this.popNotificationDelayScope();
      }
    }
  }

  private rebaseToRemoteChanges(change: IPropertyTreeMessage) {
    this.unrebasedRemoteChanges[change.guid] = _.cloneDeep(change);

    // This is the first message in the history of the document.
    if (this.remoteChanges.length === 0) {
      return;
    }

    const commitsOnOtherLocalBranch: Record<string, IPropertyTreeMessage> = {};
    const rebaseBaseChangeSet = new ChangeSet({});
    if (change.referenceGuid !== change.remoteHeadGuid) {
      // Extract all changes inbetween the remoteHeadGuid and the referenceGuid
      const changesOnOtherLocalBranch: IPropertyTreeMessage[] = [];
      let currentGuid = change.referenceGuid;
      for (; ;) {
        const currentChange = this.unrebasedRemoteChanges[currentGuid];
        if (currentChange === undefined) {
          throw new Error("Received change that references a non-existing parent change");
        }
        changesOnOtherLocalBranch.unshift(currentChange);
        commitsOnOtherLocalBranch[currentGuid] = currentChange;
        if (currentGuid === change.localBranchStart) {
          break;
        }
        currentGuid = currentChange.referenceGuid;
      }

      // Now we extract all changes until we arrive at a change that is relative to a remote change
      const alreadyRebasedChanges: IPropertyTreeMessage[] = [];
      let currentRebasedChange = this.unrebasedRemoteChanges[change.localBranchStart];
      while (currentRebasedChange.remoteHeadGuid !== currentRebasedChange.referenceGuid) {
        currentGuid = currentRebasedChange.referenceGuid;
        currentRebasedChange = this.unrebasedRemoteChanges[currentGuid];
        alreadyRebasedChanges.unshift(currentRebasedChange);
        if (currentRebasedChange === undefined) {
          throw new Error("Received change that references a non-existing parent change");
        }
      }

      // Compute the base Changeset to rebase the changes on the branch that was still the local branch
      // when the incoming change was created

      // First invert all changes on the previous local branch
      const rebaseBaseChangeSetForAlreadyRebasedChanges = new ChangeSet({});
      let startIndex: number;
      if (alreadyRebasedChanges.length > 0) {
        alreadyRebasedChanges.forEach((c) => {
          rebaseBaseChangeSetForAlreadyRebasedChanges.applyChangeSet(c.changeSet);
        });
        rebaseBaseChangeSetForAlreadyRebasedChanges._toInverseChangeSet();

        startIndex = _.findIndex(this.remoteChanges, (c) => c.guid === alreadyRebasedChanges[0].referenceGuid);
      } else {
        startIndex = _.findIndex(
          this.remoteChanges,
          (c) => c.guid === changesOnOtherLocalBranch[0].referenceGuid,
        );
      }

      // Then apply all changes on the local remote branch
      const endIndex = _.findIndex(this.remoteChanges, (c) => c.guid === change.remoteHeadGuid);
      const relevantRemoteChanges = this.remoteChanges.slice(startIndex + 1, endIndex + 1);
      relevantRemoteChanges.forEach((c) => {
        rebaseBaseChangeSetForAlreadyRebasedChanges.applyChangeSet(c.changeSet);
      });

      // Now we have to rebase all changes from the remote local branch with respect to this base changeset
      this.rebaseChangeArrays(rebaseBaseChangeSetForAlreadyRebasedChanges, changesOnOtherLocalBranch);

      // Update the reference for the rebased changes to indicate that they are now with respect to the
      // new remoteHeadGuid
      if (changesOnOtherLocalBranch.length > 0) {
        changesOnOtherLocalBranch[0].remoteHeadGuid = change.remoteHeadGuid;
        changesOnOtherLocalBranch[0].referenceGuid = change.remoteHeadGuid;
      }

      // We now have to rebase the incoming change with respect to the reverse of these changes
      changesOnOtherLocalBranch.forEach((c) => {
        rebaseBaseChangeSet.applyChangeSet(c.changeSet);
      });
      rebaseBaseChangeSet._toInverseChangeSet();
    }

    const baseCommitID = _.findIndex(this.remoteChanges, (c) => c.guid === change.remoteHeadGuid);

    // let rebaseBaseChangeSet = {} as SerializedChangeSet;
    for (let i = baseCommitID + 1; i < this.remoteChanges.length; i++) {
      rebaseBaseChangeSet.applyChangeSet(this.remoteChanges[i].changeSet, {
        rebaseMetaInformation:
          commitsOnOtherLocalBranch[this.remoteChanges[i].guid] !== undefined
            ? this.remoteChanges[i].rebaseMetaInformation
            : undefined,
      });
    }

    change.rebaseMetaInformation = new Map();
    const conflicts = [] as any[];
    rebaseBaseChangeSet._rebaseChangeSet(change.changeSet, conflicts, {
      rebaseMetaInformation: change.rebaseMetaInformation,
    });
  }

  private rebaseChangeArrays(baseChangeSet: ChangeSet, changesToRebase: IPropertyTreeMessage[]) {
    let rebaseBaseChangeSet = baseChangeSet;
    for (const change of changesToRebase) {
      const copiedChangeSet = new ChangeSet(_.cloneDeep(change.changeSet));
      copiedChangeSet._toInverseChangeSet();

      const conflicts = [] as any[];
      const rebaseMetaInformation = new Map();
      rebaseBaseChangeSet._rebaseChangeSet(change.changeSet, conflicts, {
        applyAfterMetaInformation: rebaseMetaInformation,
      });

      copiedChangeSet.applyChangeSet(rebaseBaseChangeSet);
      copiedChangeSet.applyChangeSet(change.changeSet, {
        applyAfterMetaInformation: rebaseMetaInformation,
      });
      rebaseBaseChangeSet = copiedChangeSet;
    }
  }

  private rebaseLocalChanges(
    change: IPropertyTreeMessage,
    pendingChanges: SerializedChangeSet,
    newTipDelta: SerializedChangeSet,
  ): boolean {
    let rebaseBaseChangeSet = _.cloneDeep(change.changeSet);

    const accumulatedChanges: SerializedChangeSet = {};
    const conflicts = [] as any[];

    if (this.localChanges.length > 0 && this.localChanges[0].guid === change.guid) {
      // If we got a confirmation of the commit on the tip of the localChanges array,
      // there will be no update of the tip view at all. We just move it from local changes
      // to remote changes
      this.localChanges.shift();

      return false;
    }

    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < this.localChanges.length; i++) {
      // Make sure we never receive changes out of order
      console.assert(this.localChanges[i].guid !== change.guid);

      const rebaseMetaInformation = new Map();

      const copiedChangeSet = new ChangeSet(_.cloneDeep(this.localChanges[i].changeSet));
      new ChangeSet(rebaseBaseChangeSet)._rebaseChangeSet(this.localChanges[i].changeSet, conflicts, {
        applyAfterMetaInformation: rebaseMetaInformation,
      });

      copiedChangeSet._toInverseChangeSet();
      copiedChangeSet.applyChangeSet(rebaseBaseChangeSet);
      copiedChangeSet.applyChangeSet(this.localChanges[i].changeSet, {
        applyAfterMetaInformation: rebaseMetaInformation,
      });
      rebaseBaseChangeSet = copiedChangeSet.getSerializedChangeSet();

      new ChangeSet(accumulatedChanges).applyChangeSet(this.localChanges[i].changeSet);
    }

    // Compute the inverse of the pending changes and store the result in newTipDelta
    const pendingChangesRebaseMetaInformation = new Map();
    const deltaToTipCS = new ChangeSet(newTipDelta);
    deltaToTipCS.applyChangeSet(pendingChanges);
    deltaToTipCS._toInverseChangeSet();

    // Perform a rebase of the pending changes
    new ChangeSet(rebaseBaseChangeSet)._rebaseChangeSet(pendingChanges, conflicts, {
      applyAfterMetaInformation: pendingChangesRebaseMetaInformation,
    });

    // Compute the delta between the old tip (including pending changes)
    // and the new tip (not including the rebased pending changes)
    deltaToTipCS.applyChangeSet(rebaseBaseChangeSet);
    deltaToTipCS.applyChangeSet(pendingChanges, {
      applyAfterMetaInformation: pendingChangesRebaseMetaInformation,
    });

    // Udate the the tip view
    this.tipView = _.cloneDeep(this.remoteTipView);
    const changeSet = new ChangeSet(this.tipView);
    changeSet.applyChangeSet(accumulatedChanges);

    return true;
  }

  getRoot() { return this.root; }
  get(...args) { return this.root.get(...args) }
  getIds() { return this.root.getIds() }
  getEntriesReadOnly() { return this.root.getEntriesReadOnly() }
  insert(in_id, in_property) { return this.root.insert(in_id, in_property); }
  remove(in_id) { return this.root.remove(in_id); }
  register(eventName, callback) {
    this.on(eventName, callback)
    return () => this.removeListener(eventName, callback);
  }
  unregister(eventName, callback) { return callback(); }
  getTemplate = () => { };
  resolvePath(x) { return this.root.resolvePath(x) }
  public get pset() {
    return this.root;
  }

  pushModifiedEventScope() {
    this.pushNotificationDelayScope();
  }
  popModifiedEventScope() {
    this.popNotificationDelayScope();
  }

}
