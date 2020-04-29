var express = require('express');
var router = express.Router();

/* GET users listing. */
router.get('/hi', function(req, res, next) {
  res.send(200);
});

module.exports = router;
