/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as msg from "axon";
import LifeRaft = require("liferaft");
import * as moniker from "moniker";
// tslint:disable:no-var-requires
const argv = require("argh").argv;
const debug = require("diagnostics")("raft");
const leveldown = require("leveldown");
const Log = require("liferaft/log");
// tslint:enable:no-var-requires

//
// We're going to create own custom Raft instance which is powered by axon for
// communication purposes. But you can also use things like HTTP, OMQ etc.
//
class MsgRaft extends LifeRaft {
    /**
     * Initialized, start connecting all the things.
     *
     * @param {Object} options Options.
     * @api private
     */
    public initialize(options) {
        debug("initializing reply socket on port %s", this.address);

        const socket = this.socket = msg.socket("rep");

        socket.bind(this.address);
        socket.on("message", (data, fn) => {
            this.emit("data", data, fn);
        });

        socket.on("error", () => {
            debug("failed to initialize on port: ", this.address);
        });
    }

    /**
     * The message to write.
     *
     * @param {Object} packet The packet to write to the connection.
     * @param {Function} fn Completion callback.
     * @api private
     */
    public write(packet, fn) {
        if (!this.socket) {
            this.socket = msg.socket("req");

            this.socket.connect(this.address);
            this.socket.on("error", function err() {
                console.error("failed to write to: ", this.address);
            });
        }

        debug("writing packet to socket on port %s", this.address);
        this.socket.send(packet, (data) => {
            fn(undefined, data);
        });
    }
}

//
// We're going to start with a static list of servers. A minimum cluster size is
// 4 as that only requires majority of 3 servers to have a new leader to be
// assigned. This allows the failure of one single server.
//
const ports = [
    8081, 8082, 8083,
];

//
// The port number of this Node process.
//
const port = +argv.port || ports[0];

//
// Now that we have all our variables we can safely start up our server with our
// assigned port number.
//
const raft = new MsgRaft(
    "tcp://127.0.0.1:" + port,
    {
        Log,
        "adapter": leveldown,
        "election max": 5000,
        "election min": 2000,
        "heartbeat": 1000,
        "path": `./db/${port}`,
    });

raft.on("heartbeat timeout", () => {
    debug("heart beat timeout, starting election");
});

raft.on("term change", (to, from) => {
    debug("were now running on term %s -- was %s", to, from);
}).on("leader change", (to, from) => {
    debug("we have a new leader to: %s -- was %s", to, from);
}).on("state change", (to, from) => {
    debug("we have a state to: %s -- was %s", to, from);
});

let leaderInterval;

raft.on("leader", () => {
    console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
    console.log("I am elected as leader");
    console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");

    leaderInterval = setInterval(
        () => {
            raft.command({ rando: moniker.choose(), time: Date.now() });
        },
        5000);
});

raft.on("candidate", () => {
    console.log("----------------------------------");
    console.log("I am starting as candidate");
    console.log("----------------------------------");

    clearInterval(leaderInterval);
});

raft.on("follower", () => {
    console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
    console.log("I am a follower");
    console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");

    clearInterval(leaderInterval);
});

let sum = 0;
let count = 0;

raft.on("commit", (command) => {
    sum += Date.now() - command.time;
    count++;
    if (count % 10 === 0) {
        console.log("**********************************");
        console.log(`${command.rando}: ${Date.now() - command.time}`);
        console.log(`${sum / count}`);
        console.log("**********************************");
    }
});

// var packet = raft.packet('vote', { foo: 'bar' });

//
// Join in other nodes so they start searching for each other.
//
ports.forEach((nr) => {
    if (!nr || port === nr) {
        return;
    }

    raft.join("tcp://127.0.0.1:" + nr);
});
