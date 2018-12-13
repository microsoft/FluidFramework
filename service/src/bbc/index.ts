import { IPartitionLambdaFactory } from "@prague/services-core";
import { Provider } from "nconf";
import * as redis from "redis";
import { BBCLambdaFactory } from "./lambdaFactory";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const redisConfig = config.get("redis");
    const publisher = redis.createClient(redisConfig.port, redisConfig.host);

    return new BBCLambdaFactory(publisher);
}
