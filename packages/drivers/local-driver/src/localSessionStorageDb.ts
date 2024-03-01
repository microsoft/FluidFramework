/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { EventEmitter } from "@fluid-internal/client-utils";
import { ICollection, IDb } from "@fluidframework/server-services-core";
import { ITestDbFactory } from "@fluidframework/server-test-utils";
import { v4 as uuid } from "uuid";

/**
 * A collection for local session storage, where data is stored in the browser
 * Functions include database operations such as queries, insertion and update.
 */
class LocalSessionStorageCollection<T> implements ICollection<T> {
	/**
	 * @param collectionName - data type of the collection, e.g. blobs, deltas, trees, etc.
	 */
	constructor(private readonly collectionName: string) {}

	public aggregate(pipeline: any, options?: any): any {
		throw new Error("Method Not Implemented");
	}

	public async updateMany(filter: any, set: any, addToSet: any): Promise<void> {
		throw new Error("Method Not Implemented");
	}
	public async distinct(key: any, query: any): Promise<any> {
		throw new Error("Method Not Implemented");
	}
	public async findAndUpdate(query: any, value: T): Promise<{ value: T; existing: boolean }> {
		throw new Error("Method not implemented.");
	}

	/**
	 * {@inheritDoc @fluidframework/server-services-core#ICollection.find}
	 */
	/*
	 * Each query key consists of several keys separated by '.' e.g: "operation.sequenceNumber".
	 * The hierarchical syntax allows finding nested key patterns.
	 */
	public async find(query: any, sort: any): Promise<any[]> {
		// split the keys and get the corresponding value
		function getValueByKey(propertyBag, key: string) {
			const keys = key.split(".");
			let value = propertyBag;
			keys.forEach((splitKey) => {
				value = value[splitKey];
			});
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return value;
		}

		// getting keys of the query we are trying to find
		const queryKeys = Object.keys(query);
		let filteredCollection = this.getAllInternal();
		queryKeys.forEach((key) => {
			if (!query[key]) {
				return;
			}
			if (query[key].$gt > 0 || query[key].$lt > 0) {
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
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return filteredCollection;
	}

	/**
	 * {@inheritDoc @fluidframework/server-services-core#ICollection.findAll}
	 */
	public async findAll(): Promise<any[]> {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return this.getAllInternal();
	}

	/**
	 * {@inheritDoc @fluidframework/server-services-core#ICollection.findOne}
	 */
	/*
	 * Query is expected to have a member "_id" which is a string used to find value in the database.
	 */
	public async findOne(query: any): Promise<any> {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return this.findOneInternal(query);
	}

	/**
	 * {@inheritDoc @fluidframework/server-services-core#ICollection.update}
	 */
	/*
	 * Query is expected to have a member "_id" which is a string used to find value in the database.
	 */
	public async update(query: any, set: any, addToSet: any): Promise<void> {
		const value = this.findOneInternal(query);
		if (!value) {
			throw new Error("Not found");
		} else {
			for (const key of Object.keys(set)) {
				value[key] = set[key];
			}
			this.insertInternal(value);
		}
	}

	/**
	 * {@inheritDoc @fluidframework/server-services-core#ICollection.upsert}
	 */
	/*
	 * Query is expected to have a member "_id" which is a string used to find value in the database.
	 */
	public async upsert(query: any, set: any, addToSet: any): Promise<void> {
		const value = this.findOneInternal(query);
		if (!value) {
			this.insertInternal(set);
		} else {
			for (const key of Object.keys(set)) {
				value[key] = set[key];
			}
			this.insertInternal(value);
		}
	}

	/**
	 * {@inheritDoc @fluidframework/server-services-core#ICollection.insertOne}
	 */
	/*
	 * Value is expected to have a member "_id" which is a string used to search in the database.
	 */
	public async insertOne(value: any): Promise<any> {
		const presentVal = this.findOneInternal(value);
		// Only raise error when the object is present and the value is not equal.
		if (presentVal) {
			if (JSON.stringify(presentVal) === JSON.stringify(value)) {
				return;
			}
			throw new Error("Existing Object!!");
		}

		return this.insertInternal(value);
	}

	/**
	 * {@inheritDoc @fluidframework/server-services-core#ICollection.findOrCreate}
	 */
	/*
	 * Value and query are expected to have a member "_id" which is a string used to search or insert in the database.
	 */
	public async findOrCreate(query: any, value: any): Promise<{ value: any; existing: boolean }> {
		const existing = this.findOneInternal(query);
		if (existing) {
			return { value: existing, existing: true };
		}
		this.insertInternal(value);
		return { value, existing: false };
	}

	/**
	 * {@inheritDoc @fluidframework/server-services-core#ICollection.insertMany}
	 */
	/*
	 * Each element in values is expected to have a member "_id" which is a string used to insert in the database.
	 */
	public async insertMany(values: any[], ordered: boolean): Promise<void> {
		this.insertInternal(...values);
	}

	/**
	 * {@inheritDoc @fluidframework/server-services-core#ICollection.deleteOne}
	 */
	public async deleteOne(query: any): Promise<any> {
		throw new Error("Method not implemented.");
	}

	/**
	 * {@inheritDoc @fluidframework/server-services-core#ICollection.deleteMany}
	 */
	public async deleteMany(query: any): Promise<any> {
		throw new Error("Method not implemented.");
	}

	/**
	 * {@inheritDoc @fluidframework/server-services-core#ICollection.createIndex}
	 */
	public async createIndex(index: any, unique: boolean): Promise<void> {
		throw new Error("Method not implemented.");
	}

	/**
	 * Return all values in the database
	 */
	private getAllInternal(): any[] {
		const values: string[] = [];
		for (let i = 0; i < sessionStorage.length; i++) {
			const key = sessionStorage.key(i);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			if (key!.startsWith(this.collectionName)) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				values.push(JSON.parse(sessionStorage.getItem(key!)!));
			}
		}
		return values;
	}

	/**
	 * Inserts values into the session storge.
	 * Values are expected to have a member "_id" which is a unique id, otherwise will be assigned one
	 *
	 * @param values - data to insert to the database
	 */
	private insertInternal(...values: any[]) {
		for (const value of values) {
			if (value) {
				if (!value._id) {
					value._id = uuid();
				}
				sessionStorage.setItem(
					`${this.collectionName}-${value._id}`,
					JSON.stringify(value),
				);
			}
		}
	}

	/**
	 * Finds the query in session storage and returns its value.
	 * Returns null if query is not found.
	 * Query is expected to have a member "_id" which is a unique id.
	 *
	 * @param query - what to find in the database
	 */
	private findOneInternal(query: any): any {
		if (query._id) {
			const json = sessionStorage.getItem(`${this.collectionName}-${query._id}`);
			if (json) {
				return JSON.parse(json);
			}
		} else {
			const queryKeys = Object.keys(query);
			for (let i = 0; i < sessionStorage.length; i++) {
				const ssKey = sessionStorage.key(i);
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				if (!ssKey!.startsWith(this.collectionName)) {
					continue;
				}
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const value = JSON.parse(sessionStorage.getItem(ssKey!)!);
				let foundMismatch = false;
				for (const qk of queryKeys) {
					if (value[qk] !== query[qk]) {
						foundMismatch = true;
						break;
					}
				}

				if (!foundMismatch) {
					return value;
				}
			}
		}
		return null;
	}
}

/**
 * A database for testing that stores data in the browsers session storage
 */
class LocalSessionStorageDb extends EventEmitter implements IDb {
	private readonly collections = new Map<string, LocalSessionStorageCollection<any>>();
	public async close(): Promise<void> {}
	public collection<T>(name: string): ICollection<T> {
		if (!this.collections.has(name)) {
			this.collections.set(name, new LocalSessionStorageCollection<T>(name));
		}
		return this.collections.get(name) as LocalSessionStorageCollection<T>;
	}

	public async dropCollection(name: string): Promise<boolean> {
		if (!this.collections.has(name)) {
			return true;
		}
		this.collections.delete(name);
		return true;
	}
}

/**
 * A database factory for testing that stores data in the browsers session storage
 * @internal
 */
export class LocalSessionStorageDbFactory implements ITestDbFactory {
	public readonly testDatabase: IDb = new LocalSessionStorageDb();
	public async connect(): Promise<IDb> {
		return this.testDatabase;
	}
}
