/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { Dependee, InvalidationToken } from "./dependencies";
import { ObservingDependent } from "./incrementalObservation";

/**
 * A basic {@link ObservingDependent} implementation.
 */
export abstract class SimpleObservingDependent implements ObservingDependent {
	private _dependees: Dependee[] = [];

	public constructor(public readonly computationName = "SimpleObservingDependent") {}

	public listDependees(): readonly Dependee[] {
		return this._dependees;
	}

	public abstract markInvalid(token?: InvalidationToken): void;

	public registerDependee(dependee: Dependee): void {
		this._dependees.push(dependee);
	}

	/**
	 * Unregister from dependees as a dependent. Necessary as part of disposal and markInvalid.
	 */
	public unregisterDependees(): void {
		assert(this._dependees !== null,
            0x309 /* Cannot unregister dependees on a disposed SimpleObservingDependent. */);
		for (const dependee of this._dependees) {
			// remove references to this from each dependee
			dependee.removeDependent(this);
		}
		// remove references of each dependee
		this._dependees.length = 0;
	}

	/**
	 * Disconnect from all other proxies and clear. This object is not usable after dispose.
	 */
	public dispose(): void {
		// Null out fields to make this object error if used after disposed
		this.unregisterDependees();
		this._dependees = null as any;
	}
}
