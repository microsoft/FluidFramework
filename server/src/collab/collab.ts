import * as io from 'socket.io-client';
import * as Quill from 'quill';
import * as $ from 'jquery';

let socket = io();

socket.on('user connect', (msg) => {
    $("#console").append('<div>New user connected</div>');
});

socket.on('user disconnect', (msg) => {
    $("#console").append('<div>User disconnected</div>');
});

// Implement and register module
Quill.register('modules/counter', function(quill, options) {
    var container = document.querySelector(options.container);
    quill.on('text-change', function() {
        var text = quill.getText();
        // There are a couple issues with counting words
        // this way but we'll fix these later
        container.innerHTML = text.split(/\s+/).length;

        socket.emit('chat message', text);
    });
});

var editor = new Quill('#editor', {
    modules: { 
        toolbar: '#toolbar',
        counter: {
        container: '#counter'
        } 
    },
    theme: 'snow'
});