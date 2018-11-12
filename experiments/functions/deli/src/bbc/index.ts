import * as services from "@prague/routerlicious/dist/services";
import { Provider } from "nconf";
import { IPartitionLambdaFactory } from "../kafka-service/lambdas";
import { BBCLambdaFactory } from "./lambdaFactory";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const redisConfig = config.get("redis");
    const publisher = new services.SocketIoRedisPublisher(redisConfig.port, redisConfig.host);

    return new BBCLambdaFactory(publisher);
}
