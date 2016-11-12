import * as io from 'socket.io-client';
import * as Quill from 'quill';
import * as $ from 'jquery';

Quill.register('modules/counter', (quill, options) => {
    var container = document.querySelector(options.container);
    quill.on('text-change', (delta: Quill.DeltaStatic, oldContents: Quill.DeltaStatic, source: String) => {
        var text = quill.getText();
        
        // There are a couple issues with counting words
        // this way but we'll fix these later
        container.innerHTML = text.split(/\s+/).length;        
    });
});

export function connect(id: string) {
    let socket = io();

    let editor = null;
    let suppressChange = false;

    socket.emit('join', id, (opsDocument: any[]) => {            
        editor = new Quill('#editor', {
            modules: {
                toolbar: '#toolbar',
                counter: {
                    container: '#counter'
                }
            },
            theme: 'snow'
        });
        (<any> window).myQuillEditor = editor;

        // Seed the editor with the previous document
        for (let ops of opsDocument) {
            editor.updateContents(<Quill.DeltaStatic>(<any> { ops: ops.deltas }));
        }        

        // Listen for future updates
        editor.on('text-change', (delta: Quill.DeltaStatic, oldContents: Quill.DeltaStatic, source: String) => {
            // If we are processing an append don't handle the text change event
            if (suppressChange) {
                return;
            }            

            var contents = editor.getContents();            

            socket.emit('append', {
                room: id,
                ops: delta.ops
            });
        });                
    });

    socket.on('user connect', (msg) => {
        // $("#console").append('<div>New user connected</div>');
    });

    socket.on('user disconnect', (msg) => {
        // $("#console").append('<div>User disconnected</div>');
    });

    socket.on('append', (ops) => {        
        let delta = {
            ops: ops
        };

        suppressChange = true;
        editor.updateContents(<Quill.DeltaStatic>(<any> delta));
        suppressChange = false;
    })
}