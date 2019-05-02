import { AzureFunction, Context as AzContext } from "@azure/functions";
import { BroadcasterLambda } from "@prague/lambdas";
import { IPartitionLambdaFactory, IPublisher, ITopic, IContext, IPartitionLambda } from "@prague/services-core";
import { Provider } from "nconf";
import * as redis from "redis";
import * as socketIoEmitter from "socket.io-emitter";
import { Context, processAll, settings } from "../common";
import { EventEmitter } from "events";
import * as util from "util";

class SocketIoRedisTopic implements ITopic {
    constructor(private topic: any) {
    }

    public emit(event: string, ...args: any[]) {
        this.topic.emit(event, ...args);
    }
}

class SocketIoRedisPublisher implements IPublisher {
    private redisClient: redis.RedisClient;
    private io: any;
    private events = new EventEmitter();

    // TODO update the publisher to support SSL
    constructor(port: number, host: string, key: string) {
        console.log(`${host} ${port} ${key}`)
        this.redisClient = redis.createClient(
            port,
            host,
            {
                auth_pass: key,
                tls: {
                    servername: host
                }
            });
        this.io = socketIoEmitter(this.redisClient);

        this.redisClient.on("error", (error) => {
            this.events.emit("error", error);
        });
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.events.on(event, listener);
    }

    public to(topic: string): ITopic {
        // NOTE - socket.io-emitter maintains local state during an emit request so we cannot cache the result of
        // doing a to, etc...
        return new SocketIoRedisTopic(this.io.to(topic));
    }

    public close(): Promise<void> {
        return util.promisify(((callback) => this.redisClient.quit(callback)) as any)();
    }
}

class BroadcasterLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(private io: SocketIoRedisPublisher) {
        super();

        this.io.on("error", (error) => {
            // After an IO error we need to recreate the lambda
            this.emit("error", error);
        });
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        return new BroadcasterLambda(this.io, context);
    }

    public async dispose(): Promise<void> {
        // TODO IPublisher needs a close/dispose method
        await this.io.close();
    }
}


async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const redisConfig = config.get("redis");
    const publisher = new SocketIoRedisPublisher(
        redisConfig.port,
        redisConfig.host,
        redisConfig.key);

    return new BroadcasterLambdaFactory(publisher);
}

let lookup = new Map<string, { lambda: IPartitionLambda, context: Context }>();
let lastContext: AzContext;

const lambda: AzureFunction = async (context, eventHubMessages) => {
    lastContext = context;
    const config = (new Provider({})).defaults(settings).use("memory");

    context.log("Hello!");

    const partitionContext = context.bindingData.partitionContext;
    const partitionId = partitionContext.runtimeInformation.partitionId;

    if (!lookup.has(partitionId)) {
        context.log(`Can't find ${partitionId}`);
        const pragueContext = new Context(context);
        context.log(`Creating deli factory`);
        const broadcaster = await create(config);
        context.log(`Creating partition`);
        const newLambda = await broadcaster.create(config, pragueContext);
        context.log(`Ready to do stuff`);
        lookup.set(partitionId, { lambda: newLambda, context: pragueContext });
    } else {
        context.log(`Active and reusing!`);    
        lookup.get(partitionId).context.updateContext(context);
    }

    const broadcasterLambda = lookup.get(partitionId).lambda;
    const pragueContext = lookup.get(partitionId).context;
    
    const sequenceNumberArray = context.bindingData.sequenceNumberArray;
    const target = sequenceNumberArray
        ? sequenceNumberArray[sequenceNumberArray.length - 1]
        : 0;
    context.log(`target = ${target}`);

    context.log(`JavaScript eventhub trigger function called for message array ${eventHubMessages}`);
    processAll(eventHubMessages, context, broadcasterLambda);
    await pragueContext.wait(target);
    context.log(`Done`);
};

export = lambda;
