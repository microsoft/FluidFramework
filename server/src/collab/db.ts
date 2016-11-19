import * as _ from 'lodash';
import * as redis from 'redis';

var nconf = require('nconf');
var ShareDB = require('sharedb');
var ShareDBMongo = require('sharedb-mongo');
var ShareDBRedisPub = require('sharedb-redis-pubsub');
var richText = require('rich-text');

// Prep redis operations
let redisHost = nconf.get("redis:host");
let redisPort = nconf.get("redis:port");
let redisPass = nconf.get("redis:pass");
let options: any = { auth_pass: redisPass };
if (nconf.get('redis:tls')) {
    options.tls = {
        servername: redisHost
    }
}

let pubOptions = _.clone(options);
let subOptions = _.clone(options);
subOptions.return_buffers = true;

// Create the publish and subscribe redis connections
var client = redis.createClient(redisPort, redisHost, pubOptions);
var observer = redis.createClient(redisPort, redisHost, subOptions);

// Register rich type as one of our OT formats
ShareDB.types.register(richText.type);

var db = new ShareDBMongo('mongodb://offnet-sharedb:Ow8XY0XOyNhdUcRAUkgXOyws0uVe4sfu00cvbDv5K5S0ny5dfD59jXhP95qUgmJiKkDd6LNAPwx54gfngpXxNA==@offnet-sharedb.documents.azure.com:10250/?ssl=true');
var pubsub = new ShareDBRedisPub({ client: client, observer: observer });
var shareDb = new ShareDB({
    db: db, 
    pubsub: pubsub
});

export default shareDb;