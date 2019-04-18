// tslint:disable:max-classes-per-file
import * as core from "@prague/routerlicious/dist/core";
import * as services from "@prague/routerlicious/dist/services";
import * as utils from "@prague/routerlicious/dist/utils";
import * as fabric from "fabric-client";
import { Provider } from "nconf";
import * as path from "path";
import * as db from "./chainDb";
import { AlfredRunner } from "./runner";

export class AlfredResources implements utils.IResources {
    public webServerFactory: core.IWebServerFactory;

    constructor(
        public config: Provider,
        public redisConfig: any,
        public webSocketLibrary: string,
        public port: any,
        public chainDb: db.ChainDb) {

        this.webServerFactory = new services.SocketIoWebServerFactory(this.redisConfig);
    }

    public async dispose(): Promise<void> {
        return;
    }
}

export class AlfredResourcesFactory implements utils.IResourcesFactory<AlfredResources> {
    public async create(config: Provider): Promise<AlfredResources> {
        const client = new fabric();
        const peer = client.newPeer("grpc://localhost:7051");
        const order = client.newOrderer("grpc://localhost:7050");

        // setup the fabric network
        const channelId = config.get("channelId");
        const channel = client.newChannel(channelId);
        channel.addPeer(peer);
        channel.addOrderer(order);

        const storePath = path.join(__dirname, "../../hfc-key-store");
        const stateStore = await fabric.newDefaultKeyValueStore({ path: storePath });

        // assign the store to the fabric client
        client.setStateStore(stateStore);
        const cryptoSuite = fabric.newCryptoSuite();
        const cryptoStore = fabric.newCryptoKeyStore({ path: storePath });
        cryptoSuite.setCryptoKeyStore(cryptoStore);
        client.setCryptoSuite(cryptoSuite);

        const userId = config.get("userId");
        const memberUser = await client.getUserContext(userId, true);
        if (!memberUser || !memberUser.isEnrolled()) {
            return Promise.reject(`Failed to get ${userId}.... run registerUser.js`);
        }

        const webSocketLibrary = config.get("alfred:webSocketLib");
        const redisConfig = config.get("redis");

        const publisher = new services.SocketIoRedisPublisher(redisConfig.port, redisConfig.host);

        // This wanst to create stuff
        const port = utils.normalizePort(process.env.PORT || "3000");

        const chainDb = await db.init(client, channel, channelId, publisher);

        return new AlfredResources(
            config,
            redisConfig,
            webSocketLibrary,
            port,
            chainDb);
    }
}

export class AlfredRunnerFactory implements utils.IRunnerFactory<AlfredResources> {
    public async create(resources: AlfredResources): Promise<utils.IRunner> {
        return new AlfredRunner(
            resources.webServerFactory,
            resources.config,
            resources.port,
            resources.chainDb);
    }
}
