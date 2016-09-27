var express = require('express');
var router = express.Router();
var agent = require('./agent');

/* GET users listing. */
router.get('/', function(req, res, next) {
  res.send('respond with a resource');
});

router.get('/math', function(req, res, next) {
  var answer = false;
  if (req.query.text && req.query.axiom && req.query.vname) {
    try {
      var checker = agent.createChecker(req.query.axiom, req.query.vname);
      answer = checker.check(req.query.text);
    }
    catch (e) {
      answer = false;
    }
  }
  var msg = answer?('on the right track: ' + req.query.text + " leads to " + req.query.axiom):'keep trying'
  res.send('agent says: '+msg);
});

export = router;
