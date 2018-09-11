/*!
 * Labs.js JavaScript API for Office Mix
 * Version: 1.0.5 * Copyright (c) Microsoft Corporation.  All rights reserved.
 * Your use of this file is governed by the Microsoft Services Agreement http://go.microsoft.com/fwlink/?LinkId=266419.
 */
var Labs;
(function (Labs) {
    var Core;
    (function (Core) {
        ;
    })(Core = Labs.Core || (Labs.Core = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Core;
    (function (Core) {
        (function (LabMode) {
            LabMode[LabMode["Edit"] = 0] = "Edit";
            LabMode[LabMode["View"] = 1] = "View";
        })(Core.LabMode || (Core.LabMode = {}));
        var LabMode = Core.LabMode;
    })(Core = Labs.Core || (Labs.Core = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Core;
    (function (Core) {
        ;
    })(Core = Labs.Core || (Labs.Core = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Core;
    (function (Core) {
        var Permissions = (function () {
            function Permissions() {
            }
            Permissions.Edit = "Labs.Permissions.Edit";
            Permissions.Take = "Labs.Permissions.Take";
            return Permissions;
        })();
        Core.Permissions = Permissions;
    })(Core = Labs.Core || (Labs.Core = {}));
})(Labs || (Labs = {}));
//# sourceMappingURL=LabsCore.js.map
var Labs;
(function (Labs) {
    var Core;
    (function (Core) {
        var Actions;
        (function (Actions) {
            Actions.CloseComponentAction = "Labs.Core.Actions.CloseComponentAction";
        })(Actions = Core.Actions || (Core.Actions = {}));
    })(Core = Labs.Core || (Labs.Core = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Core;
    (function (Core) {
        var Actions;
        (function (Actions) {
            Actions.CreateAttemptAction = "Labs.Core.Actions.CreateAttemptAction";
        })(Actions = Core.Actions || (Core.Actions = {}));
    })(Core = Labs.Core || (Labs.Core = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Core;
    (function (Core) {
        var Actions;
        (function (Actions) {
            Actions.CreateComponentAction = "Labs.Core.Actions.CreateComponentAction";
        })(Actions = Core.Actions || (Core.Actions = {}));
    })(Core = Labs.Core || (Labs.Core = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Core;
    (function (Core) {
        var Actions;
        (function (Actions) {
            Actions.AttemptTimeoutAction = "Labs.Core.Actions.AttemptTimeoutAction";
        })(Actions = Core.Actions || (Core.Actions = {}));
    })(Core = Labs.Core || (Labs.Core = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Core;
    (function (Core) {
        var Actions;
        (function (Actions) {
            Actions.GetValueAction = "Labs.Core.Actions.GetValueAction";
        })(Actions = Core.Actions || (Core.Actions = {}));
    })(Core = Labs.Core || (Labs.Core = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Core;
    (function (Core) {
        var Actions;
        (function (Actions) {
            Actions.ResumeAttemptAction = "Labs.Core.Actions.ResumeAttemptAction";
        })(Actions = Core.Actions || (Core.Actions = {}));
    })(Core = Labs.Core || (Labs.Core = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Core;
    (function (Core) {
        var Actions;
        (function (Actions) {
            Actions.SubmitAnswerAction = "Labs.Core.Actions.SubmitAnswerAction";
        })(Actions = Core.Actions || (Core.Actions = {}));
    })(Core = Labs.Core || (Labs.Core = {}));
})(Labs || (Labs = {}));
//# sourceMappingURL=LabsActions.js.map
var Labs;
(function (Labs) {
    var Core;
    (function (Core) {
        var GetActions;
        (function (GetActions) {
            GetActions.GetComponentActions = "Labs.Core.GetActions.GetComponentActions";
        })(GetActions = Core.GetActions || (Core.GetActions = {}));
    })(Core = Labs.Core || (Labs.Core = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Core;
    (function (Core) {
        var GetActions;
        (function (GetActions) {
            GetActions.GetAttempt = "Labs.Core.GetActions.GetAttempt";
        })(GetActions = Core.GetActions || (Core.GetActions = {}));
    })(Core = Labs.Core || (Labs.Core = {}));
})(Labs || (Labs = {}));
//# sourceMappingURL=LabsGetActions.js.map
var Labs;
(function (Labs) {
    Labs.TimelineNextMessageType = "Labs.Message.Timeline.Next";
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var ComponentInstanceBase = (function () {
        function ComponentInstanceBase() {
        }
        ComponentInstanceBase.prototype.attach = function (id, labs) {
            this._id = id;
            this._labs = labs;
        };
        return ComponentInstanceBase;
    })();
    Labs.ComponentInstanceBase = ComponentInstanceBase;
})(Labs || (Labs = {}));
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var Labs;
(function (Labs) {
    var ComponentInstance = (function (_super) {
        __extends(ComponentInstance, _super);
        function ComponentInstance() {
            _super.call(this);
        }
        ComponentInstance.prototype.createAttempt = function (callback) {
            var _this = this;
            var createAttemptAction = this.getCreateAttemptOptions();
            this._labs.takeAction(Labs.Core.Actions.CreateAttemptAction, createAttemptAction, function (err, createResult) {
                var attempt = null;
                if (!err) {
                    try {
                        attempt = _this.buildAttempt(createResult);
                    }
                    catch (exception) {
                        err = exception;
                    }
                }
                setTimeout(function () { return callback(err, attempt); }, 0);
            });
        };
        ComponentInstance.prototype.getAttempts = function (callback) {
            var _this = this;
            var componentSearch = {
                componentId: this._id,
                action: Labs.Core.Actions.CreateAttemptAction,
            };
            this._labs.getActions(Labs.Core.GetActions.GetComponentActions, componentSearch, function (err, actions) {
                var attempts = null;
                if (!err) {
                    attempts = actions.map(function (action) { return _this.buildAttempt(action); });
                }
                setTimeout(function () { return callback(null, attempts); }, 0);
            });
        };
        ComponentInstance.prototype.getCreateAttemptOptions = function () {
            var createAttemptAction = {
                componentId: this._id
            };
            return createAttemptAction;
        };
        ComponentInstance.prototype.buildAttempt = function (createAttemptResult) {
            throw "Not implemented";
        };
        return ComponentInstance;
    })(Labs.ComponentInstanceBase);
    Labs.ComponentInstance = ComponentInstance;
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    (function (ConnectionState) {
        ConnectionState[ConnectionState["Disconnected"] = 0] = "Disconnected";
        ConnectionState[ConnectionState["Connecting"] = 1] = "Connecting";
        ConnectionState[ConnectionState["Connected"] = 2] = "Connected";
    })(Labs.ConnectionState || (Labs.ConnectionState = {}));
    var ConnectionState = Labs.ConnectionState;
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var EventManager = (function () {
        function EventManager() {
            this._handlers = {};
        }
        EventManager.prototype.getHandler = function (event) {
            var handler = this._handlers[event];
            if (handler === undefined) {
                this._handlers[event] = [];
            }
            return this._handlers[event];
        };
        EventManager.prototype.add = function (event, handler) {
            var eventHandlers = this.getHandler(event);
            eventHandlers.push(handler);
        };
        EventManager.prototype.remove = function (event, handler) {
            var eventHandlers = this.getHandler(event);
            for (var i = eventHandlers.length - 1; i >= 0; i--) {
                if (eventHandlers[i] === handler) {
                    eventHandlers.splice(i, 1);
                }
            }
        };
        EventManager.prototype.fire = function (event, data) {
            var eventHandlers = this.getHandler(event);
            eventHandlers.forEach(function (handler) {
                handler(data);
            });
        };
        return EventManager;
    })();
    Labs.EventManager = EventManager;
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var LabEditor = (function () {
        function LabEditor(labsInternal, doneCallback) {
            this._labsInternal = labsInternal;
            this._doneCallback = doneCallback;
        }
        LabEditor.Create = function (labsInternal, doneCallback, callback) {
            if (labsInternal.isCreated()) {
                var labEditor = new LabEditor(labsInternal, doneCallback);
                setTimeout(function () { return callback(null, labEditor); }, 0);
            }
            else {
                labsInternal.create(function (err, data) {
                    if (err) {
                        setTimeout(function () { return callback(err, null); }, 0);
                        return;
                    }
                    var labEditor = new LabEditor(labsInternal, doneCallback);
                    setTimeout(function () { return callback(null, labEditor); }, 0);
                });
            }
        };
        LabEditor.prototype.getConfiguration = function (callback) {
            this._labsInternal.getConfiguration(callback);
        };
        LabEditor.prototype.setConfiguration = function (configuration, callback) {
            this._labsInternal.setConfiguration(configuration, callback);
        };
        LabEditor.prototype.done = function (callback) {
            this._doneCallback();
            this._doneCallback = null;
            setTimeout(function () { return callback(null, null); }, 0);
        };
        return LabEditor;
    })();
    Labs.LabEditor = LabEditor;
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var LabInstance = (function () {
        function LabInstance(labsInternal, components, doneCallback, data) {
            this._labsInternal = labsInternal;
            this.components = components;
            this._doneCallback = doneCallback;
            this.data = data;
        }
        LabInstance.Create = function (labsInternal, doneCallback, callback) {
            labsInternal.getConfigurationInstance(function (err, configuration) {
                if (err) {
                    setTimeout(function () { return callback(err, null); }, 0);
                    return;
                }
                if (!configuration) {
                    setTimeout(function () { return callback("No configuration set", null); }, 0);
                    return;
                }
                var components = configuration.components.map(function (component) {
                    var componentInstance = Labs.deserialize(component);
                    componentInstance.attach(component.componentId, labsInternal);
                    return componentInstance;
                });
                var labInstance = new LabInstance(labsInternal, components, doneCallback, configuration.data);
                setTimeout(function () { return callback(null, labInstance); }, 0);
            });
        };
        LabInstance.prototype.getState = function (callback) {
            this._labsInternal.getState(callback);
        };
        LabInstance.prototype.setState = function (state, callback) {
            this._labsInternal.setState(state, callback);
        };
        LabInstance.prototype.done = function (callback) {
            this._doneCallback();
            this._doneCallback = null;
            setTimeout(function () { return callback(null, null); }, 0);
        };
        return LabInstance;
    })();
    Labs.LabInstance = LabInstance;
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var _connectionState = 0 /* Disconnected */;
    var _labsInternal;
    var _connectionResponse;
    var _timeline;
    var _labDeserializers = {};
    var _labInstance = null;
    var _labEditor = null;
    Labs.DefaultHostBuilder;
    function connect(labHost, callback) {
        if (_connectionState !== 0 /* Disconnected */) {
            throw "connect has previously been called";
        }
        var translatedCallback = callback === undefined ? labHost : callback;
        var translatedLabHost = callback === undefined ? Labs.DefaultHostBuilder() : labHost;
        var labsInternal;
        try {
            labsInternal = new Labs.LabsInternal(translatedLabHost);
        }
        catch (exception) {
            setTimeout(function () { return translatedCallback(exception, null); }, 0);
            return;
        }
        _connectionState = 1 /* Connecting */;
        labsInternal.connect(function (err, connectionResponse) {
            if (err) {
                _connectionState = 0 /* Disconnected */;
                _labsInternal = null;
                _connectionResponse = null;
            }
            else {
                _connectionState = 2 /* Connected */;
                _labsInternal = labsInternal;
                _connectionResponse = connectionResponse;
                _timeline = new Labs.Timeline(_labsInternal);
            }
            setTimeout(function () {
                translatedCallback(err, connectionResponse);
                labsInternal.firePendingMessages();
            }, 0);
        });
    }
    Labs.connect = connect;
    function isConnected() {
        return _connectionState === 2 /* Connected */;
    }
    Labs.isConnected = isConnected;
    function getConnectionInfo() {
        checkIsConnected();
        return _connectionResponse;
    }
    Labs.getConnectionInfo = getConnectionInfo;
    function disconnect() {
        checkIsConnected();
        _labsInternal.dispose();
        _labsInternal = null;
        _timeline = null;
        _labInstance = null;
        _labEditor = null;
        _connectionState = 0 /* Disconnected */;
    }
    Labs.disconnect = disconnect;
    function editLab(callback) {
        checkIsConnected();
        if (_labInstance !== null) {
            setTimeout(function () { return callback("Lab is being taken", null); });
            return;
        }
        if (_labEditor !== null) {
            setTimeout(function () { return callback("Lab edit already in progress", null); });
            return;
        }
        Labs.LabEditor.Create(_labsInternal, function () {
            _labEditor = null;
        }, function (err, labEditor) {
            _labEditor = !err ? labEditor : null;
            setTimeout(function () { return callback(err, labEditor); }, 0);
        });
    }
    Labs.editLab = editLab;
    function takeLab(callback) {
        checkIsConnected();
        if (_labEditor !== null) {
            setTimeout(function () { return callback("Lab is being edited", null); });
            return;
        }
        if (_labInstance !== null) {
            setTimeout(function () { return callback("Lab already in progress", null); });
            return;
        }
        Labs.LabInstance.Create(_labsInternal, function () {
            _labInstance = null;
        }, function (err, labInstance) {
            _labInstance = !err ? labInstance : null;
            setTimeout(function () { return callback(err, labInstance); }, 0);
        });
    }
    Labs.takeLab = takeLab;
    function on(event, handler) {
        checkIsConnected();
        _labsInternal.on(event, handler);
    }
    Labs.on = on;
    function off(event, handler) {
        checkIsConnected();
        _labsInternal.off(event, handler);
    }
    Labs.off = off;
    function getTimeline() {
        checkIsConnected();
        return _timeline;
    }
    Labs.getTimeline = getTimeline;
    function registerDeserializer(type, deserialize) {
        if (type in _labDeserializers) {
            throw "Type already has a create function registered";
        }
        _labDeserializers[type] = deserialize;
    }
    Labs.registerDeserializer = registerDeserializer;
    function deserialize(json) {
        if (!(json.type in _labDeserializers)) {
            throw "Unknown type";
        }
        return _labDeserializers[json.type](json);
    }
    Labs.deserialize = deserialize;
    function getLanguage() {
        return _labsInternal.getLanguage();
    }
    Labs.getLanguage = getLanguage;
    function checkIsConnected() {
        // if (_connectionState != 2 /* Connected */) {
            // throw "API not initialized";
        // }
    }
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var LabsInternalState;
    (function (LabsInternalState) {
        LabsInternalState[LabsInternalState["None"] = 0] = "None";
        LabsInternalState[LabsInternalState["Initialized"] = 1] = "Initialized";
        LabsInternalState[LabsInternalState["Disposed"] = 2] = "Disposed";
    })(LabsInternalState || (LabsInternalState = {}));
    var LabsInternal = (function () {
        function LabsInternal(labHost) {
            this._state = 0 /* None */;
            this._eventManager = new Labs.EventManager();
            this._hostVersion = null;
            this._queuePendingMessages = true;
            this._pendingMessages = [];
            this._created = false;
            var versions = labHost.getSupportedVersions();
            var hasSupportedVersion = false;
            for (var i = 0; i < versions.length; i++) {
                if (versions[i].version.major === 0 && versions[i].version.minor <= 1) {
                    hasSupportedVersion = true;
                }
            }
            if (!hasSupportedVersion) {
                throw "Unsupported host version";
            }
            this._labHost = labHost;
        }
        LabsInternal.prototype.connect = function (callback) {
            var _this = this;
            if (this._state !== 0 /* None */) {
                throw "Already initialized";
            }
            this._labHost.connect(this._labHost.getSupportedVersions().splice(0), function (err, initialState) {
                if (!err) {
                    _this._state = 1 /* Initialized */;
                    _this._hostVersion = initialState.hostVersion;
                    _this._createInfo = initialState.initializationInfo;
                    _this._language = _this._labHost.getLanguage();
                    _this._labHost.on(function (message, messageData) {
                        if (_this._queuePendingMessages) {
                            _this._pendingMessages.push({ message: message, messageData: messageData });
                        }
                        else {
                            _this._eventManager.fire(message, messageData);
                        }
                    });
                }
                setTimeout(function () { return callback(err, initialState); }, 0);
            });
        };
        LabsInternal.prototype.firePendingMessages = function () {
            var _this = this;
            this._queuePendingMessages = false;
            this._pendingMessages.forEach(function (pendingMessage) {
                _this._eventManager.fire(pendingMessage.message, pendingMessage.messageData);
            });
            this._pendingMessages = [];
        };
        LabsInternal.prototype.create = function (callback) {
            var _this = this;
            this.checkIsInitialized();
            this._labHost.create({}, function (err, editData) {
                _this._createInfo = {
                    hostVersion: _this._hostVersion
                };
                setTimeout(function () { return callback(err, editData); });
            });
        };
        LabsInternal.prototype.isCreated = function () {
            this.checkIsInitialized();
            return this._createInfo !== null;
        };
        LabsInternal.prototype.dispose = function () {
            this.checkIsInitialized();
            this._state = 2 /* Disposed */;
            this._labHost.disconnect(function (err, data) {
                if (err) {
                    console.error("Labs.js: Error disconnecting from host.");
                }
            });
        };
        LabsInternal.prototype.on = function (event, handler) {
            this.checkIsInitialized();
            this._eventManager.add(event, handler);
        };
        LabsInternal.prototype.sendMessage = function (type, options, callback) {
            this.checkIsInitialized();
            this._labHost.sendMessage(type, options, callback);
        };
        LabsInternal.prototype.off = function (event, handler) {
            this.checkIsInitialized();
            this._eventManager.remove(event, handler);
        };
        LabsInternal.prototype.getState = function (callback) {
            this.checkIsInitialized();
            this._labHost.getState(callback);
        };
        LabsInternal.prototype.setState = function (state, callback) {
            this.checkIsInitialized();
            this._labHost.setState(state, callback);
        };
        LabsInternal.prototype.getConfiguration = function (callback) {
            this.checkIsInitialized();
            this._labHost.getConfiguration(callback);
        };
        LabsInternal.prototype.setConfiguration = function (configuration, callback) {
            this.checkIsInitialized();
            this._labHost.setConfiguration(configuration, callback);
        };
        LabsInternal.prototype.getConfigurationInstance = function (callback) {
            this.checkIsInitialized();
            this._labHost.getConfigurationInstance(callback);
        };
        LabsInternal.prototype.takeAction = function (type, options, result, callback) {
            this.checkIsInitialized();
            if (callback !== undefined) {
                this._labHost.takeAction(type, options, result, callback);
            }
            else {
                this._labHost.takeAction(type, options, result);
            }
        };
        LabsInternal.prototype.getActions = function (type, options, callback) {
            this.checkIsInitialized();
            this._labHost.getActions(type, options, callback);
        };
        LabsInternal.prototype.getLanguage = function () {
            return this._labHost.getLanguage();
        };
        LabsInternal.prototype.checkIsInitialized = function () {
            if (this._state !== 1 /* Initialized */) {
                throw "Not initialized";
            }
        };
        return LabsInternal;
    })();
    Labs.LabsInternal = LabsInternal;
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Timeline = (function () {
        function Timeline(labsInternal) {
            this._labsInternal = labsInternal;
        }
        Timeline.prototype.next = function (completionStatus, callback) {
            var options = {
                status: completionStatus
            };
            this._labsInternal.sendMessage(Labs.TimelineNextMessageType, options, function (err, result) {
                setTimeout(function () { return callback(err, null); }, 0);
            });
        };
        return Timeline;
    })();
    Labs.Timeline = Timeline;
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var ValueHolder = (function () {
        function ValueHolder(componentId, attemptId, id, labs, isHint, hasBeenRequested, hasValue, value) {
            this._componentId = componentId;
            this._attemptId = attemptId;
            this.id = id;
            this._labs = labs;
            this.isHint = isHint;
            this.hasBeenRequested = hasBeenRequested;
            this.hasValue = hasValue;
            this.value = value;
        }
        ValueHolder.prototype.getValue = function (callback) {
            var _this = this;
            if (this.hasValue && this.hasBeenRequested) {
                setTimeout(function () { return callback(null, _this.value); }, 0);
                return;
            }
            var options = {
                componentId: this._componentId,
                attemptId: this._attemptId,
                valueId: this.id,
                isHint: this.isHint
            };
            this._labs.takeAction(Labs.Core.Actions.GetValueAction, options, function (err, completedAction) {
                if (!err) {
                    var result = completedAction.result;
                    _this.value = result.value;
                    _this.hasValue = true;
                    _this.hasBeenRequested = true;
                }
                setTimeout(function () { return callback(err, _this.value); }, 0);
            });
        };
        ValueHolder.prototype.provideValue = function (value) {
            this.value = value;
            this.hasValue = true;
            this.hasBeenRequested = true;
        };
        return ValueHolder;
    })();
    Labs.ValueHolder = ValueHolder;
})(Labs || (Labs = {}));
//# sourceMappingURL=LabsApi.js.map
var Labs;
(function (Labs) {
    var Components;
    (function (Components) {
        var ComponentAttempt = (function () {
            function ComponentAttempt(labs, componentId, attemptId, values) {
                this._resumed = false;
                this._state = 0 /* InProgress */;
                this._values = {};
                this._labs = labs;
                this._id = attemptId;
                this._componentId = componentId;
                for (var key in values) {
                    var valueHolderValues = [];
                    var valueArray = values[key];
                    for (var i = 0; i < valueArray.length; i++) {
                        var value = valueArray[i];
                        valueHolderValues.push(new Labs.ValueHolder(this._componentId, this._id, value.valueId, this._labs, value.isHint, false, value.hasValue, value.value));
                    }
                    this._values[key] = valueHolderValues;
                }
            }
            ComponentAttempt.prototype.verifyResumed = function () {
                if (!this._resumed) {
                    throw "Attempt has not yet been resumed";
                }
            };
            ComponentAttempt.prototype.isResumed = function () {
                return this._resumed;
            };
            ComponentAttempt.prototype.resume = function (callback) {
                var _this = this;
                if (this._resumed) {
                    throw "Already resumed";
                }
                var attemptSearch = {
                    attemptId: this._id
                };
                this._labs.getActions(Labs.Core.GetActions.GetAttempt, attemptSearch, function (err, actions) {
                    if (err) {
                        setTimeout(function () { return callback(err, null); }, 0);
                        return;
                    }
                    _this.resumeCore(actions);
                    _this.sendResumeAction(function (resumeErr, data) {
                        if (!resumeErr) {
                            _this._resumed = true;
                        }
                        setTimeout(function () { return callback(err, data); });
                    });
                });
            };
            ComponentAttempt.prototype.sendResumeAction = function (callback) {
                var resumeAttemptActon = {
                    componentId: this._componentId,
                    attemptId: this._id
                };
                this._labs.takeAction(Labs.Core.Actions.ResumeAttemptAction, resumeAttemptActon, function (err, data) {
                    if (!err) {
                    }
                    setTimeout(function () { return callback(err, null); }, 0);
                });
            };
            ComponentAttempt.prototype.resumeCore = function (actions) {
                for (var i = 0; i < actions.length; i++) {
                    var action = actions[i];
                    this.processAction(action);
                }
            };
            ComponentAttempt.prototype.getState = function () {
                return this._state;
            };
            ComponentAttempt.prototype.processAction = function (action) {
                if (action.type === Labs.Core.Actions.GetValueAction) {
                    this.useValue(action);
                }
                else if (action.type == Labs.Core.Actions.AttemptTimeoutAction) {
                    this._state = 1 /* Timeout */;
                }
            };
            ComponentAttempt.prototype.getValues = function (key) {
                this.verifyResumed();
                return this._values[key];
            };
            ComponentAttempt.prototype.useValue = function (completedSubmission) {
                var useValueAction = completedSubmission.options;
                var useValueResult = completedSubmission.result;
                var valueId = useValueAction.valueId;
                for (var key in this._values) {
                    var valueArray = this._values[key];
                    for (var i = 0; i < valueArray.length; i++) {
                        if (valueArray[i].id === valueId) {
                            valueArray[i].provideValue(useValueResult.value);
                        }
                    }
                }
            };
            return ComponentAttempt;
        })();
        Components.ComponentAttempt = ComponentAttempt;
    })(Components = Labs.Components || (Labs.Components = {}));
})(Labs || (Labs = {}));
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var Labs;
(function (Labs) {
    var Components;
    (function (Components) {
        var ActivityComponentAttempt = (function (_super) {
            __extends(ActivityComponentAttempt, _super);
            function ActivityComponentAttempt(labs, componentId, attemptId, values) {
                _super.call(this, labs, componentId, attemptId, values);
            }
            ActivityComponentAttempt.prototype.complete = function (callback) {
                var _this = this;
                var submitAnswer = {
                    componentId: this._componentId,
                    attemptId: this._id,
                    answer: null
                };
                this._labs.takeAction(Labs.Core.Actions.SubmitAnswerAction, submitAnswer, null, function (err, completedAction) {
                    if (err) {
                        setTimeout(function () { return callback(err, null); }, 0);
                        return;
                    }
                    _this._state = 2 /* Completed */;
                    setTimeout(function () { return callback(null, null); }, 0);
                });
            };
            ActivityComponentAttempt.prototype.processAction = function (action) {
                if (action.type === Labs.Core.Actions.SubmitAnswerAction) {
                    this._state = 2 /* Completed */;
                }
                else if (action.type === Labs.Core.Actions.GetValueAction) {
                    _super.prototype.processAction.call(this, action);
                }
            };
            return ActivityComponentAttempt;
        })(Components.ComponentAttempt);
        Components.ActivityComponentAttempt = ActivityComponentAttempt;
    })(Components = Labs.Components || (Labs.Components = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Components;
    (function (Components) {
        Components.ActivityComponentInstanceType = "Labs.Components.ActivityComponentInstance";
        var ActivityComponentInstance = (function (_super) {
            __extends(ActivityComponentInstance, _super);
            function ActivityComponentInstance(component) {
                _super.call(this);
                this.component = component;
            }
            ActivityComponentInstance.prototype.buildAttempt = function (createAttemptAction) {
                var id = createAttemptAction.result.attemptId;
                return new Components.ActivityComponentAttempt(this._labs, this.component.componentId, id, this.component.values);
            };
            return ActivityComponentInstance;
        })(Labs.ComponentInstance);
        Components.ActivityComponentInstance = ActivityComponentInstance;
        Labs.registerDeserializer(Components.ActivityComponentInstanceType, function (json) {
            return new ActivityComponentInstance(json);
        });
    })(Components = Labs.Components || (Labs.Components = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Components;
    (function (Components) {
        var ChoiceComponentAnswer = (function () {
            function ChoiceComponentAnswer(answer) {
                this.answer = answer;
            }
            return ChoiceComponentAnswer;
        })();
        Components.ChoiceComponentAnswer = ChoiceComponentAnswer;
    })(Components = Labs.Components || (Labs.Components = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Components;
    (function (Components) {
        var ChoiceComponentAttempt = (function (_super) {
            __extends(ChoiceComponentAttempt, _super);
            function ChoiceComponentAttempt(labs, componentId, attemptId, values) {
                _super.call(this, labs, componentId, attemptId, values);
                this._submissions = [];
            }
            ChoiceComponentAttempt.prototype.timeout = function (callback) {
                var _this = this;
                this._labs.takeAction(Labs.Core.Actions.AttemptTimeoutAction, { attemptId: this._id }, function (err, result) {
                    if (!err) {
                        _this._state = 1 /* Timeout */;
                    }
                    setTimeout(function () { return callback(err, null); }, 0);
                });
            };
            ChoiceComponentAttempt.prototype.getSubmissions = function () {
                this.verifyResumed();
                return this._submissions;
            };
            ChoiceComponentAttempt.prototype.submit = function (answer, result, callback) {
                var _this = this;
                this.verifyResumed();
                var submitAnswer = {
                    componentId: this._componentId,
                    attemptId: this._id,
                    answer: answer.answer
                };
                var submitResult = {
                    submissionId: null,
                    complete: result.complete,
                    score: result.score
                };
                this._labs.takeAction(Labs.Core.Actions.SubmitAnswerAction, submitAnswer, submitResult, function (err, completedAction) {
                    if (err) {
                        setTimeout(function () { return callback(err, null); }, 0);
                        return;
                    }
                    var submission = _this.storeSubmission(completedAction);
                    setTimeout(function () { return callback(null, submission); }, 0);
                });
            };
            ChoiceComponentAttempt.prototype.processAction = function (action) {
                if (action.type === Labs.Core.Actions.SubmitAnswerAction) {
                    this.storeSubmission(action);
                }
                else {
                    _super.prototype.processAction.call(this, action);
                }
            };
            ChoiceComponentAttempt.prototype.storeSubmission = function (completedSubmission) {
                var options = completedSubmission.options;
                var result = completedSubmission.result;
                if (result.complete) {
                    this._state = 2 /* Completed */;
                }
                var submission = new Components.ChoiceComponentSubmission(new Components.ChoiceComponentAnswer(options.answer), new Components.ChoiceComponentResult(result.score, result.complete), completedSubmission.time);
                this._submissions.push(submission);
                return submission;
            };
            return ChoiceComponentAttempt;
        })(Components.ComponentAttempt);
        Components.ChoiceComponentAttempt = ChoiceComponentAttempt;
    })(Components = Labs.Components || (Labs.Components = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Components;
    (function (Components) {
        Components.ChoiceComponentInstanceType = "Labs.Components.ChoiceComponentInstance";
        var ChoiceComponentInstance = (function (_super) {
            __extends(ChoiceComponentInstance, _super);
            function ChoiceComponentInstance(component) {
                _super.call(this);
                this.component = component;
            }
            ChoiceComponentInstance.prototype.buildAttempt = function (createAttemptAction) {
                var id = createAttemptAction.result.attemptId;
                return new Components.ChoiceComponentAttempt(this._labs, this.component.componentId, id, this.component.values);
            };
            return ChoiceComponentInstance;
        })(Labs.ComponentInstance);
        Components.ChoiceComponentInstance = ChoiceComponentInstance;
        Labs.registerDeserializer(Components.ChoiceComponentInstanceType, function (json) {
            return new ChoiceComponentInstance(json);
        });
    })(Components = Labs.Components || (Labs.Components = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Components;
    (function (Components) {
        Components.DynamicComponentInstanceType = "Labs.Components.DynamicComponentInstance";
        var DynamicComponentInstance = (function (_super) {
            __extends(DynamicComponentInstance, _super);
            function DynamicComponentInstance(component) {
                _super.call(this);
                this.component = component;
            }
            DynamicComponentInstance.prototype.getComponents = function (callback) {
                var _this = this;
                var componentSearch = {
                    componentId: this._id,
                    action: Labs.Core.Actions.CreateComponentAction,
                };
                this._labs.getActions(Labs.Core.GetActions.GetComponentActions, componentSearch, function (err, actions) {
                    var components = actions.map(function (action) { return _this.createComponentInstance(action); });
                    setTimeout(function () { return callback(null, components); }, 0);
                });
            };
            DynamicComponentInstance.prototype.createComponent = function (component, callback) {
                var _this = this;
                var options = {
                    componentId: this._id,
                    component: component
                };
                this._labs.takeAction(Labs.Core.Actions.CreateComponentAction, options, function (err, result) {
                    var instance = null;
                    if (!err) {
                        instance = _this.createComponentInstance(result);
                    }
                    setTimeout(function () { return callback(err, instance); }, 0);
                });
            };
            DynamicComponentInstance.prototype.createComponentInstance = function (action) {
                var componentInstanceDefinition = action.result.componentInstance;
                var componentInstance = Labs.deserialize(componentInstanceDefinition);
                componentInstance.attach(componentInstanceDefinition.componentId, this._labs);
                return componentInstance;
            };
            DynamicComponentInstance.prototype.close = function (callback) {
                var _this = this;
                this.isClosed(function (err, closed) {
                    if (err) {
                        setTimeout(function () { return callback(err, null); });
                        return;
                    }
                    var options = {
                        componentId: _this._id
                    };
                    _this._labs.takeAction(Labs.Core.Actions.CloseComponentAction, options, null, function (err, action) {
                        setTimeout(function () { return callback(err, null); });
                    });
                });
            };
            DynamicComponentInstance.prototype.isClosed = function (callback) {
                var componentSearch = {
                    componentId: this._id,
                    action: Labs.Core.Actions.CloseComponentAction,
                };
                this._labs.getActions(Labs.Core.GetActions.GetComponentActions, componentSearch, function (err, actions) {
                    if (err) {
                        setTimeout(function () { return callback(err, null); }, 0);
                    }
                    else {
                        var closed = actions.length > 0;
                        setTimeout(function () { return callback(null, closed); }, 0);
                    }
                });
            };
            return DynamicComponentInstance;
        })(Labs.ComponentInstanceBase);
        Components.DynamicComponentInstance = DynamicComponentInstance;
        Labs.registerDeserializer(Components.DynamicComponentInstanceType, function (json) {
            return new DynamicComponentInstance(json);
        });
    })(Components = Labs.Components || (Labs.Components = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Components;
    (function (Components) {
        Components.ActivityComponentType = "Labs.Components.ActivityComponent";
    })(Components = Labs.Components || (Labs.Components = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Components;
    (function (Components) {
        Components.ChoiceComponentType = "Labs.Components.ChoiceComponent";
    })(Components = Labs.Components || (Labs.Components = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Components;
    (function (Components) {
        Components.Infinite = -1;
        Components.DynamicComponentType = "Labs.Components.DynamicComponent";
    })(Components = Labs.Components || (Labs.Components = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Components;
    (function (Components) {
        Components.InputComponentType = "Labs.Components.InputComponent";
    })(Components = Labs.Components || (Labs.Components = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Components;
    (function (Components) {
        var InputComponentAnswer = (function () {
            function InputComponentAnswer(answer) {
                this.answer = answer;
            }
            return InputComponentAnswer;
        })();
        Components.InputComponentAnswer = InputComponentAnswer;
    })(Components = Labs.Components || (Labs.Components = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Components;
    (function (Components) {
        var InputComponentAttempt = (function (_super) {
            __extends(InputComponentAttempt, _super);
            function InputComponentAttempt(labs, componentId, attemptId, values) {
                _super.call(this, labs, componentId, attemptId, values);
                this._submissions = [];
            }
            InputComponentAttempt.prototype.processAction = function (action) {
                if (action.type === Labs.Core.Actions.SubmitAnswerAction) {
                    this.storeSubmission(action);
                }
                else {
                    _super.prototype.processAction.call(this, action);
                }
            };
            InputComponentAttempt.prototype.getSubmissions = function () {
                this.verifyResumed();
                return this._submissions;
            };
            InputComponentAttempt.prototype.submit = function (answer, result, callback) {
                var _this = this;
                this.verifyResumed();
                var submitAnswer = {
                    componentId: this._componentId,
                    attemptId: this._id,
                    answer: answer.answer
                };
                var submitResult = {
                    submissionId: null,
                    complete: result.complete,
                    score: result.score
                };
                this._labs.takeAction(Labs.Core.Actions.SubmitAnswerAction, submitAnswer, submitResult, function (err, completedAction) {
                    if (err) {
                        setTimeout(function () { return callback(err, null); }, 0);
                        return;
                    }
                    var submission = _this.storeSubmission(completedAction);
                    setTimeout(function () { return callback(null, submission); }, 0);
                });
            };
            InputComponentAttempt.prototype.storeSubmission = function (completedSubmission) {
                var options = completedSubmission.options;
                var result = completedSubmission.result;
                if (result.complete) {
                    this._state = 2 /* Completed */;
                }
                var submission = new Components.InputComponentSubmission(new Components.InputComponentAnswer(options.answer), new Components.InputComponentResult(result.score, result.complete), completedSubmission.time);
                this._submissions.push(submission);
                return submission;
            };
            return InputComponentAttempt;
        })(Components.ComponentAttempt);
        Components.InputComponentAttempt = InputComponentAttempt;
    })(Components = Labs.Components || (Labs.Components = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Components;
    (function (Components) {
        Components.InputComponentInstanceType = "Labs.Components.InputComponentInstance";
        var InputComponentInstance = (function (_super) {
            __extends(InputComponentInstance, _super);
            function InputComponentInstance(component) {
                _super.call(this);
                this.component = component;
            }
            InputComponentInstance.prototype.buildAttempt = function (createAttemptAction) {
                var id = createAttemptAction.result.attemptId;
                return new Components.InputComponentAttempt(this._labs, this.component.componentId, id, this.component.values);
            };
            return InputComponentInstance;
        })(Labs.ComponentInstance);
        Components.InputComponentInstance = InputComponentInstance;
        Labs.registerDeserializer(Components.InputComponentInstanceType, function (json) {
            return new InputComponentInstance(json);
        });
    })(Components = Labs.Components || (Labs.Components = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Components;
    (function (Components) {
        var InputComponentResult = (function () {
            function InputComponentResult(score, complete) {
                this.score = score;
                this.complete = complete;
            }
            return InputComponentResult;
        })();
        Components.InputComponentResult = InputComponentResult;
    })(Components = Labs.Components || (Labs.Components = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Components;
    (function (Components) {
        var InputComponentSubmission = (function () {
            function InputComponentSubmission(answer, result, time) {
                this.answer = answer;
                this.result = result;
                this.time = time;
            }
            return InputComponentSubmission;
        })();
        Components.InputComponentSubmission = InputComponentSubmission;
    })(Components = Labs.Components || (Labs.Components = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    (function (ProblemState) {
        ProblemState[ProblemState["InProgress"] = 0] = "InProgress";
        ProblemState[ProblemState["Timeout"] = 1] = "Timeout";
        ProblemState[ProblemState["Completed"] = 2] = "Completed";
    })(Labs.ProblemState || (Labs.ProblemState = {}));
    var ProblemState = Labs.ProblemState;
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Components;
    (function (Components) {
        var ChoiceComponentResult = (function () {
            function ChoiceComponentResult(score, complete) {
                this.score = score;
                this.complete = complete;
            }
            return ChoiceComponentResult;
        })();
        Components.ChoiceComponentResult = ChoiceComponentResult;
    })(Components = Labs.Components || (Labs.Components = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Components;
    (function (Components) {
        var ChoiceComponentSubmission = (function () {
            function ChoiceComponentSubmission(answer, result, time) {
                this.answer = answer;
                this.result = result;
                this.time = time;
            }
            return ChoiceComponentSubmission;
        })();
        Components.ChoiceComponentSubmission = ChoiceComponentSubmission;
    })(Components = Labs.Components || (Labs.Components = {}));
})(Labs || (Labs = {}));
//# sourceMappingURL=LabsComponents.js.map
var Labs;
(function (Labs) {
    var Command = (function () {
        function Command(type, commandData) {
            this.type = type;
            this.commandData = commandData;
        }
        return Command;
    })();
    Labs.Command = Command;
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var CommandType;
    (function (CommandType) {
        CommandType.Connect = "connect";
        CommandType.Disconnect = "disconnect";
        CommandType.Create = "create";
        CommandType.GetConfigurationInstance = "getConfigurationInstance";
        CommandType.TakeAction = "takeAction";
        CommandType.GetCompletedActions = "getCompletedActions";
        CommandType.ModeChanged = "modeChanged";
        CommandType.GetConfiguration = "getConfiguration";
        CommandType.SetConfiguration = "setConfiguratoin";
        CommandType.GetState = "getState";
        CommandType.SetState = "setState";
        CommandType.SendMessage = "sendMessage";
    })(CommandType = Labs.CommandType || (Labs.CommandType = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var Core;
    (function (Core) {
        var EventTypes = (function () {
            function EventTypes() {
            }
            EventTypes.ModeChanged = "modeChanged";
            EventTypes.Activate = "activate";
            EventTypes.Deactivate = "deactivate";
            return EventTypes;
        })();
        Core.EventTypes = EventTypes;
    })(Core = Labs.Core || (Labs.Core = {}));
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    (function (MessageType) {
        MessageType[MessageType["Message"] = 0] = "Message";
        MessageType[MessageType["Completion"] = 1] = "Completion";
        MessageType[MessageType["Failure"] = 2] = "Failure";
    })(Labs.MessageType || (Labs.MessageType = {}));
    var MessageType = Labs.MessageType;
    var Message = (function () {
        function Message(id, labId, type, payload) {
            this.id = id;
            this.labId = labId;
            this.type = type;
            this.payload = payload;
        }
        return Message;
    })();
    Labs.Message = Message;
    var MessageProcessor = (function () {
        function MessageProcessor(labId, targetOrigin, messageHandler) {
            this._labId = labId;
            this.isStarted = false;
            this.nextMessageId = 0;
            this.targetOrigin = targetOrigin;
            this.messageHandler = messageHandler;
            this.messageMap = {};
        }
        MessageProcessor.prototype.throwIfNotStarted = function () {
            if (!this.isStarted) {
                throw "Processor has not been started";
            }
        };
        MessageProcessor.prototype.getNextMessageId = function () {
            return this.nextMessageId++;
        };
        MessageProcessor.prototype.parseOrigin = function (href) {
            var parser = document.createElement('a');
            parser.href = href;
            return parser.protocol + "//" + parser.host;
        };
        MessageProcessor.prototype.listener = function (event) {
            var _this = this;
            var response;
            var messageEvent = event;
            var message;
            try {
                message = JSON.parse(messageEvent.data);
            }
            catch (exception) {
                return;
            }
            if (message.labId !== this._labId) {
                return;
            }
            if (message.type === 1 /* Completion */) {
                response = this.messageMap[message.id];
                delete this.messageMap[message.id];
                if (response.origin === messageEvent.source) {
                    response.callback(null, message.payload);
                }
            }
            else if (message.type === 2 /* Failure */) {
                response = this.messageMap[message.id];
                delete this.messageMap[message.id];
                if (response.origin === messageEvent.source) {
                    response.callback({ error: message.payload }, null);
                }
            }
            else if (message.type == 0 /* Message */) {
                this.messageHandler(messageEvent.source, message.payload, function (err, data) {
                    var responseMessage = new Message(message.id, _this._labId, err ? 2 /* Failure */ : 1 /* Completion */, data);
                    try {
                        _this.postMessage(messageEvent.source, responseMessage);
                    }
                    catch (exceptoin) {
                    }
                });
            }
            else {
                throw "Unknown message type";
            }
        };
        MessageProcessor.prototype.postMessage = function (targetWindow, message) {
            if (!targetWindow) {
                throw "Unknown target window";
            }
            targetWindow.postMessage(JSON.stringify(message), this.targetOrigin);
        };
        MessageProcessor.prototype.start = function () {
            var _this = this;
            if (this.isStarted) {
                throw "Processor already running";
            }
            this.eventListener = function (event) {
                _this.listener(event);
            };
            window.addEventListener("message", this.eventListener);
            this.isStarted = true;
        };
        MessageProcessor.prototype.stop = function () {
            this.throwIfNotStarted();
            window.removeEventListener("message", this.eventListener);
            this.isStarted = false;
        };
        MessageProcessor.prototype.sendMessage = function (targetWindow, data, callback) {
            this.throwIfNotStarted();
            var nextId = this.getNextMessageId();
            var message = new Message(nextId, this._labId, 0 /* Message */, data);
            try {
                this.postMessage(targetWindow, message);
            }
            catch (exception) {
                setTimeout(function () { return callback(exception ? exception : "post message exception", null); }, 0);
                return;
            }
            this.messageMap[nextId] = {
                origin: targetWindow,
                callback: callback
            };
        };
        return MessageProcessor;
    })();
    Labs.MessageProcessor = MessageProcessor;
})(Labs || (Labs = {}));
//# sourceMappingURL=LabsHostsCore.js.map
var Labs;
(function (Labs) {
    var InMemoryLabHost = (function () {
        function InMemoryLabHost(version) {
            this._labState = null;
            this._messages = [];
            this._initializationInfo = null;
            this._version = version;
        }
        InMemoryLabHost.prototype.getSupportedVersions = function () {
            return [{ version: this._version }];
        };
        InMemoryLabHost.prototype.connect = function (versions, callback) {
            var connectionResponse = {
                initializationInfo: this._initializationInfo,
                hostVersion: {
                    major: 0,
                    minor: 1
                },
                userInfo: {
                    id: "TestUserId",
                    permissions: [
                        Labs.Core.Permissions.Edit,
                        Labs.Core.Permissions.Take
                    ]
                },
                applicationId: "TestAppId",
                mode: 0 /* Edit */
            };
            setTimeout(function () { return callback(null, connectionResponse); }, 0);
        };
        InMemoryLabHost.prototype.disconnect = function (callback) {
            setTimeout(function () { return callback(null, null); }, 0);
        };
        InMemoryLabHost.prototype.on = function (handler) {
        };
        InMemoryLabHost.prototype.sendMessage = function (type, options, callback) {
            this._messages.push({
                type: type,
                options: options,
                response: null
            });
            setTimeout(function () { return callback(null, null); });
        };
        InMemoryLabHost.prototype.getMessages = function () {
            return this._messages;
        };
        InMemoryLabHost.prototype.create = function (options, callback) {
            this._initializationInfo = {
                hostVersion: this._version
            };
            this._labState = new Labs.InMemoryLabState();
            setTimeout(function () { return callback(null, null); }, 0);
        };
        InMemoryLabHost.prototype.verifyLabCreated = function (callback) {
            if (!this._initializationInfo) {
                setTimeout(function () { return callback("Lab has not been created", null); });
                return false;
            }
            else {
                return true;
            }
        };
        InMemoryLabHost.prototype.getConfiguration = function (callback) {
            if (!this.verifyLabCreated(callback)) {
                return;
            }
            var configuration = this._labState.getConfiguration();
            setTimeout(function () { return callback(null, configuration); }, 0);
        };
        InMemoryLabHost.prototype.setConfiguration = function (configuration, callback) {
            if (!this.verifyLabCreated(callback)) {
                return;
            }
            this._labState.setConfiguration(configuration);
            setTimeout(function () { return callback(null, null); }, 0);
        };
        InMemoryLabHost.prototype.getState = function (callback) {
            if (!this.verifyLabCreated(callback)) {
                return;
            }
            var state = this._labState.getState();
            setTimeout(function () { return callback(null, state); });
        };
        InMemoryLabHost.prototype.setState = function (state, callback) {
            if (!this.verifyLabCreated(callback)) {
                return;
            }
            this._labState.setState(state);
            setTimeout(function () { return callback(null, null); }, 0);
        };
        InMemoryLabHost.prototype.getConfigurationInstance = function (callback) {
            if (!this.verifyLabCreated(callback)) {
                return;
            }
            var configurationInstance = this._labState.getConfigurationInstance();
            setTimeout(function () { return callback(null, configurationInstance); }, 0);
        };
        InMemoryLabHost.prototype.takeAction = function (type, options, result, callback) {
            if (!this.verifyLabCreated(callback)) {
                return;
            }
            var translatedCallback = callback !== undefined ? callback : result;
            var translatedResult = callback !== undefined ? result : null;
            var action = this._labState.takeAction(type, options, translatedResult);
            setTimeout(function () { return translatedCallback(null, action); }, 0);
        };
        InMemoryLabHost.prototype.getActions = function (type, options, callback) {
            if (!this.verifyLabCreated(callback)) {
                return;
            }
            var actions = this._labState.getActions(type, options);
            setTimeout(function () { return callback(null, actions); }, 0);
        };
        InMemoryLabHost.prototype.getLanguage = function () {
            return "en-US";
        };
        return InMemoryLabHost;
    })();
    Labs.InMemoryLabHost = InMemoryLabHost;
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    ;
    var InMemoryLabState = (function () {
        function InMemoryLabState() {
            this._configuration = null;
            this._configurationInstance = null;
            this._state = null;
            this._actions = [];
            this._nextId = 0;
            this._componentInstances = {};
        }
        InMemoryLabState.prototype.getConfiguration = function () {
            return this._configuration;
        };
        InMemoryLabState.prototype.setConfiguration = function (configuration) {
            this._configuration = configuration;
            this._configurationInstance = null;
            this._state = null;
            this._actions = [];
            this._componentInstances = {};
        };
        InMemoryLabState.prototype.getState = function () {
            return this._state;
        };
        InMemoryLabState.prototype.setState = function (state) {
            this._state = state;
        };
        InMemoryLabState.prototype.getConfigurationInstance = function () {
            if (!this._configurationInstance) {
                this._configurationInstance = this.getConfigurationInstanceFromConfiguration(this._configuration);
            }
            return this._configurationInstance;
        };
        InMemoryLabState.prototype.getConfigurationInstanceFromConfiguration = function (configuration) {
            var _this = this;
            if (!configuration) {
                return null;
            }
            var components = configuration.components.map(function (component) { return _this.getAndStoreComponentInstanceFromComponent(component); });
            return {
                appVersion: configuration.appVersion,
                components: components,
                name: configuration.name,
                timeline: configuration.timeline
            };
        };
        InMemoryLabState.prototype.getAndStoreComponentInstanceFromComponent = function (component) {
            var instance = JSON.parse(JSON.stringify(component));
            var componentId = this._nextId++;
            instance.componentId = componentId.toString();
            if (component.type === Labs.Components.ChoiceComponentType) {
                instance.type = Labs.Components.ChoiceComponentInstanceType;
            }
            else if (component.type === Labs.Components.InputComponentType) {
                instance.type = Labs.Components.InputComponentInstanceType;
            }
            else if (component.type === Labs.Components.ActivityComponentType) {
                instance.type = Labs.Components.ActivityComponentInstanceType;
            }
            else if (component.type === Labs.Components.DynamicComponentType) {
                instance.type = Labs.Components.DynamicComponentInstanceType;
            }
            else {
                throw "unknown type";
            }
            for (var key in instance.values) {
                var values = instance.values[key];
                for (var i = 0; i < values.length; i++) {
                    var valueId = this._nextId++;
                    values[i].valueId = valueId.toString();
                }
            }
            this._componentInstances[instance.componentId] = {
                component: component,
                instance: instance
            };
            return instance;
        };
        InMemoryLabState.prototype.takeAction = function (type, options, result) {
            return this.takeActionCore(type, options, result);
        };
        InMemoryLabState.prototype.takeActionCore = function (type, options, result) {
            if (result === null) {
                if (type === Labs.Core.Actions.CreateAttemptAction) {
                    var attemptId = this._nextId++;
                    var createResult = {
                        attemptId: attemptId.toString()
                    };
                    result = createResult;
                }
                else if (type === Labs.Core.Actions.GetValueAction) {
                    var optionsAsGetValueOptions = options;
                    var getValueResult = {
                        value: this.findConfigurationValue(optionsAsGetValueOptions.componentId, optionsAsGetValueOptions.attemptId, optionsAsGetValueOptions.valueId)
                    };
                    result = getValueResult;
                }
                else if (type === Labs.Core.Actions.CreateComponentAction) {
                    var createComponentOptions = options;
                    var createdInstance = this.getAndStoreComponentInstanceFromComponent(createComponentOptions.component);
                    var createComponentResult = {
                        componentInstance: createdInstance
                    };
                    result = createComponentResult;
                }
                else if (type === Labs.Core.Actions.SubmitAnswerAction) {
                    var submissionId = this._nextId++;
                    var submitAnswerResult = {
                        submissionId: submissionId.toString(),
                        complete: true,
                        score: null
                    };
                    result = submitAnswerResult;
                }
            }
            else {
                if (type === Labs.Core.Actions.SubmitAnswerAction) {
                    var submissionId = this._nextId++;
                    var resultsAsSubmitResults = result;
                    resultsAsSubmitResults.submissionId = submissionId.toString();
                }
            }
            var completedAction = {
                type: type,
                options: options,
                result: result,
                time: Date.now()
            };
            this._actions.push(completedAction);
            return completedAction;
        };
        InMemoryLabState.prototype.findConfigurationValue = function (componentId, attemptId, valueId) {
            var storedComponent = this._componentInstances[componentId];
            if (storedComponent) {
                for (var key in storedComponent.instance.values) {
                    var values = storedComponent.instance.values[key];
                    for (var i = 0; i < values.length; i++) {
                        if (values[i].valueId === valueId) {
                            return storedComponent.component.values[key][i].value;
                        }
                    }
                }
            }
            throw "not found";
        };
        InMemoryLabState.prototype.getAllActions = function () {
            return this._actions;
        };
        InMemoryLabState.prototype.setActions = function (actions) {
            this._actions = actions;
        };
        InMemoryLabState.prototype.getActions = function (type, options) {
            var completedActions = [];
            var i;
            var completedAction;
            if (type === Labs.Core.GetActions.GetAttempt) {
                var actionAsGetAttempt = options;
                for (i = 0; i < this._actions.length; i++) {
                    completedAction = this._actions[i];
                    if (completedAction.options.attemptId === actionAsGetAttempt.attemptId) {
                        completedActions.push(completedAction);
                    }
                }
            }
            else if (type === Labs.Core.GetActions.GetComponentActions) {
                var actionAsGetComponentActions = options;
                for (i = 0; i < this._actions.length; i++) {
                    completedAction = this._actions[i];
                    if (completedAction.type === actionAsGetComponentActions.action && completedAction.options.componentId === actionAsGetComponentActions.componentId) {
                        completedActions.push(completedAction);
                    }
                }
            }
            else {
                throw "Unknown get results action";
            }
            return completedActions;
        };
        return InMemoryLabState;
    })();
    Labs.InMemoryLabState = InMemoryLabState;
})(Labs || (Labs = {}));
;
var Office;
var Labs;
(function (Labs) {
    ;
    var Resolver = (function () {
        function Resolver() {
            var _this = this;
            this._callbacks = [];
            this._isResolved = false;
            this.promise = {
                then: function (callback) {
                    _this._callbacks.push(callback);
                    if (_this._isResolved) {
                        _this.fireCallbacks();
                    }
                }
            };
        }
        Resolver.prototype.resolve = function (value) {
            this._isResolved = true;
            this._resolvedValue = value;
            this.fireCallbacks();
        };
        Resolver.prototype.fireCallbacks = function () {
            var _this = this;
            this._callbacks.forEach(function (callback) {
                callback(_this._resolvedValue);
            });
            this._callbacks = [];
        };
        return Resolver;
    })();
    Labs.Resolver = Resolver;
    ;
    var OfficeJSLabHost = (function () {
        function OfficeJSLabHost() {
            var _this = this;
            this._version = { version: { major: 0, minor: 1 } };
            var resolver = new Resolver();
            this._officeInitialized = resolver.promise;
            Office.initialize = function () {
                var labsSettings = Office.context.document.settings.get(OfficeJSLabHost.SettingsKeyName);
                if (labsSettings && labsSettings.published) {
                    _this._labHost = new Labs.PostMessageLabHost(labsSettings.publishedAppId, parent.parent, "*", Office.context.displayLanguage);
                }
                else {
                    _this._labHost = new Labs.RichClientOfficeJSLabsHost(labsSettings ? labsSettings.configuration : null, labsSettings ? labsSettings.hostVersion : null);
                }
                resolver.resolve();
            };
        }
        OfficeJSLabHost.prototype.getSupportedVersions = function () {
            return [this._version];
        };
        OfficeJSLabHost.prototype.connect = function (versions, callback) {
            var _this = this;
            this._officeInitialized.then(function () {
                _this._labHost.connect(versions, callback);
            });
        };
        OfficeJSLabHost.prototype.disconnect = function (callback) {
            this._labHost.disconnect(callback);
        };
        OfficeJSLabHost.prototype.on = function (handler) {
            this._labHost.on(handler);
        };
        OfficeJSLabHost.prototype.sendMessage = function (type, options, callback) {
            this._labHost.sendMessage(type, options, callback);
        };
        OfficeJSLabHost.prototype.create = function (options, callback) {
            this._labHost.create(options, callback);
        };
        OfficeJSLabHost.prototype.getConfiguration = function (callback) {
            this._labHost.getConfiguration(callback);
        };
        OfficeJSLabHost.prototype.setConfiguration = function (configuration, callback) {
            this._labHost.setConfiguration(configuration, callback);
        };
        OfficeJSLabHost.prototype.getConfigurationInstance = function (callback) {
            this._labHost.getConfigurationInstance(callback);
        };
        OfficeJSLabHost.prototype.getState = function (callback) {
            this._labHost.getState(callback);
        };
        OfficeJSLabHost.prototype.setState = function (state, callback) {
            this._labHost.setState(state, callback);
        };
        OfficeJSLabHost.prototype.takeAction = function (type, options, result, callback) {
            this._labHost.takeAction(type, options, result, callback);
        };
        OfficeJSLabHost.prototype.getActions = function (type, options, callback) {
            this._labHost.getActions(type, options, callback);
        };
        OfficeJSLabHost.prototype.getLanguage = function () {
            return this._labHost.getLanguage();
        };
        OfficeJSLabHost.SettingsKeyName = "__labs__";
        return OfficeJSLabHost;
    })();
    Labs.OfficeJSLabHost = OfficeJSLabHost;
})(Labs || (Labs = {}));
Labs.DefaultHostBuilder = function () { return new Labs.OfficeJSLabHost(); };
var Labs;
(function (Labs) {
    var EventState;
    (function (EventState) {
        EventState[EventState["Reject"] = 0] = "Reject";
        EventState[EventState["Collecting"] = 1] = "Collecting";
        EventState[EventState["Firing"] = 2] = "Firing";
    })(EventState || (EventState = {}));
    ;
    var PostMessageLabHost = (function () {
        function PostMessageLabHost(labId, targetWindow, targetOrigin, targetLanguage) {
            var _this = this;
            this._handlers = [];
            this._version = { version: { major: 0, minor: 1 } };
            this._state = 0 /* Reject */;
            this._deferredEvents = [];
            this._language = "en-US";
            this._targetWindow = targetWindow;
            this._messageProcessor = new Labs.MessageProcessor(labId, targetOrigin, function (origin, data, callback) {
                if (origin == _this._targetWindow) {
                    _this.handleEvent(data, callback);
                }
            });
            if (targetLanguage) {
                this._language = targetLanguage;
            }
        }
        PostMessageLabHost.prototype.handleEvent = function (command, callback) {
            if (this._state == 0 /* Reject */) {
                callback("Message received prior to connection", null);
            }
            else if (this._state == 1 /* Collecting */) {
                this._deferredEvents.push({
                    command: command,
                    callback: callback
                });
            }
            else {
                this.invokeEvent(null, command, callback);
            }
        };
        PostMessageLabHost.prototype.invokeDeferredEvents = function (err) {
            var _this = this;
            this._deferredEvents.forEach(function (event) {
                _this.invokeEvent(err, event.command, event.callback);
            });
            this._deferredEvents = [];
        };
        PostMessageLabHost.prototype.invokeEvent = function (err, command, callback) {
            if (!err) {
                this._handlers.map(function (handler) {
                    handler(command.type, command.commandData);
                });
            }
            callback(err, null);
        };
        PostMessageLabHost.prototype.getSupportedVersions = function () {
            return [this._version];
        };
        PostMessageLabHost.prototype.connect = function (versions, callback) {
            var _this = this;
            this._messageProcessor.start();
            this._state = 1 /* Collecting */;
            var initializeMessage = new Labs.Command(Labs.CommandType.Connect, this._version);
            this._messageProcessor.sendMessage(this._targetWindow, initializeMessage, function (err, connectionResponse) {
                if (connectionResponse.hostVersion.major !== _this._version.version.major) {
                    err = "Unsupported post message host";
                }
                setTimeout(function () {
                    callback(err, connectionResponse);
                    _this.invokeDeferredEvents(err);
                    _this._state = err ? 0 /* Reject */ : 2 /* Firing */;
                }, 0);
            });
        };
        PostMessageLabHost.prototype.disconnect = function (callback) {
            var _this = this;
            this._state = 0 /* Reject */;
            var doneCommand = new Labs.Command(Labs.CommandType.Disconnect, null);
            this._messageProcessor.sendMessage(this._targetWindow, doneCommand, function (err, data) {
                _this._messageProcessor.stop();
                callback(err, data);
            });
        };
        PostMessageLabHost.prototype.on = function (handler) {
            this._handlers.push(handler);
        };
        PostMessageLabHost.prototype.sendMessage = function (type, options, callback) {
            var commandData = {
                type: type,
                options: options
            };
            var sendMessageCommand = new Labs.Command(Labs.CommandType.SendMessage, commandData);
            this.sendCommand(sendMessageCommand, callback);
        };
        PostMessageLabHost.prototype.create = function (options, callback) {
            var createCommand = new Labs.Command(Labs.CommandType.Create, options);
            this.sendCommand(createCommand, callback);
        };
        PostMessageLabHost.prototype.getConfiguration = function (callback) {
            var getConfigurationCommand = new Labs.Command(Labs.CommandType.GetConfiguration);
            this.sendCommand(getConfigurationCommand, callback);
        };
        PostMessageLabHost.prototype.setConfiguration = function (configuration, callback) {
            var setConfigurationCommand = new Labs.Command(Labs.CommandType.SetConfiguration, configuration);
            this.sendCommand(setConfigurationCommand, callback);
        };
        PostMessageLabHost.prototype.getConfigurationInstance = function (callback) {
            var getConfigurationInstanceCommand = new Labs.Command(Labs.CommandType.GetConfigurationInstance);
            this.sendCommand(getConfigurationInstanceCommand, callback);
        };
        PostMessageLabHost.prototype.getState = function (callback) {
            var getStateCommand = new Labs.Command(Labs.CommandType.GetState);
            this.sendCommand(getStateCommand, callback);
        };
        PostMessageLabHost.prototype.setState = function (state, callback) {
            var setStateCommand = new Labs.Command(Labs.CommandType.SetState, state);
            this.sendCommand(setStateCommand, callback);
        };
        PostMessageLabHost.prototype.takeAction = function (type, options, result, callback) {
            var commandData = {
                type: type,
                options: options,
                result: callback !== undefined ? result : null
            };
            var takeActionCommand = new Labs.Command(Labs.CommandType.TakeAction, commandData);
            this.sendCommand(takeActionCommand, callback !== undefined ? callback : result);
        };
        PostMessageLabHost.prototype.getActions = function (type, options, callback) {
            var commandData = {
                type: type,
                options: options
            };
            var getCompletedActionsCommand = new Labs.Command(Labs.CommandType.GetCompletedActions, commandData);
            this.sendCommand(getCompletedActionsCommand, callback);
        };
        PostMessageLabHost.prototype.getLanguage = function () {
            return this._language;
        };
        PostMessageLabHost.prototype.sendCommand = function (command, callback) {
            this._messageProcessor.sendMessage(this._targetWindow, command, callback);
        };
        return PostMessageLabHost;
    })();
    Labs.PostMessageLabHost = PostMessageLabHost;
})(Labs || (Labs = {}));
var Labs;
(function (Labs) {
    var RichClientOfficeJSLabsHost = (function () {
        function RichClientOfficeJSLabsHost(configuration, createdHostVersion) {
            var _this = this;
            this._handlers = [];
            this._version = { version: { major: 0, minor: 1 } };
            this._labState = null;
            this._configurationInfo = null;
            if (createdHostVersion) {
                this._createdHostVersion = createdHostVersion;
                this._configurationInfo = { hostVersion: this._createdHostVersion };
                this._labState = new Labs.InMemoryLabState();
                this._labState.setConfiguration(configuration);
                this._createdHostVersion = createdHostVersion;
            }
            else {
                this._configurationInfo = null;
                this._createdHostVersion = null;
            }
            var activeViewResolver = new Labs.Resolver();
            Office.context.document.getActiveViewAsync(function (result) {
                _this._activeMode = _this.getLabModeFromActiveView(result.value);
                activeViewResolver.resolve(result.value);
            });
            this._activeViewP = activeViewResolver.promise;
            Office.context.document.addHandlerAsync("activeViewChanged", function (args) {
                _this._activeMode = _this.getLabModeFromActiveView(args.activeView);
                _this._handlers.forEach(function (handler) {
                    handler(Labs.CommandType.ModeChanged, { mode: Labs.Core.LabMode[_this._activeMode] });
                });
            });
        }
        RichClientOfficeJSLabsHost.prototype.getLabModeFromActiveView = function (view) {
            return view === 'edit' ? 0 /* Edit */ : 1 /* View */;
        };
        RichClientOfficeJSLabsHost.prototype.getSupportedVersions = function () {
            return [this._version];
        };
        RichClientOfficeJSLabsHost.prototype.connect = function (versions, callback) {
            var _this = this;
            this._activeViewP.then(function () {
                var connectionResponse = {
                    initializationInfo: _this._configurationInfo,
                    hostVersion: {
                        major: 0,
                        minor: 1
                    },
                    userInfo: {
                        id: "TestUserId",
                        permissions: [
                            Labs.Core.Permissions.Edit,
                            Labs.Core.Permissions.Take
                        ]
                    },
                    applicationId: "TestAppId",
                    mode: _this._activeMode
                };
                setTimeout(function () { return callback(null, connectionResponse); }, 0);
            });
        };
        RichClientOfficeJSLabsHost.prototype.disconnect = function (callback) {
            setTimeout(function () { return callback(null, null); }, 0);
        };
        RichClientOfficeJSLabsHost.prototype.on = function (handler) {
            this._handlers.push(handler);
        };
        RichClientOfficeJSLabsHost.prototype.sendMessage = function (type, options, callback) {
            if (type === Labs.TimelineNextMessageType) {
                var nextSlide = Office.Index.Next;
                Office.context.document.goToByIdAsync(nextSlide, Office.GoToType.Index, function (asyncResult) {
                    var error = null;
                    if (asyncResult.status == Office.AsyncResultStatus.Failed) {
                        error = asyncResult.error;
                    }
                    setTimeout(function () { return callback(error, null); }, 0);
                });
            }
            else {
                setTimeout(function () { return callback("unknown message", null); }, 0);
            }
        };
        RichClientOfficeJSLabsHost.prototype.verifyLabCreated = function (callback) {
            if (!this._configurationInfo) {
                setTimeout(function () { return callback("Lab has not been created", null); });
                return false;
            }
            else {
                return true;
            }
        };
        RichClientOfficeJSLabsHost.prototype.create = function (options, callback) {
            this._createdHostVersion = this._version.version;
            this._configurationInfo = { hostVersion: this._createdHostVersion };
            this._labState = new Labs.InMemoryLabState();
            this._labState.setConfiguration(null);
            this.updateStoredLabsState(callback);
        };
        RichClientOfficeJSLabsHost.prototype.getConfiguration = function (callback) {
            var _this = this;
            if (!this.verifyLabCreated(callback)) {
                return;
            }
            setTimeout(function () { return callback(null, _this._labState.getConfiguration()); }, 0);
        };
        RichClientOfficeJSLabsHost.prototype.setConfiguration = function (configuration, callback) {
            if (!this.verifyLabCreated(callback)) {
                return;
            }
            this._labState.setConfiguration(configuration);
            this.updateStoredLabsState(callback);
        };
        RichClientOfficeJSLabsHost.prototype.updateStoredLabsState = function (callback) {
            var settings = {
                configuration: this._labState.getConfiguration(),
                hostVersion: this._createdHostVersion
            };
            Office.context.document.settings.set(Labs.OfficeJSLabHost.SettingsKeyName, settings);
            Office.context.document.settings.saveAsync(function (asyncResult) {
                setTimeout(function () { return callback(asyncResult.status === Office.AsyncResultStatus.Failed ? asyncResult.status : null, null); }, 0);
            });
        };
        RichClientOfficeJSLabsHost.prototype.getConfigurationInstance = function (callback) {
            var _this = this;
            if (!this.verifyLabCreated(callback)) {
                return;
            }
            setTimeout(function () { return callback(null, _this._labState.getConfigurationInstance()); });
        };
        RichClientOfficeJSLabsHost.prototype.getState = function (callback) {
            var _this = this;
            if (!this.verifyLabCreated(callback)) {
                return;
            }
            setTimeout(function () { return callback(null, _this._labState.getState()); });
        };
        RichClientOfficeJSLabsHost.prototype.setState = function (state, callback) {
            if (!this.verifyLabCreated(callback)) {
                return;
            }
            this._labState.setState(state);
            setTimeout(function () { return callback(null, null); });
        };
        RichClientOfficeJSLabsHost.prototype.takeAction = function (type, options, result, callback) {
            if (!this.verifyLabCreated(callback)) {
                return;
            }
            var translatedCallback = callback !== undefined ? callback : result;
            var translatedResult = callback !== undefined ? result : null;
            var action = this._labState.takeAction(type, options, translatedResult);
            setTimeout(function () { return translatedCallback(null, action); });
        };
        RichClientOfficeJSLabsHost.prototype.getActions = function (type, options, callback) {
            var _this = this;
            if (!this.verifyLabCreated(callback)) {
                return;
            }
            setTimeout(function () { return callback(null, _this._labState.getActions(type, options)); });
        };
        RichClientOfficeJSLabsHost.prototype.getLanguage = function () {
            return Office.context.displayLanguage;
        };
        return RichClientOfficeJSLabsHost;
    })();
    Labs.RichClientOfficeJSLabsHost = RichClientOfficeJSLabsHost;
})(Labs || (Labs = {}));
//# sourceMappingURL=LabsHosts.js.map