var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/getclientsidewebparts', function(req, res, next) {
  res.send(200);
});

module.exports = router;
