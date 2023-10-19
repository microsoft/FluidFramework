/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEmitter } from "tiny-typed-emitter";

import type { IInventoryItem, IInventoryItemEvents } from "../modelInterfaces";

/**
 * InventoryItem is the local object with the friendly interface for the view to use.
 * It binds to either legacy or new SharedTree by abstracting out how the values are
 * changed.
 */
export class InventoryItem extends TypedEmitter<IInventoryItemEvents> implements IInventoryItem {
	public get id() {
		return this._id;
	}
	public get name() {
		return this._name;
	}
	public get quantity() {
		return this._quantity;
	}
	public set quantity(newQuantity: number) {
		// Setting the quantity does not directly update the value, but rather roundtrips it through
		// the backing data by using the provided callback.  We trust that later this will result in
		// handleQuantityUpdate getting called when the true backing data changes.
		this._setQuantity(newQuantity);
	}
	/**
	 * handleQuantityUpdate is not available on IInventoryItem intentionally, since it should not be
	 * available to the view.  Instead it is to be called by the backing data when the true value
	 * of the data changes.
	 */
	public handleQuantityUpdate(newQuantity: number) {
		this._quantity = newQuantity;
		this.emit("quantityChanged");
	}
	public constructor(
		private readonly _id: string,
		private readonly _name: string,
		private _quantity: number,
		private readonly _setQuantity: (quantity: number) => void,
		public readonly deleteItem: () => void,
	) {
		super();
	}
}
