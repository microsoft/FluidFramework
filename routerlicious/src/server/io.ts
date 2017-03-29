import * as _ from "lodash";
import * as nconf from "nconf";
import * as redis from "redis";
import * as socketIo from "socket.io";
import * as socketIoRedis from "socket.io-redis";

let io = socketIo();

let host = nconf.get("redis:host");
let port = nconf.get("redis:port");
let pass = nconf.get("redis:pass");

// Setup redis options
let options: any = { auth_pass: pass };
if (nconf.get("redis:tls")) {
    options.tls = {
        servername: host,
    };
}

let pubOptions = _.clone(options);
let subOptions = _.clone(options);
subOptions.return_buffers = true;

let pub = redis.createClient(port, host, pubOptions);
let sub = redis.createClient(port, host, subOptions);
io.adapter(socketIoRedis({ pubClient: pub, subClient: sub }));

io.on("connection", (socket) => {
    // The loadObject call needs to see if the object already exists. If not it should offload to
    // the storage service to go and create it.
    //
    // If it does exist it should query that same service to pull in the current snapshot.
    //
    // Given a client is then going to send us deltas on that service we need routerlicious to kick in as well.
    socket.on("loadObject", (id: string, type: string, response) => {
        console.log(`Client has requested to load ${id}`);
        socket.join(id);
        const document = {
            id,
            snapshot: {},
            type,
        };
        response(document);
    });
});

export default io;
