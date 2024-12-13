/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { TreeStatus } from "../feature-libraries/index.js";
import {
	type ImplicitFieldSchema,
	type TreeNode,
	type TreeNodeApi,
	type TreeView,
	getOrCreateInnerNode,
	treeNodeApi,
} from "../simple-tree/index.js";

import { SchematizingSimpleTreeView } from "./schematizingTreeView.js";
import type { ITreeCheckout } from "./treeCheckout.js";
import { getCheckoutFlexTreeView } from "./checkoutFlexTreeView.js";

/**
 * A special object that signifies when a SharedTree {@link RunTransaction | transaction} should "roll back".
 * @public
 */
export const rollback = Symbol("SharedTree Transaction Rollback");

/**
 * A function which runs a transaction in a SharedTree.
 * @privateRemarks
 * This interface exists so that the (generously) overloaded `Tree.runTransaction` function can have the "rollback" property hanging off of it.
 * The rollback property being available on the function itself gives users a convenient option for rolling back a transaction without having to import another symbol.
 * @sealed @public
 */
export interface RunTransaction {
	/**
	 * The {@link rollback} object used to roll back a transaction.
	 */
	readonly rollback: typeof rollback;

	/**
	 * Apply one or more edits to the tree as a single atomic unit.
	 * @param node - The node that will be passed to `transaction`.
	 * This is typically the root node of the subtree that will be modified by the transaction.
	 * @param transaction - The function to run as the body of the transaction.
	 * This function is passed the provided `node`.
	 * @returns The value returned by the inner `transaction` function.
	 * @remarks
	 * All of the changes in the transaction are applied synchronously and therefore no other changes (either from this client or from a remote client) can be interleaved with those changes.
	 * Note that this is guaranteed by Fluid for any sequence of changes that are submitted synchronously, whether in a transaction or not.
	 * However, using a transaction has the following additional consequences:
	 * - If reverted (e.g. via an "undo" operation), all the changes in the transaction are reverted together.
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * Local change events will be emitted for each change as the transaction is being applied.
	 * If the transaction function throws an error then the transaction will be automatically rolled back (discarding any changes made to the tree so far) before the error is propagated up from this function.
	 * If the transaction is rolled back, a corresponding change event will also be emitted for the rollback.
	 */
	<TNode extends TreeNode, TResult>(
		node: TNode,
		transaction: (node: TNode) => TResult,
	): TResult;
	/**
	 * Apply one or more edits to the tree as a single atomic unit.
	 * @param tree - The tree which will be edited by the transaction
	 * @param transaction - The function to run as the body of the transaction.
	 * This function is passed the root of the tree.
	 * @returns The value returned by the inner `transaction` function.
	 * @remarks
	 * All of the changes in the transaction are applied synchronously and therefore no other changes (either from this client or from a remote client) can be interleaved with those changes.
	 * Note that this is guaranteed by Fluid for any sequence of changes that are submitted synchronously, whether in a transaction or not.
	 * However, using a transaction has the following additional consequences:
	 * - If reverted (e.g. via an "undo" operation), all the changes in the transaction are reverted together.
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * Local change events will be emitted for each change as the transaction is being applied.
	 * If the transaction function throws an error then the transaction will be automatically rolled back (discarding any changes made to the tree so far) before the error is propagated up from this function.
	 * If the transaction is rolled back, a corresponding change event will also be emitted for the rollback.
	 */
	// TODO: TreeView is invariant over the schema, so to accept any view, `any` is the only real option unless a non generic (or covariant) base type for view is introduced (which is planned).
	// This use of any is actually type safe as it is only used as a constraint, and the actual strongly typed view (TView) is passed to the callback.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	<TView extends TreeView<any>, TResult>(
		tree: TView,
		transaction: (root: TView["root"]) => TResult,
	): TResult;
	/**
	 * Apply one or more edits to the tree as a single atomic unit.
	 * @param node - The node that will be passed to `transaction`.
	 * This is typically the root node of the subtree that will be modified by the transaction.
	 * @param transaction - The function to run as the body of the transaction.
	 * This function is passed the provided `node`.
	 * At any point during the transaction, the function may return the special {@link RunTransaction.rollback | rollback value} (`Tree.runTransaction.rollback`) to abort the transaction and discard any changes it made so far.
	 * @returns The value returned by the inner `transaction` function.
	 * @remarks
	 * All of the changes in the transaction are applied synchronously and therefore no other changes (either from this client or from a remote client) can be interleaved with those changes.
	 * Note that this is guaranteed by Fluid for any sequence of changes that are submitted synchronously, whether in a transaction or not.
	 * However, using a transaction has the following additional consequences:
	 * - If reverted (e.g. via an "undo" operation), all the changes in the transaction are reverted together.
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * Local change events will be emitted for each change as the transaction is being applied.
	 * If the transaction function throws an error then the transaction will be automatically rolled back (discarding any changes made to the tree so far) before the error is propagated up from this function.
	 * If the transaction is rolled back (whether by an error or by returning the {@link RunTransaction.rollback} | rollback value), a corresponding change event will also be emitted for the rollback.
	 */
	<TNode extends TreeNode, TResult>(
		node: TNode,
		transaction: (node: TNode) => TResult | typeof rollback,
	): TResult | typeof rollback;
	/**
	 * Apply one or more edits to the tree as a single atomic unit.
	 * @param tree - The tree which will be edited by the transaction
	 * @param transaction - The function to run as the body of the transaction.
	 * This function is passed the root of the tree.
	 * At any point during the transaction, the function may return the special {@link RunTransaction.rollback | rollback value} (`Tree.runTransaction.rollback`) to abort the transaction and discard any changes it made so far.
	 * @returns The value returned by the inner `transaction` function.
	 * @remarks
	 * All of the changes in the transaction are applied synchronously and therefore no other changes (either from this client or from a remote client) can be interleaved with those changes.
	 * Note that this is guaranteed by Fluid for any sequence of changes that are submitted synchronously, whether in a transaction or not.
	 * However, using a transaction has the following additional consequences:
	 * - If reverted (e.g. via an "undo" operation), all the changes in the transaction are reverted together.
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * Local change events will be emitted for each change as the transaction is being applied.
	 * If the transaction function throws an error then the transaction will be automatically rolled back (discarding any changes made to the tree so far) before the error is propagated up from this function.
	 * If the transaction is rolled back (whether by an error or by returning the {@link RunTransaction.rollback} | rollback value), a corresponding change event will also be emitted for the rollback.
	 */
	// See comment on previous overload about use of any here.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	<TView extends TreeView<any>, TResult>(
		tree: TView,
		transaction: (root: TView["root"]) => TResult | typeof rollback,
	): TResult | typeof rollback;
	/**
	 * Apply one or more edits to the tree as a single atomic unit.
	 * @param node - The node that will be passed to `transaction`.
	 * This is typically the root node of the subtree that will be modified by the transaction.
	 * @param transaction - The function to run as the body of the transaction.
	 * This function is passed the provided `node`.
	 * @remarks
	 * All of the changes in the transaction are applied synchronously and therefore no other changes (either from this client or from a remote client) can be interleaved with those changes.
	 * Note that this is guaranteed by Fluid for any sequence of changes that are submitted synchronously, whether in a transaction or not.
	 * However, using a transaction has the following additional consequences:
	 * - If reverted (e.g. via an "undo" operation), all the changes in the transaction are reverted together.
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * Local change events will be emitted for each change as the transaction is being applied.
	 * If the transaction function throws an error then the transaction will be automatically rolled back (discarding any changes made to the tree so far) before the error is propagated up from this function.
	 * If the transaction is rolled back, a corresponding change event will also be emitted for the rollback.
	 */
	<TNode extends TreeNode>(node: TNode, transaction: (node: TNode) => void): void;
	/**
	 * Apply one or more edits to the tree as a single atomic unit.
	 * @param tree - The tree which will be edited by the transaction
	 * @param transaction - The function to run as the body of the transaction.
	 * This function is passed the root of the tree.
	 * @remarks
	 * All of the changes in the transaction are applied synchronously and therefore no other changes (either from this client or from a remote client) can be interleaved with those changes.
	 * Note that this is guaranteed by Fluid for any sequence of changes that are submitted synchronously, whether in a transaction or not.
	 * However, using a transaction has the following additional consequences:
	 * - If reverted (e.g. via an "undo" operation), all the changes in the transaction are reverted together.
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * Local change events will be emitted for each change as the transaction is being applied.
	 * If the transaction function throws an error then the transaction will be automatically rolled back (discarding any changes made to the tree so far) before the error is propagated up from this function.
	 * If the transaction is rolled back, a corresponding change event will also be emitted for the rollback.
	 */
	// See comment on previous overload about use of any here.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	<TView extends TreeView<any>>(tree: TView, transaction: (root: TView["root"]) => void): void;
	/**
	 * Apply one or more edits to the tree as a single atomic unit.
	 * @param node - The node that will be passed to `transaction`.
	 * This is typically the root node of the subtree that will be modified by the transaction.
	 * @param transaction - The function to run as the body of the transaction.
	 * This function is passed the provided `node`.
	 * @param preconditions - An optional list of {@link TransactionConstraint | constraints} that are checked just before the transaction begins.
	 * If any of the constraints are not met when `runTransaction` is called, it will throw an error.
	 * If any of the constraints are not met after the transaction has been ordered by the service, it will be rolled back on this client and ignored by all other clients.
	 * @returns The value returned by the inner `transaction` function.
	 * @remarks
	 * All of the changes in the transaction are applied synchronously and therefore no other changes (either from this client or from a remote client) can be interleaved with those changes.
	 * Note that this is guaranteed by Fluid for any sequence of changes that are submitted synchronously, whether in a transaction or not.
	 * However, using a transaction has the following additional consequences:
	 * - If reverted (e.g. via an "undo" operation), all the changes in the transaction are reverted together.
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * Local change events will be emitted for each change as the transaction is being applied.
	 * If the transaction function throws an error then the transaction will be automatically rolled back (discarding any changes made to the tree so far) before the error is propagated up from this function.
	 * If the transaction is rolled back, a corresponding change event will also be emitted for the rollback.
	 */
	<TNode extends TreeNode, TResult>(
		node: TNode,
		transaction: (node: TNode) => TResult,
		preconditions?: readonly TransactionConstraint[],
	): TResult;
	/**
	 * Apply one or more edits to the tree as a single atomic unit.
	 * @param tree - The tree which will be edited by the transaction
	 * @param transaction - The function to run as the body of the transaction.
	 * This function is passed the root of the tree.
	 * @param preconditions - An optional list of {@link TransactionConstraint | constraints} that are checked just before the transaction begins.
	 * If any of the constraints are not met when `runTransaction` is called, it will throw an error.
	 * If any of the constraints are not met after the transaction has been ordered by the service, it will be rolled back on this client and ignored by all other clients.
	 * @returns The value returned by the inner `transaction` function.
	 * @remarks
	 * All of the changes in the transaction are applied synchronously and therefore no other changes (either from this client or from a remote client) can be interleaved with those changes.
	 * Note that this is guaranteed by Fluid for any sequence of changes that are submitted synchronously, whether in a transaction or not.
	 * However, using a transaction has the following additional consequences:
	 * - If reverted (e.g. via an "undo" operation), all the changes in the transaction are reverted together.
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * Local change events will be emitted for each change as the transaction is being applied.
	 * If the transaction function throws an error then the transaction will be automatically rolled back (discarding any changes made to the tree so far) before the error is propagated up from this function.
	 * If the transaction is rolled back, a corresponding change event will also be emitted for the rollback.
	 */
	// See comment on previous overload about use of any here.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	<TView extends TreeView<any>, TResult>(
		tree: TView,
		transaction: (root: TView["root"]) => TResult,
		preconditions?: readonly TransactionConstraint[],
	): TResult;
	/**
	 * Apply one or more edits to the tree as a single atomic unit.
	 * @param node - The node that will be passed to `transaction`.
	 * This is typically the root node of the subtree that will be modified by the transaction.
	 * @param transaction - The function to run as the body of the transaction.
	 * This function is passed the provided `node`.
	 * At any point during the transaction, the function may return the special {@link RunTransaction.rollback | rollback value} (`Tree.runTransaction.rollback`) to abort the transaction and discard any changes it made so far.
	 * @param preconditions - An optional list of {@link TransactionConstraint | constraints} that are checked just before the transaction begins.
	 * If any of the constraints are not met when `runTransaction` is called, it will throw an error.
	 * If any of the constraints are not met after the transaction has been ordered by the service, it will be rolled back on this client and ignored by all other clients.
	 * @returns The value returned by the inner `transaction` function.
	 * @remarks
	 * All of the changes in the transaction are applied synchronously and therefore no other changes (either from this client or from a remote client) can be interleaved with those changes.
	 * Note that this is guaranteed by Fluid for any sequence of changes that are submitted synchronously, whether in a transaction or not.
	 * However, using a transaction has the following additional consequences:
	 * - If reverted (e.g. via an "undo" operation), all the changes in the transaction are reverted together.
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * Local change events will be emitted for each change as the transaction is being applied.
	 * If the transaction function throws an error then the transaction will be automatically rolled back (discarding any changes made to the tree so far) before the error is propagated up from this function.
	 * If the transaction is rolled back (whether by an error or by returning the {@link RunTransaction.rollback} | rollback value), a corresponding change event will also be emitted for the rollback.
	 */
	<TNode extends TreeNode, TResult>(
		node: TNode,
		transaction: (node: TNode) => TResult | typeof rollback,
		preconditions?: readonly TransactionConstraint[],
	): TResult | typeof rollback;
	/**
	 * Apply one or more edits to the tree as a single atomic unit.
	 * @param tree - The tree which will be edited by the transaction
	 * @param transaction - The function to run as the body of the transaction.
	 * This function is passed the root of the tree.
	 * At any point during the transaction, the function may return the special {@link RunTransaction.rollback | rollback value} (`Tree.runTransaction.rollback`) to abort the transaction and discard any changes it made so far.
	 * @param preconditions - An optional list of {@link TransactionConstraint | constraints} that are checked just before the transaction begins.
	 * If any of the constraints are not met when `runTransaction` is called, it will throw an error.
	 * If any of the constraints are not met after the transaction has been ordered by the service, it will be rolled back on this client and ignored by all other clients.
	 * @returns The value returned by the inner `transaction` function.
	 * @remarks
	 * All of the changes in the transaction are applied synchronously and therefore no other changes (either from this client or from a remote client) can be interleaved with those changes.
	 * Note that this is guaranteed by Fluid for any sequence of changes that are submitted synchronously, whether in a transaction or not.
	 * However, using a transaction has the following additional consequences:
	 * - If reverted (e.g. via an "undo" operation), all the changes in the transaction are reverted together.
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * Local change events will be emitted for each change as the transaction is being applied.
	 * If the transaction function throws an error then the transaction will be automatically rolled back (discarding any changes made to the tree so far) before the error is propagated up from this function.
	 * If the transaction is rolled back (whether by an error or by returning the {@link RunTransaction.rollback} | rollback value), a corresponding change event will also be emitted for the rollback.
	 */
	// See comment on previous overload about use of any here.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	<TView extends TreeView<any>, TResult>(
		tree: TView,
		transaction: (root: TView["root"]) => TResult | typeof rollback,
		preconditions?: readonly TransactionConstraint[],
	): TResult | typeof rollback;
	/**
	 * Apply one or more edits to the tree as a single atomic unit.
	 * @param node - The node that will be passed to `transaction`.
	 * This is typically the root node of the subtree that will be modified by the transaction.
	 * @param transaction - The function to run as the body of the transaction.
	 * This function is passed the provided `node`.
	 * @param preconditions - An optional list of {@link TransactionConstraint | constraints} that are checked just before the transaction begins.
	 * If any of the constraints are not met when `runTransaction` is called, it will throw an error.
	 * If any of the constraints are not met after the transaction has been ordered by the service, it will be rolled back on this client and ignored by all other clients.
	 * @remarks
	 * All of the changes in the transaction are applied synchronously and therefore no other changes (either from this client or from a remote client) can be interleaved with those changes.
	 * Note that this is guaranteed by Fluid for any sequence of changes that are submitted synchronously, whether in a transaction or not.
	 * However, using a transaction has the following additional consequences:
	 * - If reverted (e.g. via an "undo" operation), all the changes in the transaction are reverted together.
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * Local change events will be emitted for each change as the transaction is being applied.
	 * If the transaction function throws an error then the transaction will be automatically rolled back (discarding any changes made to the tree so far) before the error is propagated up from this function.
	 * If the transaction is rolled back, a corresponding change event will also be emitted for the rollback.
	 */
	<TNode extends TreeNode>(
		node: TNode,
		transaction: (node: TNode) => void,
		preconditions?: readonly TransactionConstraint[],
	): void;
	/**
	 * Apply one or more edits to the tree as a single atomic unit.
	 * @param tree - The tree which will be edited by the transaction
	 * @param transaction - The function to run as the body of the transaction.
	 * This function is passed the root of the tree.
	 * @param preconditions - An optional list of {@link TransactionConstraint | constraints} that are checked just before the transaction begins.
	 * If any of the constraints are not met when `runTransaction` is called, it will throw an error.
	 * If any of the constraints are not met after the transaction has been ordered by the service, it will be rolled back on this client and ignored by all other clients.
	 * @remarks
	 * All of the changes in the transaction are applied synchronously and therefore no other changes (either from this client or from a remote client) can be interleaved with those changes.
	 * Note that this is guaranteed by Fluid for any sequence of changes that are submitted synchronously, whether in a transaction or not.
	 * However, using a transaction has the following additional consequences:
	 * - If reverted (e.g. via an "undo" operation), all the changes in the transaction are reverted together.
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * Local change events will be emitted for each change as the transaction is being applied.
	 * If the transaction function throws an error then the transaction will be automatically rolled back (discarding any changes made to the tree so far) before the error is propagated up from this function.
	 * If the transaction is rolled back, a corresponding change event will also be emitted for the rollback.
	 */
	// See comment on previous overload about use of any here.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	<TView extends TreeView<any>>(
		tree: TView,
		transaction: (root: TView["root"]) => void,
		preconditions?: readonly TransactionConstraint[],
	): void;
}

/**
 * Provides various functions for interacting with {@link TreeNode}s.
 * @remarks
 * This type should only be used via the public `Tree` export.
 * @system @sealed @public
 */
export interface TreeApi extends TreeNodeApi {
	/**
	 * Run a {@link RunTransaction | transaction}.
	 */
	readonly runTransaction: RunTransaction;
	/**
	 * Check if the subtree defined by `node` contains `other`.
	 *
	 * @returns true if `other` is an inclusive descendant of `node`, and false otherwise.
	 * @remarks
	 * This includes direct and indirect children:
	 * as long as `node` is an ancestor of `other` (occurs in its parentage chain), this returns true, regardless of the number of levels of the tree between.
	 *
	 * `node` is considered to contain itself, so the case where `node === other` returns true.
	 *
	 * This is handy when checking if moving `node` into `other` would create a cycle and thus is invalid.
	 *
	 * This check walks the parents of `other` looking for `node`,
	 * and thus runs in time proportional to the depth of child in the tree.
	 */
	contains(node: TreeNode, other: TreeNode): boolean;
}

/**
 * The `Tree` object holds various functions for interacting with {@link TreeNode}s.
 * @public
 */
export const treeApi: TreeApi = {
	...treeNodeApi,

	runTransaction: createRunTransaction(),

	contains(parent: TreeNode, child: TreeNode): boolean {
		let toCheck: TreeNode | undefined = child;
		while (toCheck !== undefined) {
			if (toCheck === parent) {
				return true;
			}
			toCheck = treeApi.parent(toCheck);
		}
		return false;
	},
};

/**
 * A requirement for a SharedTree transaction to succeed.
 * @remarks Transaction constraints are useful for validating that the state of the tree meets some requirement when a transaction runs.
 * In general, when running a transaction a client can validate their tree state in whatever way they wish and decide to either proceed with the transaction or not.
 * However, they cannot know what the tree state will be when the transaction is _sequenced_.
 * There may have been any number of edits from other clients that get sequenced before the transaction is eventually sequenced.
 * Constraints provide a way to validate the tree state after the transaction has been sequenced and abort the transaction if the constraints are not met.
 * All clients will validate the constraints of a transaction when it is sequenced, so all clients will agree on whether the transaction succeeds or not.
 * @public
 */
export type TransactionConstraint = NodeInDocumentConstraint; // TODO: Add more constraint types here

/**
 * A transaction {@link TransactionConstraint | constraint} which requires that the given node exists in the tree.
 * @remarks The node must be in the document (its {@link TreeStatus | status} must be {@link TreeStatus.InDocument | InDocument}) to qualify as "existing".
 * @public
 */
export interface NodeInDocumentConstraint {
	readonly type: "nodeInDocument";
	readonly node: TreeNode;
}

// TODO: Add more constraint types here

/** Creates a copy of `runTransaction` with the `rollback` property added so as to satisfy the `RunTransaction` interface. */
function createRunTransaction(): RunTransaction {
	/** A type-safe helper to add a "rollback" property (as required by the `RunTransaction` interface) to a given object */
	function defineRollbackProperty<T extends object>(
		target: T,
	): T & { rollback: typeof rollback } {
		Reflect.defineProperty(target, "rollback", { value: rollback });
		return target as T & { readonly rollback: typeof rollback };
	}

	return defineRollbackProperty(runTransaction.bind({}));
}

/**
 * Run the given transaction.
 * @remarks
 * This API is not publicly exported but is exported outside of this module so that test code may unit test the `Tree.runTransaction` function directly without being restricted to its public API overloads.
 */
export function runTransaction<
	TNode extends TreeNode,
	TRoot extends ImplicitFieldSchema,
	TResult,
>(
	treeOrNode: TNode | TreeView<TRoot>,
	transaction:
		| ((node: TNode) => TResult | typeof rollback)
		| ((root: TRoot) => TResult | typeof rollback),
	preconditions: readonly TransactionConstraint[] = [],
): TResult | typeof rollback {
	if (treeOrNode instanceof SchematizingSimpleTreeView) {
		const t = transaction as (root: TRoot) => TResult | typeof rollback;
		return runTransactionInCheckout(
			treeOrNode.checkout,
			() => t(treeOrNode.root as TRoot),
			preconditions,
		);
	} else {
		const node = treeOrNode as TNode;
		const t = transaction as (node: TNode) => TResult | typeof rollback;
		const context = getOrCreateInnerNode(node).context;
		if (context.isHydrated() === false) {
			throw new UsageError(
				"Transactions cannot be run on Unhydrated nodes. Transactions apply to a TreeView and Unhydrated nodes are not part of a TreeView.",
			);
		}
		const treeView = getCheckoutFlexTreeView(context);
		return runTransactionInCheckout(treeView.checkout, () => t(node), preconditions);
	}
}

function runTransactionInCheckout<TResult>(
	checkout: ITreeCheckout,
	transaction: () => TResult | typeof rollback,
	preconditions: readonly TransactionConstraint[],
): TResult | typeof rollback {
	checkout.transaction.start();
	for (const constraint of preconditions) {
		switch (constraint.type) {
			case "nodeInDocument": {
				const node = getOrCreateInnerNode(constraint.node);
				const nodeStatus = treeApi.status(constraint.node);
				if (nodeStatus !== TreeStatus.InDocument) {
					throw new UsageError(
						`Attempted to add a "nodeInDocument" constraint, but the node is not currently in the document. Node status: ${nodeStatus}`,
					);
				}
				checkout.editor.addNodeExistsConstraint(node.anchorNode);
				break;
			}
			default:
				unreachableCase(constraint.type);
		}
	}

	let result: ReturnType<typeof transaction>;
	try {
		result = transaction();
	} catch (error) {
		// If the transaction has an unhandled error, abort and rollback the transaction but continue to propagate the error.
		checkout.transaction.abort();
		throw error;
	}

	if (result === rollback) {
		checkout.transaction.abort();
		return result;
	}

	checkout.transaction.commit();

	return result;
}
