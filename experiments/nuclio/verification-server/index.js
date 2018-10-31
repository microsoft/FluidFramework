const express = require('express');
const app = express();
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
    app.get('/increment', (req, res) => {
        num++;
        res.send('Touches: ' + num);
    });
    
    app.get('/', (req, res) => {
        res.send('Touches: ' + num);
    });
    
    app.listen(port, () => console.log(`Touch Counter \nListening publicly on ${tunnelURL}\nListening locally on ${port}!`));
    
  })
  .catch(err => {
    if (err.code === 'ECONNREFUSED') {
      return console.error("Looks like you're not running ngrok.");
    }
    console.error(err);
  });
