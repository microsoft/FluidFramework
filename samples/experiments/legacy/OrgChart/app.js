var bodyParser = require('body-parser');
var express = require('express');
var sql = require("mssql");

app = express();

app.use(bodyParser.urlencoded({ etended: true }));
app.use(bodyParser.json());

app.use('/', express.static('files'));

var router = express.Router();

router.get('/EmployeeByAlias/:alias', function (req, res) {
    getByAlias(req.params.alias, function (err, employee) {
        if (err) {
            res.send(err);
        }
        else {
            res.json(employee);
        }
    });
});

router.get('/EmployeeById/:employeeId', function (req, res) {
    getById(req.params.employeeId, function (err, employee) {
        if (err) {
            res.send(err);
        }
        else {
            res.json(employee);
        }
    });
});

router.get('/Reports/:employeeId', function (req, res) {
    getReports(req.params.employeeId, function (err, employee) {
        if (err) {
            res.send(err);
        }
        else {
            res.json(employee);
        }
    });
});

app.use('/api', router);

var port = process.env.PORT || 3000;
app.listen(port);
console.log('listened on port ' + port);

var config = {
    "server": "yg440",
    "user": "login1",
    "password": "kouling1!",
    "database": "Employees"
};

function getByAlias(alias, callback) {
    sql.connect(config).then(function () {
        new sql.Request()
            .input('input_alias', sql.NVarChar, alias)
            .query('select * from Employees where Alias=@input_alias').then(function (recordset) {
                callback(null, recordset && recordset.length > 0 ? recordset[0] : {});
                console.log('getByAlias: ' + alias);
            }).catch(function (err) {
                callback(err, null);
                console.log(err);
            });

    }).catch(function (err) {
        console.log(err);
    });
}

function getById(employeeId, callback) {
    sql.connect(config).then(function () {
        new sql.Request()
            .input('input_employeeId', sql.Int, employeeId)
            .query('select * from Employees where EmployeeId=@input_employeeId').then(function (recordset) {
                callback(null, recordset && recordset.length > 0 ? recordset[0] : {});
                console.log('getById: ' + employeeId);
            }).catch(function (err) {
                callback(err, null);
                console.log(err);
            });

    }).catch(function (err) {
        console.log(err);
    });
}

function getReports(employeeId, callback) {
    sql.connect(config).then(function () {
        new sql.Request()
            .input('input_employeeId', sql.Int, employeeId)
            .query('select * from Employees where ManagerEmployeeId=@input_employeeId').then(function (recordset) {
                callback(null, recordset ? recordset : {});
                console.log('getReports: ' + employeeId);
            }).catch(function (err) {
                callback(err, null);
                console.log(err);
            });

    }).catch(function (err) {
        console.log(err);
    });
}
