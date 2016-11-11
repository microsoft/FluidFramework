import socketIo = require('socket.io');

var io = socketIo();

io.on('connection', (socket) => {
    socket.on('chat message', (msg) => {
        console.log(`message: ` + msg);
    });

    socket.on('disconnect', () => {
        socket.broadcast.emit('user disconnect');        
    })

    socket.broadcast.emit('user connect', 'hi');
});

export default io;