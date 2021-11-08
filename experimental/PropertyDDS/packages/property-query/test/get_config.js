/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const getPort = require('get-port');

/**
 * Get ports for ps, cs and the proxy and save it to testconfig.json
 * @param {Object} program the commander object (command line options)
 */
async function main(program) {
  const startServers = !(process.env.START_SERVERS === 'false');
  const startProxy = !!program.proxy;
  const filename = path.join(__dirname, 'testconfig.json');
  const config = JSON.stringify({
    ports: {
      ps: program.default ? 3000 : await getPort(),
      cs: program.default ? 3010 : await getPort(),
      hr: program.default ? 3025 : await getPort(),
      proxy: program.default ? 3100 : await getPort()
    },
    startServers: startServers,
    startProxy: startProxy
  });

  fs.writeFileSync(filename, config);
  console.log(`Generated: ${filename}, ports: ${config}`);
}

const program = require('commander')
  .option('-d, --default', 'use the default ports', false)
  .option('-p, --proxy', 'front the servers by a proxy', false)
  .parse(process.argv);

main(program);
