import * as _ from "lodash";
import * as nconf from "nconf";
import * as path from "path";
import * as redis from "redis";
import * as socketIo from "socket.io";
import * as socketIoRedis from "socket.io-redis";
import * as util from "util";
import * as winston from "winston";
import * as utils from "../utils";
import { TmzRunner } from "./runner";

const provider = nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config/config.json")).use("memory");

// Configure logging
utils.configureLogging(provider.get("logger"));

async function run() {
    // Setup Kafka connection
    const kafkaEndpoint = provider.get("kafka:lib:endpoint");
    const kafkaLibrary = provider.get("kafka:lib:name");
    const topic = provider.get("tmz:topic");
    const groupId = provider.get("tmz:groupId");

    // Setup redis for socketio
    let io = socketIo();

    let host = nconf.get("redis:host");
    let redisPort = nconf.get("redis:port");
    let pass = nconf.get("redis:pass");

    let options: any = { auth_pass: pass };
    if (nconf.get("redis:tls")) {
        options.tls = {
            servername: host,
        };
    }

    let pubOptions = _.clone(options);
    let subOptions = _.clone(options);

    let pub = redis.createClient(redisPort, host, pubOptions);
    let sub = redis.createClient(redisPort, host, subOptions);
    io.adapter(socketIoRedis({ pubClient: pub, subClient: sub }));

    // setup state manager and work manager.
    let port = provider.get("tmz:port");
    const checkerTimeout = provider.get("tmz:timeoutMSec:checker");
    const schedulerType = provider.get("tmz:workerType");
    const onlyServer = provider.get("tmz:onlyServer");

    let consumer = utils.kafkaConsumer.create(kafkaLibrary, kafkaEndpoint, groupId, topic, true);

    const runner = new TmzRunner(
        io,
        port,
        consumer,
        schedulerType,
        onlyServer,
        checkerTimeout);

    process.on("SIGTERM", () => {
        runner.stop();
    });

    // Start the service
    const runningP = runner.start();

    // Clean up all resources when the runner finishes
    const doneP = runningP.catch((error) => error);
    const closedP = doneP.then(() => {
        const consumerClosedP = consumer.close();
        const socketIoP = util.promisify(((callback) => io.close(callback)) as Function)();
        const pubP = util.promisify(((callback) => pub.quit(callback)) as Function)();
        const subP = util.promisify(((callback) => sub.quit(callback)) as Function)();

        return Promise.all([consumerClosedP, socketIoP, pubP, subP]);
    });

    return Promise.all([runningP, closedP]);
}

// Start up the TMZ service
winston.info("Starting");
const runP = run();
runP.then(
    () => {
        winston.info("Exiting");
    },
    (error) => {
        winston.error(error);
        process.exit(1);
    });
