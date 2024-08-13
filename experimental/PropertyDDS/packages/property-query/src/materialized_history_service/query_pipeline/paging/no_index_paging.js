/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const YIELD_EVERY_N = 1000;

const ComparatorFactory = require("../comparator");
const PathHelper = require("@fluid-experimental/property-changeset").PathHelper;
const PropertyUtils = require("@fluid-experimental/property-changeset").Utils;
const TypeIdHelper = require("@fluid-experimental/property-changeset").TypeIdHelper;
const ScanTraversalUtils = require("../scan_traversal_utils");
const _ = require("lodash");
const OperationError = require("@fluid-experimental/property-common").OperationError;
const HTTPStatus = require("http-status");

/**
 * Provides in-memory paging behavior
 */
class NoIndexPaging {
	/**
	 * Filters the ChangeSet in-memory
	 * @param {QueryV1Execution~QuerySpecification} query - Query specification
	 * @param {Object} changeSet - ChangeSet
	 * @param {Array<String>} limitedPaths - A list of paths to intersect with
	 * @return {Object} - Filtered ChangeSet and paths for paging
	 */
	static async doPaging(query, changeSet, limitedPaths) {
		const tokenizedPagingPath = PathHelper.tokenizePathString(query.from[0].pathPrefix);

		const tokenizedOrderClauses = query.paging.order.map((o) => {
			return {
				by: PathHelper.tokenizePathString(o.by || ""),
				direction: o.direction === "ASC" ? 1 : -1,
			};
		});

		let memIndex = await NoIndexPaging._buildIndex(
			tokenizedPagingPath,
			tokenizedOrderClauses,
			query.from[0].depthLimit,
			changeSet,
		);

		if (limitedPaths) {
			let standardizedLimitedPaths = limitedPaths.map((lp) =>
				PathHelper.tokenizePathString(lp).map(PathHelper.quotePathSegmentIfNeeded).join("."),
			);

			memIndex = memIndex.filter((mi) => standardizedLimitedPaths.includes(mi.path));
		}

		const partialCheckoutPaths = memIndex
			.sort(NoIndexPaging._sortingComparator.bind(this, tokenizedOrderClauses, 0))
			.slice(query.paging.offset, query.paging.offset + query.paging.limit)
			.map((i) => i.path);

		// Paging yielded some paths, yay.  Return only the paging items
		if (partialCheckoutPaths.length > 0) {
			return {
				changeSet: PropertyUtils.getFilteredChangeSetByPaths(changeSet, partialCheckoutPaths),
				queryPaths: partialCheckoutPaths,
			};
		} else {
			// Out of bounds paging
			if (memIndex.length > 0) {
				return {
					changeSet: NoIndexPaging._getEmptySetChangeSet(tokenizedPagingPath, changeSet),
					queryPaths: [],
				};
			} else {
				// Original ChangeSet doesn't have the path required, return empty
				return {
					changeSet: {},
					queryPaths: [],
				};
			}
		}
	}

	/**
	 * Builds an index for paging
	 * @param {Array<String>} tokenizedPagingPath - Prefix on which to select
	 * @param {Array<Object>} tokenizedOrderClauses - Field to use as index value
	 * @param {Number} depthLimit - Maximum depth from tokenizedPagingPath to go down
	 * @param {Object} changeSet - ChangeSet on which to build the index
	 * @return {Array<Object>} - Objects, with path, value for sorting
	 */
	static async _buildIndex(tokenizedPagingPath, tokenizedOrderClauses, depthLimit, changeSet) {
		let counter = 0;

		const _getPath = (context, length) =>
			context._parentStack.slice(0, length).map(PathHelper.quotePathSegmentIfNeeded).join(".");

		return new Promise((resolve, reject) => {
			let idx = {};
			let knownSortTypes = [];

			let subPaths = tokenizedOrderClauses.map((toc) => toc.by);

			PropertyUtils.traverseChangeSetRecursivelyAsync(
				changeSet,
				{
					preCallback: (context, cb) => {
						if (
							ScanTraversalUtils.shouldStopTraversing(
								tokenizedPagingPath,
								subPaths,
								depthLimit,
								context,
							)
						) {
							return cb("break");
						}

						if (ScanTraversalUtils.isItemContext(tokenizedPagingPath, depthLimit, context)) {
							if (!idx[_getPath(context, context._parentStack.length)]) {
								idx[_getPath(context, context._parentStack.length)] = Array(
									tokenizedOrderClauses.length,
								).fill({
									value: undefined,
									typeId: undefined,
								});
							}
						}

						const orderClauseIndex = NoIndexPaging._getOrderClauseIndex(
							tokenizedPagingPath,
							tokenizedOrderClauses,
							depthLimit,
							context,
						);

						if (orderClauseIndex > -1) {
							try {
								NoIndexPaging._validatePrimitiveType(context.getTypeid());
								knownSortTypes[orderClauseIndex] = NoIndexPaging._validateSameType(
									knownSortTypes[orderClauseIndex],
									context.getTypeid(),
								);
							} catch (ex) {
								reject(ex);
								return undefined;
							}

							idx[_getPath(context, -1 * tokenizedOrderClauses[orderClauseIndex].by.length)][
								orderClauseIndex
							] = {
								value: context.getNestedChangeSet(),
								typeId: context.getTypeid(),
							};
						}

						counter++;

						if (counter >= YIELD_EVERY_N) {
							setImmediate(cb);
							counter = 0;
						} else {
							cb();
						}
						return undefined;
					},
				},
				() => {
					resolve(
						Object.keys(idx).map((k) => {
							return {
								path: k,
								values: idx[k],
							};
						}),
					);
				},
			);
		});
	}

	/**
	 * Return the index in the order clause this context is for
	 * @param {Array<String>} tokenizedPagingPath - Prefix on which to select
	 * @param {Array<Object>} tokenizedOrderClauses - Field to use as index value
	 * @param {Number} depthLimit - Limit of path depth for search
	 * @param {Object} context - Traversal context
	 * @return {Number} - Whether this represent the property to sort upon
	 */
	static _getOrderClauseIndex(
		tokenizedPagingPath,
		tokenizedOrderClauses,
		depthLimit,
		context,
	) {
		return tokenizedOrderClauses.findIndex((oc) => {
			const expectedStackLength = tokenizedPagingPath.length + oc.by.length + depthLimit;
			if (context._parentStack.length > expectedStackLength) {
				return false;
			}

			const beginPart = context._parentStack.slice(0, tokenizedPagingPath.length);
			const endPart = context._parentStack.slice(-1 * oc.by.length);

			return _.isEqual(beginPart, tokenizedPagingPath) && _.isEqual(endPart, oc.by);
		});
	}

	/**
	 * Returns a changeSet corresponding to an empty collection
	 * @param {Array<String>} tokenizedPagingPath - Tokenized path
	 * @param {Object} changeSet - Changeset to act upon
	 * @return {Object} - ChangeSet with the collection, but no item
	 */
	static _getEmptySetChangeSet(tokenizedPagingPath, changeSet) {
		PropertyUtils.traverseChangeSetRecursively(changeSet, {
			preCallback: (context) => {
				if (_.isEqual(context._parentStack, tokenizedPagingPath)) {
					context.replaceNestedChangeSet({});
					context.stopTraversal();
				}
			},
		});

		return changeSet;
	}

	/**
	 * Comparator used to sort the indices
	 * @param {Array<Object>} tokenizedOrderClauses - Multiple order clauses for this query
	 * @param {Number} level - Which clause to compare aginst
	 * @param {*} a - Comparable A
	 * @param {*} b - Comparable B
	 * @return {Number} - Result of the comparison
	 */
	static _sortingComparator(tokenizedOrderClauses, level, a, b) {
		const aValue = a.values[level].value;
		const bValue = b.values[level].value;
		const typeId = a.values[level].typeId || b.values[level].typeId;
		const multiplicator = tokenizedOrderClauses[level].direction;
		let comparisonValue;

		// Comparing by map key case
		if (tokenizedOrderClauses.length === 1 && tokenizedOrderClauses[0].by.length === 0) {
			comparisonValue = ComparatorFactory.getKeyComparator().compare(a.path, b.path);
		} else {
			comparisonValue = ComparatorFactory.getComparator(typeId).compare(aValue, bValue);
		}

		if (comparisonValue !== 0) {
			return comparisonValue * multiplicator;
		} else {
			if (tokenizedOrderClauses.length > level + 1) {
				return NoIndexPaging._sortingComparator(tokenizedOrderClauses, level + 1, a, b);
			} else {
				return 0;
			}
		}
	}

	/**
	 * Whether a typeId is considered primitive
	 * @param {String} type - Typeid to be evaluated
	 */
	static _validatePrimitiveType(type) {
		if (!TypeIdHelper.isPrimitiveType(type)) {
			throw new OperationError(
				`Attempting to perform paging on a non-primitive orderBy, type was ${type}`,
				"_validatePrimitiveType",
				HTTPStatus.BAD_REQUEST,
				OperationError.FLAGS.QUIET,
			);
		}
	}

	/**
	 * Gates that indices are built on all the same type
	 * @param {String} knownType - Last known type
	 * @param {String} type  - Type to check against
	 * @return {String} - New last known type
	 */
	static _validateSameType(knownType, type) {
		if (!knownType) {
			return type;
		} else {
			if (knownType === type) {
				return type;
			}
			throw new OperationError(
				`Attempting to perform sorting on different types for orderBy ${type}/${knownType}`,
				"_validateSameType",
				HTTPStatus.BAD_REQUEST,
				OperationError.FLAGS.QUIET,
			);
		}
	}
}

module.exports = NoIndexPaging;
