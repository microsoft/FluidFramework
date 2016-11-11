import socketIo = require('socket.io');

var io = socketIo();

io.on('connection', (socket) => {
    console.log('a user connected!');
});


export default io;