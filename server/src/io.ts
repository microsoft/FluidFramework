import socketIo = require('socket.io');
import * as redis from 'redis';
var socketIoRedis = require('socket.io-redis');
import * as deltasDB from './db/deltas';
import * as nconf from 'nconf';
import * as _ from 'lodash';

var io = socketIo();

let host = nconf.get("redis:host");
let port = nconf.get("redis:port");
let pass = nconf.get("redis:pass");

// Setup redis options
let options: any = { auth_pass: pass };
if (nconf.get('redis:tls')) {
    options.tls = {
        servername: host
    }
}

let pubOptions = _.clone(options);
let subOptions = _.clone(options);
subOptions.return_buffers = true;

var pub = redis.createClient(port, host, pubOptions);
var sub = redis.createClient(port, host, subOptions);
io.adapter(socketIoRedis({ pubClient: pub, subClient: sub }));

interface IAppendOperation {
    room: string;
    ops: any[];
}

io.on('connection', (socket) => {
    socket.on('join', (room, response) => {
        console.log(`Join of room ${room} requested`);
        socket.join(room);

        deltasDB.get(room).then(
            (deltas) => {
                console.log('Recieved deltas');
                response(deltas);
            },
            (error) => {
                console.log("error getting existing deltas");
            });        
    });

    socket.on('append', (append: IAppendOperation) => {        
        deltasDB.append(append.room, append.ops);
        socket.to(append.room).broadcast.emit('append', append.ops);        
    });

    socket.on('disconnect', () => {
        socket.broadcast.emit('user disconnect');        
    })

    socket.broadcast.emit('user connect', 'hi');
});

export default io;