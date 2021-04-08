import { expect } from "chai";
import { SharedPropertyTree, IPropertyTreeMessage, IRemotePropertyTreeMessage, OpKind } from "../propertyTree";

describe("PropertyTree", () => {
	describe("Pruning History", () => {
		it("Prune does nothing if sequence number is too low to prune", () => {
			/**
			 * REMOTE CHANGES:      (A,0) - (B,1)
			 * UNREBASED CHANGES:     \-(C,2)
			 * minimum sequence number: 0
			 */
			const msn = 0;
			const remoteChanges: IPropertyTreeMessage[] = [
				{
					op: OpKind.ChangeSet,
					changeSet: {},
					guid: "A",
					referenceGuid: "",
					remoteHeadGuid: "",
					localBranchStart: undefined,
				},
				{
					op: OpKind.ChangeSet,
					changeSet: {},
					guid: "B",
					referenceGuid: "A",
					remoteHeadGuid: "A",
					localBranchStart: undefined,
				},
			];
			const unrebasedRemoteChanges: Record<string, IRemotePropertyTreeMessage> = {};
			unrebasedRemoteChanges.C = {
				op: OpKind.ChangeSet,
				changeSet: {},
				guid: "C",
				referenceGuid: "A",
				remoteHeadGuid: "A",
				localBranchStart: undefined,
				sequenceNumber: 2,
			};
			const prundedData = SharedPropertyTree.prune(msn, remoteChanges, unrebasedRemoteChanges);

			expect(remoteChanges).to.deep.equal(prundedData.remoteChanges);
			expect(unrebasedRemoteChanges).to.deep.equal(prundedData.unrebasedRemoteChanges);
		});
		it("Prune does nothing if sequence number is equivalent to the sole unrebased commit", () => {
			/**
			 * REMOTE CHANGES:      (A,0) - (B,1)
			 * UNREBASED CHANGES:     \-(C,2)
			 * minimum sequence number: 2
			 */
			const msn = 2;
			const remoteChanges: IPropertyTreeMessage[] = [
				{
					op: OpKind.ChangeSet,
					changeSet: {},
					guid: "A",
					referenceGuid: "",
					remoteHeadGuid: "",
					localBranchStart: undefined,
				},
				{
					op: OpKind.ChangeSet,
					changeSet: {},
					guid: "B",
					referenceGuid: "A",
					remoteHeadGuid: "A",
					localBranchStart: undefined,
				},
			];
			const unrebasedRemoteChanges: Record<string, IRemotePropertyTreeMessage> = {};
			unrebasedRemoteChanges.C = {
				op: OpKind.ChangeSet,
				changeSet: {},
				guid: "C",
				referenceGuid: "A",
				remoteHeadGuid: "A",
				localBranchStart: undefined,
				sequenceNumber: 2,
			};
			const prundedData = SharedPropertyTree.prune(msn, remoteChanges, unrebasedRemoteChanges);
			expect(prundedData.prunedCount).to.equal(0);
			expect(remoteChanges).to.deep.equal(prundedData.remoteChanges);
			expect(unrebasedRemoteChanges).to.deep.equal(prundedData.unrebasedRemoteChanges);
		});

		it("Prune does nothing if all unrebased changes with leq sqn than msn are ref'ing all remote changes", () => {
			/**
			 * REMOTE CHANGES:      (A,0) - (B,1)
			 * UNREBASED CHANGES:    |      \-(C,2)
			 * UNREBASED CHANGES:     \-(D,3)
			 * minimum sequence number: 2
			 */
			const msn = 2;
			const remoteChanges: IPropertyTreeMessage[] = [
				{
					op: OpKind.ChangeSet,
					changeSet: {},
					guid: "A",
					referenceGuid: "",
					remoteHeadGuid: "",
					localBranchStart: undefined,
				},
				{
					op: OpKind.ChangeSet,
					changeSet: {},
					guid: "B",
					referenceGuid: "A",
					remoteHeadGuid: "A",
					localBranchStart: undefined,
				},
			];
			const unrebasedRemoteChanges: Record<string, IRemotePropertyTreeMessage> = {};
			unrebasedRemoteChanges.C = {
				op: OpKind.ChangeSet,
				changeSet: {},
				guid: "C",
				referenceGuid: "B",
				remoteHeadGuid: "B",
				localBranchStart: undefined,
				sequenceNumber: 2,
			};

			unrebasedRemoteChanges.D = {
				op: OpKind.ChangeSet,
				changeSet: {},
				guid: "D",
				referenceGuid: "A",
				remoteHeadGuid: "A",
				localBranchStart: undefined,
				sequenceNumber: 3,
			};
			const prundedData = SharedPropertyTree.prune(msn, remoteChanges, unrebasedRemoteChanges);
			expect(prundedData.prunedCount).to.equal(0);
			expect(remoteChanges).to.deep.equal(prundedData.remoteChanges);
			expect(unrebasedRemoteChanges).to.deep.equal(prundedData.unrebasedRemoteChanges);
		});

		it("Prune deletes the initial commit since its not referenced by unrebased change", () => {
			/**
			 * REMOTE CHANGES:      (A,0) - (B,1)
			 * UNREBASED CHANGES:           \-(C,2)
			 */
			const msn = 2;
			const remoteChanges: IPropertyTreeMessage[] = [
				{
					op: OpKind.ChangeSet,
					changeSet: {},
					guid: "A",
					referenceGuid: "",
					remoteHeadGuid: "",
					localBranchStart: undefined,
				},
				{
					op: OpKind.ChangeSet,
					changeSet: {},
					guid: "B",
					referenceGuid: "A",
					remoteHeadGuid: "A",
					localBranchStart: undefined,
				},
			];
			const unrebasedRemoteChanges: Record<string, IRemotePropertyTreeMessage> = {};
			unrebasedRemoteChanges.C = {
				op: OpKind.ChangeSet,
				changeSet: {},
				guid: "C",
				referenceGuid: "B",
				remoteHeadGuid: "B",
				localBranchStart: undefined,
				sequenceNumber: 2,
			};
			const prundedData = SharedPropertyTree.prune(msn, remoteChanges, unrebasedRemoteChanges);

			expect(prundedData.prunedCount).to.equal(1);
			expect(prundedData.remoteChanges.length).to.be.equal(1);
			expect(remoteChanges[1]).to.equal(prundedData.remoteChanges[0]);
			expect(unrebasedRemoteChanges).to.deep.equal(prundedData.unrebasedRemoteChanges);
		});

		it("Prune deletes the initial commit since its not indirectly referenced by unrebased change", () => {
			/**
			 * REMOTE CHANGES:      (A,0) <- (B,1)
			 * UNREBASED CHANGES:              \-(D,2) <-(C,3)
			 * minimum sequence number: 3
			 */
			const msn = 3;
			const remoteChanges: IPropertyTreeMessage[] = [
				{
					op: OpKind.ChangeSet,
					changeSet: {},
					guid: "A",
					referenceGuid: "",
					remoteHeadGuid: "",
					localBranchStart: undefined,
				},
				{
					op: OpKind.ChangeSet,
					changeSet: {},
					guid: "B",
					referenceGuid: "A",
					remoteHeadGuid: "A",
					localBranchStart: undefined,
				},
			];
			const unrebasedRemoteChanges: Record<string, IRemotePropertyTreeMessage> = {};
			unrebasedRemoteChanges.C = {
				op: OpKind.ChangeSet,
				changeSet: {},
				guid: "C",
				referenceGuid: "D",
				remoteHeadGuid: "B",
				localBranchStart: undefined,
				sequenceNumber: 3,
			};
			unrebasedRemoteChanges.D = {
				op: OpKind.ChangeSet,
				changeSet: {},
				guid: "D",
				referenceGuid: "B",
				remoteHeadGuid: "B",
				localBranchStart: undefined,
				sequenceNumber: 2,
			};
			const prundedData = SharedPropertyTree.prune(msn, remoteChanges, unrebasedRemoteChanges);

			expect(prundedData.prunedCount).to.equal(1);
			expect(prundedData.remoteChanges.length).to.be.equal(1);
			expect(remoteChanges[1]).to.equal(prundedData.remoteChanges[0]);
			expect(unrebasedRemoteChanges).to.deep.equal(prundedData.unrebasedRemoteChanges);
		});

		it("Prune deletes multiple changes since msn is higher than one of the unrebased changes chain sqn", () => {
			/**
			 * REMOTE CHANGES:       (A,0) <- (B,1)
			 * UNREBASED CHANGES:     |         \-(E,4)
			 * UNREBASED CHANGES:     \-(D,2) <- (C,3)
			 */
			const msn = 4;
			const remoteChanges: IPropertyTreeMessage[] = [
				{
					op: OpKind.ChangeSet,
					changeSet: {},
					guid: "A",
					referenceGuid: "",
					remoteHeadGuid: "",
					localBranchStart: undefined,
				},
				{
					op: OpKind.ChangeSet,
					changeSet: {},
					guid: "B",
					referenceGuid: "A",
					remoteHeadGuid: "A",
					localBranchStart: undefined,
				},
			];
			const unrebasedRemoteChanges: Record<string, IRemotePropertyTreeMessage> = {};
			unrebasedRemoteChanges.C = {
				op: OpKind.ChangeSet,
				changeSet: {},
				guid: "C",
				referenceGuid: "D",
				remoteHeadGuid: "A",
				localBranchStart: undefined,
				sequenceNumber: 3,
			};
			unrebasedRemoteChanges.D = {
				op: OpKind.ChangeSet,
				changeSet: {},
				guid: "D",
				referenceGuid: "A",
				remoteHeadGuid: "A",
				localBranchStart: undefined,
				sequenceNumber: 2,
			};
			unrebasedRemoteChanges.E = {
				op: OpKind.ChangeSet,
				changeSet: {},
				guid: "E",
				referenceGuid: "B",
				remoteHeadGuid: "B",
				localBranchStart: undefined,
				sequenceNumber: 4,
			};
			const prundedData = SharedPropertyTree.prune(msn, remoteChanges, unrebasedRemoteChanges);

			expect(prundedData.prunedCount).to.equal(3);
			expect(prundedData.remoteChanges.length).to.be.equal(1);
			expect(Object.keys(prundedData.unrebasedRemoteChanges).length).to.equal(1);
			expect(remoteChanges[1]).to.equal(prundedData.remoteChanges[0]);
			expect(unrebasedRemoteChanges.E).to.deep.equal(prundedData.unrebasedRemoteChanges.E);
		});

		it("Prune should not prune partially rebased commit chains", () => {
			/**
			 * REMOTE CHANGES:       (A,0) <- (B,1) <- (C,2)
			 * UNREBASED CHANGES:     \-(B,1) <- (C,2)
			 */
			const msn = 2;
			const remoteChanges: IPropertyTreeMessage[] = [
				{
					op: OpKind.ChangeSet,
					changeSet: {},
					guid: "A",
					referenceGuid: "",
					remoteHeadGuid: "",
					localBranchStart: undefined,
				},
				{
					op: OpKind.ChangeSet,
					changeSet: {},
					guid: "B",
					referenceGuid: "A",
					remoteHeadGuid: "A",
					localBranchStart: undefined,
				},
				{
					op: OpKind.ChangeSet,
					changeSet: {},
					guid: "C",
					referenceGuid: "B",
					remoteHeadGuid: "A",
					localBranchStart: undefined,
				},
			];
			const unrebasedRemoteChanges: Record<string, IRemotePropertyTreeMessage> = {};
			unrebasedRemoteChanges.B = {
				op: OpKind.ChangeSet,
				changeSet: {},
				guid: "B",
				referenceGuid: "A",
				remoteHeadGuid: "A",
				localBranchStart: undefined,
				sequenceNumber: 1,
			};
			unrebasedRemoteChanges.C = {
				op: OpKind.ChangeSet,
				changeSet: {},
				guid: "C",
				referenceGuid: "B",
				remoteHeadGuid: "A",
				localBranchStart: undefined,
				sequenceNumber: 2,
			};

			const prundedData = SharedPropertyTree.prune(msn, remoteChanges, unrebasedRemoteChanges);

			expect(prundedData.prunedCount).to.equal(0);
			expect(prundedData.remoteChanges.length).to.be.equal(3);
			expect(Object.keys(prundedData.unrebasedRemoteChanges).length).to.equal(2);
		});
	});
});
