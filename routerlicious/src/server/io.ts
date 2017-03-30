import * as _ from "lodash";
import * as nconf from "nconf";
import * as redis from "redis";
import * as socketIo from "socket.io";
import * as socketIoRedis from "socket.io-redis";
import * as socketStorage from "../socket-storage";

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
    socket.on("loadObject", (message: socketStorage.ILoadObjectMessage, response) => {
        console.log(`Client has requested to load ${message.objectId}`);
        socket.join(message.objectId);

        const responseMessage: socketStorage.IResponse<socketStorage.IObjectDetails> = {
            data: {
                id: message.objectId,
                snapshot: {},
                type: message.type,
            },
            error: null,
        };

        response(responseMessage);
    });

    // Message sent when a new operation is submitted to the router
    socket.on("submitOp", (message: socketStorage.ISubmitOpMessage, response) => {
        console.log(`Client has sent the message: ${JSON.stringify(message)}`);
        const responseMessage: socketStorage.IResponse<boolean> = {
            data: true,
            error: null,
        };

        // Notify the client of receipt
        response(responseMessage);

        // TODO routerlicious now needs to get this message to the appropriate worker who will assign a sequence
        // number and then send the update to clients
        const routedMessage: socketStorage.IRoutedOpMessage = {
            clientId: message.clientId,
            objectId: message.objectId,
            op: message.op,
        };
        io.to(message.objectId).emit("op", routedMessage);
    });
});

export default io;
