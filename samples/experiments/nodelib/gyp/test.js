const http = require('http');

function getPage() {
    return new Promise((resolve, reject) => {
        http.get(
            { host: 'google.com', path: '/' },
            (response) => {
                var body = '';
                response.on('data', function(d) {
                    body += d;
                });
                response.on('end', function() {
                    resolve(body);
                });
            });
    });
}

let total = 0;
for (let i = 0; i < 10; i++) {
    total += i;
}

setInterval(() => {
    getPage().then((value) => {
        console.log(`The total was ${total} - ${value}`);
    });
}, 1000);

console.log("End of the loop!");
