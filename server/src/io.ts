import socketIo = require('socket.io');
import * as deltasDB from './db/deltas';

var io = socketIo();

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
        console.log('Append received');
        console.log(JSON.stringify(append, null, 2));

        deltasDB.append(append.room, append.ops);
        socket.to(append.room).broadcast.emit('append', append.ops);        
    });

    socket.on('disconnect', () => {
        socket.broadcast.emit('user disconnect');        
    })

    socket.broadcast.emit('user connect', 'hi');
});

export default io;