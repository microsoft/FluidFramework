/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview
 * Declaration of the RepositoriesController
 */
const LONG_POLLING_TIME = 4000;

const BaseController = require('../utils/base_controller');
const BranchGuidProvider = require('../utils/branch_guid_provider');
const bodyParser = require('body-parser');
const generateGUID = require('@fluid-experimental/property-common').GuidUtils.generateGUID;
const OperationError = require('@fluid-experimental/property-common').OperationError;
const HTTPStatus = require('http-status');
const MVQueryExecutor = require('../../materialized_history_service/query_pipeline/mv_query_executor');
const _ = require('lodash');

/**
 * The Branches controller hosts all endpoints that are related to branch creation / updates and query
 */
class BranchesController extends BaseController {
  /**
   * The Branches controller hosts all endpoints that are related to branch creation / updates and query
   * @param {object} params BaseController parameters
   * @param {HFDM.MaterializedHistoryService.MaterializedHistoryService} params.materializedHistoryService -
   *   The materialized history service that is controlled by this server
   * @param {RequestSignatureValidator} [params.requestSignatureValidator] - RequestSignatureValidator instance
   * @constructor
   */
  constructor(params) {
    super(params);

    this.id = 'BranchesController';

    this._app = params.app;
    this._server = params.server;
    this._materializedHistoryService = params.materializedHistoryService;
    this._requestSignatureValidator = params.requestSignatureValidator;
    this._systemMonitor = params.systemMonitor;
    this._mvQueryExecutor = new MVQueryExecutor({
      materializedHistoryService: this._materializedHistoryService,
      systemMonitor: this._systemMonitor
    });
    this._myHostPort = params.myHostPort;

    /**
     *  @swagger
     *  /v1/branch:
     *    post:
     *      operationId: branch_POST
     *      description: Creates a new branch.
     *      parameters:
     *        - name: body
     *          in: body
     *          description: Describes the new branch.
     *          required: true
     *          schema:
     *            type: object
     *            properties:
     *              guid:
     *                type: string
     *              rootCommitGuid:
     *                type: string
     *              meta:
     *                type: object
     *              created:
     *                type: integer
     *              parentBranchGuid:
     *                type: string
     *      responses:
     *        500:
     *          description: Creating the branch failed.
     *          schema:
     *            title: Internal Server Error
     *        200:
     *          description: Branch created.
     */
    this._app.post(
      this.getV1Paths('/branch').concat(['/mhs/v1/branch']),
      bodyParser.json({limit: '100mb'}),
      this._requestSignatureValidator.validateSignature(BranchGuidProvider.branchGuidFromBodyGuid),
      this._checkKeys(['guid', 'meta', 'rootCommitGuid'], []).bind(this),
      this.createBranch.bind(this),
      this._handleErrors.bind(this)
    );

    /**
     *  @swagger
     *  /v1/branchDeletion:
     *    post:
     *      operationId: branchdeletion_POST
     *      description: Deletes one or many branches
     *      parameters:
     *        - name: body
     *          in: body
     *          description: Describes the new branch.
     *          required: true
     *          schema:
     *            type: object
     *            properties:
     *              branchGuids:
     *                type: array
     *                items:
     *                  type: string
     *      responses:
     *        500:
     *          description: Deleting the branches failed.
     *          schema:
     *            title: Internal Server Error
     *        200:
     *          description: The result of the deletion task execution
     *          schema:
     *            type: object
     *            properties:
     *              taskGuid:
     *                type: string
     *              status:
     *                type: string
     *              branchGuids:
     *                type: array
     *                items:
     *                  type: string
     *              taskUrl:
     *                type: string
     */
    this._app.post(
      this.getV1Paths('/branchDeletion').concat(['/mhs/v1/branchDeletion']),
      bodyParser.json({limit: '100mb'}),
      this._requestSignatureValidator.validateSignature(BranchGuidProvider.branchGuidFromBodyGuids),
      this._checkKeys(['branchGuids'], []).bind(this),
      this.createDeleteBranchTask.bind(this),
      this._handleErrors.bind(this)
    );

    /**
     *  @swagger
     *  /v1/branchDeletion/{taskGuid}:
     *    get:
     *      operationId: branchdeletion_GET
     *      description: Gets the status of a branch deletion
     *      parameters:
     *        - name: taskGuid
     *          in: path
     *          required: true
     *          type: string
     *          description: Guid of the task.
     *      responses:
     *        500:
     *          description: Obtaining the status of the task failed.
     *          schema:
     *            title: Internal Server Error
     *        200:
     *          description: The result of the deletion task execution
     *          schema:
     *            type: object
     *            properties:
     *              taskGuid:
     *                type: string
     *              status:
     *                type: string
     *              branchGuids:
     *                type: array
     *                items:
     *                  type: string
     *              taskUrl:
     *                type: string
     */
    this._app.get(
      this.getV1Paths('/branchDeletion/:taskGuid').concat(['/mhs/v1/branchDeletion/:taskGuid']),
      bodyParser.json({limit: '100mb'}),
      this._checkKeys([], ['taskGuid']).bind(this),
      this.getDeleteBranchTask.bind(this),
      this._handleErrors.bind(this)
    );

        /**
     *  @swagger
     *  /v1/branchDeletion/{taskGuid}/retry:
     *    post:
     *      operationId: branchdeletionretry_POST
     *      description: Triggers the retrial of a branch deletion task
     *      parameters:
     *        - name: taskGuid
     *          in: path
     *          required: true
     *          type : string
     *          description: Guid of the task.
     *      responses:
     *        500:
     *          description: Retrying the task failed.
     *          schema:
     *            title: Internal Server Error
     *        200:
     *          description: The result of the deletion task execution
     *          schema:
     *            type: object
     *            properties:
     *              taskGuid:
     *                type: string
     *              status:
     *                type: string
     *              branchGuids:
     *                type: array
     *                items:
     *                  type: string
     *              taskUrl:
     *                  type: string
     */
    this._app.post(
      this.getV1Paths('/branchDeletion/:taskGuid/retry').concat(['/mhs/v1/branchDeletion/:taskGuid/retry']),
      bodyParser.json({limit: '100mb'}),
      this._checkKeys([], ['taskGuid']).bind(this),
      this.retryDeleteBranchTask.bind(this),
      this._handleErrors.bind(this)
    );

    /**
     *  @swagger
     *  /v1/branch/{branchGuid}:
     *    get:
     *      operationId: branch_GET
     *      description: Retrieves information about a branch.
     *      parameters:
     *        - name: branchGuid
     *          in: path
     *          type: string
     *          description: GUID of the branch.
     *          required: true
     *        - name: body
     *          in: body
     *          description: The new commit
     *          required: true
     *          schema:
     *            type: object
     *            properties:
     *              guid:
     *                type: string
     *              parentGuid:
     *                type: string
     *              changeSet:
     *                type: string
     *              meta:
     *                type: object
     *      responses:
     *        500:
     *          description: Could not retrieve the branch
     *          schema:
     *            title: Internal Server Error
     *        200:
     *          description: The serialized changeset of the subset of the materialized
     *                       view that corresponds to the supplied paths
     */
    this._app.get(
      this.getV1Paths('/branch/:branchGuid').concat(['/mhs/v1/branch/:branchGuid']),
      this._requestSignatureValidator.validateSignature(BranchGuidProvider.branchGuidFromParams),
      this._checkKeys([], ['branchGuid']).bind(this),
      this.getBranch.bind(this),
      this._handleErrors.bind(this)
    );

    /**
     *  @swagger
     *  /v1/branch/{branchGuid}/commit:
     *    post:
     *      operationId: branch_commit_POST
     *      description: Adds a commit to a branch.
     *      parameters:
     *        - name: branchGuid
     *          in: path
     *          type: string
     *          description: GUID of the branch.
     *          required: true
     *      responses:
     *        500:
     *          description: Could not retrieve the branch
     *          schema:
     *            title: Internal Server Error
     *        200:
     *          description: Information about the branch
     */
    this._app.post(
      this.getV1Paths('/branch/:branchGuid/commit').concat(['/mhs/v1/branch/:branchGuid/commit']),
      bodyParser.json({limit: '100mb'}),
      this._requestSignatureValidator.validateSignature(BranchGuidProvider.branchGuidFromParams),
      this._checkKeys(['guid', 'parentGuid', 'branchGuid', 'changeSet', 'meta'], ['branchGuid']).bind(this),
      this.createCommit.bind(this),
      this._handleErrors.bind(this)
    );

        /**
     *  @swagger
     *  /v1/branch/{branchGuid}/commitTask:
     *    post:
     *      operationId: branch_commit_task_POST
     *      description: Adds a commit to a branch.
     *      parameters:
     *        - name: branchGuid
     *          in: path
     *          type: string
     *          description: GUID of the branch.
     *          required: true
     *      responses:
     *        500:
     *          description: Could not retrieve the branch
     *          schema:
     *            title: Internal Server Error
     *        201:
     *          description: The commit creation was queued
     */
    this._app.post(
      this.getV1Paths('/branch/:branchGuid/commitTask').concat(['/mhs/v1/branch/:branchGuid/commitTask']),
      bodyParser.json({limit: '100mb'}),
      this._requestSignatureValidator.validateSignature(BranchGuidProvider.branchGuidFromParams),
      this._checkKeys(['guid', 'parentGuid', 'branchGuid'], ['branchGuid']).bind(this),
      this.createCommitTask.bind(this),
      this._handleErrors.bind(this)
    );

    /**
     *  @swagger
     *  /v1/branch/{branchGuid}/commit/{commitGuid}:
     *    post:
     *      operationId: branch_commit_GET
     *      description: Gets a commits meta information
     *      parameters:
     *        - name: branchGuid
     *          in: path
     *          description: GUID of the branch.
     *          required: true
     *          type: string
     *        - name: commitGuid
     *          in: path
     *          description: GUID of the commit.
     *          required: true
     *          type: string
     *      responses:
     *        500:
     *          description: Could not retrieve the commit
     *          schema:
     *            title: Internal Server Error
     *        200:
     *          description: Information about the commit
     */
    this._app.get(
      this.getV1Paths('/branch/:branchGuid/commit/:commitGuid')
        .concat(['/mhs/v1/branch/:branchGuid/commit/:commitGuid']),
      this._requestSignatureValidator.validateSignature(BranchGuidProvider.branchGuidFromParams),
      this._checkKeys([], ['branchGuid', 'commitGuid']).bind(this),
      this.getCommit.bind(this),
      this._handleErrors.bind(this)
    );

    /**
     *  @swagger
     *  /v1/branch/{branchGuid}/commit/{commitGuid}/materializedView:
     *    post:
     *      operationId: branch_commit_materializedView_GET
     *      description: Gets the materializedView of a commit
     *      parameters:
     *        - name: branchGuid
     *          in: path
     *          description: GUID of the branch.
     *          required: true
     *          type: string
     *        - name: commitGuid
     *          in: path
     *          description: GUID of the commit.
     *          required: true
     *          type: string
     *        - name: path
     *          in: query
     *          description: Path to filter the output.
     *          required: false
     *          type: string
     *        - name: followReferences
     *          in: query
     *          description: Follow references while traversing the changeset and include the referenced subtrees
     *          required: false
     *          type: string
     *        - name: pagingLimit
     *          in: query
     *          description: Size of a page in KB
     *          required: false
     *          type: string
     *        - name: pagingStartPath
     *          in: query
     *          description: start path at which the next page is fetched
     *          required: false
     *          type: string
     *        - name: rangeStart
     *          in: query
     *          description: start of a query range
     *          required: false
     *          type: string
     *        - name: rangeEnd
     *          in: query
     *          description: end of a query range
     *          required: false
     *          type: string
     *      responses:
     *        500:
     *          description: Could not retrieve the commit
     *          schema:
     *            title: Internal Server Error
     *        200:
     *          description: The serialized changeset of the subset of the materialized
     *                       view that corresponds to the supplied paths
     */
    this._app.get(
      this.getV1Paths('/branch/:branchGuid/commit/:commitGuid/materializedView')
        .concat(['/mhs/v1/branch/:branchGuid/commit/:commitGuid/materializedView']),
      this._requestSignatureValidator.validateSignature(BranchGuidProvider.branchGuidFromParams),
      this._checkKeys([], ['branchGuid', 'commitGuid']).bind(this),
      this.getCommitMV.bind(this),
      this._handleErrors.bind(this)
    );


    /**
     *  @swagger
     *  /v1/branch/{branchGuid}/commit/{commitGuid}/materializedView:
     *    post:
     *      operationId: branch_commit_materializedView_POST
     *      description: Gets the materializedView of a commit by using POST
     *      parameters:
     *        - name: branchGuid
     *          in: path
     *          description: GUID of the branch.
     *          required: true
     *          type: string
     *        - name: commitGuid
     *          in: path
     *          description: GUID of the commit.
     *          required: true
     *          type: string
     *        - name: path
     *          in: body
     *          description: Path to filter the output.
     *          required: false
     *          type: string
     *        - name: followReferences
     *          in: body
     *          description: Follow references while traversing the changeset and include the referenced subtrees
     *          required: false
     *          type: string
     *        - name: pagingLimit
     *          in: body
     *          description: Size of a page in KB
     *          required: false
     *          type: string
     *        - name: pagingStartPath
     *          in: body
     *          description: start path at which the next page is fetched
     *          required: false
     *          type: string
     *        - name: rangeStart
     *          in: body
     *          description: start of a query range
     *          required: false
     *          type: string
     *        - name: rangeEnd
     *          in: body
     *          description: end of a query range
     *          required: false
     *          type: string
     *      responses:
     *        500:
     *          description: Could not retrieve the commit
     *          schema:
     *            title: Internal Server Error
     *        200:
     *          description: The serialized changeset of the subset of the materialized
     *                       view that corresponds to the supplied paths
     */
    this._app.post(
      this.getV1Paths('/branch/:branchGuid/commit/:commitGuid/materializedView')
        .concat(['/mhs/v1/branch/:branchGuid/commit/:commitGuid/materializedView']),
      bodyParser.json({limit: '100mb'}),
      this._requestSignatureValidator.validateSignature(BranchGuidProvider.branchGuidFromParams),
      this._checkKeys([], ['branchGuid', 'commitGuid']).bind(this),
      this.getCommitMVByPost.bind(this),
      this._handleErrors.bind(this)
    );

    /**
     *  @swagger
     *  /v1/branch/{branchGuid}/commit/{commitGuid}/changeSet:
     *    post:
     *      operationId: branch_commit_changeSet_GET
     *      description: Gets the changeSet for a commit
     *      parameters:
     *        - name: branchGuid
     *          in: path
     *          description: GUID of the branch.
     *          required: true
     *          type: string
     *        - name: commitGuid
     *          in: path
     *          description: GUID of the commit.
     *          required: true
     *          type: string
     *        - name: path
     *          in: query
     *          description: Path to filter the output.
     *          required: false
     *          type: string
     *        - name: rangeStart
     *          in: query
     *          description: start of a query range
     *          required: false
     *          type: string
     *        - name: rangeEnd
     *          in: query
     *          description: end of a query range
     *          required: false
     *          type: string
     *      responses:
     *        500:
     *          description: Could not retrieve the commit
     *          schema:
     *            title: Internal Server Error
     *        200:
     *          description: The serialized changeset of the subset of the changeSet
     *                       view that corresponds to the supplied paths
     */
    this._app.get(
      this.getV1Paths('/branch/:branchGuid/commit/:commitGuid/changeSet')
        .concat(['/mhs/v1/branch/:branchGuid/commit/:commitGuid/changeSet']),
      this._requestSignatureValidator.validateSignature(BranchGuidProvider.branchGuidFromParams),
      this._checkKeys([], ['branchGuid', 'commitGuid']).bind(this),
      this.getCommitCS.bind(this),
      this._handleErrors.bind(this)
    );
  }

  /**
   * Creates a new branch
   * @param {Request}  req - The request
   * @param {Response} res - The response
   * @param {function} next - Next middleware
   */
  async createBranch(req, res, next) {
    try {
      await this._materializedHistoryService.createBranch(req.body);
      this.render(res, {result: 'Branch created'}, HTTPStatus.OK);
    } catch (ex) {
      next(ex);
    }
  }

  /**
   * Returns a branch
   *
   * @param {Request}  req - The request
   * @param {Response} res - The response
   * @param {function} next - Next middleware
   */
  async getBranch(req, res, next) {
    try {
      const branch = await this._materializedHistoryService.getBranch(req.params.branchGuid);
      this.render(res, branch, HTTPStatus.OK);
    } catch (ex) {
      next(ex);
    }
  }

  /**
   * Creates a new commit
   *
   * @param {Request}  req - The request
   * @param {Response} res - The response
   * @param {function} next - Next middleware
   */
  async createCommit(req, res, next) {
    try {
      const commit = await this._materializedHistoryService.createCommit(req.body);
      this.render(res, commit, HTTPStatus.OK);
    } catch (ex) {
      next(ex);
    }
  }

  /**
   * Creates a new commit task
   *
   * @param {Request}  req - The request
   * @param {Response} res - The response
   * @param {function} next - Next middleware
   */
  async createCommitTask(req, res, next) {
    try {
      let tracer = this._systemMonitor.carrier();
      this._systemMonitor.startBackgroundTransaction('CreateCommit', async () => {
        this._systemMonitor.extract(tracer);
        await this._materializedHistoryService.createCommit(req.body);
      });

      this.render(res, { status: 'CREATED' }, HTTPStatus.CREATED);
    } catch (ex) {
      next(ex);
    }
  }

  /**
   * Get commit meta information
   *
   * @param {Request}  req - The request
   * @param {Response} res - The response
   * @param {function} next - Next middleware
   */
  async getCommit(req, res, next) {
    try {
      const commit = await this._materializedHistoryService.getCommit(req.params.commitGuid);
      this.render(res, commit, HTTPStatus.OK);
    } catch (ex) {
      next(ex);
    }
  }

  /**
   * Get Materialized view at commit
   *
   * @param {Request}  req - The request
   * @param {Response} res - The response
   * @param {function} next - Next middleware
   */
  async getCommitMV(req, res, next) {

    let paths = req.query.path;
    if (paths === undefined) {
      paths = [];
    }
    if (_.isString(paths)) {
      paths = [paths];
    }

    // https://github.com/expressjs/express/issues/3039
    if (_.isObject(paths)) {
      paths = Object.values(paths);
    }

    req.query.path = paths;

    try {
      let branchInfo, mvAtCommit;

      await this._materializedHistoryService.waitUntilCommitApplied(req.params.branchGuid, req.params.commitGuid);

      if (req.aborted) {
        next(new OperationError('Request aborted', 'getCommitMV',
          HTTPStatus.BAD_REQUEST, OperationError.FLAGS.QUIET)
        );
        return;
      }

      await this._systemMonitor.startWebTransaction('GetCommitMV', async () => {
        [ branchInfo, mvAtCommit ] = await this._mvQueryExecutor.execute(
          req.params.branchGuid,
          req.params.commitGuid,
          req.query
        );

        let response = _.extend(mvAtCommit, { rootCommitGuid: branchInfo.rootCommitGuid });
        this.render(res, response, HTTPStatus.OK);
      });
    } catch (ex) {
      next(ex);
    }
  }

  /**
   * Get Materialized view at commit using Post
   *
   * @param {Request}  req - The request
   * @param {Response} res - The response
   * @param {function} next - Next middleware
   */
  async getCommitMVByPost(req, res, next) {

    let paths = req.body.path;
    if (paths === undefined) {
      paths = [];
    }
    if (_.isString(paths)) {
      paths = [paths];
    }

    req.body.path = paths;

    try {
      let branchInfo, mvAtCommit;

      await this._materializedHistoryService.waitUntilCommitApplied(req.params.branchGuid, req.params.commitGuid);

      if (req.aborted) {
        next(new OperationError('Request aborted', 'getCommitMV',
          HTTPStatus.BAD_REQUEST, OperationError.FLAGS.QUIET)
        );
        return;
      }

      this._systemMonitor.startWebTransaction('GetCommitMV', async () => {
        [ branchInfo, mvAtCommit ] = await this._mvQueryExecutor.execute(
          req.params.branchGuid,
          req.params.commitGuid,
          req.body
        );

        let response = _.extend(mvAtCommit, { rootCommitGuid: branchInfo.rootCommitGuid });
        this.render(res, response, HTTPStatus.OK);
      });
    } catch (ex) {
      next(ex);
    }
  }

  /**
   * Get changeset at commit
   *
   * @param {Request}  req - The request
   * @param {Response} res - The response
   * @param {function} next - Next middleware
   */
  async getCommitCS(req, res, next) {
    let paths = req.query.path;
    if (paths === undefined) {
      paths = [];
    }
    if (_.isString(paths)) {
      paths = [paths];
    }

    // https://github.com/expressjs/express/issues/3039
    if (_.isObject(paths)) {
      paths = Object.values(paths);
    }

    let ranges;
    if (req.query.rangeStart &&
        req.query.rangeEnd) {
      let rangeStart = req.query.rangeStart;
      let rangeEnd = req.query.rangeEnd;

      if (_.isString(rangeStart)) {
        rangeStart = [rangeStart];
      }
      if (_.isString(rangeEnd)) {
        rangeEnd = [rangeEnd];
      }

      ranges = [];
      if (rangeStart.length !== rangeEnd.length) {
        throw new OperationError('Number of rangeStart and rangeEnd parameters must match', 'GetCommit',
          HTTPStatus.BAD_REQUEST, OperationError.FLAGS.QUIET);
      }

      for (let i = 0; i < rangeStart.length; i++) {
        ranges.push( [rangeStart[i], rangeEnd[i]]);
      }
    }

    const fetchSchemas = req.query.fetchSchemas !== 'false';

    try {
      const commit = await this._materializedHistoryService.getCommitCS({
        guid: req.params.commitGuid,
        paths: paths,
        ranges,
        fetchSchemas,
        branchGuid: req.params.branchGuid
      });
      this.render(res, commit, HTTPStatus.OK);
    } catch (ex) {
      next(ex);
    }
  }

  /**
   * Creates a branches deletion task
   *
   * @param {Request}  req - The request
   * @param {Response} res - The response
   * @param {function} next - Next middleware
   */
  async createDeleteBranchTask(req, res, next) {
    let replied = false;

    try {
      let existingTaskForBranches = await this._materializedHistoryService.getDeleteBranchTaskByBranches({
        branchGuids: req.body.branchGuids
      });

      if (existingTaskForBranches.length > 0) {
        this.render(res, { existingTasks: existingTaskForBranches }, HTTPStatus.CREATED);
        return;
      }

      let taskGuid = generateGUID();
      const [ task, taskPromise ] = await this._materializedHistoryService.createDeleteBranchTask({
        taskGuid: taskGuid,
        branchGuids: req.body.branchGuids,
        taskUrl: `http://${this._myHostPort}/v1/branchDeletion/${taskGuid}`
      });

      taskPromise.then(() => {
        if (!replied) {
          replied = true;
          this.render(res, task, HTTPStatus.OK);
        }
      });

      setTimeout(() => {
        if (!replied) {
          replied = true;
          this.render(res, task, HTTPStatus.OK);
        }
      }, LONG_POLLING_TIME);
    } catch (ex) {
      next(ex);
    }
  }

  /**
   * Returns a branches deletion task
   *
   * @param {Request}  req - The request
   * @param {Response} res - The response
   * @param {function} next - Next middleware
   */
  async getDeleteBranchTask(req, res, next) {
    let replied = false;
    try {
      const [ task, taskPromise ] = await this._materializedHistoryService.getDeleteBranchTask({
        taskGuid: req.params.taskGuid
      });

      if (!task) {
        next(new OperationError(
          'Not found', 'getDeleteBranchTask', HTTPStatus.NOT_FOUND, OperationError.FLAGS.TRANSIENT)
        );
        return;
      }

      await new Promise((resolve, reject) => {
        this._requestSignatureValidator.validateSignature(BranchGuidProvider.fromArgument(task.branchGuids))(req, res,
          (err) => {
            if (err) {
              replied = true;
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });

      if (task.status === 'COMPLETED') {
        replied = true;
        this.render(res, task, HTTPStatus.OK);
        return;
      }

      if (taskPromise) {
        taskPromise.then(() => {
          if (!replied) {
            replied = true;
            this.render(res, task, HTTPStatus.OK);
          }
        });

        setTimeout(() => {
          if (!replied) {
            replied = true;
            this.render(res, task, HTTPStatus.OK);
          }
        }, LONG_POLLING_TIME);
      } else {
        // If the task is requested on an instance not processing it, just wait a bit
        // and return the result, fetched again from Dynamo
        setTimeout(async () => {
          const [ task2 ] = await this._materializedHistoryService.getDeleteBranchTask({
            taskGuid: req.params.taskGuid
          });
          replied = true;
          this.render(res, task2, HTTPStatus.OK);
        }, LONG_POLLING_TIME);
      }
    } catch (ex) {
      replied = true;
      next(ex);
    }
  }

  /**
   * Reinitializes the processing of a branches deletion task
   *
   * @param {Request}  req - The request
   * @param {Response} res - The response
   * @param {function} next - Next middleware
   */
  async retryDeleteBranchTask(req, res, next) {
    let replied = false;
    try {
      const [ task ] = await this._materializedHistoryService.getDeleteBranchTask({
        taskGuid: req.params.taskGuid
      });

      if (!task) {
        next(new OperationError(
          'Not found', 'retryDeleteBranchTask', HTTPStatus.NOT_FOUND, OperationError.FLAGS.TRANSIENT)
        );
        return;
      }

      await new Promise((resolve, reject) => {
        this._requestSignatureValidator.validateSignature(BranchGuidProvider.fromArgument(task.branchGuids))(req, res,
          (err) => {
            if (err) {
              replied = true;
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });

      // Synchronously set a non-error state.
      // In theory, we are not guaranteed to set the status to
      // Something else than error, in time, before
      // the setTimeout hits.
      // This guarantees it.
      task.status = 'RETRYING';
      delete task.error;
      task.taskUrl = `http://${this._myHostPort}/v1/branchDeletion/${task.taskGuid}`;
      // We also need to write before setting the timeout for long polling
      // otherwise we might still resolve with the errored state.
      // if the database is slow, we might time out on the client that expects a response
      // within a few seconds of LONG_POLLING_TIME but that is the price to pay.
      await this._materializedHistoryService._deletionManager._writeTaskStatus(task);
      const taskPromise = this._materializedHistoryService.retryDeleteBranchTask(task);

      taskPromise.then(() => {
        if (!replied) {
          replied = true;
          this.render(res, task, HTTPStatus.OK);
        }
      });
      setTimeout(() => {
        if (!replied) {
          replied = true;
          this.render(res, task, HTTPStatus.OK);
        }
      }, LONG_POLLING_TIME);
    } catch (ex) {
      next(ex);
    }
  }

  /**
   * Make sure all required keys exist
   * @param {Array<String>} in_requiredBodyKeys - The keys that are required in the body
   * @param {Array<String>} in_requiredParamKeys - The keys that are required in the params
   * @return {function} - Express middleware
   */
  _checkKeys(in_requiredBodyKeys, in_requiredParamKeys) {
    return (req, res, next) => {
      let errors = [];

      for (let key of in_requiredBodyKeys) {
        if (req.body[key] === undefined) {
          errors.push(new OperationError(`Missing body element: '${key}'`, 'Bad Request', HTTPStatus.BAD_REQUEST,
            OperationError.FLAGS.QUIET));
        }
      }
      for (let key of in_requiredParamKeys) {
        if (req.params[key] === undefined) {
          errors.push(new OperationError(`Missing parameter: '${key}'`, 'Bad Request', HTTPStatus.BAD_REQUEST,
            OperationError.FLAGS.QUIET));
        }
      }

      if (errors.length !== 0) {
        return next(errors);
      }

      return next();
    };
  }

  /**
   * Error handling middleware
   * @param {Error}  err - The error
   * @param {Request}  req - The request
   * @param {Response} res - The response
   * @param {function} next - Next middleware
   */
  _handleErrors(err, req, res, next) {
    let errors = err;

    if (!_.isArray(errors)) {
      errors = [err];
    }

    this.render(res, { errors }, errors[0].statusCode || HTTPStatus.INTERNAL_SERVER_ERROR);
  }
}

module.exports = BranchesController;

