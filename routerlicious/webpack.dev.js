const path = require('path');


module.exports = {
    mode: "development",    
    output: {
        path: path.resolve(__dirname, "public/scripts/dist"),
        filename: '[name].js', // Overwriten in prod/dev config
        library: "[name]"
    },
}
