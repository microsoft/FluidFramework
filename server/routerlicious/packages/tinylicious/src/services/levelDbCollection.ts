/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */

import { ICollection } from "@fluidframework/server-services-core";
import * as charwise from "charwise";
import * as _ from "lodash";

export interface ICollectionProperty {
	indexes: string[]; // Index structure for the collection.
	limit?: number; // Range query maximum fetch. If set, last index should be a number.
}

/**
 * Helper function to read a sublevel stream and return a promise for an array of the results.
 */
async function readStream<T>(stream): Promise<T[]> {
	const entries: T[] = [];

	return new Promise<T[]>((resolve, reject) => {
		stream.on("data", (data: T) => {
			entries.push(data);
		});

		stream.on("end", () => {
			resolve(entries);
		});

		stream.on("error", (error) => {
			reject(error);
		});
	});
}

export class Collection<T> implements ICollection<T> {
	constructor(
		private readonly db: any,
		private readonly property: ICollectionProperty,
	) {}

	public aggregate(pipeline: any, options?: any): any {
		throw new Error("Method Not Implemented");
	}

	public async updateMany(filter: any, set: any, addToSet: any): Promise<void> {
		throw new Error("Method Not Implemented");
	}
	public async distinct(key: any, query: any): Promise<any> {
		throw new Error("Method Not Implemented");
	}

	public async find(query: any, sort?: any): Promise<T[]> {
		return this.findInternal(query, sort);
	}

	public async findAll(): Promise<T[]> {
		return readStream(this.db.createValueStream());
	}

	// eslint-disable-next-line @rushstack/no-new-null
	public findOne(query: any): Promise<T | null> {
		return this.findOneInternal(query);
	}

	public async update(filter: any, set: any, addToSet: any): Promise<void> {
		const value = await this.findOneInternal(filter);
		if (!value) {
			throw new Error("Not found");
		} else {
			_.extend(value, set);
			return this.insertOne(value);
		}
	}

	public async findAndUpdate(query: any, value: any): Promise<{ value: any; existing: boolean }> {
		throw new Error("Method Not Implemented");
	}

	public async upsert(filter: any, set: any, addToSet: any): Promise<void> {
		const value = await this.findOneInternal(filter);
		if (!value) {
			return this.insertOne(set);
		} else {
			_.extend(value, set);
			return this.insertOne(value);
		}
	}

	public async insertOne(value: any): Promise<any> {
		return this.insertOneInternal(value);
	}

	public async findOrCreate(query: any, value: any): Promise<{ value: any; existing: boolean }> {
		const existing = await this.findOneInternal(query);
		if (existing) {
			return { value: existing, existing: true };
		} else {
			const item = await this.insertOneInternal(value);
			return { value: item, existing: false };
		}
	}

	public async insertMany(values: any[], ordered: boolean): Promise<void> {
		const batchValues: { type: "put"; key: string; value: any }[] = [];
		values.forEach((value) => {
			batchValues.push({
				type: "put",
				key: this.getKey(value),
				value,
			});
		});
		return this.db.batch(batchValues);
	}

	public async deleteOne(filter: any): Promise<any> {
		return this.db.del(this.getKey(filter));
	}

	// We should probably implement this.
	public async deleteMany(filter: any): Promise<any> {
		throw new Error("Method not implemented.");
	}

	public async createIndex(index: any, unique: boolean): Promise<void> {
		return;
	}

	private async insertOneInternal(value: any): Promise<any> {
		await new Promise<void>((resolve, reject) => {
			this.db.put(this.getKey(value), value, (error) => {
				if (error) {
					reject(error);
				} else {
					resolve();
				}
			});
		});

		return value;
	}

	private async findOneInternal(query: any): Promise<T | null> {
		const values = await this.findInternal(query);
		if (values.length <= 0) {
			return null;
		}
		return values[0];
	}

	// Generate an insertion key for a value based on index structure.
	private getKey(value: any) {
		function getValueByKey(propertyBag, key: string) {
			const keys = key.split(".");
			let v = propertyBag;
			keys.forEach((splitKey) => {
				v = v[splitKey];
			});
			return v;
		}

		const values: any[] = [];
		this.property.indexes.forEach((key) => {
			const innerValue = getValueByKey(value, key);
			// Leveldb does lexicographic comparison. We need to encode a number for numeric comparison.
			values.push(isNaN(innerValue) ? innerValue : charwise.encode(Number(innerValue)));
		});

		return values.join("!");
	}

	private async findInternal(query: any, sort?: any): Promise<T[]> {
		const isRange = this.property.limit !== undefined;
		const indexes = this.property.indexes;
		const indexLen = isRange ? indexes.length - 1 : indexes.length;
		const queryValues: any[] = [];
		for (let i = 0; i < indexLen; ++i) {
			const queryValue = query[indexes[i]];
			if (queryValue !== undefined) {
				queryValues.push(
					isNaN(queryValue) ? queryValue : charwise.encode(Number(queryValue)),
				);
			}
		}
		const key = queryValues.join("!");
		// Property limit check is redundant with `isRange` value, but it helps with type checking.
		if (isRange && this.property.limit !== undefined) {
			const rangeKey = indexes[indexes.length - 1];
			const from =
				query[rangeKey] && query[rangeKey].$gt > 0 ? Number(query[rangeKey].$gt) + 1 : 1;
			const to =
				query[rangeKey] && query[rangeKey].$lt > 0
					? Number(query[rangeKey].$lt) - 1
					: from + this.property.limit - 1;

			const gte = `${key}!${charwise.encode(Number(from))}`;
			const lte = `${key}!${charwise.encode(Number(to))}`;
			const valueStream = this.db.createValueStream({
				gte,
				lte,
				limit: this.property.limit,
			});

			return readStream(valueStream);
		} else {
			return new Promise<T[]>((resolve, reject) => {
				this.db.get(key, (err, val) => {
					if (err) {
						if (err.notFound) {
							resolve([]);
						} else {
							reject(err);
						}
					} else {
						resolve([val]);
					}
				});
			});
		}
	}
}
