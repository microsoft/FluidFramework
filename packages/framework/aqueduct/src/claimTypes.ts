/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The confirmed result of a pending claim, resolved after the op roundtrips.
 *
 * @public
 */
export type ClaimConfirmation<T = unknown> =
	| {
			/**
			 * The claim was successfully reserved by this client.
			 */
			readonly status: "Accepted";

			/**
			 * The value that was claimed.
			 */
			readonly currentValue: T;
	  }
	| {
			/**
			 * Another client already claimed this key.
			 */
			readonly status: "AlreadyClaimed";

			/**
			 * The value that was previously claimed by the winning client.
			 */
			readonly currentValue: T;
	  }
	| {
			/**
			 * The operation was aborted (e.g., due to rollback or disposal).
			 */
			readonly status: "Aborted";
	  };

/**
 * The result of a {@link PureDataObject.trySetClaim} operation.
 *
 * @public
 */
export type ClaimResult<T = unknown> =
	| {
			/**
			 * The key was already committed by a previous claim.
			 */
			readonly status: "Accepted";

			/**
			 * The committed value.
			 */
			readonly currentValue: T;
	  }
	| {
			/**
			 * Another client already claimed this key.
			 */
			readonly status: "AlreadyClaimed";

			/**
			 * The value that was previously claimed by the winning client.
			 */
			readonly currentValue: T;
	  }
	| {
			/**
			 * The claim op has been submitted and is awaiting server acknowledgement.
			 */
			readonly status: "Pending";

			/**
			 * A promise that resolves with the final outcome once the op roundtrips.
			 */
			readonly promise: Promise<ClaimConfirmation<T>>;
	  };
