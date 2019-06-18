/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as _ from "lodash";
import * as nconf from "nconf";
import * as redis from "redis";
import * as socketIo from "socket.io";
import * as socketIoRedis from "socket.io-redis";
import * as deltasDB from "./db/deltas";

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

interface IAppendOperation {
    room: string;
    ops: any[];
}

io.on("connection", (socket) => {
    socket.on("join", (room, response) => {
        socket.join(room);

        deltasDB.get(room).then(
            (deltas) => {
                response(deltas);
            },
            (error) => {
                console.error("error getting existing deltas");
            });
    });

    socket.on("append", (append: IAppendOperation) => {
        deltasDB.append(append.room, append.ops);
        socket.to(append.room).broadcast.emit("append", append.ops);
    });

    socket.on("disconnect", () => {
        socket.broadcast.emit("user disconnect");
    });

    socket.broadcast.emit("user connect", "hi");
});

export default io;
