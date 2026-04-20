/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @public
 *
 */
abstract class MockAbstractClass {
	/**
	 * @public
	 */
	invalidMethodDefinition(): number {
		return 1;
	}

	/**
	 * @alpha
	 */
	abstract invalidPropertySignature: number;

	abstract validMethodSignature(): boolean;

	abstract validPropertySignature: string;
}
