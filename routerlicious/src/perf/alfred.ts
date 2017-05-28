import * as _ from "lodash";
import * as nconf from "nconf";
import * as path from "path";
import * as socketIoEmitter from "socket.io-emitter";

import * as redis from "redis";
import * as msgpack from "msgpack-lite"

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

const chunkSize = nconf.get("perf:chunkSize");

// Initialize Socket.io and connect to the Redis adapter
let redisConfig = nconf.get("redis");
let io = socketIoEmitter(({ host: redisConfig.host, port: redisConfig.port }));
io.redis.on("error", (error) => {
    console.error(`Error with socket io emitter: ${error}`);
});


// Setup redis client
let host = nconf.get("redis:host");
let port = nconf.get("redis:port");
let pass = nconf.get("redis:pass");

let options: any = { auth_pass: pass, return_buffers: true };
if (nconf.get("redis:tls")) {
    options.tls = {
        servername: host,
    };
}
let subOptions = _.clone(options);

// Subscriber to read from redis directly.
let sub = redis.createClient(port, host, subOptions);


console.log("Perf testing alfred...");
runTest();

const objectId = "test-document";

async function runTest() {
    console.log("Wait for 10 seconds to warm up kafka, zookeeper, and redis....");
    await sleep(10000);
    produce();
    await consume();
}

async function produce() {
    for (let i = 1; i <= chunkSize; ++i) {
        io.to(objectId).emit("op", objectId, "something");
    }
}

async function consume() {
    return new Promise<any>((resolve, reject) => {
        sub.on("message", function(channel, message) {
            let decodedMessage = msgpack.decode(message);
            console.log(`From receiver: ${JSON.stringify(decodedMessage)}`);
        });
        // Subscribing to specific redis channel for this document.
        sub.subscribe("socket.io#/#test-document#");
    });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
