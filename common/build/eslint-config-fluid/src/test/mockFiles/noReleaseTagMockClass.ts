/**
 * @public
 */
class MockClass {
	/**
	 * @internal
	 */
	foo(): void {}

	/**
	 * @alpha
	 */
	bar(): void {}

	/**
	 * @beta
	 */
	baz(): void {}

	/**
	 * @public
	 */
	bazz(): void {}

	/**
	 * Correctly implemented method with valid comment.
	 */
	correctValidComment(): void {}

	// Correctly implemented method with a slash comment.
	correctSlashComment(): void {}

	correctNoComment(): void {}
}
