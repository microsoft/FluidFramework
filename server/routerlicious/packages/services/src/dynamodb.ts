/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { assert } from "console";
import * as core from "@fluidframework/server-services-core";
import * as charwise from "charwise";
import {
    DynamoDB as DynamoDBClient, DynamoDBClientConfig,
} from "@aws-sdk/client-dynamodb";
import {
    BatchWriteCommandInput, DynamoDBDocument, QueryCommandInput,
    QueryCommandOutput, TranslateConfig,
} from "@aws-sdk/lib-dynamodb";
import { isEmpty, extend, isObject } from "lodash";

const UNUSED_RANGE_KEY = "UNUSED";
const MaxFetchSize = 500;
const MaxBatchSize = 25;

interface IQueryFragment { Key?: string, ConditionFragment: string, AttributeValuesFragment: Record<string, string> }

export interface IDynamoDBCollectionOptions {
    // table in which the collection lives
    table_name: string,
    // definition of how to compose the partition key
    partition_index: {
        // partition key prefix
        prefix: string,
        // sequence of keys for which the values of the inserted object serve to compose
        // the partition key
        index: string[],
    }
    // the key of the range index, if undefined a default constant is used
    range_index?: string,
    limit?: number
}
export interface IDynamoDBOptions {
    table_name: string,
}
export class DynamoDBCollection<T> implements core.ICollection<T> {
    constructor(private readonly client: DynamoDBDocument, private readonly options: IDynamoDBCollectionOptions) {

    }
    aggregate(group: any, options?: any) {
        throw new Error("Method 'aggregate' not implemented.");
    }

    async distinct(key: any, query: any): Promise<any> {
        throw new Error("Method 'distinct' not implemented.");
    }

    async find(filter: any, _sort: any): Promise<T[]> {
        const { partition_key, range_key } = this.compose_key_fragments(filter);

        const results = await this.make_query({
            ExpressionAttributeValues:
                { ...partition_key.AttributeValuesFragment, ...range_key.AttributeValuesFragment },
            TableName: this.options.table_name,
            KeyConditionExpression: `${partition_key.ConditionFragment} and ${range_key.ConditionFragment}`,
        }, true);

        const items = results
            .map((result: any) => { return (result.Items || []).map((item) => { return item.content as T; }) as T[]; });

        return ([] as T[]).concat(...items);
    }

    async findOne(filter: any): Promise<T> {
        const value = await this.findOneInternal(filter);
        return value || null;
    }

    async findAll(): Promise<T[]> {
        // A scan is costly in dynamodb probably should have a GSI if this is necessary
        // to fetch the whole collection for now this throws
        throw new Error("Method 'findAll' not implemented.");

        // const result = await this.client.scan(
        //     {
        //         TableName: this.options.table_name,
        //         FilterExpression: "begins_with(pk,:pk)",
        //         ExpressionAttributeValues: { ":pk": this.options.partition_index.prefix },
        //     });
        // return (result.Items || []).map((item) => { return item.content as T; });
    }

    async findOrCreate(query: any, value: T): Promise<{ value: T, existing: boolean }> {
        const { partition_key, range_key } = this.compose_key_fragments(query);

        const derived_partition_key = this.compose_partition_key(value);
        const derived_range_key = this.getRangeKeyFromValue(value);

        if (partition_key.Key !== derived_partition_key.Key || range_key.Key !== derived_range_key) {
            throw new Error("Provided query and from value derived query are different");
        }

        const found = await this.findOneInternal(query);

        if (found) {
            return { value: found, existing: true };
        } else {
            await this.insertOneInternal(value);
            return { value, existing: false };
        }
    }

    async update(filter: any, set: any, addToSet: any): Promise<void> {
        // addToSet is currently not used in the codebase except for testHistorian.ts
        if (!isEmpty(addToSet)) {
            throw new Error("Not implemented addToSet");
        }
        // TODO: this can probably done with an update expression in dynamodb to avoid two calls to dynamodb
        const value = await this.findOneInternal(filter);
        if (!value) {
            return Promise.reject(new Error("Item not found"));
        } else {
            extend(value, set);
            return this.insertOneInternal(value);
        }
    }
    async updateMany(filter: any, set: any, addToSet: any): Promise<void> {
        const values = await this.find(filter, undefined);
        values.forEach((value) => { extend(value, set); });
        await this.insertMany(values, false);
    }
    async upsert(filter: any, set: any, addToSet: any): Promise<void> {
        // addToSet is currently not used in the codebase except for testHistorian.ts
        if (!isEmpty(addToSet)) {
            throw new Error("Not implemented addToSet");
        }
        // TODO: this can probably done with an update expression in dynamodb to avoid two calls to dynamodb
        const value = await this.findOneInternal(filter);
        if (!value) {
            return this.insertOneInternal(set);
        } else {
            extend(value, set);
            return this.insertOneInternal(value);
        }
    }

    async insertOne(value: T): Promise<any> {
        return this.insertOneInternal(value);
    }

    private chunkArray(commands: any[]): any[][] {
        const result: (T[])[] = [];
        for (let i = 0; i < commands.length; i += MaxBatchSize) {
            const chunk = commands.slice(i, i + MaxBatchSize);
            result.push(chunk);
        }
        return result;
    }

    async insertMany(values: T[], _ordered: boolean): Promise<void> {
        const puts = values.map((val) => {
            const { Key } = this.compose_partition_key(val);
            const range_key = this.getRangeKeyFromValue(val);
            const v = val as any;
            // input value contains a mongoTimestamp field which is a Date object, we convert
            // it to a string for DynamoDB to handle this
            if (v.mongoTimestamp) {
                v.mongoTimestamp = (v.mongoTimestamp as Date).toString();
            }
            return { PutRequest: { Item: { content: val, pk: Key, sk: range_key } } };
        });

        const putsChunks = this.chunkArray(puts);

        const batchWrites = putsChunks.map((chunk) => {
            const cmd: BatchWriteCommandInput = {
                RequestItems: {
                    [this.options.table_name]: chunk,
                },
            };
            return cmd;
        });

        for (const batch of batchWrites) {
            await this.client.batchWrite(batch);
        }
    }

    async deleteOne(filter: any): Promise<any> {
        const { Key } = this.compose_partition_key(filter);
        const range_key = this.compose_range_key_fragment(filter);

        return this.client.delete({
            TableName: this.options.table_name,
            Key: {
                pk: Key, sk: range_key.Key,
            },
        });
    }

    async deleteMany(filter: any): Promise<any> {
        const values = await this.find(filter, undefined);
        const deletes = values.map((val) => {
            const { Key } = this.compose_partition_key(val);
            const range_key = this.getRangeKeyFromValue(val);
            return { DeleteRequest: { Key: { pk: Key, sk: range_key } } };
        });
        const deletesChunks = this.chunkArray(deletes);

        const batchDeletes = deletesChunks.map((chunk) => {
            const cmd: BatchWriteCommandInput = {
                RequestItems: {
                    [this.options.table_name]: chunk,
                },
            };
            return cmd;
        });

        for (const batch of batchDeletes) {
            await this.client.batchWrite(batch);
        }
    }

    async createIndex(index: any, unique: boolean): Promise<void> {
        // Dynamic Index as in MongoDB are not supported so we need to create them beforehand
        // That means this op is a noop as long as we dont call it with an index not yet created
        // we could create one just by calling it with a new partition index definition and start inserting new items
        // as long as the range key is a string (or a number if that is changed)
    }

    private async make_query(command: QueryCommandInput, unwrap_pages: boolean): Promise<QueryCommandOutput[]> {
        const results: QueryCommandOutput[] = [];

        let last_key;
        do {
            command.ExclusiveStartKey = last_key;
            const result = await this.client.query(command);
            last_key = result.LastEvaluatedKey;
            results.push(result);
        } while (last_key && unwrap_pages);

        return results;
    }

    /**
     * Composes a partition key for dynamodb based on the query
     * @param filter filter
     * @returns
     */
    private compose_partition_key(filter: any): IQueryFragment {
        // key is based on {PREFIX#something#other}
        // prefixing it with the collection type based on
        // https://aws.amazon.com/blogs/database/choosing-the-right-dynamodb-partition-key/
        // prefixing the partition key as well
        const { prefix, index } = this.options.partition_index;
        const key = [
            prefix,
            ...index.map(
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                (i) => filter[i]).map((item) => (isNaN(item) ? item : charwise.encode(item)) as string)].join("#");

        return {
            ConditionFragment: "pk =:partition_key",
            AttributeValuesFragment: { ":partition_key": key },
            Key: key,
        };
    }

    private getRangeKeyFromValue(propertyBag: any): string {
        const range_index = this.range_index;
        if (range_index === UNUSED_RANGE_KEY) {
            return UNUSED_RANGE_KEY;
        }
        const keys = this.range_index.split(".");
        let v = propertyBag;
        keys.forEach((splitKey) => {
            v = v[splitKey];
        });
        // TODO(marcus): do we have to do this, are all possible usages of range_keys
        // here numbers then we dont need to build this string solution and encode it with charwise
        return (isNaN(v) ? v : charwise.encode(v)) as string;
    }

    private async insertOneInternal(value: any): Promise<void> {
        const { Key } = this.compose_partition_key(value);
        const range_key = this.getRangeKeyFromValue(value);

        // input value contains a mongoTimestamp field which is a Date object, we convert
        // it to a string for DynamoDB to handle this
        if (value.mongoTimestamp) {
            value.mongoTimestamp = (value.mongoTimestamp as Date).toString();
        }
        // eslint-disable-next-line no-useless-catch
        try {
            await this.client.put({
                TableName: this.options.table_name,
                Item: {
                    pk: Key, sk: range_key,
                    content: value,
                },
                // mongodb implementation seems of overwrite entries if they already exist
                // as a consequence this condition is disabled fo rnow
                // ConditionExpression: "attribute_not_exists(pk)",
            });
        } catch (error: any) {
            // disabled, see comment above
            // if (error.name === "ConditionalCheckFailedException") {
            //   throw new Error("Cannot insert, item already exists");
            // } else {
            throw error;
            // }
        }
    }

    private async findOneInternal(filter: any): Promise<T | null> {
        const { partition_key, range_key } = this.compose_key_fragments(filter);
        const results = await this.make_query({
            ExpressionAttributeValues:
                { ...partition_key.AttributeValuesFragment, ...range_key.AttributeValuesFragment },
            TableName: this.options.table_name,
            KeyConditionExpression: `${partition_key.ConditionFragment} and ${range_key.ConditionFragment}`,
            Limit: 1,
        }, false);

        const values = (results[0].Items || []).map((item) => { return item.content as T; });
        return values.length > 0 ? values[0] : null;
    }

    private compose_range_key_fragment(obj: any): IQueryFragment {
        const key = this.range_index === UNUSED_RANGE_KEY ? UNUSED_RANGE_KEY : obj[this.range_index] || {};
        // If this is a ranged query and we have a ranged request
        if (this.options.limit && isObject(key)) {
            const range = key as any;
            const from = range && range.$gt > 0 ?
                Number(range.$gt) + 1 :
                1;
            const to = range && range.$lt > 0 ?
                Number(range.$lt) - 1 :
                from + this.options.limit - 1;
            return {
                ConditionFragment: "sk between :start and :end",
                AttributeValuesFragment: { ":start": charwise.encode(from), ":end": charwise.encode(to) },
            };
        } else {
            const Key = isNaN(key) ? key : charwise.encode(key);
            return {
                Key,
                ConditionFragment: "sk = :sk",
                AttributeValuesFragment: { ":sk": Key },
            };
        }
    }

    private compose_key_fragments(value: any): { partition_key: IQueryFragment, range_key: IQueryFragment } {
        const partition_key = this.compose_partition_key(value);
        const range_key = this.compose_range_key_fragment(value);
        return { partition_key, range_key };
    }

    private get range_index(): string {
        return this.options.range_index === undefined ? UNUSED_RANGE_KEY : this.options.range_index;
    }
}

export class DynamoDB extends EventEmitter implements core.IDb {
    constructor(private readonly client: DynamoDBDocument, private readonly options: IDynamoDBOptions) {
        // e.g https://mongodb.github.io/node-mongodb-native/4.1/classes/MongoClient.html#on event keys
        super();
    }

    public async close(): Promise<void> {
        this.client.destroy();
        this.emit("close");
    }

    public collection<T>(name: string): core.ICollection<T> {
        return new DynamoDBCollection<T>(this.client, this.getCollectionIndexes(name));
    }
    /**
     * Returns predefined options for querying specific collections in dynamodb, consisting of partition / range keys
     * as well as the table name in which the collection is located
     * @param name
     * @returns
     */
    private getCollectionIndexes(name: string): IDynamoDBCollectionOptions {
        switch (name) {
            case "deltas":
                return {
                    table_name: this.options.table_name,
                    partition_index: {
                        prefix: "DELTAS",
                        index: ["tenantId", "documentId"],
                    },
                    range_index: "operation.sequenceNumber",
                    limit: MaxFetchSize,
                };
            case "rawdeltas":
                return {
                    table_name: this.options.table_name,
                    partition_index: {
                        prefix: "RAWDELTAS",
                        index: ["tenantId", "documentId"],
                    },
                    range_index: "index",
                    limit: MaxFetchSize,
                };
            case "documents":
                return {
                    table_name: this.options.table_name,
                    partition_index: {
                        prefix: "DOCUMENTS",
                        index: ["tenantId", "documentId"],
                    },
                };
            case "nodes":
                return {
                    table_name: this.options.table_name,
                    partition_index: {
                        prefix: "NODES",
                        index: ["_id"],
                    },
                };
            case "scribeDeltas":
                return {
                    table_name: this.options.table_name,
                    partition_index: {
                        prefix: "SCRIBEDELTAS",
                        index: ["tenantId", "documentId"],
                    },
                    range_index: "operation.sequenceNumber",
                    limit: MaxFetchSize,
                };
            case "content":
                return {
                    table_name: this.options.table_name,
                    partition_index: {
                        prefix: "CONTENT",
                        index: ["tenantId", "documentId"],
                    },
                    range_index: "sequenceNumber",
                    limit: MaxFetchSize,
                };
            case "tenants":
                return {
                    table_name: this.options.table_name,
                    partition_index: {
                        prefix: "TENANTS",
                        index: ["_id"],
                    },
                };
            case "reservations":
                return {
                    table_name: this.options.table_name,
                    partition_index: {
                        prefix: "TENANTS",
                        index: ["_id"],
                    },
                    range_index: "node",
                    limit: MaxFetchSize,
                };
            default:
                throw new Error(`Collection ${name} not implemented.`);
        }
    }
}

interface IDynamoDBConfig {
    endpoint: string,
    region: string,
    table: string,
}
export class DynamoDbFactory implements core.IDbFactory {
    private readonly endpoint: string;
    private readonly region: string;
    private readonly table_name: string;

    constructor(config: IDynamoDBConfig) {
        assert(!!config.endpoint, `No endpoint provided`);
        assert(!!config.region, `No region provided`);
        assert(!!config.table, `No table name proved`);

        this.endpoint = config.endpoint;
        this.region = config.region;
        this.table_name = config.table;
    }

    public async connect(): Promise<core.IDb> {
        const options: DynamoDBClientConfig = {

            endpoint: this.endpoint,
            region: this.region,
            maxAttempts: 10,
            // default retry strategy is exponential backoff
            // implemented by the AWS SDK
        };

        const config: TranslateConfig = {
            marshallOptions: {
                convertEmptyValues: true,
                removeUndefinedValues: true,
            },
        };

        const client = new DynamoDBClient(options);
        const document = DynamoDBDocument.from(client, config);

        return new DynamoDB(document, { table_name: this.table_name });
    }
}
