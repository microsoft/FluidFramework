/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import { ICollection, IDb, IDbFactory } from "@fluidframework/server-services-core";
import * as _ from "lodash";

/**
 * @internal
 */
export class TestCollection implements ICollection<any> {
	constructor(public collection: any[]) {}

	public async aggregate(pipeline: any, options?: any) {
		throw new Error("Method not implemented.");
	}

	public async find(query: any, sort: any): Promise<any[]> {
		return this.findInternal(query, sort);
	}

	public async findAll(): Promise<any[]> {
		return this.collection;
	}

	public async findOne(query: any): Promise<any> {
		return this.findOneInternal(query);
	}

	public async update(filter: any, set: any, addToSet: any): Promise<void> {
		const value = this.findOneInternal(filter);
		if (!value) {
			throw new Error("Not found");
		}
		_.extend(value, set);
	}

	public async updateMany(filter: any, set: any, addToSet: any): Promise<void> {
		const values = this.findInternal(filter);
		values.forEach((value) => {
			if (!value) {
				throw new Error("Not found");
			}
			_.extend(value, set);
		});
	}

	public async upsert(filter: any, set: any, addToSet: any): Promise<void> {
		const value = this.findOneInternal(filter);
		if (!value) {
			this.collection.push(set);
		}

		_.extend(value, set);
	}

	public async insertOne(value: any): Promise<any> {
		if (this.findOneInternal(value) !== null) {
			return Promise.resolve("existing object");
		}

		return this.insertOneInternal(value);
	}

	public async findOrCreate(query: any, value: any): Promise<{ value: any; existing: boolean }> {
		const existing = this.findOneInternal(query);
		if (existing) {
			return { value: existing, existing: true };
		}

		return { value: this.insertOneInternal(value), existing: false };
	}

	public async findAndUpdate(query: any, value: any): Promise<{ value: any; existing: boolean }> {
		const existingValue = this.findOneInternal(query);
		if (!existingValue) {
			return { value: existingValue, existing: false };
		}
		this.removeOneInternal(existingValue);
		this.insertOneInternal(value);
		return { value: existingValue, existing: true };
	}

	public async insertMany(values: any[], ordered: boolean): Promise<void> {
		values.forEach((value) => {
			this.collection.push(value);
		});
	}

	public async deleteOne(filter: any): Promise<any> {
		const value = this.findOneInternal(filter);
		this.removeOneInternal(value);
		return value;
	}

	public async deleteMany(filter: any): Promise<any[]> {
		const values = this.findInternal(filter);
		values.forEach((value) => {
			this.removeOneInternal(value);
		});
		return values;
	}

	public async distinct(key: any, filter: any): Promise<any> {
		throw new Error("Method not implemented.");
	}

	public async createIndex(index: any, unique: boolean): Promise<void> {
		throw new Error("Method not implemented.");
	}

	private insertOneInternal(value: any): any {
		this.collection.push(value);
		return value;
	}

	private removeOneInternal(value: any): void {
		const index = this.collection.indexOf(value);
		if (index >= 0) {
			this.collection.splice(index, 1);
		}
	}

	private findOneInternal(query: any): any {
		let returnValue: any;
		if (query._id) {
			returnValue = this.collection.find((value) => value._id === query._id);
		} else {
			const found = this.findInternal(query);
			returnValue = found[0];
		}
		return returnValue === undefined ? null : returnValue;
	}

	private findInternal(query: any, sort?: any): any[] {
		function getValueByKey(propertyBag, key: string) {
			const keys = key.split(".");
			let value = propertyBag;
			keys.forEach((splitKey) => {
				value = value[splitKey];
			});
			return value;
		}

		const queryKeys = Object.keys(query);
		let filteredCollection = this.collection;
		queryKeys.forEach((key) => {
			if (!query[key]) {
				return;
			}
			if (query[key].$gt > 0 || query[key].$lt > 0 || query[key].$lte > 0) {
				if (query[key].$gt > 0) {
					filteredCollection = filteredCollection.filter(
						(value) => getValueByKey(value, key) > query[key].$gt,
					);
				}
				if (query[key].$lt > 0) {
					filteredCollection = filteredCollection.filter(
						(value) => getValueByKey(value, key) < query[key].$lt,
					);
				}
				if (query[key].$lte > 0) {
					filteredCollection = filteredCollection.filter(
						(value) => getValueByKey(value, key) <= query[key].$lte,
					);
				}
			} else {
				filteredCollection = filteredCollection.filter(
					(value) => getValueByKey(value, key) === query[key],
				);
			}
		});

		if (sort && Object.keys(sort).length === 1) {
			// eslint-disable-next-line no-inner-declarations
			function compare(a, b) {
				const sortKey = Object.keys(sort)[0];
				return sort[sortKey] === 1
					? getValueByKey(a, sortKey) - getValueByKey(b, sortKey)
					: getValueByKey(b, sortKey) - getValueByKey(a, sortKey);
			}

			filteredCollection = filteredCollection.sort(compare);
		}
		return filteredCollection;
	}
}

/**
 * @internal
 */
export class TestDb implements IDb {
	private readonly emitter = new EventEmitter();

	constructor(private collections: { [key: string]: any[] }) {}

	public async close(): Promise<void> {}

	public on(event: string, listener: (...args: any[]) => void) {
		this.emitter.on(event, listener);
	}

	public collection<T>(name: string): ICollection<T> {
		if (!(name in this.collections)) {
			this.collections[name] = [];
		}

		const collection = this.collections[name];
		return new TestCollection(collection);
	}

	public async dropCollection(name: string): Promise<boolean> {
		if (!Object.prototype.hasOwnProperty.call(this.collections, name)) {
			return true;
		}

		// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
		delete this.collections[name];
		return true;
	}
}

/**
 * @alpha
 */
export interface ITestDbFactory extends IDbFactory {
	readonly testDatabase: IDb;
}

/**
 * @internal
 */
export class TestDbFactory implements ITestDbFactory {
	public readonly testDatabase: IDb;
	constructor(collections: { [key: string]: any[] }) {
		this.testDatabase = new TestDb(collections);
	}

	public async connect(): Promise<IDb> {
		return this.testDatabase;
	}
}
