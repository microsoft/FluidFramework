// Simple helper script to generate a production compose file that includes a versioned docker image
const fs = require("fs");

const composeFile = process.argv[2];

const compose =
`version: '3'
services:
    alfred:
        image: ${composeFile}
        ports:
            - "80:3000"
        environment:
            - logger__colorize=false
            - logger__morganFormat=combined
            - logger__json=false
            - logger__level=verbose
            - logger__timestamp=false
    deli:
        image: ${composeFile}
        environment:
            - logger__colorize=false
            - logger__morganFormat=combined
            - logger__json=false
            - logger__level=verbose
            - logger__timestamp=false
    paparazzi:
        image: ${composeFile}
        environment:
            - logger__colorize=false
            - logger__morganFormat=combined
            - logger__json=false
            - logger__level=verbose
            - logger__timestamp=false
    scriptorium:
        image: ${composeFile}
        environment:
            - logger__colorize=false
            - logger__morganFormat=combined
            - logger__json=false
            - logger__level=verbose
            - logger__timestamp=false
    tmz:
        image: ${composeFile}
        environment:
            - logger__colorize=false
            - logger__morganFormat=combined
            - logger__json=false
            - logger__level=verbose
            - logger__timestamp=false`;

console.log(compose);

fs.writeFile(process.argv[3], compose, () => {});
