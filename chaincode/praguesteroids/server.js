var Path = require('path');
var Express = require('express');
var Browserify = require('browserify-middleware');
var ServeIndex = require('serve-index')

var app = Express();

app.use(Express.static(__dirname));

app.use("/lib/pragueGlobal.js", Browserify('./src/lib/pragueGlobal.js', Browserify.settings.development));

app.use('/example.js', Browserify('./src/game-asteroids/example.js', Browserify.settings.development));

app.set('port', process.env.PORT || 6565);


app.get('/', function(req, res) {
  res.redirect('/src/game-overview/')
});

app.use(ServeIndex(__dirname, {
  icons : true,
  css : 'ul#files li{float:none;}' // not actually working!
}));


app.listen(app.get('port'), function() {
  console.log('Checkout http://localhost:' + app.get('port'));
});