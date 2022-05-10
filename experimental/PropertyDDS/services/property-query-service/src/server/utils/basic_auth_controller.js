/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');
const BaseController = require('./base_controller');
const basicAuthMiddlewareFactory = require('./middlewares/basicauth').middlewareFactory;
const settings = require('./server_settings');

/**
 * A base controller to set up basic auth routes.
 */
class BasicAuthController extends BaseController {
  /**
   * Creates a controller for basic auth routes
   * @param {HFDM.ServerUtils.BaseServer} baseServer An instance of HFDM.ServerUtils.BaseServer
   * @param {Object} params List of parameters
   * @param {string} params.basicAuth.username A username to authenticate
   * @param {string} params.basicAuth.password A password to authenticate
   * @param {Object[]} params.basicAuth.passwordList A password list to authenticate
   *  { value: string , endAt: string ISO date}
   */
  constructor(baseServer, params) {
    const basicAuthItem = (params && params.basicAuth) || {
      username: settings.get('hfrs:basicAuthName') || settings.get('basicAuthName'),
      password: settings.get('hfrs:basicAuthPassword') || settings.get('basicAuthPassword'),
      passwordList: settings.get('hfrs:basicAuthPasswordList') || settings.get('basicAuthPasswordList')
    };

    const { username, password, passwordList } = basicAuthItem;

    const passwordListToUse = passwordList || [{
      value: password,
      endAt: '3000-01-01T00:00:00.000Z'
    }];

    const basicAuthMiddleware = username && passwordListToUse &&
      basicAuthMiddlewareFactory(username, passwordListToUse);

    super(params);
    this._baseServer = baseServer;
    this._isBasicAuthConfigured = !process.env.CLOUDOS_MONIKER || !!basicAuthMiddleware;
    this._basicAuthMiddleware = basicAuthMiddleware;
  }

  /**
   * Setup the basic auth routes
   * @param {object} routes Descvribes the basic auth routes to setup.
   */
  setupRoutes(routes) {
    if (!this._isBasicAuthConfigured) {
      // Missing basic auth parameter(s): {basicAuth: {username: '', password: ''}}.
      // The '/logger' route will be disabled.
      return;
    }

    _.each(routes.get, (callback, route) => {
      if (this._basicAuthMiddleware) {
        this._baseServer.getExpressApp().get(route, this._basicAuthMiddleware);
      }
      this._baseServer.getExpressApp().get(route, callback);
    });

    _.each(routes.post, (callback, route) => {
      if (this._basicAuthMiddleware) {
        this._baseServer.getExpressApp().post(route, this._basicAuthMiddleware);
      }
      this._baseServer.getExpressApp().post(route, callback);
    });
  }
}

module.exports = BasicAuthController;
