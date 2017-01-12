import * as _ from "lodash";
import * as nconf from "nconf";
import * as redis from "redis";
import * as richText from "rich-text";
import * as ShareDB from "sharedb";
import * as ShareDBMongo from "sharedb-mongo";
import * as ShareDBRedisPub from "sharedb-redis-pubsub";

// Prep redis operations
let redisHost = nconf.get("redis:host");
let redisPort = nconf.get("redis:port");
let redisPass = nconf.get("redis:pass");
let options: any = { auth_pass: redisPass };
if (nconf.get("redis:tls")) {
    options.tls = {
        servername: redisHost,
    };
}

let pubOptions = _.clone(options);
let subOptions = _.clone(options);
subOptions.return_buffers = true;

// Create the publish and subscribe redis connections
let client = redis.createClient(redisPort, redisHost, pubOptions);
let observer = redis.createClient(redisPort, redisHost, subOptions);

// Register rich type as one of our OT formats
ShareDB.types.register(richText.type);

let db = new ShareDBMongo("mongodb://mongodb:27017");
let pubsub = new ShareDBRedisPub({ client, observer });
let shareDb = new ShareDB({
    db,
    pubsub,
});

export default shareDb;
