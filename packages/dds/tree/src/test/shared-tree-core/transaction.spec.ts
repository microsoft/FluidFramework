/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { TransactionStack, type OnPop } from "../../shared-tree-core/index.js";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

describe("TransactionStacks", () => {
	it("emit an event after starting a transaction", () => {
		const transaction = new TransactionStack();
		let started = false;
		transaction.events.on("started", () => {
			assert.equal(transaction.isInProgress(), true);
			started = true;
		});
		transaction.start();
		assert.equal(started, true);
	});

	it("emit an event just before aborting a transaction", () => {
		const transaction = new TransactionStack();
		let aborting = false;
		transaction.events.on("aborting", () => {
			assert.equal(transaction.isInProgress(), true);
			aborting = true;
		});
		transaction.start();
		transaction.abort();
		assert.equal(aborting, true);
	});

	it("emit an event just before committing a transaction", () => {
		const transaction = new TransactionStack();
		let committing = false;
		transaction.events.on("committing", () => {
			assert.equal(transaction.isInProgress(), true);
			committing = true;
		});
		transaction.start();
		transaction.commit();
		assert.equal(committing, true);
	});

	it("report whether or not a transaction is in progress", () => {
		const transaction = new TransactionStack();
		assert.equal(transaction.isInProgress(), false);
		transaction.start();
		assert.equal(transaction.isInProgress(), true);
		transaction.start();
		assert.equal(transaction.isInProgress(), true);
		transaction.commit();
		assert.equal(transaction.isInProgress(), true);
		transaction.abort();
		assert.equal(transaction.isInProgress(), false);
	});

	it("run a function when a transaction begins", () => {
		let invoked = false;
		const transaction = new TransactionStack((): void => {
			invoked = true;
			assert.equal(transaction.isInProgress(), false);
		});
		transaction.start();
		assert.equal(invoked, true);
	});

	it("run a function when a transaction aborts", () => {
		let invoked = false;
		const transaction = new TransactionStack((): OnPop => {
			return () => {
				invoked = true;
				assert.equal(transaction.isInProgress(), false);
			};
		});
		transaction.start();
		assert.equal(invoked, false);
		transaction.abort();
		assert.equal(invoked, true);
	});

	it("run a function when a transaction commits", () => {
		let invoked = false;
		const transaction = new TransactionStack((): OnPop => {
			return () => {
				invoked = true;
				assert.equal(transaction.isInProgress(), false);
			};
		});
		transaction.start();
		assert.equal(invoked, false);
		transaction.commit();
		assert.equal(invoked, true);
	});

	it("throw an error if committing without starting a transaction", () => {
		const transaction = new TransactionStack();
		assert.throws(
			() => transaction.commit(),
			(e: Error) => validateAssertionError(e, "No transaction to commit"),
		);
	});

	it("throw an error if aborting without starting a transaction", () => {
		const transaction = new TransactionStack();
		assert.throws(
			() => transaction.abort(),
			(e: Error) => validateAssertionError(e, "No transaction to abort"),
		);
	});

	it("can't be used after disposal", () => {
		const transaction = new TransactionStack();
		assert.equal(transaction.disposed, false);
		transaction.dispose();
		assert.equal(transaction.disposed, true);
		assert.throws(
			() => transaction.isInProgress(),
			(e: Error) => validateAssertionError(e, "Transactor is disposed"),
		);
		assert.throws(
			() => transaction.start(),
			(e: Error) => validateAssertionError(e, "Transactor is disposed"),
		);
		assert.throws(
			() => transaction.commit(),
			(e: Error) => validateAssertionError(e, "Transactor is disposed"),
		);
		assert.throws(
			() => transaction.abort(),
			(e: Error) => validateAssertionError(e, "Transactor is disposed"),
		);
		assert.throws(
			() => transaction.dispose(),
			(e: Error) => validateAssertionError(e, "Transactor is disposed"),
		);
	});

	it("abort all transactions when disposed", () => {
		let aborted = 0;
		const transaction = new TransactionStack(() => {
			return () => {
				aborted += 1;
			};
		});
		transaction.start();
		transaction.start();
		transaction.dispose();
		assert.equal(aborted, 2);
	});
});
