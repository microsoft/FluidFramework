/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
// eslint-disable-next-line import/no-internal-modules
import { TransactionEnricher } from "../../shared-tree-core/transactionEnricher.js";
import { TestChange, TestChangeRebaser } from "../testChange.js";
import type { RevisionTag } from "../../core/index.js";
import { mintRevisionTag } from "../utils.js";
import { TestChangeEnricher } from "./utils.js";

const rebaser = new TestChangeRebaser();
const enricher = new TestChangeEnricher();
const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const tag3: RevisionTag = mintRevisionTag();
const tag4: RevisionTag = mintRevisionTag();

describe("TransactionEnricher", () => {
	describe("isTransacting()", () => {
		it("returns false at creation", () => {
			const transactionEnricher = new TransactionEnricher(rebaser, enricher);
			assert.equal(transactionEnricher.isTransacting(), false);
		});
		it("returns false after a transaction is committed", () => {
			const transactionEnricher = new TransactionEnricher(rebaser, enricher);
			transactionEnricher.startTransaction();
			transactionEnricher.commitTransaction();
			assert.equal(transactionEnricher.isTransacting(), false);
		});
		it("returns false after a transaction is aborted", () => {
			const transactionEnricher = new TransactionEnricher(rebaser, enricher);
			transactionEnricher.startTransaction();
			transactionEnricher.abortTransaction();
			assert.equal(transactionEnricher.isTransacting(), false);
		});
		it("returns true during a transaction", () => {
			const transactionEnricher = new TransactionEnricher(rebaser, enricher);
			transactionEnricher.startTransaction();
			{
				assert.equal(transactionEnricher.isTransacting(), true);
				transactionEnricher.startTransaction();
				{
					assert.equal(transactionEnricher.isTransacting(), true);
					transactionEnricher.startTransaction();
					{
						assert.equal(transactionEnricher.isTransacting(), true);
					}
					transactionEnricher.abortTransaction();
					assert.equal(transactionEnricher.isTransacting(), true);
				}
				transactionEnricher.commitTransaction();
				assert.equal(transactionEnricher.isTransacting(), true);
			}
			transactionEnricher.commitTransaction();
		});
	});
	describe("commitTransaction()", () => {
		it("throws when not in a transaction", () => {
			const transactionEnricher = new TransactionEnricher(rebaser, enricher);
			assert.throws(() => transactionEnricher.commitTransaction());
			transactionEnricher.startTransaction();
			transactionEnricher.commitTransaction();
			assert.throws(() => transactionEnricher.commitTransaction());
			transactionEnricher.startTransaction();
			transactionEnricher.abortTransaction();
			assert.throws(() => transactionEnricher.commitTransaction());
		});
		it("returns undefined when committing an inner transaction", () => {
			const transactionEnricher = new TransactionEnricher<TestChange>(rebaser, enricher);
			transactionEnricher.startTransaction();
			transactionEnricher.startTransaction();
			transactionEnricher.startTransaction();
			assert.equal(transactionEnricher.commitTransaction(), undefined);
			assert.equal(transactionEnricher.commitTransaction(), undefined);
		});
		describe("when committing an outer transaction", () => {
			it("returns undefined for a transaction with no change steps", () => {
				const transactionEnricher = new TransactionEnricher<TestChange>(rebaser, enricher);
				transactionEnricher.startTransaction();
				const getter = transactionEnricher.commitTransaction();
				assert.equal(getter, undefined);
			});
			it("returns undefined for a transaction with aborted change steps", () => {
				const transactionEnricher = new TransactionEnricher<TestChange>(rebaser, enricher);
				transactionEnricher.startTransaction();
				{
					transactionEnricher.startTransaction();
					{
						transactionEnricher.addTransactionStep({
							change: TestChange.mint([1], 2),
							revision: tag2,
						});
					}
					transactionEnricher.abortTransaction();
				}
				const getter = transactionEnricher.commitTransaction();
				assert.equal(getter, undefined);
			});
			it("returns a getter that returns the composition of transaction steps for a transaction with change steps", () => {
				const transactionEnricher = new TransactionEnricher<TestChange>(rebaser, enricher);
				transactionEnricher.startTransaction();
				{
					transactionEnricher.addTransactionStep({
						change: TestChange.mint([], 1),
						revision: tag1,
					});
					transactionEnricher.startTransaction();
					{
						transactionEnricher.addTransactionStep({
							change: TestChange.mint([1], 2),
							revision: tag2,
						});
					}
					transactionEnricher.abortTransaction();
					transactionEnricher.startTransaction();
					{
						transactionEnricher.addTransactionStep({
							change: TestChange.mint([1], 3),
							revision: tag3,
						});
					}
					transactionEnricher.commitTransaction();
					transactionEnricher.addTransactionStep({
						change: TestChange.mint([1, 3], 4),
						revision: tag4,
					});
				}
				const getter = transactionEnricher.commitTransaction();
				assert.notEqual(getter, undefined);
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const change = getter!(tag1);
				const expected = TestChange.mint([], [1000, 3000, 4000]);
				assert.deepEqual(change, expected);
			});
		});
	});
});
