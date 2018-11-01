var request = require('request');
const baseUrl = "https://api.iextrading.com/1.0/stock/"
function getPrices(tickers) {
    var url = baseUrl + "market/batch?types=price&symbols=";
    for (let ticker of tickers) {
        url += (ticker + ",");
    }
    request(url, (e, r, b) => {
        console.log(b);
    });
}

getPrices(['msft', 'fb']);