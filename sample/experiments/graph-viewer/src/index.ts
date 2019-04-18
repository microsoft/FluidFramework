import * as express from "express";
import * as querystring from "querystring";
import * as request from "request";
import * as path from "path";
import * as registration from "@prague/routerlicious/dist/socket-storage/registration";
import { copyFile } from "fs";

const routerlicious = "http://praguekube.westus2.cloudapp.azure.com";
const historian = "http://prague-historian.westus2.cloudapp.azure.com";

const repository = "prague";
const owner = "prague";
registration.registerAsDefault(routerlicious, historian, owner, repository);

const app = express();

app.get('/', (req, res) => {
    let viewPath = path.join(__dirname, '../view/index.html');
    let paths = viewPath + "\n" + __dirname;
    res.sendFile(viewPath);
});

app.get('/okay', (req, res) => {
    res.send(__dirname);
});

app.listen(4000, () => console.log('Example app listening on port 4000!'))
app.use(express.static('dist'));
app.use(express.static('view'));

function DeliverHtml() {
    return path.join(__dirname, '/index.html');
}
