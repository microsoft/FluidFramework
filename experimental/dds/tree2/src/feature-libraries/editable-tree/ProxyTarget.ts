/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	Anchor,
	TreeNavigationResult,
	ITreeSubscriptionCursor,
	ITreeSubscriptionCursorState,
	FieldAnchor,
} from "../../core";
import { ProxyContext } from "./editableTreeContext";

/**
 * This is a base class for `NodeProxyTarget` and `FieldProxyTarget`, which uniformly handles cursors and anchors.
 */
export abstract class ProxyTarget<T extends Anchor | FieldAnchor> {
	private readonly lazyCursor: ITreeSubscriptionCursor;

	public constructor(
		public readonly context: ProxyContext,
		cursor: ITreeSubscriptionCursor,
		private anchor?: T,
	) {
		this.lazyCursor = cursor.fork();
		context.withCursors.add(this);
		if (anchor !== undefined) {
			this.context.withAnchors.add(this);
		}
	}

	public free(): void {
		this.lazyCursor.free();
		this.context.withCursors.delete(this);
		if (this.anchor !== undefined) {
			this.forgetAnchor(this.anchor);
			this.context.withAnchors.delete(this);
			this.anchor = undefined;
		}
	}

	public getAnchor(): T {
		if (this.anchor === undefined) {
			this.anchor = this.buildAnchor();
			this.context.withAnchors.add(this);
		}
		return this.anchor;
	}

	public prepareForEdit(): void {
		this.getAnchor();
		this.lazyCursor.clear();
		this.context.withCursors.delete(this);
	}

	public get cursor(): ITreeSubscriptionCursor {
		if (this.lazyCursor.state !== ITreeSubscriptionCursorState.Current) {
			assert(
				this.lazyCursor.state === ITreeSubscriptionCursorState.Cleared,
				"Unset cursor should be in cleared state",
			);
			assert(
				this.anchor !== undefined,
				0x3c3 /* EditableTree should have an anchor if it does not have a cursor */,
			);
			const result = this.tryMoveCursorToAnchor(this.anchor, this.lazyCursor);
			assert(
				result === TreeNavigationResult.Ok,
				0x3c4 /* It is invalid to access an EditableTree node which no longer exists */,
			);
			this.context.withCursors.add(this);
		}
		return this.lazyCursor;
	}

	protected abstract buildAnchor(): T;

	protected abstract tryMoveCursorToAnchor(
		anchor: T,
		cursor: ITreeSubscriptionCursor,
	): TreeNavigationResult;

	/**
	 * Called when disposing of this target, iff it has an anchor.
	 */
	protected abstract forgetAnchor(anchor: T): void;
}
