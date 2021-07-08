/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint no-unused-expressions: 0 */
/* globals targets */

const MHServer = require('../../src/server/server');
const getPort = require('get-port');
const PluginManager = require('../../src/plugins/PluginManager');
const getExpressApp = require('../utils/get_express_app');

const RequestUtils = require('../../src/server/utils/request_utils');
const { promisify } = require('util');
const requestAsPromise = promisify(RequestUtils.requestWithRetries);

describe('Single metric endpoint', () => {
  let server, port;

  before(async () => {
    port = await getPort();
    targets.mhServerUrl = `http://127.0.0.1:${port}`;
    server = new MHServer({
      app: getExpressApp(),
      port,
      systemMonitor: PluginManager.instance.systemMonitor
    });
    await server.start();
  });

  it('should return the load metric', async () => {
    let result = await requestAsPromise({
      requestParams: {
        url: `${targets.mhServerUrl}/v1/metric/MH_load`,
        json: true
      },
      logger: () => {}
    });
    expect(result).to.exist;
    expect(result.metricName).to.eql('MH_load');
    expect(result.value).to.be.a('number');
  });

  after(() => server.stop());
});
