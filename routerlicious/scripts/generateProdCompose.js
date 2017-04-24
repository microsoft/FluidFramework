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
    deli:
        image: ${composeFile}
    paparazzi:
        image: ${composeFile}
    scriptorium:
        image: ${composeFile}
    tmz:
        image: ${composeFile}`;

console.log(compose);

fs.writeFile(process.argv[3], compose, () => {});
