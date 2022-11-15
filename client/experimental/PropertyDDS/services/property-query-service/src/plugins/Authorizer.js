/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// If we are not enforcing and were not passed a user, use this:
const _mockUser = 'User_Good';
const _mockPolicyId = 'mockPolicyId';

/**
 * @fileoverview
 * Class for managing Access Control Management Wrapper
 */
class Authorizer {
  /**
   * Authorizer constructor
   **/
  constructor() {
    this.enforce = false;
    this.initialized = false;
    this._dependencies = {};
  }

  /**
   * Asynchronous initialization function
   * @param {function} [in_callback] Asynchronous callback called with Error or undefined if successful
   * @return {Promise} Promise.
   **/
  init(in_callback) {
    this.initialized = true;
    if (in_callback) {
      in_callback();
    }
    return Promise.resolve();
  }

  /**
   * Add a new dependency to the AuthorizerPlugin
   * @param {String} in_name The dependency name
   * @param {Object} in_dependency The dependency to add
   */
  setDependency(in_name, in_dependency) {
    this._dependencies[in_name] = in_dependency;
  }

  /**
   * Get a dependency from AuthorizerPlugin
   * @param {String} in_name The dependency name
   * @return {Object} The dependency to add
   */
  getDependency(in_name) {
    return this._dependencies[in_name];
  }

  /**
   * Create policies for this user with the specified list of actions
   * @param {object} subject - Request subject
   * @param {Array=} actions - The optional list of actions to be used in creating the new policies
   * @return {Promise} - An object with the userId and policyIds created if resolved, Error if rejected
   */
  createSubjectIdActionPolicies(subject, actions) {
    const uid = _mockUser;

    const response = {
      userId: uid,
      policyIds: [uid + '-read', uid + '-write', uid + '-delete'],
      subjectId: 'O2User:' + uid
    };

    return Promise.resolve(response);
  }

  /**
   * Called when Containers are created.
   * @param {object} in_subject - The subject from the request to create containers.
   * @param {Array<string>=} in_actions - The optional actions to apply to those containers.
   *   Defaults to read,write,delete
   * @param {Array<object>} containers - The new containers
   * @return {Promise} - Pass through the containers argument
   */
  onCreateContainers(in_subject, in_actions, containers) {
    return Promise.resolve(containers);
  }

  /**
   * Call this to set up sharing policies on URNs.
   * @param {String} subject - token with the id of the user or service making the change
   * @param {object} in_params - parameters for sharing
   * @return {Promise} - The result of all of that, either resolve or fail
   */
  sharing(subject, in_params) {
    return Promise.resolve(in_params.urns);
  }

  /**
   * Called when a Container/Repository is created
   * @param {object} in_subject - The subject on the request that created the new repository
   * @param {Array<string>=} in_actions - The optional actions to assign to the repository
   * @param {Object} in_repository - New repository with v2 urn
   * @param {object} in_shareOptions - Optional repository/branch share options
   * @return {Promise} - Pass through the repository argument
   */
  onCreateRepository(in_subject, in_actions, in_repository, in_shareOptions = {}) {
    return Promise.resolve(in_repository);
  }

  /**
   * Called when a Branch is created
   * @param {object} in_subject - Initial subject from the submitted request. Needed for userId or serviceId,
   * @param {Array<string>=} in_actions - List of actions to apply, optional. The defaults will be
   *   applied if not specified
   * @param {Object} in_branch - New branch with v2 urn
   * @return {Promise} - Pass through the branch argument
   * @private
   */
  onCreateBranch(in_subject, in_actions, in_branch) {
    return Promise.resolve(in_branch);
  }

  /**
   * Called when a Container/Repository is deleted.
   * @param {Object} in_repo_urn - Existing Repository v2 Urn
   * @return {Promise} - Pass through the repository argument
   */
  onDeleteRepository(in_repo_urn) {
    return Promise.resolve(in_repo_urn);
  }

  /**
   * Called when a Branch is deleted.
   * @param {Object} in_branch_urn - Existing Branch v2 Urn
   * @return {Promise} - Pass through the branch argument
   */
  onDeleteBranch(in_branch_urn) {
    return Promise.resolve(in_branch_urn);
  }

  /**
   * Called when a repository is expired.
   * @param {string} in_urn - The repository (or branch) v2 urn that is being expired
   * @return {Promise<string>} - The URN of the successfully expired repo, or rejects
   */
  onExpireRepository(in_urn) {
    return Promise.resolve(in_urn);
  }

  /**
   * Called when a branch is expired.
   * @param {string} in_branch_urn - The branch that is being expired
   * @return {Promise<string>} - The URN of the successfully expired branch, or rejects
   */
  onExpireBranch(in_branch_urn) {
    return this.onExpireRepository(in_branch_urn);
  }

  /**
   * Called to unexpire a repository.
   * @param {string} in_urn - The repository (or branch, also okay) v2 urn that is being unexpired
   * @return {Promise<string>} - The URN of the successfully unexpired repo, or rejects
   */
  onUnexpireRepository(in_urn) {
    return Promise.resolve(in_urn);
  }

  /**
   * Called when a branch is unexpired.
   * @param {string} in_branch_urn - The branch that is being unexpired
   * @return {Promise<string>} - The URN of the successfully unexpired branch, or rejects
   */
  onUnexpireBranch(in_branch_urn) {
    return this.onUnexpireRepository(in_branch_urn);
  }

  /**
   * Gets a user's groups
   * @param {string} userId - the userId to query
   * @param {Array<string>=} scopes - filter a user's groups by these scopes
   * @return {Promise<Array>} - A Promise resolving in an array of group Ids

   */
  getGroupsForUserId(userId, scopes) {
    return Promise.resolve([]);
  }

  /**
   * Validate that the user or client has the permission to access the resource
   * @param {object} subject - Request subject
   * @param {string|Array<string>} resource - The resource or resources we are determining access for
   * @param {string|Array<string>} action - The action or actions we want access for ('read', 'write' or 'delete')
   * @param {object=} in_params - Optional parameters for the authorization check
   * @return {Promise} - UserId or ClientId if resolved, Error if rejected
   */
  validateUserHasPermission(subject, resource, action, in_params) {
    return Promise.resolve('O2User:' + _mockUser);
  }

  /**
   * Authorize a user / action against a list of policyIds
   * Returns the list policyIds that matched user & actions
   * @param {object} subject - Request subject with subject information to resolve group membership
   * @param {string|Array<string>} action - The action or actions we want access for
   * @param {Array<string>} policyIds - The ids of the policy we want to check
   * @return {Promise} - Array of matching policyIds
   */
  batchAuthorizePolicy(subject, action, policyIds) {
    return Promise.resolve({ policyIds: [ _mockPolicyId ] });
  }

  /**
   * Create multiple policies for subjects and actions
   * @param {object} params - parameters for creating the policies
   * @param {Array<string>} params.actions - actions for which to create policies
   * @param {Array<string>} [params.userIds] - Optional user ids which will get policies assigned
   * @param {Array<string>} [params.groupIds] - Optional group ids which will get policies assigned
   * @param {Array<string>} [params.serviceIds] - Optional service ids which will get policies assigned
   * @return {Promise<Array<string>>} Resulting list of created policyIds
   */
  batchCreatePolicies(params) {
    return Promise.resolve([ _mockPolicyId ]);
  }

  /**
   * Convert the creatorId from the given v1 object to v2
   * @param {object} objectWithCreator - if object has a creatorId, we convert it
   * @return {string} creatorId - converted creatorId
   */
  convertObjectV2creatorIdToV1(objectWithCreator) {
    return objectWithCreator.creatorId;
  }

  /**
   * Get the creatorId from the given object
   * @param {object} in_object - Any object that contains creatorId parameter
   * @return {string} creatorId
   */
  getCreatorIdFromObject(in_object) {
    return in_object.creatorId ? in_object.creatorId : undefined;
  }

  /**
   * @param {object} in_subject - Subject to check
   * @return {string} Subject Id
   */
  getSubjectId(in_subject) {
    return in_subject.userId || in_subject.clientId;
  }

  /**
   * Get permissions from the list of policyIds
   * @param {Array<string>} policyIds - The ids of the policy
   * @return {Promise} - Permissions object that contains client ids and its actions
   * Return permissions example:
   * {
   *  userIds: {
   *    userId1: [property.read, property.write]
   *    userId2: [property.write, branch.delete]
   *  }
   *  serviceIds: {
   *    serviceId1: [property.write]
   *    serviceId2: [branch.read, branch.delete]
   *  }
   *  groupIds: {
   *    groupId1: [branch.write]
   *    groupId2: [property.read, property.write]
   *  }
   * }
   */
  getPermissionsFromPolicyIds(policyIds) {
    return Promise.resolve({
      userIds: {
        [_mockUser]: ['branch.read']
      }
    });
  }

  /**
   * Get permissions from a resource URN
   * @param {string} urn - Resource URN
   * @return {Promise} - Permissions object that map client ids to actions
   * Return permissions example:
   * {
   *  userIds: {
   *    O2userId1: [read, write]
   *    O2userId2: [write, delete]
   *  }
   *  serviceIds: {
   *    serviceId1: [write]
   *    serviceId2: [read, delete]
   *  }
   *  groupIds: {
   *    groupId1: [write]
   *    groupId2: [read, write]
   *  }
   * }
   */
  getResourcePermissions(urn) {
    return Promise.resolve({
      userIds: {
        [_mockUser]: ['read']
      }
    });
  }

  /**
   * Recover all policyIds from passed subjects and actions
   * @param {object} params - parameters for recovering the policyIds
   * @param {Array<string>} params.actions - actions to recover policyIds
   * @param {Array<string>} [params.userIds = []] - Optional userIds to recover policyIds
   * @param {Array<string>} [params.groupIds = []] - Optional groupIds to recover policyIds
   * @param {Array<string>} [params.serviceIds = []] - Optional serviceIds to recover policyIds
   * @return {Array<string>} List of policyIds
   */
  recoverPolicyIds(params) {
    return [_mockPolicyId];
  }
}

module.exports = Authorizer;
