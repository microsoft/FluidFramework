const express = require('express');
const app = express();
const bodyParser = require('body-parser');

const port = 3333;
var tunnelURL = "";

// Get NGROK Address
const fetch = require('node-fetch')
fetch('http://localhost:4040/api/tunnels')
  .then(res => res.json())
  .then(json => json.tunnels.find(tunnel => tunnel.proto === 'https'))
  .then(secureTunnel => {
      tunnelURL = secureTunnel.public_url;
  })
  .then(() => {

    var num = 0;
    var photos = "";
    app.use(bodyParser.urlencoded( {extended: false }));
    app.use(bodyParser.json());

    app.post('/blobUploaded', (req, res) => {
      console.log("Post:blobUploaded");
      var contents = req.body;
      photos += "<img src=" + contents.operation.contents.url + " style=max-width:100px></img>";
    });

    app.post('/op', (req, res) => {
      console.log("Post:Op");
      num++;
    });

    app.get('/', (req, res) => {
        var body = 'Touches: ' + num;
        body += photos;
        res.send(body);
    });
    
    app.listen(port, () => console.log(`Touch Counter \nListening publicly on ${tunnelURL}\nListening locally on ${port}!`));

  })
  .catch(err => {
    if (err.code === 'ECONNREFUSED') {
      return console.error("Looks like you're not running ngrok.");
    }
    console.error(err);
  });
