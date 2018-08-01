var jwt = require('jsonwebtoken');

module.exports = function (context, req) {

    var token = 
        jwt.sign(
            req.body.payload,
            req.body.secretKey
        );

    context.res = {
        token
    };

    context.done();
};