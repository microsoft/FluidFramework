import { open } from './bootstrap-prague';

document.body.innerHTML = `
  <div id='view'></div>
  <pre id='log'></pre>
`;

const viewElement = document.getElementById('view');
const logElement = document.getElementById('log');

const log = (msg: string) => {
    logElement.innerText += msg + '\n';
}

const documentName = 'ticklish-pineapple'

log(`Opening '${documentName}'`)
open('ticklish-pineapple').then(sharedString => {
    log(`Succeeded, waiting for loaded...`);
    sharedString.loaded.then(() => {
        const text = sharedString.getText();
        log(`Loaded Snapshot: ${text}`);
        viewElement.innerText = text;

        const num = Math.floor(Math.random() * 10);
        log(`Prepending: '${num}'`);
        sharedString.insertText('' + num, 0);
    });
    
    sharedString.on('op', op => {
        viewElement.innerText = sharedString.getText();
        log(`'${sharedString.getText()}' <- op: '${JSON.stringify(op)}'`);
    });
}, error => {
    log(`Failed: ${error}`)
});