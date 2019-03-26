import { BroadcasterLambdaFactory } from "@prague/lambdas";
import * as services from "@prague/services";
import { IPartitionLambdaFactory } from "@prague/services-core";
import { Provider } from "nconf";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const redisConfig = config.get("redis");
    const publisher = new services.SocketIoRedisPublisher(redisConfig.port, redisConfig.host);

    return new BroadcasterLambdaFactory(publisher);
}
