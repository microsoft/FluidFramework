(function () {
    'use strict';

    var __extends = (this && this.__extends) || (function () {
        var extendStatics = function (d, b) {
            extendStatics = Object.setPrototypeOf ||
                ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
                function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
            return extendStatics(d, b);
        };
        return function (d, b) {
            if (typeof b !== "function" && b !== null)
                throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
            extendStatics(d, b);
            function __() { this.constructor = d; }
            d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
        };
    })();
    (function es5Sham(window) {
        var supportsDescriptors = Object.defineProperty && (function () {
            try {
                var obj = {};
                Object.defineProperty(obj, 'x', {
                    enumerable: false, value: obj
                });
                for (var temp in obj) {
                    if (obj.hasOwnProperty(temp)) {
                        return false;
                    }
                }
                return obj.x === obj;
            }
            catch (e) {
                return false;
            }
        }());
        if (!supportsDescriptors && !window.definePropertyShamSet) {
            window.definePropertyShamSet = true;
            var nativeDefineProperty = Object.defineProperty;
            Object.defineProperty = function (object, prop, descriptor) {
                if (object instanceof Element) {
                    nativeDefineProperty(object, prop, descriptor);
                }
                else {
                    object[prop] = (descriptor) ? descriptor.value : true;
                }
            };
        }
    })(window);
    var requirejs, require, define;
    (function (undef) {
        var main, req, makeMap, handlers, defined = {}, waiting = {}, config = {}, defining = {}, hasOwn = Object.prototype.hasOwnProperty, aps = [].slice, jsSuffixRegExp = /\.js$/;
        function hasProp(obj, prop) {
            return hasOwn.call(obj, prop);
        }
        function normalize(name, baseName) {
            var nameParts, nameSegment, mapValue, foundMap, lastIndex, foundI, foundStarMap, starI, i, j, part, normalizedBaseParts, baseParts = baseName && baseName.split("/"), map = config.map, starMap = (map && map['*']) || {};
            if (name) {
                name = name.split('/');
                lastIndex = name.length - 1;
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }
                if (name[0].charAt(0) === '.' && baseParts) {
                    normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
                    name = normalizedBaseParts.concat(name);
                }
                for (i = 0; i < name.length; i++) {
                    part = name[i];
                    if (part === '.') {
                        name.splice(i, 1);
                        i -= 1;
                    }
                    else if (part === '..') {
                        if (i === 0 || (i === 1 && name[2] === '..') || name[i - 1] === '..') {
                            continue;
                        }
                        else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                name = name.join('/');
            }
            if ((baseParts || starMap) && map) {
                nameParts = name.split('/');
                for (i = nameParts.length; i > 0; i -= 1) {
                    nameSegment = nameParts.slice(0, i).join("/");
                    if (baseParts) {
                        for (j = baseParts.length; j > 0; j -= 1) {
                            mapValue = map[baseParts.slice(0, j).join('/')];
                            if (mapValue) {
                                mapValue = mapValue[nameSegment];
                                if (mapValue) {
                                    foundMap = mapValue;
                                    foundI = i;
                                    break;
                                }
                            }
                        }
                    }
                    if (foundMap) {
                        break;
                    }
                    if (!foundStarMap && starMap && starMap[nameSegment]) {
                        foundStarMap = starMap[nameSegment];
                        starI = i;
                    }
                }
                if (!foundMap && foundStarMap) {
                    foundMap = foundStarMap;
                    foundI = starI;
                }
                if (foundMap) {
                    nameParts.splice(0, foundI, foundMap);
                    name = nameParts.join('/');
                }
            }
            return name;
        }
        function makeRequire(relName, forceSync) {
            return function () {
                var args = aps.call(arguments, 0);
                if (typeof args[0] !== 'string' && args.length === 1) {
                    args.push(null);
                }
                return req.apply(undef, args.concat([relName, forceSync]));
            };
        }
        function makeNormalize(relName) {
            return function (name) {
                return normalize(name, relName);
            };
        }
        function makeLoad(depName) {
            return function (value) {
                defined[depName] = value;
            };
        }
        function callDep(name) {
            if (hasProp(waiting, name)) {
                var args = waiting[name];
                delete waiting[name];
                defining[name] = true;
                main.apply(undef, args);
            }
            if (!hasProp(defined, name) && !hasProp(defining, name)) {
                throw new Error('No ' + name);
            }
            return defined[name];
        }
        function splitPrefix(name) {
            var prefix, index = name ? name.indexOf('!') : -1;
            if (index > -1) {
                prefix = name.substring(0, index);
                name = name.substring(index + 1, name.length);
            }
            return [prefix, name];
        }
        function makeRelParts(relName) {
            return relName ? splitPrefix(relName) : [];
        }
        makeMap = function (name, relParts) {
            var plugin, parts = splitPrefix(name), prefix = parts[0], relResourceName = relParts[1];
            name = parts[1];
            if (prefix) {
                prefix = normalize(prefix, relResourceName);
                plugin = callDep(prefix);
            }
            if (prefix) {
                if (plugin && plugin.normalize) {
                    name = plugin.normalize(name, makeNormalize(relResourceName));
                }
                else {
                    name = normalize(name, relResourceName);
                }
            }
            else {
                name = normalize(name, relResourceName);
                parts = splitPrefix(name);
                prefix = parts[0];
                name = parts[1];
                if (prefix) {
                    plugin = callDep(prefix);
                }
            }
            return {
                f: prefix ? prefix + '!' + name : name,
                n: name,
                pr: prefix,
                p: plugin
            };
        };
        function makeConfig(name) {
            return function () {
                return (config && config.config && config.config[name]) || {};
            };
        }
        handlers = {
            require: function (name) {
                return makeRequire(name);
            },
            exports: function (name) {
                var e = defined[name];
                if (typeof e !== 'undefined') {
                    return e;
                }
                else {
                    return (defined[name] = {});
                }
            },
            module: function (name) {
                return {
                    id: name,
                    uri: '',
                    exports: defined[name],
                    config: makeConfig(name)
                };
            }
        };
        main = function (name, deps, callback, relName) {
            var cjsModule, depName, ret, map, i, relParts, args = [], callbackType = typeof callback, usingExports;
            relName = relName || name;
            relParts = makeRelParts(relName);
            if (callbackType === 'undefined' || callbackType === 'function') {
                deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
                for (i = 0; i < deps.length; i += 1) {
                    map = makeMap(deps[i], relParts);
                    depName = map.f;
                    if (depName === "require") {
                        args[i] = handlers.require(name);
                    }
                    else if (depName === "exports") {
                        args[i] = handlers.exports(name);
                        usingExports = true;
                    }
                    else if (depName === "module") {
                        cjsModule = args[i] = handlers.module(name);
                    }
                    else if (hasProp(defined, depName) ||
                        hasProp(waiting, depName) ||
                        hasProp(defining, depName)) {
                        args[i] = callDep(depName);
                    }
                    else if (map.p) {
                        map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                        args[i] = defined[depName];
                    }
                    else {
                        throw new Error(name + ' missing ' + depName);
                    }
                }
                ret = callback ? callback.apply(defined[name], args) : undefined;
                if (name) {
                    if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                        defined[name] = cjsModule.exports;
                    }
                    else if (ret !== undef || !usingExports) {
                        defined[name] = ret;
                    }
                }
            }
            else if (name) {
                defined[name] = callback;
            }
        };
        requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
            if (typeof deps === "string") {
                if (handlers[deps]) {
                    return handlers[deps](callback);
                }
                return callDep(makeMap(deps, makeRelParts(callback)).f);
            }
            else if (!deps.splice) {
                config = deps;
                if (config.deps) {
                    req(config.deps, config.callback);
                }
                if (!callback) {
                    return;
                }
                if (callback.splice) {
                    deps = callback;
                    callback = relName;
                    relName = null;
                }
                else {
                    deps = undef;
                }
            }
            callback = callback || function () { };
            if (typeof relName === 'function') {
                relName = forceSync;
                forceSync = alt;
            }
            if (forceSync) {
                main(undef, deps, callback, relName);
            }
            else {
                setTimeout(function () {
                    main(undef, deps, callback, relName);
                }, 4);
            }
            return req;
        };
        req.config = function (cfg) {
            return req(cfg);
        };
        requirejs._defined = defined;
        define = function (name, deps, callback) {
            if (typeof name !== 'string') {
                throw new Error('See almond README: incorrect module build, no module name');
            }
            if (!deps.splice) {
                callback = deps;
                deps = [];
            }
            if (!hasProp(defined, name) && !hasProp(waiting, name)) {
                waiting[name] = [name, deps, callback];
            }
        };
        define.amd = {
            jQuery: true
        };
    }());
    define("closed-captions/ttml-time-parser", ["require", "exports"], function (require, exports) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.TtmlTimeParser = void 0;
        var TtmlTimeParser = (function () {
            function TtmlTimeParser(mediaFrameRate, mediaTickRate) {
                this.mediaFrameRate = mediaFrameRate;
                this.mediaTickRate = mediaTickRate;
            }
            TtmlTimeParser.prototype.parse = function (ttmlTime) {
                if (!ttmlTime) {
                    return 0;
                }
                var absoluteTime = TtmlTimeParser.absoluteTimeRegex.exec(ttmlTime);
                if (absoluteTime && (absoluteTime.length > 3)) {
                    var hours = parseInt(absoluteTime[1], 10) * 60 * 60;
                    var minutes = parseInt(absoluteTime[2], 10) * 60;
                    var seconds = parseInt(absoluteTime[3], 10);
                    var subseconds = 0;
                    if (absoluteTime[5]) {
                        subseconds = parseFloat(absoluteTime[4]) * 1000;
                    }
                    if (absoluteTime[6]) {
                        subseconds = Math.round(parseFloat(absoluteTime[6]) * this.getTimeUnitMultiplier('f'));
                    }
                    return (1000 * (hours + minutes + seconds)) + subseconds;
                }
                var relativeTime = TtmlTimeParser.relativeTimeRegex.exec(ttmlTime);
                if (relativeTime && (relativeTime.length > 3)) {
                    return Math.round(parseFloat(relativeTime[1]) * this.getTimeUnitMultiplier(relativeTime[3]));
                }
                return 0;
            };
            TtmlTimeParser.prototype.getTimeUnitMultiplier = function (timeUnit) {
                switch (timeUnit) {
                    case 'h':
                        return 1000 * 60 * 60;
                    case 'ms':
                        return 1;
                    case 'm':
                        return 1000 * 60;
                    case 's':
                        return 1000;
                    case 'f':
                        return 1000 / this.mediaFrameRate;
                    case 't':
                        return 1000 / this.mediaTickRate;
                    default:
                        return 0;
                }
            };
            TtmlTimeParser.absoluteTimeRegex = /^(\d{1,}):(\d{2}):(\d{2})((\.\d{1,})|:(\d{2,}(\.\d{1,})?))?$/;
            TtmlTimeParser.relativeTimeRegex = /^(\d+(\.\d+)?)(ms|[hmsft])$/;
            return TtmlTimeParser;
        }());
        exports.TtmlTimeParser = TtmlTimeParser;
    });
    define("mwf/utilities/stringExtensions", ["require", "exports"], function (require, exports) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.format = exports.getMatchLength = exports.endsWith = exports.startsWith = exports.trim = exports.isNullOrWhiteSpace = void 0;
        function isNullOrWhiteSpace(value) {
            return (!value) || (typeof value !== 'string') || (!trim(value));
        }
        exports.isNullOrWhiteSpace = isNullOrWhiteSpace;
        function trim(value) {
            if (!value || (typeof value !== 'string')) {
                return value;
            }
            if (value.trim) {
                return value.trim();
            }
            return value.replace(/^\s+|\s+$/g, '');
        }
        exports.trim = trim;
        function startsWith(value, prefix, ignoreCase) {
            if (ignoreCase === void 0) { ignoreCase = true; }
            if (!value || !prefix) {
                return false;
            }
            if (ignoreCase) {
                value = value.toLocaleLowerCase();
                prefix = prefix.toLocaleLowerCase();
            }
            if (value.startsWith) {
                return value.startsWith(prefix);
            }
            return value.indexOf(prefix) === 0;
        }
        exports.startsWith = startsWith;
        function endsWith(value, suffix, ignoreCase) {
            if (ignoreCase === void 0) { ignoreCase = true; }
            if (!value || !suffix) {
                return false;
            }
            if (ignoreCase) {
                value = value.toLocaleLowerCase();
                suffix = suffix.toLocaleLowerCase();
            }
            if (value.endsWith) {
                return value.endsWith(suffix);
            }
            return value.lastIndexOf(suffix) !== -1 && value.lastIndexOf(suffix) === value.length - suffix.length;
        }
        exports.endsWith = endsWith;
        function getMatchLength(string1, string2, ignoreCase) {
            if (ignoreCase === void 0) { ignoreCase = true; }
            if (!string1 || !string2) {
                return 0;
            }
            var match = 0;
            if (ignoreCase) {
                string1 = string1.toLocaleLowerCase();
                string2 = string2.toLocaleLowerCase();
            }
            while (string1.charCodeAt(match) === string2.charCodeAt(match)) {
                match++;
            }
            return match;
        }
        exports.getMatchLength = getMatchLength;
        function format(formatSpecifier) {
            var parameters = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                parameters[_i - 1] = arguments[_i];
            }
            return formatSpecifier.replace(/{(\d+)}/g, function (match, index) {
                if (index >= parameters.length) {
                    return match;
                }
                var value = parameters[index];
                if ((typeof value !== 'number') && !value) {
                    return '';
                }
                if (typeof value === 'string') {
                    return value;
                }
                return value.toString();
            });
        }
        exports.format = format;
    });
    define("mwf/utilities/utility", ["require", "exports", "mwf/utilities/stringExtensions"], function (require, exports, stringExtensions_1) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.Viewports = exports.getValueFromLocalStorage = exports.saveToLocalStorage = exports.getValueFromSessionStorage = exports.saveToSessionStorage = exports.addQSP = exports.getQSPFromUrl = exports.getQSPValue = exports.poll = exports.extend = exports.parseJson = exports.toElapsedTimeString = exports.getPerfMarkerValue = exports.createPerfMarker = exports.apiDeprecated = exports.pointInRect = exports.detectContrast = exports.getCookie = exports.setCookie = exports.getKeyCode = exports.getVirtualKey = exports.getDimensions = exports.getWindowHeight = exports.getWindowWidth = exports.isNumber = void 0;
        function isNumber(value) {
            return ((!isNaN(value)) && ((typeof value) === 'number'));
        }
        exports.isNumber = isNumber;
        function getWindowWidth() {
            var clientWidth = window.innerWidth && document.documentElement.clientWidth ?
                Math.min(window.innerWidth, document.documentElement.clientWidth) :
                window.innerWidth ||
                    document.documentElement.clientWidth;
            return clientWidth;
        }
        exports.getWindowWidth = getWindowWidth;
        function getWindowHeight() {
            return window.innerHeight && document.documentElement.clientHeight
                ? Math.min(window.innerHeight, document.documentElement.clientHeight)
                : window.innerHeight || document.documentElement.clientHeight;
        }
        exports.getWindowHeight = getWindowHeight;
        function getDimensions(containerElement) {
            if (containerElement == null) {
                return;
            }
            return {
                width: containerElement.clientWidth,
                height: containerElement.clientHeight
            };
        }
        exports.getDimensions = getDimensions;
        function getVirtualKey(event) {
            var virtualKey;
            event = event || window.event;
            if (!event) {
                return virtualKey;
            }
            virtualKey = event.key || event.keyIdentifier;
            if (!virtualKey) {
                return virtualKey;
            }
            switch (virtualKey) {
                case 'Left': return 'ArrowLeft';
                case 'Right': return 'ArrowRight';
                case 'Up': return 'ArrowUp';
                case 'Down': return 'ArrowDown';
                case 'Esc': return 'Escape';
                default: return virtualKey;
            }
        }
        exports.getVirtualKey = getVirtualKey;
        function getKeyCode(event) {
            event = event || window.event;
            return (event == null) ? null : event.which || event.keyCode || event.charCode;
        }
        exports.getKeyCode = getKeyCode;
        function setCookie(name, value, path, days, domain) {
            var expires = '';
            if (days) {
                var date = new Date();
                date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
                expires = '; expires=' + date.toUTCString();
            }
            var cookieDomain = '';
            if (domain) {
                cookieDomain = ";domain=" + domain;
            }
            window.document.cookie = name + '=' + encodeURIComponent(value) + expires + ("; path=" + path + ";") + cookieDomain;
        }
        exports.setCookie = setCookie;
        function getCookie(name) {
            if (!!name) {
                for (var _i = 0, _a = document.cookie.split('; '); _i < _a.length; _i++) {
                    var cookie = _a[_i];
                    var delimiterIndex = cookie.indexOf('=');
                    var cookieName = decodeQuotedCookie(cookie.substring(0, delimiterIndex));
                    if (cookieName === name) {
                        return decodeQuotedCookie(cookie.substring(cookieName.length + 1));
                    }
                }
            }
            return null;
        }
        exports.getCookie = getCookie;
        function decodeQuotedCookie(value) {
            value = decodeURIComponent(value.replace('/\+/g', ' '));
            if (value.indexOf('"') === 0) {
                value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            }
            return value;
        }
        function detectContrast(hexValue) {
            if (!!hexValue && (hexValue.length === 6)) {
                var red = parseInt(hexValue.substring(0, 2), 16);
                var green = parseInt(hexValue.substring(2, 4), 16);
                var blue = parseInt(hexValue.substring(4, 6), 16);
                if (!isNaN(red) && !isNaN(green) && !isNaN(blue)) {
                    var brightness = ((red * 299) + (green * 587) + (blue * 114)) / 255000;
                    return (brightness >= 0.5) ? 2 : 1;
                }
            }
            return null;
        }
        exports.detectContrast = detectContrast;
        function pointInRect(x, y, rectangle) {
            if (!rectangle || !isNumber(x) || !isNumber(y) ||
                !isNumber(rectangle.left) || !isNumber(rectangle.right) ||
                !isNumber(rectangle.top) || !isNumber(rectangle.bottom)) {
                return false;
            }
            return (x >= rectangle.left) && (x <= rectangle.right) && (y >= rectangle.top) && (y <= rectangle.bottom);
        }
        exports.pointInRect = pointInRect;
        function apiDeprecated(message) {
            if (console && console.warn) {
                console.warn(message);
            }
            else if (console && console.error) {
                console.error(message);
            }
        }
        exports.apiDeprecated = apiDeprecated;
        function createPerfMarker(name, createAlways) {
            if (!createAlways && getQSPValue('item').toLowerCase().indexOf('perf_marker_global:true') < 0) {
                return;
            }
            if (stringExtensions_1.isNullOrWhiteSpace(name) || !window.performance || !window.performance.mark) {
                return;
            }
            var normalizedName = name.split(' ').join('_');
            window.performance.mark(normalizedName);
            if (window.console && window.console.timeStamp) {
                window.console.timeStamp(normalizedName);
            }
        }
        exports.createPerfMarker = createPerfMarker;
        function getPerfMarkerValue(name) {
            if (stringExtensions_1.isNullOrWhiteSpace(name) || !window.performance || !window.performance.mark) {
                return 0;
            }
            var normalizedName = name.split(' ').join('_');
            var perfMarker = window.performance.getEntriesByName(normalizedName);
            return perfMarker && perfMarker.length ? Math.round(perfMarker[perfMarker.length - 1].startTime) : 0;
        }
        exports.getPerfMarkerValue = getPerfMarkerValue;
        function toElapsedTimeString(seconds, longformat) {
            if (!isNumber(seconds)) {
                return '00:00';
            }
            var negative = seconds < 0;
            if (negative) {
                seconds *= -1;
            }
            var hours = Math.floor(seconds / 3600);
            var remainder = seconds % 3600;
            var minutes = Math.floor(remainder / 60);
            var elapsedTime = '';
            if (longformat) {
                elapsedTime = (hours > 0) ? hours + ':' : '00:';
            }
            else {
                elapsedTime = (hours > 0) ? hours + ':' : '';
            }
            seconds = Math.floor(remainder % 60);
            elapsedTime += ((minutes < 10) ? '0' : '') + minutes;
            elapsedTime += ':' + ((seconds === 0) ? '00' : (((seconds < 10) ? '0' : '') + seconds));
            return negative ? "-" + elapsedTime : elapsedTime;
        }
        exports.toElapsedTimeString = toElapsedTimeString;
        function parseJson(json) {
            if (!JSON || !JSON.parse) {
                throw new Error('JSON.parse unsupported.');
            }
            if (!json) {
                throw new Error('Invalid json.');
            }
            return JSON.parse(json);
        }
        exports.parseJson = parseJson;
        function extend() {
            var parameters = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                parameters[_i] = arguments[_i];
            }
            if (!parameters || !parameters.length) {
                return null;
            }
            var recursive = (typeof (parameters[0]) === 'boolean') && parameters[0];
            if (parameters.length < 2) {
                return recursive ? null : parameters[0];
            }
            if (recursive && (parameters.length < 3)) {
                return parameters[1];
            }
            var target = recursive ? parameters[1] : parameters[0];
            for (var paramIndex = recursive ? 2 : 1; paramIndex < parameters.length; paramIndex++) {
                for (var key in parameters[paramIndex]) {
                    if (parameters[paramIndex].hasOwnProperty(key)) {
                        var source = parameters[paramIndex][key];
                        if (recursive) {
                            var isSourceArray = Array.isArray
                                ? Array.isArray(source)
                                : ({}).toString.call(source) === '[object Array]';
                            var isTargetArray = !!target[key] && (Array.isArray
                                ? Array.isArray(target[key])
                                : ({}).toString.call(target[key]) === '[object Array]');
                            var isSourceObject = !isSourceArray && (typeof source === 'object');
                            var isTargetObject = !isTargetArray && !!target[key] && (typeof target[key] === 'object');
                            if (isSourceArray && isTargetArray) {
                                for (var arrayIndex = 0; arrayIndex < source.length; arrayIndex++) {
                                    isSourceArray = Array.isArray
                                        ? Array.isArray(source[arrayIndex])
                                        : ({}).toString.call(source[arrayIndex]) === '[object Array]';
                                    isTargetArray = !!target[key][arrayIndex] && (Array.isArray
                                        ? Array.isArray(target[key][arrayIndex])
                                        : ({}).toString.call(target[key][arrayIndex]) === '[object Array]');
                                    isSourceObject = !isSourceArray && (typeof source[arrayIndex] === 'object');
                                    isTargetObject = !isTargetArray && !!target[key][arrayIndex] && (typeof target[key][arrayIndex] === 'object');
                                    if (isSourceArray) {
                                        target[key][arrayIndex] = extend(true, isTargetArray ? target[key][arrayIndex] : [], source[arrayIndex]);
                                    }
                                    else if (isSourceObject) {
                                        target[key][arrayIndex] = extend(true, isTargetObject ? target[key][arrayIndex] : {}, source[arrayIndex]);
                                    }
                                    else {
                                        target[key][arrayIndex] = source[arrayIndex];
                                    }
                                }
                                continue;
                            }
                            else if (isSourceArray) {
                                target[key] = extend(true, [], source);
                                continue;
                            }
                            else if (isSourceObject) {
                                target[key] = extend(true, isTargetObject ? target[key] : {}, source);
                                continue;
                            }
                        }
                        target[key] = source;
                    }
                }
            }
            return target;
        }
        exports.extend = extend;
        function poll(checkCriteria, interval, timeout, successCallback, timeoutCallback) {
            var endTime = (!timeout || (timeout < 0)) ? -1 : Number(new Date()) + timeout;
            interval = interval || 100;
            (function internalPoll() {
                var successful = checkCriteria();
                if (successful && successCallback) {
                    successCallback();
                }
                else if (successful) {
                    return;
                }
                else if ((endTime === -1) || (Number(new Date()) < endTime)) {
                    setTimeout(internalPoll, interval);
                }
                else if (timeoutCallback) {
                    timeoutCallback();
                }
                else {
                    return;
                }
            })();
        }
        exports.poll = poll;
        function getQSPValue(queryStringParamName, ignoreCase) {
            if (ignoreCase === void 0) { ignoreCase = true; }
            return getQSP(location.search, queryStringParamName, ignoreCase);
        }
        exports.getQSPValue = getQSPValue;
        function getQSPFromUrl(url, queryStringParamName, ignoreCase) {
            if (ignoreCase === void 0) { ignoreCase = true; }
            return getQSP(url, queryStringParamName, ignoreCase);
        }
        exports.getQSPFromUrl = getQSPFromUrl;
        function getQSP(url, queryStringParamName, ignoreCase) {
            if (ignoreCase === void 0) { ignoreCase = true; }
            if (!queryStringParamName || !url) {
                return '';
            }
            var regexStr = '[\\?&]' + queryStringParamName.replace(/[\[\]]/g, '\\$&') + '=([^&#]*)';
            var regex = ignoreCase ? new RegExp(regexStr, 'i') : new RegExp(regexStr);
            var results = regex.exec(url);
            return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
        }
        function addQSP(url, queryStringParameter) {
            if (!queryStringParameter) {
                return url;
            }
            if (url.indexOf('//') === -1) {
                throw 'To avoid unexpected results in URL parsing, url must begin with "http://", "https://", or "//"';
            }
            var anchor = document.createElement('a');
            anchor.href = url;
            anchor.search = (!anchor.search ? '?' : anchor.search + '&') + queryStringParameter;
            var returnUrl = anchor.href;
            anchor = null;
            return returnUrl;
        }
        exports.addQSP = addQSP;
        function checkUpdateRetrieveStorage(storageType, key, value) {
            try {
                if (!key || (value !== undefined && !value)) {
                    return null;
                }
                switch (storageType) {
                    case 1:
                        if (!window.localStorage) {
                            return null;
                        }
                        if (value === undefined) {
                            return localStorage.getItem(key);
                        }
                        else {
                            localStorage.setItem(key, value);
                        }
                        break;
                    case 0:
                        if (!window.sessionStorage) {
                            return null;
                        }
                        if (value === undefined) {
                            return sessionStorage.getItem(key);
                        }
                        else {
                            sessionStorage.setItem(key, value);
                        }
                        break;
                }
            }
            catch (e) {
                switch (storageType) {
                    case 1:
                        console.log('Error while fetching or saving local storage. It could be due to cookie is blocked.');
                        break;
                    case 0:
                        console.log('Error while fetching or saving session storage. It could be due to cookie is blocked.');
                        break;
                }
            }
        }
        function saveToSessionStorage(key, value) {
            checkUpdateRetrieveStorage(0, key, value);
        }
        exports.saveToSessionStorage = saveToSessionStorage;
        function getValueFromSessionStorage(key) {
            return checkUpdateRetrieveStorage(0, key);
        }
        exports.getValueFromSessionStorage = getValueFromSessionStorage;
        function saveToLocalStorage(key, value) {
            checkUpdateRetrieveStorage(1, key, value);
        }
        exports.saveToLocalStorage = saveToLocalStorage;
        function getValueFromLocalStorage(key) {
            return checkUpdateRetrieveStorage(1, key);
        }
        exports.getValueFromLocalStorage = getValueFromLocalStorage;
        (function (Viewports) {
            Viewports.allWidths = [320, 540, 768, 1084, 1400, 1779];
            Viewports.vpMin = Viewports.allWidths[0];
            Viewports.vpMax = 2048;
            function getViewport() {
                if (window.matchMedia) {
                    for (var i = 0; i < Viewports.allWidths.length; ++i) {
                        if (!window.matchMedia('(min-width:' + Viewports.allWidths[i] + 'px)').matches) {
                            return i;
                        }
                    }
                }
                else {
                    for (var i = 0; i < Viewports.allWidths.length; ++i) {
                        if (!(getWindowWidth() >= Viewports.allWidths[i])) {
                            return i;
                        }
                    }
                }
                return Viewports.allWidths.length;
            }
            Viewports.getViewport = getViewport;
        })(exports.Viewports || (exports.Viewports = {}));
    });
    define("closed-captions/ttml-settings", ["require", "exports", "mwf/utilities/utility"], function (require, exports, utility_1) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.TtmlSettings = exports.xmlNS = void 0;
        exports.xmlNS = 'http://www.w3.org/XML/1998/namespace';
        var TtmlSettings = (function () {
            function TtmlSettings(settingsOverrides) {
                this.ttmlNamespace = 'http://www.w3.org/ns/ttml';
                this.ttmlStyleNamespace = 'http://www.w3.org/ns/ttml#styling';
                this.ttmlParameterNamespace = 'http://www.w3.org/ns/ttml#parameter';
                this.ttmlMetaNamespace = 'http://www.w3.org/ns/ttml#metadata';
                this.idPrefix = '';
                this.mediaFrameRate = 30;
                this.mediaFrameRateMultiplier = 1;
                this.mediaSubFrameRate = 1;
                this.mediaTickRate = 1000;
                this.supportedTimeBase = 'media';
                this.cellResolution = { rows: 15, columns: 32 };
                this.defaultRegionStyle = {
                    backgroundColor: 'transparent',
                    color: '#E8E9EA',
                    direction: 'ltr',
                    display: 'auto',
                    displayAlign: 'before',
                    extent: 'auto',
                    fontFamily: 'default',
                    fontSize: '1c',
                    fontStyle: 'normal',
                    fontWeight: 'normal',
                    lineHeight: 'normal',
                    opacity: '1',
                    origin: 'auto',
                    overflow: 'hidden',
                    padding: '0',
                    showBackground: 'always',
                    textAlign: 'start',
                    textDecoration: 'none',
                    textOutline: 'none',
                    unicodeBidi: 'normal',
                    visibility: 'visible',
                    wrapOption: 'normal',
                    writingMode: 'lrtb'
                };
                this.fontMap = {};
                this.fontMap['default'] = 'Lucida sans typewriter, Lucida console, Consolas';
                this.fontMap['monospaceSerif'] = 'Courier';
                this.fontMap['proportionalSerif'] = 'Times New Roman, Serif';
                this.fontMap['monospaceSansSerif'] = 'Lucida sans typewriter, Lucida console, Consolas';
                this.fontMap['proportionalSansSerif'] = 'Arial, Sans-serif';
                this.fontMap['casual'] = 'Verdana';
                this.fontMap['cursive'] = 'Zapf-Chancery, Segoe script, Cursive';
                this.fontMap['smallCaps'] = 'Arial, Helvetica';
                this.fontMap['monospace'] = 'Lucida sans typewriter, Lucida console, Consolas';
                this.fontMap['sansSerif'] = 'Arial, Sans-serif';
                this.fontMap['serif'] = 'Times New Roman, Serif';
                if (settingsOverrides) {
                    utility_1.extend(this, settingsOverrides);
                }
            }
            return TtmlSettings;
        }());
        exports.TtmlSettings = TtmlSettings;
    });
    define("constants/interfaces", ["require", "exports"], function (require, exports) {
        Object.defineProperty(exports, "__esModule", { value: true });
    });
    define("mwf/utilities/htmlExtensions", ["require", "exports", "mwf/utilities/stringExtensions"], function (require, exports, stringExtensions_2) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.preventDefaultSwipeAction = exports.getParent = exports.getCoordinates = exports.isImageLoadFailed = exports.isImageLoadedSuccessfully = exports.scrollElementIntoView = exports.getOffsetParent = exports.getScrollY = exports.stopPropagation = exports.customEvent = exports.getEvent = exports.getEventTargetOrSrcElement = exports.removeInnerHtml = exports.setText = exports.getText = exports.isDescendantOrSelf = exports.isDescendant = exports.toArray = exports.isArray = exports.removeEvent = exports.css = exports.getClientRectWithMargin = exports.getClientRect = exports.getDirection = exports.htmlCollectionToArray = exports.nodeListToArray = exports.selectElementsFromSelectors = exports.selectFirstElementT = exports.selectElementsT = exports.selectFirstElement = exports.selectElements = exports.removeElement = exports.hasClass = exports.addAttribute = exports.addClasses = exports.removeClasses = exports.removeClass = exports.addClass = exports.onDeferred = exports.documentReady = exports.addDebouncedEvent = exports.addThrottledEvents = exports.addThrottledEvent = exports.preventDefault = exports.removeEvents = exports.addEvents = exports.addEvent = exports.eventTypes = exports.Direction = exports.SafeBrowserApis = void 0;
        var SafeBrowserApis;
        (function (SafeBrowserApis) {
            SafeBrowserApis.requestAnimationFrame = window.requestAnimationFrame || function (callback) {
                if (typeof callback === 'function') {
                    window.setTimeout(callback, 16.7);
                }
            };
        })(SafeBrowserApis = exports.SafeBrowserApis || (exports.SafeBrowserApis = {}));
        var Direction;
        (function (Direction) {
            Direction[Direction["right"] = 0] = "right";
            Direction[Direction["left"] = 1] = "left";
        })(Direction = exports.Direction || (exports.Direction = {}));
        var eventTypes;
        (function (eventTypes) {
            eventTypes[eventTypes["animationend"] = 0] = "animationend";
            eventTypes[eventTypes["blur"] = 1] = "blur";
            eventTypes[eventTypes["change"] = 2] = "change";
            eventTypes[eventTypes["click"] = 3] = "click";
            eventTypes[eventTypes["DOMContentLoaded"] = 4] = "DOMContentLoaded";
            eventTypes[eventTypes["DOMNodeInserted"] = 5] = "DOMNodeInserted";
            eventTypes[eventTypes["DOMNodeRemoved"] = 6] = "DOMNodeRemoved";
            eventTypes[eventTypes["ended"] = 7] = "ended";
            eventTypes[eventTypes["error"] = 8] = "error";
            eventTypes[eventTypes["focus"] = 9] = "focus";
            eventTypes[eventTypes["focusin"] = 10] = "focusin";
            eventTypes[eventTypes["focusout"] = 11] = "focusout";
            eventTypes[eventTypes["input"] = 12] = "input";
            eventTypes[eventTypes["load"] = 13] = "load";
            eventTypes[eventTypes["keydown"] = 14] = "keydown";
            eventTypes[eventTypes["keypress"] = 15] = "keypress";
            eventTypes[eventTypes["keyup"] = 16] = "keyup";
            eventTypes[eventTypes["loadedmetadata"] = 17] = "loadedmetadata";
            eventTypes[eventTypes["mousedown"] = 18] = "mousedown";
            eventTypes[eventTypes["mousemove"] = 19] = "mousemove";
            eventTypes[eventTypes["mouseout"] = 20] = "mouseout";
            eventTypes[eventTypes["mouseover"] = 21] = "mouseover";
            eventTypes[eventTypes["mouseup"] = 22] = "mouseup";
            eventTypes[eventTypes["onreadystatechange"] = 23] = "onreadystatechange";
            eventTypes[eventTypes["resize"] = 24] = "resize";
            eventTypes[eventTypes["scroll"] = 25] = "scroll";
            eventTypes[eventTypes["submit"] = 26] = "submit";
            eventTypes[eventTypes["timeupdate"] = 27] = "timeupdate";
            eventTypes[eventTypes["touchcancel"] = 28] = "touchcancel";
            eventTypes[eventTypes["touchend"] = 29] = "touchend";
            eventTypes[eventTypes["touchmove"] = 30] = "touchmove";
            eventTypes[eventTypes["touchstart"] = 31] = "touchstart";
            eventTypes[eventTypes["wheel"] = 32] = "wheel";
        })(eventTypes = exports.eventTypes || (exports.eventTypes = {}));
        function addEvent(target, eventType, listener, useCapture) {
            if (useCapture === void 0) { useCapture = false; }
            for (var _i = 0, _a = toArray(target); _i < _a.length; _i++) {
                var t = _a[_i];
                bindEventToDOM(t, listener, useCapture, eventTypes[eventType]);
            }
        }
        exports.addEvent = addEvent;
        function addEvents(target, eventTypes, listener, useCapture) {
            if (useCapture === void 0) { useCapture = false; }
            if (stringExtensions_2.isNullOrWhiteSpace(eventTypes)) {
                return;
            }
            for (var _i = 0, _a = toArray(target); _i < _a.length; _i++) {
                var t = _a[_i];
                for (var _b = 0, _c = eventTypes.split(/\s+/); _b < _c.length; _b++) {
                    var eventType = _c[_b];
                    if (!stringExtensions_2.isNullOrWhiteSpace(eventType)) {
                        bindEventToDOM(t, listener, useCapture, eventType);
                    }
                }
            }
        }
        exports.addEvents = addEvents;
        function removeEvents(target, eventTypes, listener, useCapture) {
            if (useCapture === void 0) { useCapture = false; }
            for (var _i = 0, _a = toArray(target); _i < _a.length; _i++) {
                var t = _a[_i];
                for (var _b = 0, _c = toArray(eventTypes); _b < _c.length; _b++) {
                    var eventType = _c[_b];
                    if (!stringExtensions_2.isNullOrWhiteSpace(eventType)) {
                        removeEventFromDOM(t, listener, useCapture, eventType);
                    }
                }
            }
        }
        exports.removeEvents = removeEvents;
        function preventDefault(event) {
            event = getEvent(event);
            if (event) {
                if (event.preventDefault) {
                    event.preventDefault();
                }
                else {
                    event.returnValue = false;
                }
            }
        }
        exports.preventDefault = preventDefault;
        function addThrottledEvent(target, name, listener, threshold) {
            if (threshold === void 0) { threshold = 150; }
            var timer = null;
            var last = 0;
            var throttledEventHandler = function (event) {
                var now = Date.now();
                if (timer) {
                    clearTimeout(timer);
                    timer = undefined;
                }
                if (!!last && (now < last + threshold)) {
                    timer = setTimeout(function () {
                        last = Date.now();
                        listener(event);
                    }, threshold - (now - last));
                }
                else {
                    last = now;
                    listener(event);
                }
            };
            addEvent(target, name, throttledEventHandler);
            return throttledEventHandler;
        }
        exports.addThrottledEvent = addThrottledEvent;
        function addThrottledEvents(target, eventTypes, listener, useCapture, threshold) {
            if (useCapture === void 0) { useCapture = false; }
            if (threshold === void 0) { threshold = 150; }
            function throttle(listener) {
                var timer = null;
                var last = 0;
                var throttledEventHandler = function (event) {
                    var now = Date.now();
                    clearTimeout(timer);
                    if (!!last && (now < last + threshold)) {
                        timer = setTimeout(function () {
                            last = now;
                            listener(event);
                        }, threshold - (now - last));
                    }
                    else {
                        last = now;
                        listener(event);
                    }
                };
                return throttledEventHandler;
            }
            if (stringExtensions_2.isNullOrWhiteSpace(eventTypes)) {
                return;
            }
            for (var _i = 0, _a = toArray(target); _i < _a.length; _i++) {
                var t = _a[_i];
                for (var _b = 0, _c = eventTypes.split(/\s+/); _b < _c.length; _b++) {
                    var eventType = _c[_b];
                    if (!stringExtensions_2.isNullOrWhiteSpace(eventType)) {
                        var throttledListener = throttle(listener);
                        bindEventToDOM(t, throttledListener, useCapture, eventType);
                    }
                }
            }
        }
        exports.addThrottledEvents = addThrottledEvents;
        function addDebouncedEvent(target, name, listener, delay) {
            if (delay === void 0) { delay = 150; }
            var timer = null;
            var debounceEventHandler = function (event) {
                window.clearTimeout(timer);
                timer = setTimeout(function () { listener(event); }, delay);
            };
            addEvent(target, name, debounceEventHandler);
            return debounceEventHandler;
        }
        exports.addDebouncedEvent = addDebouncedEvent;
        function documentReady(listener, domReadyTimeout) {
            if (domReadyTimeout === void 0) { domReadyTimeout = 5000; }
            if (document.readyState === 'complete') {
                listener.call(null);
                return;
            }
            if (!(document.attachEvent) && (document.readyState === 'interactive')) {
                listener.call(null);
                return;
            }
            var domReadyTimer = null;
            var domContentListener;
            var readyStateListener;
            var timeoutAwareListener = function (reason) {
                clearTimeout(domReadyTimer);
                if (domContentListener) {
                    removeEvent(document, eventTypes.DOMContentLoaded, domContentListener);
                }
                if (readyStateListener) {
                    removeEvent(document, eventTypes.onreadystatechange, readyStateListener);
                }
                SafeBrowserApis.requestAnimationFrame.call(window, listener);
            };
            domReadyTimer = setTimeout(function () {
                timeoutAwareListener();
            }, domReadyTimeout);
            if (document.addEventListener) {
                domContentListener = function () {
                    timeoutAwareListener();
                };
                addEvent(document, eventTypes.DOMContentLoaded, domContentListener, false);
                return;
            }
            if (document.attachEvent) {
                readyStateListener = function () {
                    if (document.readyState === 'complete') {
                        timeoutAwareListener();
                    }
                };
                addEvent(document, eventTypes.onreadystatechange, readyStateListener, false);
            }
        }
        exports.documentReady = documentReady;
        function onDeferred(listener, onLoadTimeout) {
            if (onLoadTimeout === void 0) { onLoadTimeout = 5000; }
            var timeoutAwareListener;
            var deferredTimer = setTimeout(function () {
                clearTimeout(deferredTimer);
                removeEvent(window, eventTypes.load, timeoutAwareListener);
                listener.call(null);
            }, onLoadTimeout);
            timeoutAwareListener = function () {
                clearTimeout(deferredTimer);
                SafeBrowserApis.requestAnimationFrame.call(window, listener);
            };
            if (document.readyState === 'complete') {
                clearTimeout(deferredTimer);
                listener.call(null);
            }
            else {
                addEvent(window, eventTypes.load, timeoutAwareListener);
            }
        }
        exports.onDeferred = onDeferred;
        function addClass(element, cssClass) {
            if ((!!element) && (!stringExtensions_2.isNullOrWhiteSpace(cssClass)) && (!hasClass(element, cssClass))) {
                if (element.classList) {
                    element.classList.add(cssClass);
                }
                else {
                    element.className = stringExtensions_2.trim(element.className + ' ' + cssClass);
                }
            }
        }
        exports.addClass = addClass;
        function removeClass(elements, cssClass) {
            if ((!!elements) && (!stringExtensions_2.isNullOrWhiteSpace(cssClass))) {
                var removeClass_1 = ' ' + stringExtensions_2.trim(cssClass) + ' ';
                for (var _i = 0, _a = toArray(elements); _i < _a.length; _i++) {
                    var element = _a[_i];
                    if (element.classList) {
                        element.classList.remove(cssClass);
                    }
                    else if (!stringExtensions_2.isNullOrWhiteSpace(element.className)) {
                        var classNames = ' ' + element.className + ' ';
                        while (classNames.indexOf(removeClass_1) > -1) {
                            classNames = classNames.replace(removeClass_1, ' ');
                        }
                        element.className = stringExtensions_2.trim(classNames);
                    }
                }
            }
        }
        exports.removeClass = removeClass;
        function removeClasses(element, cssClasses) {
            if (cssClasses) {
                for (var _i = 0, cssClasses_1 = cssClasses; _i < cssClasses_1.length; _i++) {
                    var cssClass = cssClasses_1[_i];
                    removeClass(element, cssClass);
                }
            }
        }
        exports.removeClasses = removeClasses;
        function addClasses(element, cssClasses) {
            if (cssClasses) {
                for (var _i = 0, cssClasses_2 = cssClasses; _i < cssClasses_2.length; _i++) {
                    var cssClass = cssClasses_2[_i];
                    addClass(element, cssClass);
                }
            }
        }
        exports.addClasses = addClasses;
        function addAttribute(element, elementAttributes) {
            if (element && elementAttributes) {
                for (var _i = 0, elementAttributes_1 = elementAttributes; _i < elementAttributes_1.length; _i++) {
                    var attribute = elementAttributes_1[_i];
                    if (!stringExtensions_2.isNullOrWhiteSpace(attribute.name) && !stringExtensions_2.isNullOrWhiteSpace(attribute.value)) {
                        element.setAttribute(attribute.name, attribute.value);
                    }
                }
            }
        }
        exports.addAttribute = addAttribute;
        function hasClass(element, cssClass) {
            if ((!element) || stringExtensions_2.isNullOrWhiteSpace(cssClass)) {
                return false;
            }
            else if (element.classList) {
                return element.classList.contains(cssClass);
            }
            else {
                return (' ' + element.className + ' ').indexOf(' ' + stringExtensions_2.trim(cssClass) + ' ') > -1;
            }
        }
        exports.hasClass = hasClass;
        function removeElement(element) {
            return element ? element.parentElement.removeChild(element) : element;
        }
        exports.removeElement = removeElement;
        function selectElements(selector, context) {
            return selectElementsT(selector, context);
        }
        exports.selectElements = selectElements;
        function selectFirstElement(selector, context) {
            var elementsSelected = selectElementsT(selector, context);
            return (!elementsSelected || !elementsSelected.length) ? null : elementsSelected[0];
        }
        exports.selectFirstElement = selectFirstElement;
        function selectElementsT(selector, context) {
            if (stringExtensions_2.isNullOrWhiteSpace(selector) || selector === '#') {
                return [];
            }
            var currentContext = context || document;
            if (/^[\#.]?[\w-]+$/.test(selector)) {
                switch (selector[0]) {
                    case '.':
                        if (currentContext.getElementsByClassName) {
                            return htmlCollectionToArray(currentContext.getElementsByClassName(selector.slice(1)));
                        }
                        else {
                            return nodeListToArray(currentContext.querySelectorAll(selector));
                        }
                    case '#':
                        var element = currentContext.querySelector(selector);
                        return (element ? [element] : []);
                }
                return nodeListToArray(currentContext.querySelectorAll(selector));
            }
            return nodeListToArray(currentContext.querySelectorAll(selector));
        }
        exports.selectElementsT = selectElementsT;
        function selectFirstElementT(selector, context) {
            var elementsSelected = selectElementsT(selector, context);
            return (!elementsSelected || !elementsSelected.length) ? null : elementsSelected[0];
        }
        exports.selectFirstElementT = selectFirstElementT;
        function selectElementsFromSelectors(selectors, context) {
            var currentContext = context || document;
            var selectorList;
            var selectedList;
            selectorList = selectors.split(',');
            for (var _i = 0, selectorList_1 = selectorList; _i < selectorList_1.length; _i++) {
                var selector = selectorList_1[_i];
                selectedList += this.selectElements(selector, currentContext);
            }
            return selectedList;
        }
        exports.selectElementsFromSelectors = selectElementsFromSelectors;
        function nodeListToArray(nodeList) {
            if (!nodeList) {
                return [];
            }
            var elements = [];
            for (var n = 0; n < nodeList.length; n++) {
                elements.push(nodeList[n]);
            }
            return elements;
        }
        exports.nodeListToArray = nodeListToArray;
        function htmlCollectionToArray(htmlCollection) {
            if (!htmlCollection) {
                return [];
            }
            var elements = [];
            for (var n = 0; n < htmlCollection.length; n++) {
                elements.push(htmlCollection[n]);
            }
            return elements;
        }
        exports.htmlCollectionToArray = htmlCollectionToArray;
        function getDirection(context) {
            if (context === void 0) { context = document.documentElement; }
            while (context !== null) {
                var dir = context.getAttribute('dir');
                if (!!dir) {
                    return dir === 'rtl' ? Direction.right : Direction.left;
                }
                else {
                    context = context.parentElement;
                }
            }
            return Direction.left;
        }
        exports.getDirection = getDirection;
        function getClientRect(element) {
            if (!element) {
                return;
            }
            var box = element.getBoundingClientRect();
            var clone = {};
            for (var property in box) {
                clone[property] = box[property];
            }
            if (typeof clone.width === 'undefined') {
                clone.width = element.offsetWidth;
            }
            if (typeof clone.height === 'undefined') {
                clone.height = element.offsetHeight;
            }
            return clone;
        }
        exports.getClientRect = getClientRect;
        function getClientRectWithMargin(element) {
            if (!element) {
                return;
            }
            return {
                width: parseFloat(getClientRect(element).width) + parseFloat(css(element, 'margin-left')) + parseFloat(css(element, 'margin-right')),
                height: parseFloat(getClientRect(element).height) + parseFloat(css(element, 'margin-top')) + parseFloat(css(element, 'margin-bottom'))
            };
        }
        exports.getClientRectWithMargin = getClientRectWithMargin;
        function css(element, property, value) {
            if (!element) {
                return null;
            }
            if (!!value || value === '') {
                element.style[property] = value;
            }
            else {
                value = element.style[property];
                if (stringExtensions_2.isNullOrWhiteSpace(value)) {
                    value = getComputedStyle(element);
                    value = value[property];
                }
                return value;
            }
        }
        exports.css = css;
        function removeEvent(eventTargets, name, listener, useCapture) {
            if (!eventTargets || !name || !listener) {
                return;
            }
            for (var _i = 0, _a = toArray(eventTargets); _i < _a.length; _i++) {
                var target = _a[_i];
                removeEventFromDOM(target, listener, useCapture, eventTypes[name]);
            }
        }
        exports.removeEvent = removeEvent;
        function isArray(obj) {
            return Array.isArray ?
                Array.isArray(obj) :
                ({}).toString.call(obj) === '[object Array]';
        }
        exports.isArray = isArray;
        function toArray(obj) {
            return isArray(obj) ? obj : [obj];
        }
        exports.toArray = toArray;
        function isDescendant(parent, child) {
            return !!parent && (parent !== child) && parent.contains(child);
        }
        exports.isDescendant = isDescendant;
        function isDescendantOrSelf(parent, child) {
            return !!parent && parent.contains(child);
        }
        exports.isDescendantOrSelf = isDescendantOrSelf;
        function getText(element) {
            return !!element ? element.textContent || element.innerText || '' : '';
        }
        exports.getText = getText;
        function setText(element, text) {
            if (!!element && text !== null) {
                element.textContent ? element.textContent = text : element.innerHTML = text;
            }
        }
        exports.setText = setText;
        function removeInnerHtml(parentElement) {
            if (parentElement) {
                parentElement.innerHTML = '';
            }
        }
        exports.removeInnerHtml = removeInnerHtml;
        function getEventTargetOrSrcElement(event) {
            event = getEvent(event);
            return (event.target || event.srcElement);
        }
        exports.getEventTargetOrSrcElement = getEventTargetOrSrcElement;
        function getEvent(event) {
            return event || window.event;
        }
        exports.getEvent = getEvent;
        function bindEventToDOM(target, listener, useCapture, eventType) {
            if (useCapture === void 0) { useCapture = false; }
            if (!!target) {
                window.addEventListener
                    ? target.addEventListener(eventType, listener, useCapture)
                    : target.attachEvent('on' + eventType, listener);
            }
        }
        function removeEventFromDOM(target, listener, useCapture, eventType) {
            if (useCapture === void 0) { useCapture = false; }
            if (!!target) {
                window.removeEventListener
                    ? target.removeEventListener(eventType, listener, useCapture)
                    : target.detachEvent('on' + eventType, listener);
            }
        }
        function customEvent(element, eventType, data) {
            if (data === void 0) { data = {}; }
            if (!element || !eventType) {
                return null;
            }
            var eventName = (typeof eventType === 'string') ? eventType : eventTypes[eventType];
            var event = null;
            data.bubbles = typeof data.bubbles === 'undefined' ? true : data.bubbles;
            data.cancelable = typeof data.cancelable === 'undefined' ? true : data.cancelable;
            if (window.CustomEvent && typeof window.CustomEvent === "function") {
                event = new CustomEvent(eventName, data);
                if (data.changedTouches && data.changedTouches.length) {
                    event['changedTouches'] = data.changedTouches;
                }
            }
            else if (document.createEvent) {
                event = document.createEvent('CustomEvent');
                event.initCustomEvent(eventName, data.bubbles, data.cancelable, data.detail);
                if (data.changedTouches && data.changedTouches.length) {
                    event['changedTouches'] = data.changedTouches;
                }
            }
            else {
                event = document.createEventObject();
                try {
                    element.fireEvent('on' + eventName, event);
                }
                catch (err) {
                    return undefined;
                }
                return event;
            }
            element.dispatchEvent(event);
            return event;
        }
        exports.customEvent = customEvent;
        function stopPropagation(event) {
            if (event.stopPropagation) {
                event.stopPropagation();
            }
            else {
                event.returnValue = false;
            }
        }
        exports.stopPropagation = stopPropagation;
        function getScrollY(context) {
            if (context === void 0) { context = window; }
            return context.scrollY || context.pageYOffset || ((context.document.compatMode === "CSS1Compat") ? context.document.documentElement.scrollTop : context.document.body.scrollTop);
        }
        exports.getScrollY = getScrollY;
        function getOffsetParent(element) {
            if (!element) {
                return window.document.documentElement;
            }
            var docElement = element.ownerDocument.documentElement;
            var offsetParent = element.offsetParent;
            while (offsetParent && css(offsetParent, "position") == "static") {
                offsetParent = offsetParent.offsetParent;
            }
            return offsetParent || docElement;
        }
        exports.getOffsetParent = getOffsetParent;
        function scrollElementIntoView(element, scrollContainer) {
            if (!element || !scrollContainer) {
                return;
            }
            var height = scrollContainer.clientHeight;
            var scrollHeight = scrollContainer.scrollHeight;
            if (scrollHeight > height) {
                scrollContainer.scrollTop = Math.min(element.offsetTop - scrollContainer.firstElementChild.offsetTop, scrollHeight - height);
            }
        }
        exports.scrollElementIntoView = scrollElementIntoView;
        function isImageLoadedSuccessfully(image) {
            if (typeof image.complete !== 'undefined' && typeof image.naturalHeight !== 'undefined') {
                return image && image.complete && image.naturalHeight > 0;
            }
            return true;
        }
        exports.isImageLoadedSuccessfully = isImageLoadedSuccessfully;
        function isImageLoadFailed(image) {
            if (image && typeof image.complete !== 'undefined' && typeof image.naturalHeight !== 'undefined') {
                return image && image.complete && (image.naturalWidth == 0 && image.naturalHeight == 0);
            }
            return false;
        }
        exports.isImageLoadFailed = isImageLoadFailed;
        function getCoordinates(event) {
            var touches = event.touches && event.touches.length ? event.touches : [event];
            var eventObject = (event.changedTouches && event.changedTouches[0]) || touches[0];
            return {
                x: eventObject.clientX,
                y: eventObject.clientY
            };
        }
        exports.getCoordinates = getCoordinates;
        function getParent(element, selector) {
            var matchesSelector = element.matches || element.webkitMatchesSelector || element.mozMatchesSelector || element.msMatchesSelector;
            while (element) {
                if (matchesSelector.call(element, selector)) {
                    break;
                }
                element = element.parentElement;
            }
            return element;
        }
        exports.getParent = getParent;
        function preventDefaultSwipeAction(element, horizontal) {
            if (horizontal === void 0) { horizontal = true; }
            if (!!element && (window.PointerEvent || window.navigator.pointerEnabled)) {
                css(element, 'touchAction', horizontal ? 'pan-y' : 'pan-x');
            }
        }
        exports.preventDefaultSwipeAction = preventDefaultSwipeAction;
    });
    define("closed-captions/ttml-parser", ["require", "exports", "closed-captions/ttml-context", "closed-captions/ttml-time-parser", "closed-captions/ttml-settings", "mwf/utilities/htmlExtensions", "mwf/utilities/stringExtensions"], function (require, exports, ttml_context_1, ttml_time_parser_1, ttml_settings_1, htmlExtensions_1, stringExtensions_3) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.TtmlParser = void 0;
        var TtmlParser = (function () {
            function TtmlParser() {
            }
            TtmlParser.parse = function (ttmlDocument, settingsOverrides) {
                ttmlDocument = (typeof ttmlDocument === 'string') ? TtmlParser.parseXml(ttmlDocument) : ttmlDocument;
                var ttmlContext = new ttml_context_1.TtmlContext();
                ttmlContext.settings = new ttml_settings_1.TtmlSettings(settingsOverrides);
                ttmlContext.root = TtmlParser.verifyRoot(ttmlDocument, ttmlContext);
                ttmlContext.body = TtmlParser.getFirstElementByTagNameNS(ttmlContext.root, 'body', ttmlContext.settings.ttmlNamespace);
                ttmlContext.events = [];
                ttmlContext.styleSetCache = [];
                if (ttmlContext.body) {
                    TtmlParser.parseTtAttrs(ttmlContext);
                    var head = TtmlParser.ensureRegions(ttmlContext);
                    var timeBase = TtmlParser.getAttributeNS(ttmlContext.root, 'timeBase', ttmlContext.settings.ttmlParameterNamespace) || 'media';
                    if (ttmlContext.settings.supportedTimeBase.indexOf(timeBase) !== -1) {
                        TtmlParser.processAnonymousSpans(ttmlContext, ttmlContext.body);
                        var timeParser = new ttml_time_parser_1.TtmlTimeParser(ttmlContext.settings.mediaFrameRate, ttmlContext.settings.mediaTickRate);
                        TtmlParser.applyTiming(ttmlContext, ttmlContext.root, { start: TtmlParser.mediaStart, end: TtmlParser.mediaEnd }, true, timeParser);
                        TtmlParser.applyStyling(ttmlContext, head);
                    }
                    ttmlContext.events.push({ time: TtmlParser.mediaEnd, element: null });
                    ttmlContext.events.sort(function (event1, event2) {
                        return event1.time - event2.time;
                    });
                }
                return ttmlContext;
            };
            TtmlParser.parseXml = function (xmlString) {
                var xml = null;
                if (window.DOMParser) {
                    var domParser = new window.DOMParser();
                    xml = domParser.parseFromString(xmlString, 'application/xml');
                }
                else {
                    var domParser = new window.ActiveXObject('Microsoft.XMLDOM');
                    domParser.async = false;
                    domParser.loadXML(xmlString);
                    xml = domParser;
                }
                return xml;
            };
            TtmlParser.verifyRoot = function (ttmlDocument, ttmlContext) {
                var root;
                var candidate = ttmlDocument.documentElement;
                if (TtmlParser.getLocalTagName(candidate) === 'tt') {
                    if (candidate.namespaceURI !== 'http://www.w3.org/ns/ttml') {
                        ttmlContext.settings.ttmlNamespace = candidate.namespaceURI;
                        ttmlContext.settings.ttmlStyleNamespace = ttmlContext.settings.ttmlNamespace + '#styling';
                        ttmlContext.settings.ttmlParameterNamespace = ttmlContext.settings.ttmlNamespace + '#parameter';
                        ttmlContext.settings.ttmlMetaNamespace = ttmlContext.settings.ttmlNamespace + '#metadata';
                    }
                    root = candidate;
                }
                return root;
            };
            TtmlParser.parseTtAttrs = function (ttmlContext) {
                var cellRes = TtmlParser.getAttributeNS(ttmlContext.root, 'cellResolution', ttmlContext.settings.ttmlParameterNamespace);
                var extent = TtmlParser.getAttributeNS(ttmlContext.root, 'extent', ttmlContext.settings.ttmlStyleNamespace);
                var cellGrid = null;
                if (cellRes) {
                    var parts = stringExtensions_3.trim(cellRes).split(/\s+/);
                    if (parts.length === 2) {
                        var columns = Math.round(parseFloat(parts[0]));
                        var rows = Math.round(parseFloat(parts[1]));
                        if ((rows > 0) && (columns > 0)) {
                            cellGrid = { rows: rows, columns: columns };
                        }
                    }
                }
                if (cellGrid) {
                    ttmlContext.settings.cellResolution = cellGrid;
                }
                if (extent) {
                    if (extent !== 'auto') {
                        var coords = extent.split(/\s+/);
                        if ((coords.length === 2) &&
                            (coords[0].substr(coords[0].length - 2) === 'px') &&
                            (coords[1].substr(coords[1].length - 2) === 'px')) {
                            var width = parseFloat(coords[0].substr(0, coords[0].length - 2));
                            var height = parseFloat(coords[1].substr(0, coords[1].length - 2));
                            ttmlContext.settings.rootContainerRegionDimensions = { 'width': Math.round(width), 'height': Math.round(height) };
                        }
                    }
                }
            };
            TtmlParser.ensureRegions = function (ttmlContext) {
                ttmlContext.rootContainerRegion = ttmlContext.root.ownerDocument.createElementNS(ttmlContext.settings.ttmlNamespace, 'rootcontainerregion');
                ttmlContext.root.appendChild(ttmlContext.rootContainerRegion);
                var extents = ttmlContext.settings.rootContainerRegionDimensions ? stringExtensions_3.format('{0}px {1}px', ttmlContext.settings.rootContainerRegionDimensions.width, ttmlContext.settings.rootContainerRegionDimensions.height) : 'auto';
                ttmlContext.rootContainerRegion.setAttributeNS(ttmlContext.settings.ttmlStyleNamespace, 'extent', extents);
                var head = TtmlParser.getFirstElementByTagNameNS(ttmlContext.root, 'head', ttmlContext.settings.ttmlNamespace);
                if (!head) {
                    head = ttmlContext.root.ownerDocument.createElementNS(ttmlContext.settings.ttmlNamespace, 'head');
                    ttmlContext.root.appendChild(head);
                }
                ttmlContext.layout = TtmlParser.getFirstElementByTagNameNS(head, 'layout', ttmlContext.settings.ttmlNamespace);
                if (!ttmlContext.layout) {
                    ttmlContext.layout = ttmlContext.root.ownerDocument.createElementNS(ttmlContext.settings.ttmlNamespace, 'layout');
                    ttmlContext.root.appendChild(ttmlContext.layout);
                }
                var regions = ttmlContext.layout.getElementsByTagNameNS(ttmlContext.settings.ttmlNamespace, 'region');
                if (!regions.length) {
                    var anonymousRegion = ttmlContext.root.ownerDocument.createElementNS(ttmlContext.settings.ttmlNamespace, 'region');
                    anonymousRegion.setAttributeNS(ttml_settings_1.xmlNS, 'id', 'anonymous');
                    anonymousRegion.setAttribute('data-isanonymous', '1');
                    ttmlContext.layout.appendChild(anonymousRegion);
                    ttmlContext.body.setAttributeNS(ttmlContext.settings.ttmlNamespace, 'region', 'anonymous');
                }
                return head;
            };
            TtmlParser.processAnonymousSpans = function (ttmlContext, element) {
                if (TtmlParser.isTagNS(element, 'p', ttmlContext.settings.ttmlNamespace)) {
                    var textNodeGroups = [];
                    var prevNodeType = void 0;
                    for (var _i = 0, _a = htmlExtensions_1.nodeListToArray(element.childNodes); _i < _a.length; _i++) {
                        var child = _a[_i];
                        if (child.nodeType === Node.TEXT_NODE) {
                            if (prevNodeType !== Node.TEXT_NODE) {
                                textNodeGroups.push([]);
                            }
                            textNodeGroups[textNodeGroups.length - 1].push(child);
                        }
                        prevNodeType = child.nodeType;
                    }
                    for (var _b = 0, textNodeGroups_1 = textNodeGroups; _b < textNodeGroups_1.length; _b++) {
                        var group = textNodeGroups_1[_b];
                        var anonSpan = ttmlContext.root.ownerDocument.createElementNS(ttmlContext.settings.ttmlNamespace, 'span');
                        anonSpan.appendChild(group[0].parentNode.replaceChild(anonSpan, group[0]));
                        for (var index = 1; index < group.length; index++) {
                            anonSpan.appendChild(group[index]);
                        }
                    }
                }
                for (var _c = 0, _d = htmlExtensions_1.nodeListToArray(element.childNodes); _c < _d.length; _c++) {
                    var child = _d[_c];
                    this.processAnonymousSpans(ttmlContext, child);
                }
            };
            TtmlParser.applyTiming = function (ttmlContext, element, bound, isParallelContext, timeParser) {
                var beginAttribute = TtmlParser.getAttributeNS(element, 'begin', ttmlContext.settings.ttmlNamespace);
                var startTime = beginAttribute ? timeParser.parse(beginAttribute) : bound.start;
                var endTime = 0;
                var duration = 0;
                var end = 0;
                var durationAttribute = TtmlParser.getAttributeNS(element, 'dur', ttmlContext.settings.ttmlNamespace);
                var endAttribute = TtmlParser.getAttributeNS(element, 'end', ttmlContext.settings.ttmlNamespace);
                if ((!durationAttribute) && (!endAttribute)) {
                    if (isParallelContext) {
                        if (startTime <= bound.end) {
                            Math.max(0, bound.end - startTime);
                            endTime = bound.end;
                        }
                        else {
                            endTime = 0;
                        }
                    }
                }
                else if (durationAttribute && endAttribute) {
                    duration = timeParser.parse(durationAttribute);
                    end = timeParser.parse(endAttribute);
                    var minEnd = Math.min(startTime + duration, bound.start + end);
                    endTime = Math.min(minEnd, bound.end);
                }
                else if (endAttribute) {
                    end = timeParser.parse(endAttribute);
                    endTime = Math.min(bound.start + end, bound.end);
                }
                else {
                    duration = timeParser.parse(durationAttribute);
                    endTime = Math.min(startTime + duration, bound.end);
                }
                if (endTime < startTime) {
                    endTime = startTime;
                }
                startTime = Math.floor(startTime);
                endTime = Math.floor(endTime);
                element.setAttribute('data-time-start', startTime.toString());
                element.setAttribute('data-time-end', endTime.toString());
                if ((startTime >= 0) && (ttmlContext.events.filter(function (event) { return event.time === startTime; }).length <= 0)) {
                    ttmlContext.events.push({ time: startTime, element: element });
                }
                var start = startTime;
                for (var _i = 0, _a = htmlExtensions_1.nodeListToArray(element.childNodes); _i < _a.length; _i++) {
                    var child = _a[_i];
                    if (child.nodeType === Node.ELEMENT_NODE) {
                        if (TtmlParser.getAttributeNS(element, 'timeContainer', ttmlContext.settings.ttmlNamespace) !== 'seq') {
                            this.applyTiming(ttmlContext, child, { start: startTime, end: endTime }, true, timeParser);
                        }
                        else {
                            this.applyTiming(ttmlContext, child, { start: start, end: endTime }, false, timeParser);
                            start = parseInt(child.getAttribute('data-time-end'), 10);
                        }
                    }
                }
            };
            TtmlParser.applyStyling = function (ttmlContext, head) {
                var styling = TtmlParser.getFirstElementByTagNameNS(head, 'styling', ttmlContext.settings.ttmlNamespace);
                var styles = styling ? htmlExtensions_1.htmlCollectionToArray(styling.getElementsByTagNameNS(ttmlContext.settings.ttmlNamespace, 'style')) : [];
                for (var _i = 0, _a = htmlExtensions_1.nodeListToArray(ttmlContext.root.querySelectorAll('*')); _i < _a.length; _i++) {
                    var element = _a[_i];
                    this.applyStyle(ttmlContext, element, styles);
                }
            };
            TtmlParser.applyStyle = function (ttmlContext, element, styles) {
                var styleSet = {};
                this.applyStylesheet(ttmlContext.settings, styleSet, element, styles);
                TtmlParser.applyInlineStyles(ttmlContext.settings, styleSet, element);
                var empty = true;
                for (var style in styleSet) {
                    if (styleSet.hasOwnProperty(style)) {
                        empty = false;
                        break;
                    }
                }
                if (!empty) {
                    element.setAttribute('data-styleSet', ttmlContext.styleSetCache.length.toString());
                    ttmlContext.styleSetCache.push(styleSet);
                }
            };
            TtmlParser.applyStylesheet = function (settings, styleSet, element, styles) {
                var styleAttribute = TtmlParser.getAttributeNS(element, 'style', settings.ttmlNamespace);
                var ids = styleAttribute ? styleAttribute.split(/\s+/) : [];
                for (var _i = 0, ids_1 = ids; _i < ids_1.length; _i++) {
                    var styleId = ids_1[_i];
                    for (var _a = 0, styles_1 = styles; _a < styles_1.length; _a++) {
                        var style = styles_1[_a];
                        if (TtmlParser.getAttributeNS(style, 'id', ttml_settings_1.xmlNS) === styleId) {
                            this.applyStylesheet(settings, styleSet, style, styles);
                            TtmlParser.applyInlineStyles(settings, styleSet, style);
                        }
                    }
                }
                if (TtmlParser.isTagNS(element, 'region', settings.ttmlNamespace)) {
                    for (var _b = 0, _c = htmlExtensions_1.htmlCollectionToArray(element.getElementsByTagNameNS(settings.ttmlNamespace, 'style')); _b < _c.length; _b++) {
                        var style = _c[_b];
                        TtmlParser.applyInlineStyles(settings, styleSet, style);
                    }
                }
            };
            TtmlParser.applyInlineStyles = function (settings, styleSet, element) {
                for (var _i = 0, _a = htmlExtensions_1.htmlCollectionToArray(element.attributes); _i < _a.length; _i++) {
                    var attribute = _a[_i];
                    if (attribute.namespaceURI === settings.ttmlStyleNamespace) {
                        styleSet[TtmlParser.getLocalTagName(attribute)] = stringExtensions_3.trim(attribute.nodeValue);
                    }
                }
            };
            TtmlParser.getLocalTagName = function (node) {
                return node.localName || node.baseName;
            };
            TtmlParser.isTagNS = function (element, tagName, namespace) {
                return ((element.namespaceURI === namespace) && this.getLocalTagName(element) === tagName);
            };
            TtmlParser.getAttributeNS = function (element, name, namespace) {
                var result = element.getAttributeNS(namespace, name);
                if (!result) {
                    for (var _i = 0, _a = htmlExtensions_1.htmlCollectionToArray(element.attributes); _i < _a.length; _i++) {
                        var attribute = _a[_i];
                        if ((attribute.localName === name) && (attribute.lookupNamespaceURI(attribute.prefix) === namespace)) {
                            result = attribute.value;
                            break;
                        }
                    }
                }
                return result;
            };
            TtmlParser.getFirstElementByTagNameNS = function (context, tagName, namespace) {
                if (context) {
                    var matches = context.getElementsByTagNameNS(namespace, tagName);
                    if (matches && matches.length) {
                        return matches[0];
                    }
                }
                return null;
            };
            TtmlParser.mediaStart = -1;
            TtmlParser.mediaEnd = 99999999;
            return TtmlParser;
        }());
        exports.TtmlParser = TtmlParser;
    });
    define("closed-captions/ttml-context", ["require", "exports", "closed-captions/ttml-parser", "closed-captions/ttml-settings", "mwf/utilities/htmlExtensions", "mwf/utilities/stringExtensions", "mwf/utilities/utility"], function (require, exports, ttml_parser_1, ttml_settings_2, htmlExtensions_2, stringExtensions_4, utility_2) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.TtmlContext = void 0;
        var TtmlContext = (function () {
            function TtmlContext() {
                var _this = this;
                this.translateToHtml = function (element, applicableStyleSet, preserveSpace) {
                    var translation;
                    var innerNode;
                    var name = _this.getTagNameEquivalent(element);
                    var htmlName = '';
                    var htmlClass = '';
                    switch (name) {
                        case 'ttml:region':
                            htmlClass = 'cue ';
                        case 'ttml:rootcontainerregion':
                        case 'ttml:body':
                        case 'ttml:div':
                            htmlName = 'div';
                            break;
                        case 'ttml:p':
                            htmlName = 'p';
                            break;
                        case 'ttml:span':
                            htmlName = 'span';
                            break;
                        case 'ttml:br':
                            htmlName = 'br';
                            break;
                    }
                    var role = ttml_parser_1.TtmlParser.getAttributeNS(element, 'role', _this.settings.ttmlMetaNamespace);
                    if (role) {
                        htmlClass += ' ' + (role);
                    }
                    var agent = ttml_parser_1.TtmlParser.getAttributeNS(element, 'agent', _this.settings.ttmlMetaNamespace);
                    if (agent) {
                        htmlClass += ' ' + (agent);
                    }
                    if (role === 'x-ruby') {
                        htmlName = ('ruby');
                    }
                    else if (role === 'x-rubybase') {
                        htmlName = ('rb');
                    }
                    else if (role === 'x-rubytext') {
                        htmlName = ('rt');
                    }
                    if (!stringExtensions_4.isNullOrWhiteSpace(htmlName)) {
                        translation = TtmlContext.defaultStyle(_this.ownerDocument.createElement(htmlName));
                        htmlExtensions_2.addClass(translation, stringExtensions_4.trim(htmlClass));
                        var title = ttml_parser_1.TtmlParser.getAttributeNS(element, 'title', _this.settings.ttmlMetaNamespace);
                        if (title) {
                            translation.setAttribute('title', title);
                        }
                        var id = ttml_parser_1.TtmlParser.getAttributeNS(element, 'id', ttml_settings_2.xmlNS);
                        if (id && _this.settings.idPrefix) {
                            translation.setAttribute('id', _this.settings.idPrefix + id);
                        }
                        if (name === 'ttml:region') {
                            innerNode = translation.appendChild(TtmlContext.defaultStyle(_this.ownerDocument.createElement('div')));
                            htmlExtensions_2.css(innerNode, 'display', 'table');
                            htmlExtensions_2.css(innerNode, 'border-spacing', '0');
                            htmlExtensions_2.css(innerNode, 'cell-spacing', '0');
                            htmlExtensions_2.css(innerNode, 'cell-padding', '0');
                            htmlExtensions_2.css(innerNode, 'width', '100%');
                            htmlExtensions_2.css(innerNode, 'height', '100%');
                            innerNode = innerNode.appendChild(TtmlContext.defaultStyle(_this.ownerDocument.createElement('div')));
                            htmlExtensions_2.css(innerNode, 'display', 'table-cell');
                            if (applicableStyleSet['displayAlign']) {
                                _this.translateStyle(name, innerNode, { 'displayAlign': applicableStyleSet['displayAlign'] });
                                applicableStyleSet['displayAlign'] = null;
                            }
                        }
                        if (preserveSpace && (name === 'ttml:span')) {
                            innerNode = translation.appendChild(TtmlContext.defaultStyle(_this.ownerDocument.createElement('span')));
                            htmlExtensions_2.css(innerNode, 'white-space', 'pre');
                        }
                        htmlExtensions_2.css(translation, 'position', 'static');
                        htmlExtensions_2.css(translation, 'width', '100%');
                        _this.translateStyle(name, translation, applicableStyleSet);
                    }
                    return { outerNode: translation, innerNode: innerNode ? innerNode : translation };
                };
            }
            TtmlContext.prototype.setOwnerDocument = function (ownerDocument) {
                this.ownerDocument = ownerDocument;
            };
            TtmlContext.prototype.updateRelatedMediaObjectRegion = function (dimensions) {
                if (!this.settings.relatedMediaObjectRegion ||
                    (dimensions.width !== this.settings.relatedMediaObjectRegion.width) ||
                    (dimensions.height !== this.settings.relatedMediaObjectRegion.height)) {
                    this.settings.relatedMediaObjectRegion = {
                        width: dimensions.width,
                        height: dimensions.height
                    };
                    return true;
                }
                return false;
            };
            TtmlContext.prototype.hasEvents = function () {
                return this.events && !!this.events.length;
            };
            TtmlContext.prototype.resetCurrentEvents = function () {
                this.currentEvents = [];
            };
            TtmlContext.prototype.updateCurrentEvents = function (time) {
                var timeEvents = this.getTemporallyActiveEvents(time);
                var currentEventsLength = this.currentEvents ? this.currentEvents.length : 0;
                var timeEventsLength = timeEvents ? timeEvents.length : 0;
                if (currentEventsLength !== timeEventsLength) {
                    this.currentEventsTime = time;
                    this.currentEvents = timeEvents;
                    return true;
                }
                if (this.currentEvents) {
                    for (var index = 0; index < currentEventsLength; index++) {
                        if (this.currentEvents[index].time !== timeEvents[index].time) {
                            this.currentEventsTime = time;
                            this.currentEvents = timeEvents;
                            return true;
                        }
                    }
                }
                return false;
            };
            TtmlContext.prototype.getTemporallyActiveEvents = function (time) {
                var _this = this;
                return this.events.filter(function (event) {
                    return event.element ? _this.isTemporallyActive(event.element, time) : true;
                });
            };
            TtmlContext.prototype.isTemporallyActive = function (element, time) {
                return (((parseInt(element.getAttribute('data-time-start'), 10) || 0) <= time) &&
                    (time < (parseInt(element.getAttribute('data-time-end'), 10) || 0)));
            };
            TtmlContext.prototype.getCues = function (time) {
                var cues = [];
                if (this.currentEventsTime !== time) {
                    this.updateCurrentEvents(time);
                }
                var preserveSpace = (ttml_parser_1.TtmlParser.getAttributeNS(this.root, 'space', ttml_settings_2.xmlNS) === 'preserve');
                var regions = (this.layout ? this.layout.getElementsByTagNameNS(this.settings.ttmlNamespace, 'region') : []);
                for (var _i = 0, regions_1 = regions; _i < regions_1.length; _i++) {
                    var region = regions_1[_i];
                    var regionId = ttml_parser_1.TtmlParser.getAttributeNS(region, 'id', ttml_settings_2.xmlNS);
                    var anonymousId = region.getAttribute('data-isanonymous');
                    if (anonymousId || regionId) {
                        var translation = this.translate(region, this.settings.defaultRegionStyle, preserveSpace, time, this.translateToHtml);
                        if (translation.outerNode) {
                            var innerNode = translation.innerNode;
                            var outerNode = translation.outerNode;
                            for (var _a = 0, _b = this.events; _a < _b.length; _a++) {
                                var event_1 = _b[_a];
                                if (event_1.element) {
                                    if (this.isInRegion(event_1.element, anonymousId ? null : regionId)) {
                                        var pruneResult = this.prune(event_1.element, translation.inheritableStyleSet, preserveSpace, time, this.translateToHtml);
                                        var cueBody = pruneResult.prunedElement;
                                        if ((!pruneResult.hasPreservedContent) && cueBody && (!stringExtensions_4.trim(htmlExtensions_2.getText(cueBody)).length)) {
                                            cueBody = null;
                                        }
                                        if (cueBody) {
                                            innerNode.appendChild(cueBody);
                                        }
                                    }
                                }
                            }
                            var showAlways = (outerNode.getAttribute('data-showBackground') === 'always');
                            if (showAlways || innerNode.children.length) {
                                if (showAlways) {
                                    outerNode.removeAttribute('data-showBackground');
                                }
                                cues.push(outerNode);
                            }
                        }
                    }
                }
                if (cues.length) {
                    var rcr = this.translate(this.rootContainerRegion, { overflow: 'hidden', padding: '0' }, false, time, this.translateToHtml);
                    for (var _c = 0, cues_1 = cues; _c < cues_1.length; _c++) {
                        var cue = cues_1[_c];
                        rcr.innerNode.appendChild(cue);
                    }
                    cues = [];
                    cues.push(rcr.outerNode);
                }
                return cues;
            };
            TtmlContext.prototype.translate = function (element, inheritedStyleSet, preserveSpace, time, translator) {
                var translation;
                var computedStyleSet;
                if (this.isTemporallyActive(element, time)) {
                    var tag = this.getTagNameEquivalent(element);
                    computedStyleSet = this.getComputedStyleSet(element, inheritedStyleSet, tag, time);
                    if (computedStyleSet['display'] !== 'none') {
                        var applicableStyleSet = this.getApplicableStyleSet(computedStyleSet, tag);
                        translation = translator(element, applicableStyleSet, preserveSpace);
                    }
                }
                if (!translation) {
                    return { outerNode: null, innerNode: null, inheritableStyleSet: null };
                }
                return {
                    outerNode: translation.outerNode,
                    innerNode: translation.innerNode,
                    inheritableStyleSet: this.getInheritableStyleSet(computedStyleSet)
                };
            };
            TtmlContext.prototype.translateStyle = function (tagName, element, applicableStyleSet) {
                for (var style in applicableStyleSet) {
                    if (applicableStyleSet[style]) {
                        this.applyStyle(element, tagName, style, applicableStyleSet[style]);
                    }
                }
            };
            TtmlContext.prototype.prune = function (element, inheritedStyleSet, preserveSpace, time, translator, ignoreAncestors) {
                if (ignoreAncestors === void 0) { ignoreAncestors = false; }
                var outerNode;
                var hasPreservedContent = false;
                var translation = this.translate(element, inheritedStyleSet, preserveSpace, time, translator);
                if (translation.outerNode !== null) {
                    var tag = this.getTagNameEquivalent(element);
                    outerNode = translation.outerNode;
                    var innerNode = translation.innerNode;
                    for (var _i = 0, _a = htmlExtensions_2.nodeListToArray(element.childNodes); _i < _a.length; _i++) {
                        var child = _a[_i];
                        if (child.nodeType === Node.COMMENT_NODE) ;
                        else if (child.nodeType === Node.TEXT_NODE) {
                            innerNode.appendChild(document.createTextNode(child.data));
                            if (preserveSpace && (tag === 'ttml:span')) {
                                hasPreservedContent = true;
                            }
                        }
                        else {
                            var childPreserveSpace = preserveSpace;
                            var spaceAttr = ttml_parser_1.TtmlParser.getAttributeNS(child, 'space', ttml_settings_2.xmlNS);
                            if (spaceAttr) {
                                childPreserveSpace = (spaceAttr === 'preserve');
                            }
                            var pruneRecord = this.prune(child, translation.inheritableStyleSet, childPreserveSpace, time, translator, true);
                            hasPreservedContent = hasPreservedContent || pruneRecord.hasPreservedContent;
                            if (pruneRecord.prunedElement) {
                                innerNode.appendChild(pruneRecord.prunedElement);
                            }
                        }
                    }
                    if (!ignoreAncestors) {
                        var ancestor = element.parentNode;
                        while ((ancestor !== null) && (ancestor.nodeType === Node.ELEMENT_NODE) && (ancestor !== this.body)) {
                            translation = this.translate(ancestor, inheritedStyleSet, preserveSpace, time, translator);
                            if (translation.outerNode) {
                                innerNode = translation.innerNode;
                                innerNode.appendChild(outerNode);
                                outerNode = translation.outerNode;
                            }
                            else {
                                break;
                            }
                            ancestor = ancestor.parentNode;
                        }
                    }
                }
                return { prunedElement: outerNode, hasPreservedContent: hasPreservedContent };
            };
            TtmlContext.prototype.getComputedStyleSet = function (element, inheritedStyleSet, tagName, time) {
                var computedStyleSet = utility_2.extend({}, inheritedStyleSet);
                utility_2.extend(computedStyleSet, this.styleSetCache[parseInt(element.getAttribute('data-styleSet'), 10)]);
                var sets = element.getElementsByTagNameNS(this.settings.ttmlNamespace, 'set');
                for (var _i = 0, _a = htmlExtensions_2.htmlCollectionToArray(sets); _i < _a.length; _i++) {
                    var set = _a[_i];
                    if (this.isTemporallyActive(set, time)) {
                        ttml_parser_1.TtmlParser.applyInlineStyles(this.settings, computedStyleSet, set);
                    }
                }
                if ((tagName === 'ttml:p') && (computedStyleSet['lineHeight'] === 'normal')) {
                    var fontSizes = this.appendSpanFontSizes(element, this.getInheritableStyleSet(computedStyleSet), time, '');
                    if (fontSizes) {
                        computedStyleSet['computed-lineHeight'] = fontSizes;
                    }
                }
                return computedStyleSet;
            };
            TtmlContext.prototype.getApplicableStyleSet = function (computedStyleSet, tagName) {
                var applicableStyleSet = {};
                if (computedStyleSet['extent'] && this.isStyleApplicable(tagName, 'extent')) {
                    applicableStyleSet['extent'] = computedStyleSet['extent'];
                }
                if (computedStyleSet['color'] && this.isStyleApplicable(tagName, 'color')) {
                    applicableStyleSet['color'] = computedStyleSet['color'];
                }
                for (var style in computedStyleSet) {
                    if (this.isStyleApplicable(tagName, style)) {
                        applicableStyleSet[style] = computedStyleSet[style];
                    }
                }
                return applicableStyleSet;
            };
            TtmlContext.prototype.isStyleApplicable = function (tagName, style) {
                switch (style) {
                    case 'backgroundColor':
                    case 'display':
                    case 'visibility':
                        return (('ttml:body ttml:div ttml:p ttml:region ttml:rootcontainerregion ttml:span ttml:br').indexOf(tagName) >= 0);
                    case 'fontFamily':
                    case 'fontSize':
                    case 'fontStyle':
                    case 'fontWeight':
                        return ('ttml:p ttml:span ttml:br'.indexOf(tagName) >= 0);
                    case 'color':
                    case 'textDecoration':
                    case 'textOutline':
                    case 'wrapOption':
                        return ('ttml:span ttml:br'.indexOf(tagName) >= 0);
                    case 'direction':
                    case 'unicodeBidi':
                        return ('ttml:p ttml:span ttml:br'.indexOf(tagName) >= 0);
                    case 'displayAlign':
                    case 'opacity':
                    case 'origin':
                    case 'overflow':
                    case 'padding':
                    case 'showBackground':
                    case 'writingMode':
                    case 'zIndex':
                        return ('ttml:region ttml:rootcontainerregion'.indexOf(tagName) >= 0);
                    case 'extent':
                        return ('ttml:tt ttml:region ttml:rootcontainerregion'.indexOf(tagName) >= 0);
                    case 'computed-lineHeight':
                    case 'lineHeight':
                    case 'textAlign':
                        return ('ttml:p'.indexOf(tagName) >= 0);
                    default: return false;
                }
            };
            TtmlContext.prototype.getInheritableStyleSet = function (computedStyleSet) {
                var inheritedStyleSet = {};
                for (var style in computedStyleSet) {
                    if (computedStyleSet.hasOwnProperty(style)) {
                        switch (style) {
                            case 'backgroundColor':
                            case 'computed-lineHeight':
                            case 'display':
                            case 'displayAlign':
                            case 'extent':
                            case 'opacity':
                            case 'origin':
                            case 'overflow':
                            case 'padding':
                            case 'showBackground':
                            case 'unicodeBidi':
                            case 'writingMode':
                            case 'zIndex':
                                break;
                            default:
                                inheritedStyleSet[style] = computedStyleSet[style];
                                break;
                        }
                    }
                }
                return inheritedStyleSet;
            };
            TtmlContext.prototype.appendSpanFontSizes = function (element, inheritedStyleSet, time, value) {
                for (var _i = 0, _a = htmlExtensions_2.nodeListToArray(element.childNodes); _i < _a.length; _i++) {
                    var child = _a[_i];
                    if ((child.nodeType === Node.ELEMENT_NODE)) {
                        var tag = this.getTagNameEquivalent(child);
                        if (tag === 'ttml:span') {
                            var computedStyleSet = this.getComputedStyleSet(child, inheritedStyleSet, 'ttml:span', time);
                            var fontSize = computedStyleSet['fontSize'];
                            if (fontSize) {
                                value += ((value) ? ',' : '') + fontSize;
                            }
                            value = this.appendSpanFontSizes(child, this.getInheritableStyleSet(computedStyleSet), time, value);
                        }
                    }
                }
                return value;
            };
            TtmlContext.prototype.isInRegion = function (element, regionId) {
                if (!regionId) {
                    return true;
                }
                var elemRegion = ttml_parser_1.TtmlParser.getAttributeNS(element, 'region', this.settings.ttmlNamespace);
                if (elemRegion === regionId) {
                    return true;
                }
                if (!elemRegion) {
                    var ancestor = element.parentNode;
                    while ((ancestor !== null) && (ancestor.nodeType === Node.ELEMENT_NODE)) {
                        var id = this.getRegionId(ancestor);
                        if (id) {
                            return id === regionId;
                        }
                        ancestor = ancestor.parentNode;
                    }
                    for (var _i = 0, _a = htmlExtensions_2.htmlCollectionToArray(element.getElementsByTagName('*')); _i < _a.length; _i++) {
                        var node = _a[_i];
                        if (this.getRegionId(node) === regionId) {
                            return true;
                        }
                    }
                }
                return false;
            };
            TtmlContext.prototype.getRegionId = function (element) {
                var regionId;
                if ((element.nodeType === Node.ELEMENT_NODE) && (element.namespaceURI === this.settings.ttmlNamespace)) {
                    if (ttml_parser_1.TtmlParser.getLocalTagName(element) === 'region') {
                        regionId = ttml_parser_1.TtmlParser.getAttributeNS(element, 'id', ttml_settings_2.xmlNS);
                    }
                    else {
                        regionId = ttml_parser_1.TtmlParser.getAttributeNS(element, 'region', this.settings.ttmlNamespace);
                    }
                }
                return regionId;
            };
            TtmlContext.prototype.getTagNameEquivalent = function (element) {
                var tagName = ttml_parser_1.TtmlParser.getLocalTagName(element);
                var nameSpace = element.namespaceURI;
                if (nameSpace === this.settings.ttmlNamespace) {
                    return 'ttml:' + tagName;
                }
                if (nameSpace === 'http://www.w3.org/1999/xhtml') {
                    return tagName;
                }
                return '';
            };
            TtmlContext.prototype.applyStyle = function (element, tagName, style, value) {
                var mappedValue = value;
                switch (style) {
                    case 'color':
                    case 'backgroundColor': {
                        mappedValue = TtmlContext.ttmlToCssColor(value);
                        htmlExtensions_2.css(element, style, mappedValue);
                        return;
                    }
                    case 'direction':
                    case 'display': {
                        htmlExtensions_2.css(element, style, mappedValue);
                        return;
                    }
                    case 'displayAlign': {
                        switch (value) {
                            case 'before':
                                mappedValue = 'top';
                                break;
                            case 'center':
                                mappedValue = 'middle';
                                break;
                            case 'after':
                                mappedValue = 'bottom';
                                break;
                        }
                        htmlExtensions_2.css(element, 'vertical-align', mappedValue);
                        return;
                    }
                    case 'extent': {
                        var width = void 0;
                        var height = void 0;
                        if (value !== 'auto') {
                            var coords = (value.split(/\s+/));
                            if (coords.length === 2) {
                                width = this.ttmlToCssUnits(coords[0], true);
                                height = this.ttmlToCssUnits(coords[1], false);
                            }
                        }
                        if (!width) {
                            width = (this.settings.rootContainerRegionDimensions
                                ? this.settings.rootContainerRegionDimensions.width
                                : this.settings.relatedMediaObjectRegion.width).toString() + 'px';
                            height = (this.settings.rootContainerRegionDimensions
                                ? this.settings.rootContainerRegionDimensions.height
                                : this.settings.relatedMediaObjectRegion.height).toString() + 'px';
                        }
                        htmlExtensions_2.css(element, 'position', 'absolute');
                        htmlExtensions_2.css(element, 'width', width);
                        htmlExtensions_2.css(element, 'min-width', width);
                        htmlExtensions_2.css(element, 'max-width', width);
                        htmlExtensions_2.css(element, 'height', height);
                        htmlExtensions_2.css(element, 'min-height', height);
                        htmlExtensions_2.css(element, 'max-height', height);
                        return;
                    }
                    case 'fontFamily': {
                        if (this.settings.fontMap && this.settings.fontMap[value]) {
                            mappedValue = this.settings.fontMap[value];
                        }
                        if (value === 'smallCaps') {
                            htmlExtensions_2.css(element, 'fontVariant', 'small-caps');
                        }
                        htmlExtensions_2.css(element, style, mappedValue);
                        return;
                    }
                    case 'fontSize': {
                        var parts = value.split(/\s+/);
                        var size = (parts.length > 1) ? parts[1] : parts[0];
                        mappedValue = this.ttmlToCssFontSize(size, false, 0.75, tagName === 'ttml:region');
                        htmlExtensions_2.css(element, style, mappedValue);
                        return;
                    }
                    case 'fontStyle':
                    case 'fontWeight': {
                        htmlExtensions_2.css(element, style, mappedValue);
                        return;
                    }
                    case 'lineHeight': {
                        var mappedValue_1 = (value === 'normal') ? value : this.ttmlToCssFontSize(value, false);
                        htmlExtensions_2.css(element, 'line-height', mappedValue_1);
                        return;
                    }
                    case 'computed-lineHeight': {
                        var values = value.split(',');
                        var max = -1;
                        for (var _i = 0, values_1 = values; _i < values_1.length; _i++) {
                            var fontSize = values_1[_i];
                            mappedValue = this.ttmlToCssFontSize(fontSize, false);
                            if (mappedValue && ((mappedValue.indexOf('px') !== -1) && (mappedValue.indexOf('px') === mappedValue.length - 2))) {
                                var height = parseFloat(mappedValue.substr(0, mappedValue.length - 2));
                                if (!isNaN(height) && (height > max)) {
                                    max = height;
                                }
                            }
                        }
                        if (max >= 0) {
                            htmlExtensions_2.css(element, 'line-height', max + 'px');
                        }
                        return;
                    }
                    case 'origin': {
                        if (value !== 'auto') {
                            var coords = (value.split(/\s+/));
                            if (coords.length === 2) {
                                htmlExtensions_2.css(element, 'position', 'absolute');
                                htmlExtensions_2.css(element, 'left', this.ttmlToCssUnits(coords[0], true));
                                htmlExtensions_2.css(element, 'top', this.ttmlToCssUnits(coords[1], false));
                            }
                        }
                        return;
                    }
                    case 'opacity': {
                        htmlExtensions_2.css(element, style, mappedValue);
                        return;
                    }
                    case 'padding': {
                        var contextRect = utility_2.getDimensions(element);
                        var parts = (value.split(/\s+/));
                        var first = void 0;
                        var second = void 0;
                        var third = void 0;
                        var forth = void 0;
                        switch (parts.length) {
                            case 1:
                                first = this.ttmlToCssUnits(parts[0], false, contextRect);
                                second = this.ttmlToCssUnits(parts[0], true, contextRect);
                                mappedValue = stringExtensions_4.format('{0} {1} {0} {1}', first, second);
                                break;
                            case 2:
                                first = this.ttmlToCssUnits(parts[0], false, contextRect);
                                second = this.ttmlToCssUnits(parts[1], true, contextRect);
                                mappedValue = stringExtensions_4.format('{0} {1} {0} {1}', first, second);
                                break;
                            case 3:
                                first = this.ttmlToCssUnits(parts[0], false, contextRect);
                                second = this.ttmlToCssUnits(parts[1], true, contextRect);
                                third = this.ttmlToCssUnits(parts[2], false, contextRect);
                                mappedValue = stringExtensions_4.format('{0} {1} {2} {1}', first, second, third);
                                break;
                            case 4:
                                first = this.ttmlToCssUnits(parts[0], false, contextRect);
                                second = this.ttmlToCssUnits(parts[1], true, contextRect);
                                third = this.ttmlToCssUnits(parts[2], false, contextRect);
                                forth = this.ttmlToCssUnits(parts[3], true, contextRect);
                                mappedValue = stringExtensions_4.format('{0} {1} {2} {3}', first, second, third, forth);
                                break;
                        }
                        htmlExtensions_2.css(element, 'box-sizing', 'border-box');
                        htmlExtensions_2.css(element, 'border-style', 'solid');
                        htmlExtensions_2.css(element, 'border-color', 'transparent');
                        htmlExtensions_2.css(element, 'border-width', mappedValue);
                        return;
                    }
                    case 'textAlign': {
                        switch (value) {
                            case 'start':
                                mappedValue = 'left';
                                break;
                            case 'end':
                                mappedValue = 'right';
                                break;
                        }
                        htmlExtensions_2.css(element, 'text-align', mappedValue);
                        return;
                    }
                    case 'textDecoration': {
                        mappedValue = TtmlContext.ttmlToCssTextDecoration(value);
                        htmlExtensions_2.css(element, 'text-decoration', mappedValue);
                        return;
                    }
                    case 'textOutline': {
                        var defaultColor = htmlExtensions_2.css(element, 'color');
                        htmlExtensions_2.css(element, 'text-shadow', this.ttmlToCssTextOutline(mappedValue, defaultColor));
                        return;
                    }
                    case 'unicodeBidi': {
                        switch (value) {
                            case 'bidiOverride':
                                mappedValue = 'bidi-override';
                                break;
                        }
                        htmlExtensions_2.css(element, 'unicode-bidi', mappedValue);
                        return;
                    }
                    case 'visibility': {
                        htmlExtensions_2.css(element, style, mappedValue);
                        return;
                    }
                    case 'writingMode': {
                        switch (value) {
                            case 'lr':
                            case 'lrtb': {
                                htmlExtensions_2.css(element, 'writing-mode', 'horizontal-tb');
                                htmlExtensions_2.css(element, '-webkit-writing-mode', 'horizontal-tb');
                                htmlExtensions_2.css(element, 'writing-mode', 'lr-tb');
                                return;
                            }
                            case 'rl':
                            case 'rltb': {
                                htmlExtensions_2.css(element, 'writing-mode', 'horizontal-tb');
                                htmlExtensions_2.css(element, '-webkit-writing-mode', 'horizontal-tb');
                                htmlExtensions_2.css(element, 'writing-mode', 'rl-tb');
                                return;
                            }
                            case 'tblr': {
                                htmlExtensions_2.css(element, 'text-orientation', 'upright');
                                htmlExtensions_2.css(element, 'writing-mode', 'vertical-lr');
                                htmlExtensions_2.css(element, '-webkit-text-orientation', 'upright');
                                htmlExtensions_2.css(element, '-webkit-writing-mode', 'vertical-lr');
                                htmlExtensions_2.css(element, 'writing-mode', 'tb-lr');
                                return;
                            }
                            case 'tb':
                            case 'tbrl': {
                                htmlExtensions_2.css(element, 'text-orientation', 'upright');
                                htmlExtensions_2.css(element, 'writing-mode', 'vertical-rl');
                                htmlExtensions_2.css(element, '-webkit-text-orientation', 'upright');
                                htmlExtensions_2.css(element, '-webkit-writing-mode', 'vertical-rl');
                                htmlExtensions_2.css(element, 'writing-mode', 'tb-rl');
                                return;
                            }
                        }
                        return;
                    }
                    case 'wrapOption': {
                        htmlExtensions_2.css(element, 'white-space', value === 'noWrap' ? 'nowrap' : (value === 'pre' ? 'pre' : 'normal'));
                        return;
                    }
                    case 'zIndex': {
                        htmlExtensions_2.css(element, style, mappedValue);
                        return;
                    }
                    default: {
                        htmlExtensions_2.css(element, style, mappedValue);
                        return;
                    }
                }
            };
            TtmlContext.defaultStyle = function (element) {
                htmlExtensions_2.css(element, 'background-color', TtmlContext.TtmlNamedColorMap['transparent']);
                htmlExtensions_2.css(element, 'offset', '0');
                htmlExtensions_2.css(element, 'margin', '0');
                htmlExtensions_2.css(element, 'padding', '0');
                htmlExtensions_2.css(element, 'border', '0');
                return element;
            };
            TtmlContext.prototype.ttmlToCssUnits = function (ttmlUnits, width, contextRect) {
                var cssUnits = ttmlUnits;
                if (ttmlUnits) {
                    var unit = ttmlUnits.charAt(ttmlUnits.length - 1);
                    if ((unit === 'c') || (unit === '%')) {
                        var container = this.settings.rootContainerRegionDimensions
                            ? this.settings.rootContainerRegionDimensions
                            : this.settings.relatedMediaObjectRegion;
                        var length_1 = parseFloat(ttmlUnits.substr(0, ttmlUnits.length - 1));
                        var containerSize = width ? container.width : container.height;
                        var value = void 0;
                        if (unit === 'c') {
                            var gridSize = width ? this.settings.cellResolution.columns : this.settings.cellResolution.rows;
                            value = length_1 * containerSize / gridSize;
                        }
                        else if (unit === '%') {
                            if (contextRect) {
                                containerSize = width ? contextRect.width : contextRect.height;
                            }
                            value = containerSize * length_1 / 100;
                        }
                        value = Math.round(value * 10) / 10;
                        cssUnits = value + 'px';
                    }
                }
                return cssUnits;
            };
            TtmlContext.prototype.ttmlToCssFontSize = function (ttmlUnits, width, scaleFactor, isRegion) {
                if (scaleFactor === void 0) { scaleFactor = 1; }
                if (isRegion === void 0) { isRegion = false; }
                var cssUnits = ttmlUnits;
                if (ttmlUnits) {
                    var unit = ttmlUnits.charAt(ttmlUnits.length - 1);
                    if ((unit === 'c') || (isRegion && (unit === '%'))) {
                        var container = this.settings.rootContainerRegionDimensions
                            ? this.settings.rootContainerRegionDimensions
                            : this.settings.relatedMediaObjectRegion;
                        var length_2 = parseFloat(ttmlUnits.substr(0, ttmlUnits.length - 1));
                        var containerSize = width ? container.width : container.height;
                        var gridSize = width ? this.settings.cellResolution.columns : this.settings.cellResolution.rows;
                        var value = length_2 * containerSize / gridSize;
                        if (unit === '%') {
                            value /= 100;
                        }
                        value = Math.floor(value * scaleFactor * 10) / 10;
                        cssUnits = value + 'px';
                    }
                }
                return cssUnits;
            };
            TtmlContext.prototype.ttmlToCssTextOutline = function (textOutline, defaultColor) {
                var textShadow = 'none';
                if (!stringExtensions_4.isNullOrWhiteSpace(textOutline) && (textOutline !== 'none')) {
                    var parts = textOutline.split(/\s+/);
                    var color = void 0;
                    var thickness = void 0;
                    var blur_1;
                    if (parts.length === 1) {
                        color = defaultColor;
                        thickness = parts[0];
                        blur_1 = '';
                    }
                    else if (parts.length === 3) {
                        color = parts[0];
                        thickness = parts[1];
                        blur_1 = parts[2];
                    }
                    else if (parts.length === 2) {
                        var firstChar = parts[0].charAt(0);
                        if ((firstChar >= '0') && (firstChar <= '9')) {
                            color = defaultColor;
                            thickness = parts[0];
                            blur_1 = parts[1];
                        }
                        else {
                            color = parts[0];
                            thickness = parts[1];
                            blur_1 = '';
                        }
                    }
                    blur_1 = this.ttmlToCssFontSize(blur_1, false, 0.75);
                    thickness = this.ttmlToCssFontSize(thickness, false, 0.75);
                    parts = TtmlContext.lengthRegEx.exec(thickness);
                    if (parts && (parts.length === 3)) {
                        var width = Math.round(parseFloat(parts[1]));
                        var units = parts[2];
                        textShadow = '';
                        for (var x = -width; x <= width; x++) {
                            for (var y = -width; y <= width; y++) {
                                if ((x !== 0) || (y !== 0)) {
                                    textShadow += stringExtensions_4.format('{0}{4} {1}{4} {2} {3}, ', x, y, blur_1, TtmlContext.ttmlToCssColor(color), units);
                                }
                            }
                        }
                        if (textShadow) {
                            textShadow = textShadow.substr(0, textShadow.length - 2);
                        }
                    }
                }
                return textShadow;
            };
            TtmlContext.ttmlToCssTextDecoration = function (ttmlTextDecoration) {
                var textDecoration = '';
                var parts = ttmlTextDecoration.split(/\s+/);
                for (var _i = 0, parts_1 = parts; _i < parts_1.length; _i++) {
                    var value = parts_1[_i];
                    switch (value) {
                        case 'none':
                        case 'noUnderline':
                        case 'noLineThrough':
                        case 'noOverline':
                            textDecoration = 'none';
                            break;
                    }
                }
                for (var _a = 0, parts_2 = parts; _a < parts_2.length; _a++) {
                    var value = parts_2[_a];
                    switch (value) {
                        case 'none':
                        case 'noUnderline':
                        case 'noLineThrough':
                        case 'noOverline':
                            break;
                        case 'lineThrough':
                            textDecoration += ' line-through';
                            break;
                        default:
                            textDecoration += ' ' + value;
                            break;
                    }
                }
                return stringExtensions_4.trim(textDecoration);
            };
            TtmlContext.ttmlToCssColor = function (color) {
                var mappedColor = color;
                color = color.toLowerCase();
                if (color.indexOf('rgba') === 0) {
                    var parts = TtmlContext.rgbaRegEx.exec(color);
                    if (parts && (parts.length === 5)) {
                        var red = parts[1];
                        var green = parts[2];
                        var blue = parts[3];
                        var alpha = parseInt(parts[4], 10);
                        mappedColor = stringExtensions_4.format('rgba({0},{1},{2},{3})', red, green, blue, Math.round(alpha * 100 / 255) / 100);
                    }
                }
                else if ((color.charAt(0) === '#') && (color.length === 9)) {
                    var red = parseInt(color.substr(1, 2), 16);
                    var green = parseInt(color.substr(3, 2), 16);
                    var blue = parseInt(color.substr(5, 2), 16);
                    var alpha = parseInt(color.substr(7, 2), 16);
                    mappedColor = stringExtensions_4.format('rgba({0},{1},{2},{3})', red, green, blue, Math.round(alpha * 100 / 255) / 100);
                }
                else if (TtmlContext.TtmlNamedColorMap[color]) {
                    mappedColor = TtmlContext.TtmlNamedColorMap[color];
                }
                return mappedColor;
            };
            TtmlContext.lengthRegEx = /\s*(\d+\.*\d*)(.*)\s*/;
            TtmlContext.rgbaRegEx = /\s*rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)\s*/;
            TtmlContext.TtmlNamedColorMap = {
                transparent: 'rgba(0,0,0,0)',
                black: 'rgba(0,0,0,1)',
                silver: 'rgba(192,192,192,1)',
                gray: 'rgba(128,128,128,1)',
                white: 'rgba(255,255,255,1)',
                maroon: 'rgba(128,0,0,1)',
                red: 'rgba(255,0,0,1)',
                purple: 'rgba(128,0,128,1)',
                fuchsia: 'rgba(255,0,255,1)',
                magenta: 'rgba(255,0,255,1)',
                green: 'rgba(0,128,0,1)',
                lime: 'rgba(0,255,0,1)',
                olive: 'rgba(128,128,0,1)',
                yellow: 'rgba(255,255,0,1)',
                navy: 'rgba(0,0,128,1)',
                blue: 'rgba(0,0,255,1)',
                teal: 'rgba(0,128,128,1)',
                aqua: 'rgba(0,255,255,1)',
                cyan: 'rgba(0,255,255,1)'
            };
            return TtmlContext;
        }());
        exports.TtmlContext = TtmlContext;
    });
    define("data/player-data-interfaces", ["require", "exports"], function (require, exports) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.VideoErrorCodes = exports.DownloadableMediaTypes = exports.MediaQuality = exports.ClosedCaptionTypes = exports.MediaTypes = void 0;
        (function (MediaTypes) {
            MediaTypes[MediaTypes["MP4"] = 'MP4'] = "MP4";
            MediaTypes[MediaTypes["DASH"] = 'DASH'] = "DASH";
            MediaTypes[MediaTypes["SMOOTH"] = 'SMOOTH'] = "SMOOTH";
            MediaTypes[MediaTypes["HLS"] = 'HLS'] = "HLS";
        })(exports.MediaTypes || (exports.MediaTypes = {}));
        (function (ClosedCaptionTypes) {
            ClosedCaptionTypes[ClosedCaptionTypes["VTT"] = 'VTT'] = "VTT";
            ClosedCaptionTypes[ClosedCaptionTypes["TTML"] = 'TTML'] = "TTML";
        })(exports.ClosedCaptionTypes || (exports.ClosedCaptionTypes = {}));
        (function (MediaQuality) {
            MediaQuality[MediaQuality["HD"] = 'HD'] = "HD";
            MediaQuality[MediaQuality["HQ"] = 'HQ'] = "HQ";
            MediaQuality[MediaQuality["SD"] = 'SD'] = "SD";
            MediaQuality[MediaQuality["LO"] = 'LO'] = "LO";
        })(exports.MediaQuality || (exports.MediaQuality = {}));
        (function (DownloadableMediaTypes) {
            DownloadableMediaTypes[DownloadableMediaTypes["transcript"] = 'transcript'] = "transcript";
            DownloadableMediaTypes[DownloadableMediaTypes["audio"] = 'audio'] = "audio";
            DownloadableMediaTypes[DownloadableMediaTypes["video"] = 'video'] = "video";
            DownloadableMediaTypes[DownloadableMediaTypes["videoWithCC"] = 'videoWithCC'] = "videoWithCC";
        })(exports.DownloadableMediaTypes || (exports.DownloadableMediaTypes = {}));
        (function (VideoErrorCodes) {
            VideoErrorCodes[VideoErrorCodes["BufferingFirstByteTimeout"] = 2000] = "BufferingFirstByteTimeout";
            VideoErrorCodes[VideoErrorCodes["MediaErrorAborted"] = 2100] = "MediaErrorAborted";
            VideoErrorCodes[VideoErrorCodes["MediaErrorNetwork"] = 2101] = "MediaErrorNetwork";
            VideoErrorCodes[VideoErrorCodes["MediaErrorDecode"] = 2102] = "MediaErrorDecode";
            VideoErrorCodes[VideoErrorCodes["MediaErrorSourceNotSupported"] = 2103] = "MediaErrorSourceNotSupported";
            VideoErrorCodes[VideoErrorCodes["MediaErrorUnknown"] = 2104] = "MediaErrorUnknown";
            VideoErrorCodes[VideoErrorCodes["MediaSelectionNoMedia"] = 2200] = "MediaSelectionNoMedia";
            VideoErrorCodes[VideoErrorCodes["AmpEncryptError"] = 2405] = "AmpEncryptError";
            VideoErrorCodes[VideoErrorCodes["AmpPlayerMismatch"] = 2406] = "AmpPlayerMismatch";
        })(exports.VideoErrorCodes || (exports.VideoErrorCodes = {}));
    });
    define("utilities/environment", ["require", "exports"], function (require, exports) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.Environment = void 0;
        var Environment = (function () {
            function Environment() {
            }
            Environment.isOfficeCLView = function () {
                var isInIframe = (parent !== window);
                var pageUrl = isInIframe ? document.referrer : window.location.href;
                return (pageUrl.match(/client/i) && pageUrl.match(/support.office./i)) ? true : false;
            };
            Environment.isVideoPlayerSupported = function () {
                return (Environment.isHTML5videoSupported() && Environment.isES5Supported());
            };
            Environment.isHTML5videoSupported = function () {
                try {
                    return (!!document.createElement('video').canPlayType);
                }
                catch (exception) {
                }
                return false;
            };
            Environment.isES5Supported = function () {
                try {
                    var es5String = !!(String.prototype && String.prototype.trim);
                    var es5Function = !!(Function.prototype && Function.prototype.bind);
                    var es5Object = !!(Object.keys &&
                        Object.create &&
                        Object.getPrototypeOf &&
                        Object.getOwnPropertyNames &&
                        Object.isSealed &&
                        Object.isFrozen &&
                        Object.isExtensible &&
                        Object.getOwnPropertyDescriptor &&
                        Object.defineProperty &&
                        Object.defineProperties &&
                        Object.seal &&
                        Object.freeze &&
                        Object.preventExtensions);
                    if (es5String && es5Function && es5Object) {
                        return true;
                    }
                    else {
                        return false;
                    }
                }
                catch (exception) {
                }
                return false;
            };
            Environment.userAgent = navigator.userAgent;
            Environment.platform = navigator.platform;
            Environment.maxTouchPoints = navigator.maxTouchPoints;
            Environment.isWindowsPhone = !!Environment.userAgent.match(/Windows Phone/i);
            Environment.isSilk = !!Environment.userAgent.match(/Silk/i);
            Environment.hasSilkVersion = (/\bSilk\/(\d+)\.(\d+)/).test(Environment.userAgent);
            Environment.silkMajor = Environment.hasSilkVersion ? Number(RegExp.$1) : 0;
            Environment.silkMinor = Environment.hasSilkVersion ? Number(RegExp.$2) : 0;
            Environment.isSilkModern = Environment.silkMajor > 3 || (Environment.silkMajor >= 3 && Environment.silkMinor >= 5);
            Environment.isAndroid = !Environment.isWindowsPhone && (Environment.isSilk ||
                !!Environment.userAgent.match(/Android/i));
            Environment.androidVersion = (/Android (\d+\.\d+)/i.test(Environment.userAgent)) ? Number(RegExp.$1) :
                (Environment.hasSilkVersion ? (Environment.isSilkModern ? 4 : 1) : 0);
            Environment.isIPhone = !!Environment.userAgent.match(/iPhone/i) || !!Environment.userAgent.match(/iPod/i);
            Environment.isIPad = !!Environment.userAgent.match(/iPad/i) || !!(Environment.platform === 'MacIntel' && Environment.maxTouchPoints > 1);
            Environment.isIProduct = Environment.isIPad || Environment.isIPhone;
            Environment.isBlackBerry = !!Environment.userAgent.match(/BlackBerry/i);
            Environment.isHtcWindowsPhone = Environment.isWindowsPhone && !!Environment.userAgent.match(/HTC/i);
            Environment.windowsVersion = /Windows NT(\s)*(\d+\.\d+)/.test(Environment.userAgent) ? parseFloat(RegExp.$2) : -1;
            Environment.ieVersion = (/MSIE (\d+\.\d+)/.test(Environment.userAgent)) ? Number(RegExp.$1) :
                ((/Trident.*rv:(\d+\.\d+)/.test(Environment.userAgent)) ? Number(RegExp.$1) : 0);
            Environment.isIEMobileModern = (/\bIEMobile\/(\d+\.\d+)/).test(Environment.userAgent) ?
                (Number(RegExp.$1) >= 10) : ((/Windows Phone (\d+\.\d+)/i).test(Environment.userAgent) ? (Number(RegExp.$1) >= 10) : false);
            Environment.isAndroidModern = Environment.isAndroid && (Environment.androidVersion >= 4 ||
                Environment.isSilkModern);
            Environment.isMobile = Environment.isIProduct || Environment.isAndroid || Environment.isBlackBerry ||
                Environment.isWindowsPhone;
            Environment.useNativeControls = Environment.isIProduct;
            Environment.isWebkit = !!Environment.userAgent.match(/Webkit/i);
            Environment.isFirefox = !!Environment.userAgent.match(/Firefox/i);
            Environment.isChrome = !!Environment.userAgent.match(/Chrome/i) && navigator.vendor
                && (navigator.vendor.indexOf('Google') > -1);
            Environment.isEdgeBrowser = Environment.userAgent.indexOf('Edge') > -1;
            Environment.isTV = !!Environment.userAgent.match(/.*SMART\-TV.*Safari\/(535\.20\+|537\.42)/);
            Environment.isWindowsRT = (/^.*?\bWindows\b.*?\bARM\b.*?$/m).test(Environment.userAgent);
            Environment.isInIframe = (parent !== window);
            Environment.isSafari = navigator.vendor && navigator.vendor.indexOf('Apple') > -1 &&
                navigator.userAgent && !navigator.userAgent.match('CriOS');
            return Environment;
        }());
        exports.Environment = Environment;
    });
    define("utilities/player-utility", ["require", "exports", "mwf/utilities/stringExtensions", "data/player-data-interfaces", "mwf/utilities/utility", "utilities/environment"], function (require, exports, stringExtensions_5, player_data_interfaces_1, utility_3, environment_1) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.PlayerUtility = void 0;
        var PlayerUtility = (function () {
            function PlayerUtility() {
            }
            PlayerUtility.random4CharString = function () {
                return (1 + Math.random()).toString(32).substring(1);
            };
            PlayerUtility.loadScript = function (url) {
                var existingElement = document.getElementsByTagName('script')[0];
                var newScript = document.createElement('script');
                newScript.src = url;
                newScript.async = true;
                newScript.onload = newScript.onreadystatechange = function () {
                    if (!newScript.readyState
                        || newScript.readyState === 'loaded'
                        || newScript.readyState === 'complete') {
                        newScript.onload = newScript.onreadystatechange = null;
                        if (newScript.parentNode) {
                            newScript.parentNode.removeChild(newScript);
                        }
                    }
                };
                existingElement.parentNode.insertBefore(newScript, existingElement);
            };
            PlayerUtility.formatContentErrorMessage = function (code, baseMsg, additionalMsg) {
                var msg = stringExtensions_5.format('[CE{0}]: {1}', player_data_interfaces_1.VideoErrorCodes[code], baseMsg);
                if (additionalMsg) {
                    msg += stringExtensions_5.format('; (Additional: {0})', additionalMsg);
                }
                return msg;
            };
            PlayerUtility.logConsoleMessage = function (message, origin) {
                if (origin === void 0) { origin = 'VideoPlayer'; }
                var msg = stringExtensions_5.format('[{0}][{1}] {2}', PlayerUtility.toLogTime(new Date()), origin, message);
                if ((typeof console === 'object') && console.log) {
                    console.log(msg);
                }
                if (environment_1.Environment.isOfficeCLView()) {
                    PlayerUtility.logPanelMessage(msg, origin);
                }
            };
            PlayerUtility.toLogTime = function (date) {
                if (!date) {
                    date = new Date();
                }
                var h = date.getHours();
                var m = date.getMinutes();
                var s = date.getSeconds();
                h = (h < 10) ? '0' + h : h;
                m = (m < 10) ? '0' + m : m;
                s = (s < 10) ? '0' + s : s;
                return h + ':' + m + ':' + s;
            };
            PlayerUtility.toFriendlyBitrateString = function (bitrate) {
                var label;
                if (bitrate >= 10000000) {
                    var mbps = bitrate / 1000000;
                    label = Math.round(mbps).toLocaleString() + " Mbps";
                }
                else if (bitrate >= 1000000) {
                    var mbps = bitrate / 1000000;
                    label = (Math.round(mbps * 100) * 0.01).toLocaleString() + " Mbps";
                }
                else if (bitrate >= 10000) {
                    var kbps = bitrate / 1000;
                    label = Math.round(kbps).toLocaleString() + " Kbps";
                }
                else if (bitrate >= 1000) {
                    var kbps = bitrate / 1000;
                    label = (Math.round(kbps * 100) * 0.01).toLocaleString() + " Kbps";
                }
                else {
                    label = Math.round(bitrate).toLocaleString() + " bps";
                }
                return label;
            };
            PlayerUtility.logPanelMessage = function (msg, origin) {
                if (typeof (PlayerUtility.debugPanel) === 'undefined') {
                    PlayerUtility.debugPanel = PlayerUtility.createDebugPanel();
                }
                PlayerUtility.debugPanel.appendChild(document.createTextNode('[' + new Date().toLocaleString() + ']' + msg));
                PlayerUtility.debugPanel.appendChild(document.createElement('BR'));
                PlayerUtility.debugPanel.scrollTop = PlayerUtility.debugPanel.scrollHeight - PlayerUtility.debugPanel.clientHeight;
            };
            PlayerUtility.createDebugPanel = function () {
                var debugPanel = document.createElement('div');
                debugPanel.className = 'debugPanel';
                document.body.appendChild(debugPanel);
                return debugPanel;
            };
            PlayerUtility.getGUID = function () {
                var d = new Date().getTime();
                var guid = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'.replace(/x/g, function (c) {
                    var r = Math.floor((d + Math.random() * 16) % 16);
                    var v = (c === 'x' ? r : (r % 4 + 4));
                    return v.toString(16);
                });
                return guid;
            };
            PlayerUtility.removeFromPendingAjaxRequests = function (obj) {
                var index = -1;
                for (var i = 0; i < PlayerUtility.pendingAjaxRequests.length; i++) {
                    if (obj === PlayerUtility.pendingAjaxRequests[i]) {
                        index = i;
                        break;
                    }
                }
                if (index >= 0) {
                    PlayerUtility.pendingAjaxRequests.splice(index, 1);
                }
            };
            PlayerUtility.ajax = function (url, done, failed) {
                if (!url) {
                    return;
                }
                var ajaxRequest = null;
                if (window.XDomainRequest) {
                    ajaxRequest = new XDomainRequest();
                    ajaxRequest.onload = function () {
                        done && done(ajaxRequest.responseText);
                        PlayerUtility.removeFromPendingAjaxRequests(ajaxRequest);
                    };
                    PlayerUtility.pendingAjaxRequests.push(ajaxRequest);
                }
                else if (window.XMLHttpRequest) {
                    ajaxRequest = new XMLHttpRequest();
                    ajaxRequest.onreadystatechange = function () {
                        if (ajaxRequest.readyState === 4) {
                            var result = null;
                            if (ajaxRequest.status === 200) {
                                result = ajaxRequest.responseText;
                            }
                            done && done(result);
                        }
                    };
                }
                if (ajaxRequest) {
                    ajaxRequest.ontimeout = ajaxRequest.onerror = function () {
                        PlayerUtility.removeFromPendingAjaxRequests(ajaxRequest);
                        failed && failed();
                    };
                    ajaxRequest.open('GET', url, true);
                    ajaxRequest.send();
                }
            };
            PlayerUtility.createVideoPerfMarker = function (playerId, marker) {
                if (playerId && marker) {
                    utility_3.createPerfMarker(playerId + "_" + marker, true);
                }
                if (marker === 'ttvs') {
                    utility_3.createPerfMarker(marker, true);
                }
            };
            PlayerUtility.getVideoPerfMarker = function (playerId, marker) {
                return playerId && marker ? utility_3.getPerfMarkerValue(playerId + "_" + marker) : 0;
            };
            PlayerUtility.pendingAjaxRequests = [];
            return PlayerUtility;
        }());
        exports.PlayerUtility = PlayerUtility;
    });
    define("closed-captions/video-closed-captions", ["require", "exports", "closed-captions/ttml-parser", "mwf/utilities/htmlExtensions", "mwf/utilities/utility", "utilities/player-utility"], function (require, exports, ttml_parser_2, htmlExtensions_3, utility_4, player_utility_1) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.VideoClosedCaptions = void 0;
        var VideoClosedCaptions = (function () {
            function VideoClosedCaptions(element, errorCallback) {
                this.element = element;
                this.errorCallback = errorCallback;
                this.lastPlayPosition = 0;
                this.ccLanguageId = null;
                this.resetCaptions();
            }
            VideoClosedCaptions.prototype.setCcLanguage = function (ccLanguageId, href) {
                if (!this.element || (ccLanguageId === this.ccLanguageId)) {
                    return;
                }
                this.ttmlContext = null;
                this.resetCaptions();
                if (!href) {
                    this.ccLanguageId = null;
                    return;
                }
                this.ccLanguageId = ccLanguageId;
                this.loadClosedCaptions(href);
            };
            VideoClosedCaptions.prototype.getCurrentCcLanguage = function () {
                return this.ccLanguageId;
            };
            VideoClosedCaptions.prototype.loadClosedCaptions = function (href) {
                var _this = this;
                player_utility_1.PlayerUtility.ajax(href, function (result) { return _this.onClosedCaptionsLoaded(result); }, function (error) {
                    if (_this.errorCallback) {
                        _this.errorCallback({
                            errorType: 'oneplayer.error.loadClosedCaptions.ajax',
                            errorDesc: 'Ajax call failed: ' + href
                        });
                    }
                });
            };
            VideoClosedCaptions.prototype.onClosedCaptionsLoaded = function (ttmlDocument) {
                if (!ttmlDocument) {
                    if (this.errorCallback) {
                        this.errorCallback({
                            errorType: 'oneplayer.error.onClosedCaptionsLoaded.ttmlDoc',
                            errorDesc: 'No ttmlDocument found'
                        });
                    }
                    return;
                }
                this.element.setAttribute(VideoClosedCaptions.ariaHidden, 'false');
                var id = this.element.id ? (this.element.id + '-') : '';
                var settingsOverrides = {
                    idPrefix: id,
                    fontMap: { 'default': 'Segoe ui, Arial' },
                    relatedMediaObjectRegion: utility_4.getDimensions(this.element)
                };
                try {
                    this.ttmlContext = ttml_parser_2.TtmlParser.parse(ttmlDocument, settingsOverrides);
                    if (this.ttmlContext) {
                        this.ttmlContext.setOwnerDocument(this.element.ownerDocument);
                        if (this.ttmlContext.hasEvents()) {
                            this.updateCaptions(this.lastPlayPosition);
                        }
                        else {
                            this.element.setAttribute(VideoClosedCaptions.ariaHidden, 'true');
                        }
                    }
                }
                catch (e) {
                    if (this.errorCallback) {
                        this.errorCallback({
                            errorType: 'oneplayer.error.onClosedCaptionsLoaded.ttmlParser',
                            errorDesc: 'TtmlDocument parser error: ' + e.message
                        });
                    }
                }
            };
            VideoClosedCaptions.prototype.showSampleCaptions = function () {
                var mockCaptions = new DOMParser().parseFromString("<?xml version='1.0' encoding='utf-8'?>\n<tt xml:lang='en-us' xmlns='http://www.w3.org/ns/ttml' xmlns:tts='http://www.w3.org/ns/ttml#styling' \nxmlns:ttm='http://www.w3.org/ns/ttml#metadata'>\n    <head>\n    <metadata>\n        <ttm:title>Media.wvx.aib</ttm:title>\n        <ttm:copyright>Copyright (c) 2013 Microsoft Corporation.  All rights reserved.</ttm:copyright>\n    </metadata>\n    <styling>\n        <style xml:id='Style1' tts:fontFamily='proportionalSansSerif' tts:fontSize='0.8c' tts:textAlign='center' \n        tts:color='white' />\n    </styling>\n    <layout>\n        <region style='Style1' xml:id='CaptionArea' tts:origin='0c 12.6c' tts:extent='32c 2.4c' \n        tts:backgroundColor='rgba(0,0,0,160)' tts:displayAlign='center' tts:padding='0.3c 0.5c' />\n    </layout>\n    </head>\n    <body region='CaptionArea'>\n    <div>\n        <p begin='00:00:01.140' end='99:99:99.999'>EXAMPLE CAPTIONS!</p>\n    </div>\n    </body>\n</tt>", 'text/xml');
                this.onClosedCaptionsLoaded(mockCaptions);
                var dimensions = utility_4.getDimensions(this.element);
                this.ttmlContext.updateRelatedMediaObjectRegion(dimensions);
                this.element.style.bottom = '44px';
            };
            VideoClosedCaptions.prototype.updateCaptions = function (playPosition) {
                this.lastPlayPosition = playPosition;
                if (this.ttmlContext && this.ttmlContext.hasEvents()) {
                    var tick = Math.floor(playPosition * 1000);
                    this.element.setAttribute(VideoClosedCaptions.ariaHidden, 'false');
                    var dimensions = utility_4.getDimensions(this.element);
                    if (this.ttmlContext.updateRelatedMediaObjectRegion(dimensions)) {
                        this.resetCaptions();
                    }
                    if (this.ttmlContext.updateCurrentEvents(tick)) {
                        this.element.setAttribute(VideoClosedCaptions.ariaHidden, 'true');
                        htmlExtensions_3.removeInnerHtml(this.element);
                        for (var _i = 0, _a = this.ttmlContext.getCues(tick); _i < _a.length; _i++) {
                            var cue = _a[_i];
                            this.applyUserPreferencesOverrides(cue);
                            htmlExtensions_3.css(cue, 'background-color', '');
                            this.element.appendChild(cue);
                        }
                        this.element.setAttribute(VideoClosedCaptions.ariaHidden, 'false');
                    }
                }
            };
            VideoClosedCaptions.prototype.resetCaptions = function () {
                if (this.ttmlContext) {
                    this.ttmlContext.resetCurrentEvents();
                }
                if (this.element) {
                    this.element.setAttribute(VideoClosedCaptions.ariaHidden, 'true');
                    htmlExtensions_3.removeInnerHtml(this.element);
                }
            };
            VideoClosedCaptions.prototype.getCcLanguage = function () {
                return this.ccLanguageId;
            };
            VideoClosedCaptions.prototype.applyUserPreferencesOverrides = function (cue) {
                if (!VideoClosedCaptions.userPreferences) {
                    return;
                }
                if (VideoClosedCaptions.userPreferences.text) {
                    for (var _i = 0, _a = htmlExtensions_3.selectElements('span, br', cue); _i < _a.length; _i++) {
                        var element = _a[_i];
                        for (var property in VideoClosedCaptions.userPreferences.text) {
                            if (VideoClosedCaptions.userPreferences.text.hasOwnProperty(property)) {
                                htmlExtensions_3.css(element, property, VideoClosedCaptions.userPreferences.text[property]);
                            }
                        }
                    }
                }
                if (VideoClosedCaptions.userPreferences.window) {
                    var winElement = htmlExtensions_3.selectFirstElement('p', cue);
                    if (winElement) {
                        for (var property in VideoClosedCaptions.userPreferences.window) {
                            if (VideoClosedCaptions.userPreferences.window.hasOwnProperty(property)) {
                                htmlExtensions_3.css(winElement, property, VideoClosedCaptions.userPreferences.window[property]);
                            }
                        }
                    }
                }
            };
            VideoClosedCaptions.ariaHidden = 'aria-hidden';
            VideoClosedCaptions.userPreferences = {
                text: {},
                window: {}
            };
            return VideoClosedCaptions;
        }());
        exports.VideoClosedCaptions = VideoClosedCaptions;
    });
    define("closed-captions/video-closed-captions-settings", ["require", "exports", "closed-captions/video-closed-captions", "mwf/utilities/stringExtensions", "mwf/utilities/utility"], function (require, exports, video_closed_captions_1, stringExtensions_6, utility_5) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.VideoClosedCaptionsSettings = exports.closedCaptionsSettinsDefaults = exports.closedCaptionsPresetMap = exports.closedCaptionsSettingsMap = exports.closedCaptionsSettingsOptions = void 0;
        exports.closedCaptionsSettingsOptions = {
            'font': {
                'pre': 'cc_font_name_',
                'map': {
                    'casual': 'Verdana;font-variant:normal',
                    'cursive': 'Zapf-Chancery,Segoe script,Cursive;font-variant:normal',
                    'monospacedsansserif': 'Lucida sans typewriter,Lucida console,Consolas;font-variant:normal',
                    'monospacedserif': 'Courier;font-variant:normal',
                    'proportionalsansserif': 'Arial,Sans-serif;font-variant:normal',
                    'proportionalserif': 'Times New Roman,Serif;font-variant:normal',
                    'smallcapitals': 'Arial,Helvetica,Sans-serif;font-variant:small-caps'
                }
            },
            'percent': {
                'pre': 'cc_percent_',
                'map': {
                    '0': '0',
                    '50': '0.5',
                    '75': '0.75',
                    '100': '1'
                }
            },
            'text_size': {
                'pre': 'cc_text_size_',
                'map': {
                    'small': '75%',
                    'default': '100%',
                    'large': '125%',
                    'extralarge': '150%',
                    'maximum': '200%'
                }
            },
            'color': {
                'pre': 'cc_color_',
                'map': {
                    'white': '#FFFFFF',
                    'black': '#000000',
                    'blue': '#0000FF',
                    'cyan': '#00FFFF',
                    'green': '#00FF00',
                    'grey': '#BCBCBC',
                    'magenta': '#FF00FF',
                    'red': '#FF0000',
                    'yellow': '#FFFF00'
                }
            },
            'text_edge_style': {
                'pre': 'cc_text_edge_style_',
                'map': {
                    'none': 'none',
                    'depressed': '1px 1px 0 #FFF,-1px -1px 0 #000',
                    'dropshadow': '1px 1px 0 #000',
                    'raised': '1px 1px 0 #000,-1px -1px 0x #FFF',
                    'uniform': '1px 1px 0 #000,-1px 1px 0 #000,1px -1px 0 #000,-1px -1px 0 #000'
                }
            }
        };
        exports.closedCaptionsSettingsMap = {
            'text_font': { 'value': 'font-family:', 'option': 'font' },
            'text_color': { 'value': 'color:', 'option': 'color' },
            'text_size': { 'value': 'font-size:', 'option': 'text_size' },
            'text_edge_style': { 'value': 'text-shadow:', 'option': 'text_edge_style' },
            'text_opacity': { 'value': 'color:', 'option': 'percent' },
            'text_background_color': { 'value': 'background:', 'option': 'color' },
            'text_background_opacity': { 'value': 'background:', 'option': 'percent' },
            'window_color': { 'value': 'background:', 'option': 'color' },
            'window_opacity': { 'value': 'background:', 'option': 'percent' }
        };
        exports.closedCaptionsPresetMap = {
            'preset1': {
                'text_font': 'proportionalsansserif',
                'text_color': 'white',
                'text_opacity': '100',
                'text_background_color': 'black',
                'text_background_opacity': '100'
            },
            'preset2': {
                'text_font': 'monospacedserif',
                'text_color': 'white',
                'text_opacity': '100',
                'text_background_color': 'black',
                'text_background_opacity': '100'
            },
            'preset3': {
                'text_font': 'proportionalsansserif',
                'text_color': 'yellow',
                'text_opacity': '100',
                'text_background_color': 'black',
                'text_background_opacity': '100'
            },
            'preset4': {
                'text_font': 'proportionalsansserif',
                'text_color': 'blue',
                'text_opacity': '100',
                'text_background_color': 'grey',
                'text_background_opacity': '100'
            },
            'preset5': {
                'text_font': 'casual',
                'text_color': 'white',
                'text_opacity': '100',
                'text_background_color': 'black',
                'text_background_opacity': '100'
            }
        };
        exports.closedCaptionsSettinsDefaults = {
            'preset': 'preset1',
            'text_font': 'proportionalsansserif',
            'text_color': 'white',
            'text_opacity': '100',
            'text_size': 'default',
            'text_edge_style': 'none',
            'text_background_color': 'black',
            'text_background_opacity': '100',
            'window_color': 'black',
            'window_opacity': '0'
        };
        var VideoClosedCaptionsSettings = (function () {
            function VideoClosedCaptionsSettings(onErrorCallback) {
                this.onErrorCallback = onErrorCallback;
                VideoClosedCaptionsSettings.tempSettings = {};
                VideoClosedCaptionsSettings.tempSettings[VideoClosedCaptionsSettings.presetKey] = 'none';
                this.loadUserPreferences();
                this.applySettings();
            }
            VideoClosedCaptionsSettings.prototype.saveUserPreferences = function () {
                utility_5.saveToLocalStorage(VideoClosedCaptionsSettings.storageKeyName, JSON.stringify(VideoClosedCaptionsSettings.userPreferences));
            };
            VideoClosedCaptionsSettings.prototype.loadUserPreferences = function () {
                var userPrefs = utility_5.getValueFromLocalStorage(VideoClosedCaptionsSettings.storageKeyName);
                if (userPrefs) {
                    try {
                        var prefs = JSON.parse(userPrefs);
                        for (var setting in prefs) {
                            if (prefs.hasOwnProperty(setting)) {
                                this.setPreferences(setting, prefs[setting]);
                            }
                        }
                    }
                    catch (e) {
                        if (this.onErrorCallback) {
                            this.onErrorCallback({
                                errorType: 'oneplayer.error.VideoClosedCaptionsSettings.loadUserPreferences',
                                errorDesc: 'UserPrefs parsing error: ' + e.message
                            });
                        }
                    }
                }
            };
            VideoClosedCaptionsSettings.prototype.reset = function (updatePreferences) {
                if (typeof (updatePreferences) === 'undefined' || updatePreferences == null ||
                    updatePreferences) {
                    VideoClosedCaptionsSettings.userPreferences = {};
                    VideoClosedCaptionsSettings.currentSettings = {};
                    this.saveUserPreferences();
                }
                VideoClosedCaptionsSettings.tempSettings = {};
                VideoClosedCaptionsSettings.tempSettings[VideoClosedCaptionsSettings.presetKey] = 'none';
                this.applySettings();
            };
            VideoClosedCaptionsSettings.prototype.setSetting = function (settingKey, optionKey, updatePreferences) {
                if (!settingKey || !optionKey) {
                    return;
                }
                if (typeof (updatePreferences) === 'undefined' || updatePreferences == null ||
                    updatePreferences) {
                    this.setPreferences(settingKey, optionKey);
                    this.saveUserPreferences();
                    VideoClosedCaptionsSettings.tempSettings = {};
                    VideoClosedCaptionsSettings.tempSettings[VideoClosedCaptionsSettings.presetKey] = 'none';
                }
                else {
                    var presetValue = exports.closedCaptionsPresetMap[optionKey];
                    if (presetValue) {
                        VideoClosedCaptionsSettings.tempSettings[settingKey] = optionKey;
                        utility_5.extend(VideoClosedCaptionsSettings.tempSettings, presetValue);
                    }
                }
                this.applySettings();
            };
            VideoClosedCaptionsSettings.prototype.getCurrentSettings = function (settings) {
                if (settings === void 0) { settings = VideoClosedCaptionsSettings.currentSettings; }
                return utility_5.extend({}, exports.closedCaptionsSettinsDefaults, settings);
            };
            VideoClosedCaptionsSettings.prototype.setPreferences = function (settingKey, optionKey) {
                if (!settingKey || !optionKey) {
                    return;
                }
                if (settingKey === VideoClosedCaptionsSettings.presetKey) {
                    var presetValue = exports.closedCaptionsPresetMap[optionKey];
                    if (presetValue) {
                        VideoClosedCaptionsSettings.userPreferences = {};
                        VideoClosedCaptionsSettings.currentSettings = {};
                        VideoClosedCaptionsSettings.userPreferences[settingKey] = optionKey;
                        VideoClosedCaptionsSettings.currentSettings[settingKey] = optionKey;
                        utility_5.extend(VideoClosedCaptionsSettings.currentSettings, presetValue);
                    }
                }
                else {
                    if (this.getOptionValue(settingKey, optionKey)) {
                        VideoClosedCaptionsSettings.userPreferences = utility_5.extend({}, VideoClosedCaptionsSettings.currentSettings);
                        delete VideoClosedCaptionsSettings.userPreferences[VideoClosedCaptionsSettings.presetKey];
                        VideoClosedCaptionsSettings.currentSettings[VideoClosedCaptionsSettings.presetKey] = 'none';
                        VideoClosedCaptionsSettings.userPreferences[settingKey] = optionKey;
                        VideoClosedCaptionsSettings.currentSettings[settingKey] = optionKey;
                    }
                }
            };
            VideoClosedCaptionsSettings.prototype.applySettings = function () {
                var prefs = {};
                var currentSelection = VideoClosedCaptionsSettings.tempSettings[VideoClosedCaptionsSettings.presetKey] === 'none' ?
                    this.getCurrentSettings()
                    : this.getCurrentSettings(VideoClosedCaptionsSettings.tempSettings);
                for (var settingKey in currentSelection) {
                    if (currentSelection.hasOwnProperty(settingKey)) {
                        var optionValue = this.getOptionValue(settingKey, currentSelection[settingKey]);
                        if (optionValue) {
                            prefs[settingKey] = exports.closedCaptionsSettingsMap[settingKey].value + optionValue;
                        }
                    }
                }
                video_closed_captions_1.VideoClosedCaptions.userPreferences.text = this.getPrefsCss(prefs, 'text');
                video_closed_captions_1.VideoClosedCaptions.userPreferences.window = this.getPrefsCss(prefs, 'window');
            };
            VideoClosedCaptionsSettings.prototype.getOptionValue = function (settingKey, optionKey) {
                var setting = exports.closedCaptionsSettingsMap[settingKey];
                if (setting) {
                    var option = exports.closedCaptionsSettingsOptions[setting.option];
                    return option && option.map[optionKey];
                }
            };
            VideoClosedCaptionsSettings.prototype.getPrefsCss = function (prefs, prefix) {
                var prefsCss = {};
                for (var pref in prefs) {
                    if (prefs.hasOwnProperty(pref)) {
                        var propVal = prefs[pref];
                        if (pref.indexOf(prefix) === 0 && pref.indexOf('opacity') < 0) {
                            if (propVal && (propVal.length > 0)) {
                                var styles = propVal.split(';');
                                for (var _i = 0, styles_2 = styles; _i < styles_2.length; _i++) {
                                    var style = styles_2[_i];
                                    var pVal = style.split(':');
                                    if (pVal.length > 1) {
                                        prefsCss[pVal[0].trim()] = pVal[1].trim();
                                    }
                                }
                            }
                        }
                    }
                }
                for (var pref in prefs) {
                    if (prefs.hasOwnProperty(pref)) {
                        var propVal = prefs[pref];
                        if (pref.indexOf(prefix) === 0 && pref.indexOf('opacity') > 0) {
                            var pVal = propVal.split(':');
                            if (pVal.length > 1) {
                                var colorValue = prefsCss[pVal[0].trim()];
                                var opacityValue = pVal[1].trim();
                                prefsCss[pVal[0].trim()] = this.formatAsRgba(colorValue, opacityValue);
                            }
                        }
                    }
                }
                return prefsCss;
            };
            VideoClosedCaptionsSettings.prototype.formatAsRgba = function (cssColor, opacity) {
                var result = stringExtensions_6.format('rgba(0,0,0,{0})', opacity);
                var colorStart = cssColor ? cssColor.indexOf('#') : -1;
                if (colorStart >= 0) {
                    var fullColorString = cssColor.substr(colorStart + 1);
                    var colorLenght = (fullColorString.length) / 3;
                    if (colorLenght > 0) {
                        var red = parseInt(fullColorString.substr(0, colorLenght), 16);
                        var green = parseInt(fullColorString.substr(colorLenght, colorLenght), 16);
                        var blue = parseInt(fullColorString.substr(colorLenght * 2, colorLenght), 16);
                        result = stringExtensions_6.format('rgba({0},{1},{2},{3})', red, green, blue, opacity);
                    }
                }
                return result;
            };
            VideoClosedCaptionsSettings.userPreferences = {};
            VideoClosedCaptionsSettings.currentSettings = {};
            VideoClosedCaptionsSettings.tempSettings = {};
            VideoClosedCaptionsSettings.storageKeyName = 'mwf-video-player-cc-settings';
            VideoClosedCaptionsSettings.presetKey = 'preset';
            return VideoClosedCaptionsSettings;
        }());
        exports.VideoClosedCaptionsSettings = VideoClosedCaptionsSettings;
    });
    define("constants/attributes", ["require", "exports"], function (require, exports) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.AriaHiddenTrue = exports.MWFJsControlledBy = exports.RemoveHidden = exports.AddHidden = void 0;
        exports.AddHidden = {
            name: "hidden",
            value: "true"
        };
        exports.RemoveHidden = {
            name: "hidden",
            value: "false"
        };
        exports.MWFJsControlledBy = {
            name: "data-js-controlledby",
            value: "m365-dialog"
        };
        exports.AriaHiddenTrue = {
            name: "aria-hidden",
            value: "true"
        };
    });
    define("constants/class-names", ["require", "exports"], function (require, exports) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.VideoClassNames = void 0;
        exports.VideoClassNames = {
            VIDEO_PLAYER_CTN: 'ow-m365-video-player-ctn',
            VIDEO_DIALOG: 'ow-m365-video-dialog',
            VIDEO_DIALOG_MWF: 'c-dialog'
        };
    });
    define("constants/dom-selectors", ["require", "exports"], function (require, exports) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.DialogTabbableSelectors = exports.VideoSelectors = exports.VideoDialogSelectors = void 0;
        exports.VideoDialogSelectors = {
            DIALOG: '.ow-m365-video-dialog',
            DIALOG_BUTTON: '.ow-video-dialog-button'
        };
        exports.VideoSelectors = {
            VIDEO_CTN: '.ow-m365-video',
            VIDEO_CTN_RT: '.ow-generic-video',
            VIDEO_PLAYER_CTN: '.ow-m365-video-player-ctn',
            VIDEO_PLAYER_CTN_RT: '.ow-native-video-container'
        };
        exports.DialogTabbableSelectors = 'select, input, textarea, button, a, .c-glyph[data-js-dialog-hide]';
    });
    define("constants/enums", ["require", "exports"], function (require, exports) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.Attributes = exports.VideoPlayerIdPrefix = exports.VideoType = exports.videoCheckpoint = exports.awaActionTypes = exports.awaBehaviorTypes = void 0;
        (function (awaBehaviorTypes) {
            awaBehaviorTypes[awaBehaviorTypes["VIDEOSTART"] = 240] = "VIDEOSTART";
            awaBehaviorTypes[awaBehaviorTypes["VIDEOPAUSE"] = 241] = "VIDEOPAUSE";
            awaBehaviorTypes[awaBehaviorTypes["VIDEOCONTINUE"] = 242] = "VIDEOCONTINUE";
            awaBehaviorTypes[awaBehaviorTypes["VIDEOCHECKPOINT"] = 243] = "VIDEOCHECKPOINT";
            awaBehaviorTypes[awaBehaviorTypes["VIDEOJUMP"] = 244] = "VIDEOJUMP";
            awaBehaviorTypes[awaBehaviorTypes["VIDEOCOMPLETE"] = 245] = "VIDEOCOMPLETE";
            awaBehaviorTypes[awaBehaviorTypes["VIDEOBUFFERING"] = 246] = "VIDEOBUFFERING";
            awaBehaviorTypes[awaBehaviorTypes["VIDEOERROR"] = 247] = "VIDEOERROR";
            awaBehaviorTypes[awaBehaviorTypes["VIDEOMUTE"] = 248] = "VIDEOMUTE";
            awaBehaviorTypes[awaBehaviorTypes["VIDEOUNMUTE"] = 249] = "VIDEOUNMUTE";
            awaBehaviorTypes[awaBehaviorTypes["VIDEOFULLSCREEN"] = 250] = "VIDEOFULLSCREEN";
            awaBehaviorTypes[awaBehaviorTypes["VIDEOUNFULLSCREEN"] = 251] = "VIDEOUNFULLSCREEN";
            awaBehaviorTypes[awaBehaviorTypes["VIDEOREPLAY"] = 252] = "VIDEOREPLAY";
            awaBehaviorTypes[awaBehaviorTypes["VIDEOPLAYERLOAD"] = 253] = "VIDEOPLAYERLOAD";
            awaBehaviorTypes[awaBehaviorTypes["VIDEOPLAYERCLICK"] = 254] = "VIDEOPLAYERCLICK";
            awaBehaviorTypes[awaBehaviorTypes["VIDEOVOLUMECONTROL"] = 255] = "VIDEOVOLUMECONTROL";
            awaBehaviorTypes[awaBehaviorTypes["VIDEOAUDIOTRACKCONTROL"] = 256] = "VIDEOAUDIOTRACKCONTROL";
            awaBehaviorTypes[awaBehaviorTypes["VIDEOCLOSEDCAPTIONCONTROL"] = 257] = "VIDEOCLOSEDCAPTIONCONTROL";
            awaBehaviorTypes[awaBehaviorTypes["VIDEOCLOSEDCAPTIONSTYLE"] = 258] = "VIDEOCLOSEDCAPTIONSTYLE";
            awaBehaviorTypes[awaBehaviorTypes["VIDEORESOLUTIONCONTROL"] = 259] = "VIDEORESOLUTIONCONTROL";
        })(exports.awaBehaviorTypes || (exports.awaBehaviorTypes = {}));
        (function (awaActionTypes) {
            awaActionTypes["CLICKLEFT"] = "CL";
            awaActionTypes["CLICKRIGHT"] = "CR";
            awaActionTypes["CLICKMIDDLE"] = "CM";
            awaActionTypes["SCROLL"] = "S";
            awaActionTypes["ZOOM"] = "Z";
            awaActionTypes["RESIZE"] = "R";
            awaActionTypes["KEYBOARDENTER"] = "KE";
            awaActionTypes["KEYBOARDSPACE"] = "KS";
            awaActionTypes["GAMEPADA"] = "CGA";
            awaActionTypes["GAMEPADMENU"] = "CGM";
            awaActionTypes["OTHER"] = "O";
        })(exports.awaActionTypes || (exports.awaActionTypes = {}));
        (function (videoCheckpoint) {
            videoCheckpoint[videoCheckpoint["PERCENTAGE"] = 10] = "PERCENTAGE";
            videoCheckpoint[videoCheckpoint["TIME"] = 1] = "TIME";
        })(exports.videoCheckpoint || (exports.videoCheckpoint = {}));
        (function (VideoType) {
            VideoType["INLINE"] = "inline";
            VideoType["DIALOG"] = "dialog";
        })(exports.VideoType || (exports.VideoType = {}));
        (function (VideoPlayerIdPrefix) {
            VideoPlayerIdPrefix["INLINE"] = "m365-video-inline-";
            VideoPlayerIdPrefix["DIALOG"] = "m365-video-dialog-";
        })(exports.VideoPlayerIdPrefix || (exports.VideoPlayerIdPrefix = {}));
        (function (Attributes) {
            Attributes["ARIA_HIDDEN"] = "aria-hidden";
            Attributes["TABINDEX"] = "tabindex";
        })(exports.Attributes || (exports.Attributes = {}));
    });
    define("constants/events", ["require", "exports"], function (require, exports) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.Events = void 0;
        exports.Events = {
            DOM_CONTENT_LOADED: 'DOMContentLoaded'
        };
    });
    define("constants/player-constants", ["require", "exports"], function (require, exports) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.videoAdsPerfMarkers = exports.videoPerfMarkers = exports.shareTypes = exports.PlaybackStatus = exports.PlayerEvents = exports.MediaEvents = void 0;
        exports.MediaEvents = ['abort',
            'canplay',
            'canplaythrough',
            'emptied',
            'ended',
            'error',
            'loadeddata',
            'loadedmetadata',
            'loadstart',
            'pause',
            'play',
            'playing',
            'progress',
            'ratechange',
            'readystatechange',
            'seeked',
            'seeking',
            'stalled',
            'suspend',
            'timeupdate',
            'volumechange',
            'waiting'];
        exports.PlayerEvents = {
            CommonPlayerImpression: 'CommonPlayerImpression',
            PlaybackStatusChanged: 'PlaybackStatusChanged',
            Replay: 'Replay',
            BufferComplete: 'BufferComplete',
            ContentStart: 'ContentStart',
            ContentError: 'ContentError',
            ContentContinue: 'ContentContinue',
            ContentComplete: 'ContentComplete',
            ContentCheckpoint: 'ContentCheckpoint',
            ContentLoaded3PP: 'ContentLoaded3PP',
            Ready: 'Ready',
            Play: 'Play',
            Pause: 'Pause',
            Resume: 'Resume',
            Seek: 'Seek',
            VideoQualityChanged: 'VideoQualityChanged',
            Mute: 'Mute',
            Unmute: 'Unmute',
            Volume: 'Volume',
            InfoPaneOpened: 'InfoPaneOpened',
            VideoTimedout: 'VideoTimedout',
            VideoTimeUpdate: 'VideoTimeUpdate',
            FullScreenEnter: 'FullScreenEnter',
            FullScreenExit: 'FullScreenExit',
            UserInteracted: 'VideoUserInteracted',
            InteractiveOverlayClick: 'InteractiveOverlayClick',
            InteractiveBackButtonClick: 'InteractiveBackButtonClick',
            InteractiveOverlayShow: 'InteractiveOverlayShow',
            InteractiveOverlayHide: 'InteractiveOverlayHide',
            InteractiveOverlayMaximize: 'InteractiveOverlayMaximize',
            InteractiveOverlayMinimize: 'InteractiveOverlayMaximize',
            InviewEnter: 'InviewEnter',
            InviewExit: 'InviewExit',
            TimeRemainingCheckpoint: 'TimeRemainingCheckpoint',
            PlayerError: 'PlayerError',
            VideoShared: 'VideoShared',
            ClosedCaptionsChanged: 'ClosedCaptionsChanged',
            ClosedCaptionSettingsChanged: 'ClosedCaptionSettingsChanged',
            PlaybackRateChanged: 'PlaybackRateChanged',
            MediaDownloaded: 'MediaDownloaded',
            AudioTrackChanged: 'AudioTrackChanged',
            AgeGateSubmitClick: 'AgeGateSubmitClick',
            SourceErrorAttemptRecovery: 'SourceErrorAttemptRecovery',
        };
        exports.PlaybackStatus = {
            Ready: 'Ready',
            Loading: 'Loading',
            Loaded: 'Loaded',
            LoadFailed: 'LoadFailed',
            PlaybackCompleted: 'PlaybackCompleted',
            Playbackerrored: 'PlaybackErrored',
            VideoOpening: 'VideoOpening',
            VideoPlaying: 'VideoPlaying',
            VideoBuffering: 'VideoBuffering',
            VideoPaused: 'VideoPaused',
            VideoPlayCompleted: 'VideoPlayCompleted',
            VideoPlayFailed: 'VideoPlayFailed',
            VideoClosed: 'VideoClosed'
        };
        exports.shareTypes = {
            facebook: 'facebook',
            twitter: 'twitter',
            linkedin: 'linkedin',
            skype: 'skype',
            mail: 'mail',
            copy: 'copy'
        };
        exports.videoPerfMarkers = {
            scriptLoaded: 'scriptLoaded',
            playerInit: 'playerInit',
            metadataFetchStart: 'metadataFetchStart',
            metadataFetchEnd: 'metadataFetchEnd',
            playerLoadStart: 'playerLoadStart',
            playerReady: 'playerReady',
            wrapperLoadStart: 'wrapperLoadStart',
            wrapperReady: 'wrapperReady',
            locLoadStart: 'locLoadStart',
            locReady: 'locReady',
            playTriggered: 'playTriggered',
            ttvs: 'ttvs'
        };
        exports.videoAdsPerfMarkers = {
            adsScriptLoaded: 'adsScriptLoaded',
            adsPlayerInit: 'adsPlayerInit',
            adsFetchStart: 'adsFetchStart',
            adsPlayerLoadStart: 'adsPlayerLoadStart',
            adsPlayerReady: 'adsPlayerReady',
            adsPlayTriggered: 'adsPlayTriggered'
        };
    });
    define("mwf/utilities/keycodes", ["require", "exports"], function (require, exports) {
        Object.defineProperty(exports, "__esModule", { value: true });
    });
    define("video-player/player-factory", ["require", "exports", "players/core-player"], function (require, exports, core_player_1) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.PlayerFactory = void 0;
        var PlayerFactory = (function () {
            function PlayerFactory() {
            }
            PlayerFactory.createPlayer = function (playerName, container, playerData) {
                var videoPlayer;
                var createdPlayerName;
                if (!!playerName) {
                    switch (playerName.toLowerCase()) {
                        case 'youtube':
                            createdPlayerName = 'youtube';
                            videoPlayer = null;
                            break;
                        default:
                            createdPlayerName = 'coreplayer';
                            videoPlayer = new core_player_1.CorePlayer(container, playerData);
                            break;
                    }
                }
                else {
                    createdPlayerName = 'coreplayer';
                    videoPlayer = new core_player_1.CorePlayer(container, playerData);
                }
                return { playerInstance: videoPlayer, playerName: createdPlayerName };
            };
            return PlayerFactory;
        }());
        exports.PlayerFactory = PlayerFactory;
    });
    define("data/player-config", ["require", "exports", "data/player-data-interfaces"], function (require, exports, player_data_interfaces_2) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.PlayerConfig = void 0;
        var PlayerConfig = (function () {
            function PlayerConfig() {
            }
            PlayerConfig.resourcesUrl = '{0}/{1}/videoplayer/resources/{2}';
            PlayerConfig.resourceHost = '%playerResourceHost%';
            PlayerConfig.resourceHash = '%playerResourceHash%';
            PlayerConfig.defaultResourceHost = 'https://www.microsoft.com';
            PlayerConfig.ampUrl = '//amp.azure.net/libs/amp/1.8.0/azuremediaplayer.min.js';
            PlayerConfig.ampVersion2Url = '//amp.azure.net/libs/amp/2.1.9/azuremediaplayer.min.js';
            PlayerConfig.hasPlayerUrl = 'url("hash:coreui.statics/externalscripts/hasplayer/hasplayer.min.js")';
            PlayerConfig.hlsPlayerUrl = 'url("hash:coreui.statics/externalscripts/hlsplayer/hls.min.js")';
            PlayerConfig.shimServiceProdUrl = '//prod-video-cms-rt-microsoft-com.akamaized.net/vhs/api/videos/{0}';
            PlayerConfig.shimServiceIntUrl = '//cms-eastus-int-videoshim-rt.cloudapp.net/vhs/api/videos/{0}';
            PlayerConfig.adSdkUrl = '//msadsdk.blob.core.windows.net/core/1/latest.min.js';
            PlayerConfig.eventCheckpointInterval = 20000;
            PlayerConfig.firstByteTimeoutVideoMobile = 15000;
            PlayerConfig.firstByteTimeoutVideoDesktop = 10000;
            PlayerConfig.defaultVolume = .8;
            PlayerConfig.checkpoints = [25, 50, 75, 95];
            PlayerConfig.playbackRates = [2, 1.5, 1.25, 1, 0.75, 0.5];
            PlayerConfig.defaultPlaybackRate = 1;
            PlayerConfig.defaultQualityMobile = player_data_interfaces_2.MediaQuality.SD;
            PlayerConfig.defaultQualityTV = player_data_interfaces_2.MediaQuality.SD;
            PlayerConfig.defaultQualityDesktop = player_data_interfaces_2.MediaQuality.HQ;
            PlayerConfig.defaultAspectRatio = 16 / 9;
            PlayerConfig.defaultInViewWidthFraction = 0.5;
            PlayerConfig.defaultInViewHeightFraction = 0.5;
            return PlayerConfig;
        }());
        exports.PlayerConfig = PlayerConfig;
    });
    define("data/player-options", ["require", "exports", "mwf/utilities/utility", "utilities/environment", "constants/player-constants", "data/player-config"], function (require, exports, utility_6, environment_2, player_constants_1, player_config_1) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.PlayerOptions = void 0;
        var PlayerOptions = (function () {
            function PlayerOptions(options) {
                this.autoload = true;
                this.autoplay = false;
                this.startTime = 0;
                this.mute = false;
                this.loop = false;
                this.controls = true;
                this.lazyLoad = true;
                this.trigger = true;
                this.theme = 'light';
                this.playButtonTheme = 'dark';
                this.playButtonSize = 'medium';
                this.maskLevel = '40';
                this.useHLS = true;
                this.useAdaptive = true;
                this.debug = false;
                this.reporting = {
                    enabled: true,
                    jsll: true,
                    aria: false,
                    wedcs: false
                };
                this.playbackSpeed = true;
                this.interactivity = true;
                this.share = true;
                this.shareOptions = [player_constants_1.shareTypes.facebook, player_constants_1.shareTypes.twitter, player_constants_1.shareTypes.linkedin, player_constants_1.shareTypes.skype,
                    player_constants_1.shareTypes.mail, player_constants_1.shareTypes.copy];
                this.download = false;
                this.playFullScreen = false;
                this.hidePosterFrame = false;
                this.shimServiceEnv = 'prod';
                this.corePlayer = 'html5';
                this.autoCaptions = null;
                this.flexSize = false;
                this.aspectRatio = player_config_1.PlayerConfig.defaultAspectRatio;
                this.ageGate = true;
                this.jsllPostMessage = true;
                this.userMinimumAge = 0;
                this.playPauseTrigger = false;
                this.showEndImage = false;
                this.showImageForVideoError = false;
                this.inviewPlay = false;
                this.inviewThreshold = null;
                this.timeRemainingCheckpoint = null;
                this.adsEnabled = false;
                this.inViewWidthFraction = player_config_1.PlayerConfig.defaultInViewWidthFraction;
                this.inViewHeightFraction = player_config_1.PlayerConfig.defaultInViewHeightFraction;
                this.controlPanelTimeout = null;
                this.showControlOnLoad = true;
                this.useAMPVersion2 = false;
                utility_6.extend(this, options);
                if (environment_2.Environment.isMobile) {
                    this.autoplay = false;
                }
                else {
                    if (options && options.autoPlay !== undefined) {
                        this.autoplay = (!!options && !!options.autoPlay);
                    }
                }
                if (options && options.autoLoad !== undefined) {
                    this.autoload = (!!options && !!options.autoLoad);
                }
                if (this.autoplay) {
                    this.playFullScreen = false;
                    if (!this.mute && environment_2.Environment.isSafari) {
                        this.mute = true;
                    }
                }
                if (environment_2.Environment.isIPhone) {
                    this.trigger = true;
                }
                if (environment_2.Environment.isOfficeCLView() || environment_2.Environment.isIProduct) {
                    this.useAdaptive = false;
                }
                if (options && options.shareOptions) {
                    this.shareOptions = options.shareOptions;
                }
                if (!this.aspectRatio || !utility_6.isNumber(this.aspectRatio) || this.aspectRatio <= 0) {
                    this.aspectRatio = player_config_1.PlayerConfig.defaultAspectRatio;
                }
                if (!this.inViewWidthFraction || !utility_6.isNumber(this.inViewWidthFraction) || this.inViewWidthFraction > 1) {
                    this.inViewWidthFraction = player_config_1.PlayerConfig.defaultInViewWidthFraction;
                }
                if (!this.inViewHeightFraction || !utility_6.isNumber(this.inViewHeightFraction) || this.inViewHeightFraction > 1) {
                    this.inViewHeightFraction = player_config_1.PlayerConfig.defaultInViewHeightFraction;
                }
            }
            return PlayerOptions;
        }());
        exports.PlayerOptions = PlayerOptions;
    });
    define("data/video-shim-data-fetcher", ["require", "exports", "data/player-data-interfaces", "utilities/player-utility", "data/player-config", "mwf/utilities/stringExtensions"], function (require, exports, player_data_interfaces_3, player_utility_2, player_config_2, stringExtensions_7) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.VideoShimDataFetcher = void 0;
        var VideoShimDataFetcher = (function () {
            function VideoShimDataFetcher(serviceEnv, serviceUrl) {
                this.serviceEnv = serviceEnv;
                this.serviceUrl = serviceUrl;
            }
            VideoShimDataFetcher.prototype.getMetadata = function (videoId, onCompleteCallback, onFailedCallback) {
                var _this = this;
                var requestUrl = this.getServiceUrl(videoId);
                player_utility_2.PlayerUtility.ajax(requestUrl, function (result) {
                    if (result && result.length) {
                        var shimData = null;
                        try {
                            shimData = JSON.parse(result);
                        }
                        catch (e) {
                            onFailedCallback && onFailedCallback();
                            return;
                        }
                        var metadata = _this.mapToVideoMetadata(videoId, shimData);
                        onCompleteCallback && onCompleteCallback(metadata);
                    }
                    else {
                        onFailedCallback && onFailedCallback();
                    }
                }, function () {
                    onFailedCallback && onFailedCallback();
                });
            };
            VideoShimDataFetcher.prototype.getServiceUrl = function (videoId) {
                if (!this.serviceUrl) {
                    this.serviceUrl = this.serviceEnv === 'prod' ? player_config_2.PlayerConfig.shimServiceProdUrl : player_config_2.PlayerConfig.shimServiceIntUrl;
                }
                return stringExtensions_7.format(this.serviceUrl, videoId);
            };
            VideoShimDataFetcher.prototype.mapToVideoMetadata = function (videoId, shimData) {
                if (!videoId || !shimData) {
                    return null;
                }
                var videoMetadata = {
                    videoId: videoId
                };
                if (shimData.snippet) {
                    videoMetadata.title = shimData.snippet.title;
                    videoMetadata.description = shimData.snippet.description;
                    videoMetadata.interactiveTriggersEnabled = shimData.snippet.interactiveTriggersEnabled;
                    videoMetadata.interactiveTriggersUrl = shimData.snippet.interactiveTriggersUrl;
                    videoMetadata.minimumAge = shimData.snippet.minimumAge;
                    if (shimData.snippet.thumbnails) {
                        videoMetadata.posterframeUrl = this.removeProtocolFromUrl(shimData.snippet.thumbnails['medium'].url);
                    }
                }
                if (shimData.captions) {
                    videoMetadata.ccFiles = [];
                    var vttAppend = '&vtt=true';
                    for (var caption in shimData.captions) {
                        if (shimData.captions.hasOwnProperty(caption)) {
                            if (shimData.captions[caption].url.indexOf('?') < 0) {
                                vttAppend = '?vtt=true';
                            }
                            videoMetadata.ccFiles.push({
                                locale: caption,
                                url: this.removeProtocolFromUrl(shimData.captions[caption].url),
                                ccType: player_data_interfaces_3.ClosedCaptionTypes.TTML
                            });
                            videoMetadata.ccFiles.push({
                                locale: caption,
                                url: this.removeProtocolFromUrl(shimData.captions[caption].url) + vttAppend,
                                ccType: player_data_interfaces_3.ClosedCaptionTypes.VTT
                            });
                        }
                    }
                }
                if (shimData.streams) {
                    videoMetadata.videoFiles = [];
                    for (var stream in shimData.streams) {
                        if (shimData.streams.hasOwnProperty(stream)) {
                            if (stream === '1001') {
                                continue;
                            }
                            var streamData = shimData.streams[stream];
                            var mediaTypeAndQuality = this.getMediaTypeAndQuality(stream);
                            videoMetadata.videoFiles.push({
                                height: streamData.heightPixels,
                                width: streamData.widthPixels,
                                url: this.removeProtocolFromUrl(streamData.url),
                                quality: mediaTypeAndQuality.quality,
                                mediaType: mediaTypeAndQuality.mediaType
                            });
                        }
                    }
                }
                videoMetadata.downloadableFiles = [];
                if (shimData.transcripts) {
                    for (var transcript in shimData.transcripts) {
                        if (shimData.transcripts.hasOwnProperty(transcript)) {
                            videoMetadata.downloadableFiles.push({
                                locale: transcript,
                                url: this.removeProtocolFromUrl(shimData.transcripts[transcript].url),
                                mediaType: player_data_interfaces_3.DownloadableMediaTypes.transcript
                            });
                        }
                    }
                }
                if (videoMetadata.videoFiles) {
                    var selectedMP4 = void 0;
                    var selectedWidth = 0;
                    for (var _i = 0, _a = videoMetadata.videoFiles; _i < _a.length; _i++) {
                        var videoFile = _a[_i];
                        if (videoFile.mediaType === player_data_interfaces_3.MediaTypes.MP4 && videoFile.width >= selectedWidth) {
                            selectedMP4 = videoFile;
                            selectedWidth = videoFile.width;
                        }
                    }
                    if (selectedMP4) {
                        videoMetadata.downloadableFiles.push({
                            locale: shimData.snippet.culture,
                            url: this.removeProtocolFromUrl(selectedMP4.url),
                            mediaType: player_data_interfaces_3.DownloadableMediaTypes.video
                        });
                    }
                }
                return videoMetadata;
            };
            VideoShimDataFetcher.prototype.removeProtocolFromUrl = function (url) {
                if (!url) {
                    return url;
                }
                return url.replace(/(^\w+:|^)\/\//, '//');
            };
            VideoShimDataFetcher.prototype.getMediaTypeAndQuality = function (streamName) {
                var mediaType = player_data_interfaces_3.MediaTypes.MP4;
                var quality = null;
                switch (streamName.toLowerCase()) {
                    case 'h.264_320_180_400kbps':
                        mediaType = player_data_interfaces_3.MediaTypes.MP4;
                        quality = player_data_interfaces_3.MediaQuality.LO;
                        break;
                    case 'h.264_640_360_1000kbps':
                        mediaType = player_data_interfaces_3.MediaTypes.MP4;
                        quality = player_data_interfaces_3.MediaQuality.SD;
                        break;
                    case 'h.264_960_540_2250kbps':
                        mediaType = player_data_interfaces_3.MediaTypes.MP4;
                        quality = player_data_interfaces_3.MediaQuality.HQ;
                        break;
                    case 'h.264_1280_720_3400kbps':
                        mediaType = player_data_interfaces_3.MediaTypes.MP4;
                        quality = player_data_interfaces_3.MediaQuality.HD;
                        break;
                    case 'apple_http_live_streaming':
                        mediaType = player_data_interfaces_3.MediaTypes.HLS;
                        break;
                    case 'smooth_streaming':
                        mediaType = player_data_interfaces_3.MediaTypes.SMOOTH;
                        break;
                    case 'mpeg_dash':
                        mediaType = player_data_interfaces_3.MediaTypes.DASH;
                        break;
                }
                return {
                    mediaType: mediaType,
                    quality: quality
                };
            };
            VideoShimDataFetcher.prototype.isUuid = function (videoId) {
                var regexGuid = /^[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}$/gi;
                return regexGuid.test(videoId);
            };
            return VideoShimDataFetcher;
        }());
        exports.VideoShimDataFetcher = VideoShimDataFetcher;
    });
    define("video-player/video-player", ["require", "exports", "video-player/player-factory", "mwf/utilities/utility", "mwf/utilities/htmlExtensions", "data/player-options", "utilities/player-utility", "constants/player-constants", "data/video-shim-data-fetcher"], function (require, exports, player_factory_1, utility_7, htmlExtensions_4, player_options_1, player_utility_3, player_constants_2, video_shim_data_fetcher_1) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.VideoPlayer = void 0;
        var VideoPlayer = (function () {
            function VideoPlayer(videoComponent, data) {
                var _this = this;
                this.videoComponent = videoComponent;
                this.playerData = {};
                this.resizePlayer = function () {
                    if (!_this.videoComponent || !_this.playerData || !_this.playerData.options || _this.playerData.options.flexSize) {
                        _this.videoComponent.style.removeProperty('height');
                    }
                    else {
                        var width = _this.videoComponent.getBoundingClientRect().width;
                        if (width && _this.playerData.options.aspectRatio) {
                            var height = width / _this.playerData.options.aspectRatio;
                            htmlExtensions_4.css(_this.videoComponent, 'height', height + 'px');
                        }
                    }
                };
                if (!videoComponent) {
                    return;
                }
                VideoPlayer.playerInstanceCount++;
                this.playerId = videoComponent.getAttribute('id');
                if (!this.playerId) {
                    this.playerId = "vid-" + VideoPlayer.playerInstanceCount;
                    this.videoComponent.setAttribute('id', this.playerId);
                }
                player_utility_3.PlayerUtility.createVideoPerfMarker(this.playerId, player_constants_2.videoPerfMarkers.playerInit);
                var playerData = typeof data === 'object' ? data : {};
                if (!data || !data.options) {
                    var playerDataString = this.videoComponent.getAttribute(VideoPlayer.playerDataAttribute);
                    if (!!playerDataString) {
                        playerData = utility_7.parseJson(playerDataString);
                    }
                }
                this.playerData.options = new player_options_1.PlayerOptions(playerData.options);
                this.playerData.metadata = playerData.metadata;
                if (this.playerData.metadata && this.playerData.options.autoload) {
                    this.load();
                }
                else {
                    this.resizePlayer();
                }
                htmlExtensions_4.addThrottledEvent(window, htmlExtensions_4.eventTypes.resize, this.resizePlayer);
                this['getCurrentTime'] = function () {
                    var playPosition = _this.getPlayPosition();
                    return playPosition && playPosition.currentTime;
                };
                this['getDuration'] =
                    this['getVideoDuration'] = function () {
                        var playPosition = _this.getPlayPosition();
                        return playPosition && (playPosition.endTime - playPosition.startTime);
                    };
            }
            VideoPlayer.prototype.updateContainerVisibility = function (container, hide) {
                if (!!container) {
                    var hiddenVal = hide ? 'true' : 'false';
                    container.setAttribute('aria-hidden', hiddenVal);
                }
            };
            VideoPlayer.prototype.load = function (data) {
                if (data) {
                    utility_7.extend(this.playerData.options, data.options);
                    this.playerData.metadata = data.metadata;
                }
                if (!!this.currentPlayer) {
                    this.dispose();
                }
                if (this.playerData.options && this.playerData.options.debug) {
                    this.videoComponent.setAttribute('data-debug', 'true');
                }
                this.resizePlayer();
                if (this.playerData.metadata && this.playerData.metadata.videoId &&
                    (!this.playerData.metadata.videoFiles || !this.playerData.metadata.videoFiles.length) &&
                    !this.playerData.metadata.playerName) {
                    this.fetchDataAndLoad();
                }
                else {
                    this.loadPlayer();
                }
            };
            VideoPlayer.prototype.updatePlayerSource = function (playerData) {
                this.currentPlayer.updatePlayerSource(playerData);
            };
            VideoPlayer.prototype.fetchDataAndLoad = function () {
                var _this = this;
                player_utility_3.PlayerUtility.createVideoPerfMarker(this.playerId, player_constants_2.videoPerfMarkers.metadataFetchStart);
                var dataFetcher = new video_shim_data_fetcher_1.VideoShimDataFetcher(this.playerData.options.shimServiceEnv, this.playerData.options.shimServiceUrl);
                dataFetcher.getMetadata(this.playerData.metadata.videoId, function (result) {
                    player_utility_3.PlayerUtility.createVideoPerfMarker(_this.playerId, player_constants_2.videoPerfMarkers.metadataFetchEnd);
                    _this.playerData.metadata = result;
                    _this.loadPlayer();
                }, function () {
                    player_utility_3.PlayerUtility.createVideoPerfMarker(_this.playerId, player_constants_2.videoPerfMarkers.metadataFetchEnd);
                    _this.loadPlayer();
                });
            };
            VideoPlayer.prototype.getCurrentPlayState = function () {
                if (!!this.currentPlayer) {
                    return this.currentPlayer.getCurrentPlayState();
                }
            };
            VideoPlayer.prototype.loadPlayer = function () {
                player_utility_3.PlayerUtility.createVideoPerfMarker(this.playerId, player_constants_2.videoPerfMarkers.playerLoadStart);
                var playerName = (this.playerData.metadata && this.playerData.metadata.playerName) || VideoPlayer.defaultPlayerName;
                var factoryResponse = player_factory_1.PlayerFactory.createPlayer(playerName, this.videoComponent, this.playerData);
                this.currentPlayer = factoryResponse && factoryResponse.playerInstance;
                VideoPlayer.videoPlayerList[this.playerId] = this.currentPlayer;
            };
            VideoPlayer.prototype.dispose = function () {
                if (!!this.currentPlayer) {
                    this.currentPlayer.dispose();
                    this.currentPlayer = null;
                    delete VideoPlayer.videoPlayerList[this.playerId];
                }
                htmlExtensions_4.removeInnerHtml(this.videoComponent);
            };
            VideoPlayer.prototype.play = function () {
                if (!!this.currentPlayer) {
                    this.currentPlayer.play();
                }
            };
            VideoPlayer.prototype.displayImage = function (imageUrl) {
                if (!!this.currentPlayer) {
                    this.currentPlayer.displayImage(imageUrl);
                }
            };
            VideoPlayer.prototype.pause = function (isUserInitiated) {
                if (!!this.currentPlayer) {
                    this.currentPlayer.pause(isUserInitiated);
                }
            };
            VideoPlayer.prototype.mute = function (value) {
                if (!!this.currentPlayer) {
                    value !== undefined && !value ? this.currentPlayer.unmute() : this.currentPlayer.mute();
                }
            };
            VideoPlayer.prototype.unmute = function () {
                if (!!this.currentPlayer) {
                    this.currentPlayer.unmute();
                }
            };
            VideoPlayer.prototype.seek = function (seconds) {
                if (!!this.currentPlayer) {
                    this.currentPlayer.seek(seconds);
                }
            };
            VideoPlayer.prototype.enterFullScreen = function () {
                if (!!this.currentPlayer) {
                    this.currentPlayer.enterFullScreen();
                }
            };
            VideoPlayer.prototype.exitFullScreen = function () {
                if (!!this.currentPlayer) {
                    this.currentPlayer.exitFullScreen();
                }
            };
            VideoPlayer.prototype.getPlayPosition = function () {
                if (!!this.currentPlayer) {
                    return this.currentPlayer.getPlayPosition();
                }
                return {
                    currentTime: 0,
                    startTime: 0,
                    endTime: 0
                };
            };
            VideoPlayer.prototype.isLive = function () {
                return (this.currentPlayer) ? this.currentPlayer.isLive() : false;
            };
            VideoPlayer.prototype.addPlayerEventListener = function (callback) {
                if (!!this.currentPlayer) {
                    this.currentPlayer.addPlayerEventListener(callback);
                }
            };
            VideoPlayer.prototype.removePlayerEventListener = function (callback) {
                if (!!this.currentPlayer) {
                    this.currentPlayer.removePlayerEventListener(callback);
                }
            };
            VideoPlayer.prototype.setAutoPlay = function () {
                if (!!this.currentPlayer) {
                    this.currentPlayer.setAutoPlay();
                }
            };
            VideoPlayer.prototype.addPlayerEventsListener = function (callback) {
                if (!!this.currentPlayer) {
                    this.currentPlayer.addPlayerEventListener(callback);
                }
            };
            VideoPlayer.prototype.removePlayerEventsListener = function (callback) {
                if (!!this.currentPlayer) {
                    this.currentPlayer.removePlayerEventListener(callback);
                }
            };
            VideoPlayer.prototype.getPlayerId = function () {
                return this.playerId;
            };
            VideoPlayer.prototype.getPlayer = function (id) {
                for (var key in VideoPlayer.videoPlayerList) {
                    if ((id === key) && VideoPlayer.videoPlayerList.hasOwnProperty(key)) {
                        return VideoPlayer.videoPlayerList[key];
                    }
                }
                console.log('player not found in player list, id = ' + id);
                return null;
            };
            VideoPlayer.prototype.resize = function () {
                if (!!this.currentPlayer) {
                    this.currentPlayer.resize();
                }
            };
            VideoPlayer.videoPlayerList = {};
            VideoPlayer.selector = '.c-video-player';
            VideoPlayer.typeName = 'VideoPlayer';
            VideoPlayer.corePlayerContainer = '.f-core-player';
            VideoPlayer.externalPlayerContainer = '.f-external-player';
            VideoPlayer.playerDataAttribute = 'data-player-data';
            VideoPlayer.defaultPlayerName = 'coreplayer';
            VideoPlayer.playerInstanceCount = 0;
            return VideoPlayer;
        }());
        exports.VideoPlayer = VideoPlayer;
        if (!utility_7.getPerfMarkerValue(player_constants_2.videoPerfMarkers.scriptLoaded)) {
            utility_7.createPerfMarker(player_constants_2.videoPerfMarkers.scriptLoaded, true);
        }
    });
    define("mwf/utilities/componentFactory", ["require", "exports", "mwf/utilities/htmlExtensions", "mwf/utilities/utility", "mwf/utilities/stringExtensions"], function (require, exports, htmlExtensions_5, utility_8, stringExtensions_8) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.ComponentFactory = void 0;
        var ComponentFactory = (function () {
            function ComponentFactory() {
            }
            ComponentFactory.create = function (factoryInputs) {
                for (var _i = 0, factoryInputs_1 = factoryInputs; _i < factoryInputs_1.length; _i++) {
                    var factoryInput = factoryInputs_1[_i];
                    if (!factoryInput.c && !factoryInput.component) {
                        throw 'factoryInput should has either component or c to tell the factory what component to create.' +
                            'Eg.ComponentFactory.create([{ c: Carousel] or ComponentFactory.create([component: Carousel]))';
                    }
                    ComponentFactory.createComponent(factoryInput.component || factoryInput.c, factoryInput);
                }
            };
            ComponentFactory.createComponent = function (type, input) {
                if (!type) {
                    return;
                }
                var eventToBind = (input && input.eventToBind) ? input.eventToBind : '';
                var selector = (input && input.selector) ? input.selector : type.selector;
                var context = (input && input.context) ? input.context : null;
                var results = [];
                var bindFunction = function (typeName, selector, params) {
                    var elements;
                    if (input.elements) {
                        elements = input.elements;
                    }
                    else if (selector) {
                        elements = htmlExtensions_5.selectElementsT(selector, context);
                    }
                    else {
                        elements = [document.body];
                    }
                    for (var _i = 0, elements_1 = elements; _i < elements_1.length; _i++) {
                        var componentContainer = elements_1[_i];
                        if (!componentContainer.mwfInstances) {
                            componentContainer.mwfInstances = {};
                        }
                        if (!componentContainer.mwfInstances[typeName]) {
                            var component = new type(componentContainer, params);
                            if (!component.isObserving || component.isObserving()) {
                                componentContainer.mwfInstances[typeName] = component;
                                results.push(component);
                            }
                        }
                        else {
                            results.push(componentContainer.mwfInstances[typeName]);
                        }
                    }
                };
                switch (eventToBind) {
                    case 'DOMContentLoaded':
                        if (ComponentFactory.onDomReadyHappened) {
                            ComponentFactory.callBindFunction(type, selector, bindFunction, input, results);
                        }
                        else {
                            ComponentFactory.domReadyFunctions
                                .push(function () { return ComponentFactory.callBindFunction(type, selector, bindFunction, input, results); });
                            break;
                        }
                        break;
                    case 'load':
                    default:
                        if (ComponentFactory.onDeferredHappened) {
                            ComponentFactory.callBindFunction(type, selector, bindFunction, input, results);
                        }
                        else {
                            ComponentFactory.deferredFunctions
                                .push(function () { return ComponentFactory.callBindFunction(type, selector, bindFunction, input, results); });
                            break;
                        }
                }
            };
            ComponentFactory.callBindFunction = function (type, selector, bindFunction, input, results) {
                if (input === void 0) { input = null; }
                var typeName = ComponentFactory.getTypeName(type);
                var markerName = typeName || selector || '';
                var params = (input && input.params) ? input.params : {};
                params.mwfClass = typeName;
                utility_8.createPerfMarker(markerName + '_Begin');
                bindFunction(typeName, selector, params);
                utility_8.createPerfMarker(markerName + '_End');
                if (input && input.callback) {
                    input.callback(results);
                }
            };
            ComponentFactory.getTypeName = function (type) {
                if (type.typeName) {
                    return type.typeName;
                }
                if (type.name) {
                    return type.name;
                }
                var parts = ComponentFactory.typeNameRegEx.exec(type.toString());
                if (parts && (parts.length > 1)) {
                    return parts[1];
                }
            };
            ComponentFactory.enumerateComponents = function (element, callback) {
                if (!element || !callback) {
                    return;
                }
                var mwfInstances = element.mwfInstances;
                for (var property in mwfInstances) {
                    if (mwfInstances.hasOwnProperty(property)) {
                        var mwfInstance = mwfInstances[property];
                        if (mwfInstance) {
                            if (!callback(property, mwfInstance)) {
                                break;
                            }
                        }
                    }
                }
            };
            ComponentFactory.detach = function (element, typeName) {
                var mwfElement = element;
                if (!mwfElement || !mwfElement.mwfInstances || stringExtensions_8.isNullOrWhiteSpace(typeName)) {
                    return;
                }
                if (mwfElement.mwfInstances.hasOwnProperty(typeName)) {
                    var component = mwfElement.mwfInstances[typeName];
                    mwfElement.mwfInstances[typeName] = null;
                    if (component && component.detach) {
                        component.detach();
                    }
                }
            };
            ComponentFactory.typeNameRegEx = /function\s+(\S+)\s*\(/;
            ComponentFactory.onLoadTimeoutMs = 6000;
            ComponentFactory.onDeferredHappened = false;
            ComponentFactory.deferredFunctions = [];
            ComponentFactory.onDomReadyHappened = false;
            ComponentFactory.domReadyFunctions = [];
            return ComponentFactory;
        }());
        exports.ComponentFactory = ComponentFactory;
        (function () {
            htmlExtensions_5.onDeferred(function () {
                ComponentFactory.onDeferredHappened = true;
                var registeredFunctions = ComponentFactory.deferredFunctions;
                if (!registeredFunctions || registeredFunctions.length > 0) {
                    for (var _i = 0, registeredFunctions_1 = registeredFunctions; _i < registeredFunctions_1.length; _i++) {
                        var registerFunction = registeredFunctions_1[_i];
                        if (typeof registerFunction === 'function') {
                            htmlExtensions_5.SafeBrowserApis.requestAnimationFrame.call(window, registerFunction);
                        }
                    }
                }
                ComponentFactory.deferredFunctions = null;
            }, ComponentFactory.onLoadTimeoutMs);
            htmlExtensions_5.documentReady(function () {
                ComponentFactory.onDomReadyHappened = true;
                var registeredFunctions = ComponentFactory.domReadyFunctions;
                if (!registeredFunctions || registeredFunctions.length > 0) {
                    for (var _i = 0, registeredFunctions_2 = registeredFunctions; _i < registeredFunctions_2.length; _i++) {
                        var registerFunction = registeredFunctions_2[_i];
                        if (typeof registerFunction === 'function') {
                            htmlExtensions_5.SafeBrowserApis.requestAnimationFrame.call(window, registerFunction);
                        }
                    }
                }
                ComponentFactory.domReadyFunctions = null;
            }, ComponentFactory.onLoadTimeoutMs);
        })();
    });
    define("mwf/utilities/observableComponent", ["require", "exports", "mwf/utilities/htmlExtensions"], function (require, exports, htmlExtensions_6) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.ObservableComponent = void 0;
        var ObservableComponent = (function () {
            function ObservableComponent(element, params) {
                if (params === void 0) { params = null; }
                this.element = element;
                this.ignoreNextDOMChange = false;
                this.observing = false;
                if (ObservableComponent.shouldInitializeAsClass(element, params)) {
                    this.setObserver();
                }
            }
            ObservableComponent.prototype.detach = function () {
                this.unObserve();
                this.teardown();
            };
            ObservableComponent.prototype.isObserving = function () {
                return this.observing;
            };
            ObservableComponent.prototype.unObserve = function () {
                this.observing = false;
                if (this.modernObserver) {
                    this.modernObserver.disconnect();
                }
                htmlExtensions_6.removeEvent(this.element, htmlExtensions_6.eventTypes.DOMNodeInserted, this.obsoleteNodeInsertedEventHander);
                htmlExtensions_6.removeEvent(this.element, htmlExtensions_6.eventTypes.DOMNodeRemoved, this.obsoleteNodeRemovedEventHandler);
            };
            ObservableComponent.prototype.setObserver = function () {
                this.observing = true;
                if (typeof ObservableComponent.mutationObserver !== 'undefined') {
                    this.observeModern();
                }
                else if ('MutationEvent' in window) {
                    this.observeObsolete();
                }
                else ;
            };
            ObservableComponent.prototype.observeModern = function () {
                var _this = this;
                var observerConfig = {
                    childList: true,
                    subtree: true
                };
                var observerCallBack = function (mutations) { _this.onModernMutations(mutations); };
                this.modernObserver = new ObservableComponent.mutationObserver(observerCallBack);
                this.modernObserver.observe(this.element, observerConfig);
            };
            ObservableComponent.prototype.onModernMutations = function (mutations) {
                if (this.ignoreNextDOMChange) {
                    this.ignoreNextDOMChange = false;
                    return;
                }
                var needToTeardown = false;
                var needToUpdate = false;
                for (var _i = 0, mutations_1 = mutations; _i < mutations_1.length; _i++) {
                    var mutation = mutations_1[_i];
                    for (var index = 0, length_3 = mutation.addedNodes.length; index < length_3; index++) {
                        if (mutation.addedNodes[index].nodeType === Node.ELEMENT_NODE) {
                            needToTeardown = true;
                            needToUpdate = true;
                        }
                    }
                    for (var index = 0, length_4 = mutation.removedNodes.length; index < length_4; index++) {
                        if (mutation.removedNodes[index].nodeType === Node.ELEMENT_NODE) {
                            needToTeardown = true;
                            if (mutation.removedNodes[index] !== this.element) {
                                needToUpdate = true;
                            }
                        }
                    }
                }
                if (needToTeardown) {
                    this.teardown();
                }
                if (needToUpdate) {
                    this.update();
                }
            };
            ObservableComponent.prototype.observeObsolete = function () {
                var _this = this;
                this.obsoleteNodeInsertedEventHander = htmlExtensions_6.addDebouncedEvent(this.element, htmlExtensions_6.eventTypes.DOMNodeInserted, function () {
                    _this.onObsoleteNodeInserted();
                });
                this.obsoleteNodeRemovedEventHandler = htmlExtensions_6.addDebouncedEvent(this.element, htmlExtensions_6.eventTypes.DOMNodeRemoved, function (event) {
                    _this.onObsoleteNodeRemoved(event);
                });
            };
            ObservableComponent.prototype.onObsoleteNodeInserted = function () {
                if (this.ignoreNextDOMChange) {
                    return;
                }
                this.teardown();
                this.update();
            };
            ObservableComponent.prototype.onObsoleteNodeRemoved = function (event) {
                if (this.ignoreNextDOMChange) {
                    return;
                }
                this.teardown();
                if (htmlExtensions_6.getEventTargetOrSrcElement(event) !== this.element) {
                    this.update();
                }
            };
            ObservableComponent.shouldInitializeAsClass = function (element, params) {
                var mwfClass = !element ? null : element.getAttribute(ObservableComponent.mwfClassAttribute);
                var jsInit = !element ? null : element.getAttribute(ObservableComponent.initializeAttribute);
                if (jsInit === 'false') {
                    return false;
                }
                return !!element && (!mwfClass || (!!params && (mwfClass === params.mwfClass)));
            };
            ObservableComponent.mwfClassAttribute = 'data-mwf-class';
            ObservableComponent.initializeAttribute = 'data-js-initialize';
            ObservableComponent.mutationObserver = window.MutationObserver
                || window.WebKitMutationObserver
                || window.MozMutationObserver;
            return ObservableComponent;
        }());
        exports.ObservableComponent = ObservableComponent;
    });
    define("mwf/utilities/publisher", ["require", "exports", "mwf/utilities/observableComponent"], function (require, exports, observableComponent_1) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.Publisher = void 0;
        var Publisher = (function (_super) {
            __extends(Publisher, _super);
            function Publisher(element, params) {
                if (params === void 0) { params = null; }
                var _this = _super.call(this, element, params) || this;
                _this.element = element;
                return _this;
            }
            Publisher.prototype.subscribe = function (subscriber) {
                if (!subscriber) {
                    return false;
                }
                if (!this.subscribers) {
                    this.subscribers = [];
                }
                else {
                    if (this.subscribers.indexOf(subscriber) !== -1) {
                        return false;
                    }
                }
                this.subscribers.push(subscriber);
                return true;
            };
            Publisher.prototype.unsubscribe = function (subscriber) {
                if (!subscriber || !this.subscribers || !this.subscribers.length) {
                    return false;
                }
                var index = this.subscribers.indexOf(subscriber);
                if (index === -1) {
                    return false;
                }
                this.subscribers.splice(index, 1);
                return true;
            };
            Publisher.prototype.hasSubscribers = function () {
                return !!this.subscribers && (this.subscribers.length > 0);
            };
            Publisher.prototype.initiatePublish = function (context) {
                if (this.hasSubscribers()) {
                    for (var _i = 0, _a = this.subscribers; _i < _a.length; _i++) {
                        var subscriber = _a[_i];
                        this.publish(subscriber, context);
                    }
                }
            };
            Publisher.prototype.update = function () {
            };
            Publisher.prototype.teardown = function () {
            };
            return Publisher;
        }(observableComponent_1.ObservableComponent));
        exports.Publisher = Publisher;
    });
    define("mwf/slider/slider", ["require", "exports", "mwf/utilities/publisher", "mwf/utilities/htmlExtensions", "mwf/utilities/utility"], function (require, exports, publisher_1, htmlExtensions_7, utility_9) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.Slider = void 0;
        var Slider = (function (_super) {
            __extends(Slider, _super);
            function Slider(element) {
                var _this = _super.call(this, element) || this;
                _this.onKeyPressed = function (key) {
                    switch (key) {
                        case 37:
                        case 39:
                            if (!_this.isVerticalSlider) {
                                var offset = (_this.primaryDirection === htmlExtensions_7.Direction.left) ? _this.stepOffset : -_this.stepOffset;
                                offset = (key === 37) ? -offset : offset;
                                _this.updateThumbOffset(_this.thumbOffset + offset, true, true);
                                htmlExtensions_7.preventDefault(htmlExtensions_7.getEvent(event));
                            }
                            break;
                        case 38:
                        case 40:
                            if (_this.isVerticalSlider) {
                                var offset = (key === 38) ? _this.stepOffset : -_this.stepOffset;
                                _this.updateThumbOffset(_this.thumbOffset + offset, true, true);
                                htmlExtensions_7.preventDefault(htmlExtensions_7.getEvent(event));
                            }
                            break;
                        case 33:
                            {
                                htmlExtensions_7.preventDefault(htmlExtensions_7.getEvent(event));
                                var offset = 2 * _this.stepOffset;
                                _this.updateThumbOffset(_this.thumbOffset + offset, true, true);
                            }
                            break;
                        case 34:
                            {
                                htmlExtensions_7.preventDefault(htmlExtensions_7.getEvent(event));
                                var offset = -(2 * _this.stepOffset);
                                _this.updateThumbOffset(_this.thumbOffset + offset, true, true);
                            }
                            break;
                        case 36:
                            {
                                htmlExtensions_7.preventDefault(htmlExtensions_7.getEvent(event));
                                var min = parseInt(_this.input.getAttribute('min'), 10) || 0;
                                _this.updateThumbOffset(min, true, true);
                            }
                            break;
                        case 35:
                            {
                                htmlExtensions_7.preventDefault(htmlExtensions_7.getEvent(event));
                                var step = parseInt(_this.input.getAttribute('step'), 10);
                                var max = _this.thumbRange + step;
                                _this.updateThumbOffset(max, true, true);
                            }
                            break;
                    }
                };
                _this.onKeyDown = function (event) {
                    _this.onKeyPressed(utility_9.getKeyCode(htmlExtensions_7.getEvent(event)));
                };
                _this.onMouseDown = function (event) {
                    event = htmlExtensions_7.getEvent(event);
                    _this.setupDimensions();
                    if (htmlExtensions_7.getEventTargetOrSrcElement(event) === _this.thumb) {
                        htmlExtensions_7.addEvent(document, htmlExtensions_7.eventTypes.mousemove, _this.onMouseMove);
                        htmlExtensions_7.addEvent(document, htmlExtensions_7.eventTypes.mouseup, _this.onMouseUp);
                        htmlExtensions_7.addEvent(document, htmlExtensions_7.eventTypes.touchmove, _this.onMouseMove);
                        htmlExtensions_7.addEvent(document, htmlExtensions_7.eventTypes.touchcancel, _this.onMouseUp);
                        return;
                    }
                    _this.moveThumbTo(event.clientX, event.clientY);
                };
                _this.onMouseMove = function (event) {
                    if (event.type === 'mousemove') {
                        event = htmlExtensions_7.getEvent(event);
                    }
                    if (event.type === 'touchmove') {
                        var touch = htmlExtensions_7.getEvent(event);
                        event = touch.targetTouches[0];
                    }
                    _this.moveThumbTo(event.clientX, event.clientY);
                };
                _this.onMouseUp = function (event) {
                    htmlExtensions_7.removeEvent(document, htmlExtensions_7.eventTypes.mousemove, _this.onMouseMove);
                    htmlExtensions_7.removeEvent(document, htmlExtensions_7.eventTypes.mouseup, _this.onMouseUp);
                    htmlExtensions_7.removeEvent(document, htmlExtensions_7.eventTypes.touchmove, _this.onMouseMove);
                    htmlExtensions_7.removeEvent(document, htmlExtensions_7.eventTypes.touchcancel, _this.onMouseUp);
                };
                _this.onWindowResized = function (event) {
                    _this.setupDimensions();
                };
                _this.update();
                return _this;
            }
            Slider.prototype.update = function () {
                if (!this.element) {
                    return;
                }
                this.input = htmlExtensions_7.selectFirstElement('input', this.element);
                this.primaryDirection = htmlExtensions_7.getDirection(this.element);
                this.isVerticalSlider = htmlExtensions_7.hasClass(this.input, 'f-vertical');
                htmlExtensions_7.preventDefaultSwipeAction(this.element, !this.isVerticalSlider);
                htmlExtensions_7.addClass(this.input, 'x-screen-reader');
                var min = parseInt(this.input.getAttribute('min'), 10) || 0;
                var max = parseInt(this.input.getAttribute('max'), 10) || 100;
                var value = parseInt(this.input.getAttribute('value'), 10);
                var step = parseInt(this.input.getAttribute('step'), 10);
                if (this.element.children[this.element.children.length - 1] === this.input) {
                    this.mockSlider = document.createElement('div');
                    this.thumb = document.createElement('button');
                    this.thumb.setAttribute('role', 'slider');
                    this.thumb.setAttribute('aria-valuemin', min.toString());
                    this.thumb.setAttribute('aria-valuemax', max.toString());
                    this.thumb.setAttribute('aria-valuenow', value.toString());
                    this.thumb.setAttribute('aria-valuetext', value.toString());
                    if (this.input.hasAttribute('aria-label')) {
                        this.thumb.setAttribute('aria-label', this.input.getAttribute('aria-label'));
                    }
                    this.valueTooltip = document.createElement('span');
                    this.track = document.createElement('span');
                    this.thumb.appendChild(this.valueTooltip);
                    this.mockSlider.appendChild(this.thumb);
                    this.mockSlider.appendChild(this.track);
                    this.element.appendChild(this.mockSlider);
                    this.ignoreNextDOMChange = true;
                }
                else {
                    this.mockSlider = this.element.children[this.element.children.length - 1];
                    this.thumb = this.mockSlider.firstElementChild;
                    this.valueTooltip = this.thumb.firstElementChild;
                    this.track = this.mockSlider.children[this.mockSlider.children.length - 1];
                }
                this.halfThumbOffset = (this.thumb.clientWidth) / 2;
                if (this.resetSliderInternal(min, max, value, step, true)) {
                    htmlExtensions_7.addEvent(this.element, htmlExtensions_7.eventTypes.mousedown, this.onMouseDown);
                    htmlExtensions_7.addEvent(this.element, htmlExtensions_7.eventTypes.touchstart, this.onMouseDown);
                    htmlExtensions_7.addEvent(this.thumb, htmlExtensions_7.eventTypes.keydown, this.onKeyDown);
                    this.resizeListener = htmlExtensions_7.addDebouncedEvent(window, htmlExtensions_7.eventTypes.resize, this.onWindowResized);
                }
            };
            Slider.prototype.teardown = function () {
                htmlExtensions_7.removeEvent(this.element, htmlExtensions_7.eventTypes.mousedown, this.onMouseDown);
                htmlExtensions_7.removeEvent(this.element, htmlExtensions_7.eventTypes.touchstart, this.onMouseDown);
                htmlExtensions_7.removeEvent(this.thumb, htmlExtensions_7.eventTypes.keydown, this.onKeyDown);
                htmlExtensions_7.removeEvent(window, htmlExtensions_7.eventTypes.resize, this.resizeListener);
                this.input = null;
                this.mockSlider = null;
                this.thumb = null;
                this.valueTooltip = null;
                this.track = null;
                this.resizeListener = null;
            };
            Slider.prototype.resetSlider = function (min, max, value, step) {
                return this.resetSliderInternal(min, max, value, step, false);
            };
            Slider.prototype.resetSliderInternal = function (min, max, value, step, internal) {
                if (!utility_9.isNumber(min) || !utility_9.isNumber(max)) {
                    return false;
                }
                if (Math.max(min, max) - Math.min(min, max) <= 0) {
                    return false;
                }
                this.min = Math.min(min, max);
                this.max = Math.max(min, max);
                this.range = this.max - this.min;
                this.step = isNaN(step) ? (this.range / 10) : step;
                this.value = Math.min(Math.max(isNaN(value) ? (isNaN(this.value) ? this.min : this.value) : value, this.min), this.max);
                this.setupDimensions();
                this.updateThumbOffset(this.thumbOffset, internal, false, this.value);
                return true;
            };
            Slider.prototype.setValue = function (value) {
                if (!utility_9.isNumber(value) || (value < this.min) || (value > this.max)) {
                    return false;
                }
                if (value !== this.value) {
                    this.thumbOffset = ((value - this.min) * this.thumbRange / this.range) + this.halfThumbOffset;
                    this.updateThumbOffset(this.thumbOffset, false, false, value);
                }
                return true;
            };
            Slider.prototype.setupDimensions = function () {
                this.dimensions = htmlExtensions_7.getClientRect(this.mockSlider);
                if (this.isVerticalSlider) {
                    this.dimensions.left -= Slider.hitPadding;
                    this.dimensions.right += Slider.hitPadding;
                    this.thumbRange = this.dimensions.height - this.thumb.clientWidth;
                    this.maxThumbOffset = this.dimensions.height;
                }
                else {
                    this.dimensions.top -= Slider.hitPadding;
                    this.dimensions.bottom += Slider.hitPadding;
                    this.thumbRange = this.dimensions.width - this.thumb.clientWidth;
                    this.maxThumbOffset = this.dimensions.width;
                }
                this.thumbRange = Math.max(this.thumbRange, 1);
                this.thumbOffset = ((this.value - this.min) * this.thumbRange / this.range) + this.halfThumbOffset;
                this.stepOffset = this.thumbRange / (this.range / this.step);
                this.setThumbPosition();
            };
            Slider.prototype.setThumbPosition = function () {
                var offset = Math.max(0, this.thumbOffset - this.halfThumbOffset);
                htmlExtensions_7.css(this.thumb, htmlExtensions_7.Direction[this.primaryDirection], offset + 'px');
                htmlExtensions_7.css(this.track, 'width', offset + 'px');
            };
            Slider.prototype.updateThumbOffset = function (offset, internal, userInitiated, targetValue) {
                if (targetValue === void 0) { targetValue = NaN; }
                if (!utility_9.isNumber(offset)) {
                    offset = this.thumbOffset;
                }
                this.thumbOffset = Math.min(Math.max(0, offset), this.maxThumbOffset);
                var value = targetValue;
                if (isNaN(value)) {
                    value = Math.max(0, this.thumbOffset - this.halfThumbOffset) * 1000 * this.range / this.thumbRange;
                    value = Math.round(value) / 1000 + this.min;
                }
                this.value = Math.min(Math.max(this.min, value), this.max);
                this.input.setAttribute('value', this.value.toString());
                value = parseFloat(this.input.getAttribute('value'));
                if (!isNaN(value)) {
                    this.value = value;
                }
                var defaultTooltipValue = !isNaN(parseFloat(this.input.getAttribute('step')))
                    ? this.value.toString()
                    : (this.value % 1 === 0)
                        ? this.value.toString()
                        : (Math.round(this.value * 10) / 10).toString();
                this.thumb.setAttribute('aria-valuenow', defaultTooltipValue);
                this.thumb.setAttribute('aria-valuetext', defaultTooltipValue);
                this.setThumbPosition();
                this.valueDescriptor = null;
                this.initiatePublish({ value: this.value, internal: internal, userInitiated: userInitiated });
                var valueDescriptor = this.valueDescriptor || {};
                this.valueDescriptor = null;
                if (typeof valueDescriptor === 'object') {
                    htmlExtensions_7.setText(this.valueTooltip, valueDescriptor.tooltipText || defaultTooltipValue);
                    if (valueDescriptor.ariaValueText) {
                        this.thumb.setAttribute('aria-valuetext', valueDescriptor.ariaValueText);
                    }
                }
                else if (typeof valueDescriptor === 'string') {
                    if (isNaN(parseFloat(valueDescriptor)) || valueDescriptor.match(':')) {
                        this.thumb.setAttribute('aria-valuetext', valueDescriptor === '00:00:00' ? '0 second' : valueDescriptor);
                    }
                    htmlExtensions_7.setText(this.valueTooltip, valueDescriptor);
                }
            };
            Slider.prototype.publish = function (subscriber, context) {
                var valueTooltipText = subscriber.onValueChanged(context);
                if (!!valueTooltipText && !this.valueDescriptor) {
                    this.valueDescriptor = valueTooltipText;
                }
            };
            Slider.prototype.moveThumbTo = function (x, y) {
                if (!utility_9.pointInRect(x, y, this.dimensions)) {
                    return;
                }
                var offset = this.dimensions.bottom - y;
                if (!this.isVerticalSlider) {
                    offset = (this.primaryDirection === htmlExtensions_7.Direction.left) ?
                        x - this.dimensions.left :
                        this.dimensions.right - x;
                }
                this.updateThumbOffset(offset, true, true);
            };
            Slider.selector = '.c-slider';
            Slider.typeName = 'Slider';
            Slider.hitPadding = 20;
            return Slider;
        }(publisher_1.Publisher));
        exports.Slider = Slider;
    });
    define("helpers/localization-helper", ["require", "exports", "mwf/utilities/stringExtensions", "data/player-config", "utilities/player-utility"], function (require, exports, stringExtensions_9, player_config_3, player_utility_4) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.LocalizationHelper = exports.playerLocKeys = exports.ccLanguageCodes = exports.ccCultureLocStrings = void 0;
        var defaultLocStrings = {
            'audio_tracks': 'Audio Tracks',
            'closecaption_off': 'Off',
            'geolocation_error': 'We\'re sorry, this video cannot be played from your current location.',
            'media_err_aborted': 'video playback was aborted',
            'media_err_decode': 'video is not readable',
            'media_err_network': 'video failed to download',
            'media_err_src_not_supported': 'video format is not supported',
            'media_err_unknown_error': 'unknown error occurred',
            'media_err_amp_encrypt': 'The video is encrypted and we do not have the keys to decrypt it.',
            'media_err_amp_player_mismatch': 'No compatible source was found for this video.',
            'browserunsupported': 'We\'re sorry, but your browser does not support this video.',
            'browserunsupported_download': 'Please download a copy of this video to view on your device:',
            'expand': 'Full Screen',
            'mute': 'Mute',
            'nullvideoerror': 'We\'re sorry, this video cannot be played.',
            'pause': 'Pause',
            'play': 'Play',
            'play_pause_button_tooltip': 'Play and Pause Button',
            'live_caption': 'Skip ahead to live broadcast.',
            'live_label': 'LIVE',
            'playbackerror': 'We\'re sorry, an error has occurred when playing video ({0}).',
            'standarderror': 'We\'re sorry, this video can\'t be played.',
            'time': 'Time',
            'more_caption': 'More options',
            'data_error': 'Sorry, this video cannot be played.',
            'seek': 'Seek',
            'unexpand': 'Exit Full Screen',
            'unmute': 'Unmute',
            'volume': 'Volume',
            'quality': 'Quality',
            'quality_hd': 'HD',
            'quality_hq': 'HQ',
            'quality_lo': 'LO',
            'quality_sd': 'SD',
            'quality_auto': 'Auto',
            'closecaption': 'Closed captions',
            'close_text': 'Close',
            'playbackspeed': 'Playback speed',
            'playbackspeed_normal': 'Normal',
            'sharing_label': 'Share',
            'sharing_facebook': 'Facebook',
            'sharing_twitter': 'Twitter',
            'sharing_linkedin': 'LinkedIn',
            'sharing_skype': 'Skype',
            'sharing_mail': 'Mail',
            'sharing_copy': 'Copy link',
            'loading_value_text': 'Loading...',
            'loading_aria_label': 'Loading',
            'descriptive_audio': 'Audio description',
            'unknown_language': 'Unknown',
            'cc_customize': 'Customize',
            'cc_text_font': 'Font',
            'cc_text_color': 'Text color',
            'cc_color_black': 'Black',
            'cc_color_blue': 'Blue',
            'cc_color_cyan': 'Cyan',
            'cc_color_green': 'Green',
            'cc_color_grey': 'Grey',
            'cc_color_magenta': 'Magenta',
            'cc_color_red': 'Red',
            'cc_color_white': 'White',
            'cc_color_yellow': 'Yellow',
            'cc_font_name_casual': 'Casual',
            'cc_font_name_cursive': 'Cursive',
            'cc_font_name_monospacedsansserif': 'Monospaced Sans Serif',
            'cc_font_name_monospacedserif': 'Monospaced Serif',
            'cc_font_name_proportionalserif': 'Proportional Serif',
            'cc_font_name_proportionalsansserif': 'Proportional Sans Serif',
            'cc_font_name_smallcapitals': 'Small Capitals',
            'cc_text_size': 'Text size',
            'cc_text_size_default': 'Default',
            'cc_text_size_extralarge': 'Extra Large',
            'cc_text_size_large': 'Large',
            'cc_text_size_maximum': 'Maximum',
            'cc_text_size_small': 'Small',
            'cc_appearance': 'Appearance',
            'cc_preset1': 'Preset 1 ',
            'cc_preset2': 'Preset 2',
            'cc_preset3': 'Preset 3',
            'cc_preset4': 'Preset 4',
            'cc_preset5': 'Preset 5',
            'cc_presettings': 'Close captions appearance {0}: ({1}:{2}, {3}:{4})',
            'cc_text_background_color': 'Background color',
            'cc_text_background_opacity': 'Background opacity',
            'cc_text_opacity': 'Text opacity',
            'cc_percent_0': '0%',
            'cc_percent_100': '100%',
            'cc_percent_25': '25%',
            'cc_percent_50': '50%',
            'cc_percent_75': '75%',
            'cc_text_edge_color': 'Text edge color',
            'cc_text_edge_style': 'Text edge style',
            'cc_text_edge_style_depressed': 'Depressed',
            'cc_text_edge_style_dropshadow': 'Drop shadow',
            'cc_text_edge_style_none': 'No edge',
            'cc_text_edge_style_raised': 'Raised',
            'cc_text_edge_style_uniform': 'Uniform',
            'cc_window_color': 'Window color',
            'cc_window_opacity': 'Window opacity',
            'cc_reset': 'Reset',
            'download_label': 'Download',
            'download_transcript': 'Transcript',
            'download_audio': 'Audio',
            'download_video': 'Video',
            'download_videoWithCC': 'Video with closed captions',
            'agegate_day': 'Day',
            'agegate_month': 'Month',
            'agegate_year': 'Year',
            'agegate_submit': 'Submit',
            'agegate_fail': 'This content is not available at this time due to age restrictions.',
            'agegate_enterdate': 'Enter your date of birth',
            'agegate_enterdate_arialabel': 'Enter your {0} of birth',
            'agegate_verifyyourage': 'Content not intended for all audiences. Please verify your age.',
            'agegate_dateorder': 'm/d/yyyy',
            'previous_menu_aria_label': '{0} menu - go back to previous menu',
            'reactive_menu_aria_label': '{0} menu - close menu',
            'reactive_menu_aria_label_closedcaption': 'Close {0}',
            'interactivity_show': 'Show',
            'interactivity_hide': 'Hide',
            'play_video': 'Play Video',
            'playing': 'playing',
            'paused': 'paused',
        };
        exports.ccCultureLocStrings = { 'ar-ab': 'عربي', 'ar-xm': 'عربي', 'ar-ma': 'عربي', 'ar-sa': 'عربي',
            'eu-es': 'Euskara', 'bg-bg': 'Български', 'ca-es': 'Català', 'zh-cn': '简体中文', 'zh-hk': '繁體中文', 'zh-tw': '繁體中文', 'hr-hr': 'Hrvatski',
            'cs-cz': 'Čeština', 'da-dk': 'Dansk', 'nl-be': 'Nederlands', 'nl-nl': 'Nederlands', 'en-ab': 'English', 'en-aa': 'English', 'en-au': 'English',
            'en-ca': 'English', 'en-eu': 'English', 'en-hk': 'English', 'en-in': 'English', 'en-id': 'English', 'en-ie': 'English', 'en-jm': 'English',
            'en-my': 'English', 'en-nz': 'English', 'en-pk': 'English', 'en-ph': 'English', 'en-sg': 'English', 'en-za': 'English', 'en-tt': 'English',
            'en-gb': 'English', 'en-us': 'English', 'et-ee': 'Eesti', 'fi-fi': 'Suomi', 'fr-ab': 'Français', 'fr-be': 'Français', 'fr-ca': 'Français',
            'fr-fr': 'Français', 'fr-xf': 'Français', 'fr-ch': 'Français', 'gl-es': 'Galego', 'de-de': 'Deutsch', 'de-at': 'Deutsch', 'de-ch': 'Deutsch',
            'el-gr': 'Ελληνικά', 'he-il': 'עברית', 'hi-in': 'हिंदी', 'hu-hu': 'Magyar', 'is-is': 'Íslenska', 'id-id': 'Bahasa Indonesia', 'it-it': 'Italiano',
            'ja-jp': '日本語', 'kk-kz': 'Қазақ', 'ko-kr': '한국어', 'lv-lv': 'Latviešu', 'lt-lt': 'Lietuvių', 'ms-my': 'Bahasa Melayu (Asia Tenggara)‎',
            'nb-no': 'Norsk (bokmål)', 'nn-no': 'Norsk (nynorsk)', 'fa-ir': 'فارسی', 'pl-pl': 'Polski', 'pt-br': 'Português (Brasil)‎',
            'pt-pt': 'Português (Portugal)‎', 'ro-ro': 'Română', 'ru-ru': 'Русский', 'sr-latn-rs': 'Srpski', 'sk-sk': 'Slovenčina', 'sl-si': 'Slovenski',
            'es-ar': 'Español', 'es-cl': 'Español', 'es-co': 'Español', 'es-cr': 'Español', 'es-do': 'Español', 'es-ec': 'Español', 'es-us': 'Español',
            'es-gt': 'Español', 'es-hn': 'Español', 'es-xl': 'Español', 'es-mx': 'Español', 'es-ni': 'Español', 'es-pa': 'Español', 'es-py': 'Español',
            'es-pe': 'Español', 'es-pr': 'Español', 'es-es': 'Español', 'es-uy': 'Español', 'es-ve': 'Español', 'sv-se': 'Svenska', 'tl-ph': 'Tagalog',
            'th-th': 'ไทย', 'tr-tr': 'Türkçe', 'uk-ua': 'Українська', 'ur-pk': 'اردو', 'vi-vn': 'Tiếng Việt', 'sl-sl': 'Slovenian'
        };
        exports.ccLanguageCodes = { 'ar-ab': 'ar', 'ar-xm': 'ar', 'ar-ma': 'ar',
            'ar-sa': 'ar', 'eu-es': 'eu', 'bg-bg': 'bg', 'ca-es': 'ca', 'zh-cn': 'zh-cn', 'zh-hk': 'zh-hk', 'zh-tw': 'zh-tw',
            'hr-hr': 'hr', 'cs-cz': 'cs', 'da-dk': 'da', 'nl-be': 'nl', 'nl-nl': 'nl', 'en-ab': 'en', 'en-aa': 'en',
            'en-au': 'en', 'en-ca': 'en', 'en-eu': 'en', 'en-hk': 'en', 'en-in': 'en', 'en-id': 'en', 'en-ie': 'en',
            'en-jm': 'en', 'en-my': 'en', 'en-nz': 'en', 'en-pk': 'en', 'en-ph': 'en', 'en-sg': 'en', 'en-za': 'en',
            'en-tt': 'en', 'en-gb': 'en', 'en-us': 'en', 'et-ee': 'et', 'fi-fi': 'fi', 'fr-ab': 'fr', 'fr-be': 'fr',
            'fr-ca': 'fr', 'fr-fr': 'fr', 'fr-xf': 'fr', 'fr-ch': 'fr', 'gl-es': 'gl', 'de-de': 'de', 'de-at': 'de',
            'de-ch': 'de', 'el-gr': 'el', 'he-il': 'he', 'hi-in': 'hi', 'hu-hu': 'hu', 'is-is': 'is', 'id-id': 'id',
            'it-it': 'it', 'ja-jp': 'ja', 'kk-kz': 'kk', 'ko-kr': 'ko', 'lv-lv': 'lv', 'lt-lt': 'lt', 'ms-my': 'ms‎',
            'nb-no': 'nb', 'nn-no': 'nn', 'fa-ir': 'fa', 'pl-pl': 'pl', 'pt-br': 'pt-br', 'pt-pt': 'pt-pt', 'ro-ro': 'ro',
            'ru-ru': 'ru', 'sr-latn-rs': 'sr-latn-rs', 'sk-sk': 'sk', 'sl-si': 'sl', 'es-ar': 'es-ar', 'es-cl': 'es-cl', 'es-co': 'es-co',
            'es-cr': 'es-cr', 'es-do': 'es-do', 'es-ec': 'es-ec', 'es-us': 'es-us', 'es-gt': 'es-gt', 'es-hn': 'es-hn', 'es-xl': 'es-xl',
            'es-mx': 'es-mx', 'es-ni': 'es-ni', 'es-pa': 'es-pa', 'es-py': 'es-py', 'es-pe': 'es-pe', 'es-pr': 'es-pr', 'es-es': 'es-es',
            'es-uy': 'es-uy', 'es-ve': 'es-ve', 'sv-se': 'sv', 'tl-ph': 'tl', 'th-th': 'th', 'tr-tr': 'tr', 'uk-ua': 'uk',
            'ur-pk': 'ur', 'vi-vn': 'vi', 'sl-sl': 'sl' };
        exports.playerLocKeys = {
            audio_tracks: 'audio_tracks',
            closecaption_off: 'closecaption_off',
            geolocation_error: 'geolocation_error',
            media_err_aborted: 'media_err_aborted',
            media_err_decode: 'media_err_decode',
            media_err_network: 'media_err_network',
            media_err_src_not_supported: 'media_err_src_not_supported',
            media_err_unknown_error: 'media_err_unknown_error',
            media_err_amp_encrypt: 'media_err_amp_encrypt',
            media_err_amp_player_mismatch: 'media_err_amp_player_mismatch',
            browserunsupported: 'browserunsupported',
            browserunsupported_download: 'browserunsupported_download',
            expand: 'expand',
            mute: 'mute',
            nullvideoerror: 'nullvideoerror',
            pause: 'pause',
            play: 'play',
            play_video: 'play_video',
            playing: 'playing',
            paused: 'paused',
            play_pause_button_tooltip: 'play_pause_button_tooltip',
            live_caption: 'live_caption',
            live_label: 'live_label',
            playbackerror: 'playbackerror',
            standarderror: 'standarderror',
            time: 'time',
            more_caption: 'more_caption',
            data_error: 'data_error',
            seek: 'seek',
            unexpand: 'unexpand',
            unmute: 'unmute',
            volume: 'volume',
            quality: 'quality',
            quality_hd: 'quality_hd',
            quality_hq: 'quality_hq',
            quality_lo: 'quality_lo',
            quality_sd: 'quality_sd',
            quality_auto: 'quality_auto',
            cc_customize: 'cc_customize',
            cc_text_font: 'cc_text_font',
            cc_text_color: 'cc_text_color',
            cc_color_black: 'cc_color_black',
            cc_color_blue: 'cc_color_blue',
            cc_color_cyan: 'cc_color_cyan',
            cc_color_green: 'cc_color_green',
            cc_color_grey: 'cc_color_grey',
            cc_color_magenta: 'cc_color_magenta',
            cc_color_red: 'cc_color_red',
            cc_color_white: 'cc_color_white',
            cc_color_yellow: 'cc_color_yellow',
            cc_font_name_casual: 'cc_font_name_casual',
            cc_font_name_cursive: 'cc_font_name_cursive',
            cc_font_name_monospacedsansserif: 'cc_font_name_monospacedsansserif',
            cc_font_name_proportionalsansserif: 'cc_font_name_proportionalsansserif',
            cc_font_name_monospacedserif: 'cc_font_name_monospacedserif',
            cc_font_name_proportionalserif: 'cc_font_name_proportionalserif',
            cc_font_name_smallcapitals: 'cc_font_name_smallcapitals',
            cc_text_size: 'cc_text_size',
            cc_text_size_default: 'cc_text_size_default',
            cc_text_size_extralarge: 'cc_text_size_extralarge',
            cc_text_size_large: 'cc_text_size_large',
            cc_text_size_maximum: 'cc_text_size_maximum',
            cc_text_size_small: 'cc_text_size_small',
            cc_appearance: 'cc_appearance',
            cc_preset1: 'cc_preset1',
            cc_preset2: 'cc_preset2',
            cc_preset3: 'cc_preset3',
            cc_preset4: 'cc_preset4',
            cc_preset5: 'cc_preset5',
            cc_presettings: 'cc_presettings',
            cc_text_background_color: 'cc_text_background_color',
            cc_text_background_opacity: 'cc_text_background_opacity',
            cc_text_opacity: 'cc_text_opacity',
            cc_percent_0: 'cc_percent_0',
            cc_percent_100: 'cc_percent_100',
            cc_percent_25: 'cc_percent_25',
            cc_percent_50: 'cc_percent_50',
            cc_percent_75: 'cc_percent_75',
            cc_text_edge_color: 'cc_text_edge_color',
            cc_text_edge_style: 'cc_text_edge_style',
            cc_text_edge_style_depressed: 'cc_text_edge_style_depressed',
            cc_text_edge_style_dropshadow: 'cc_text_edge_style_dropshadow',
            cc_text_edge_style_none: 'cc_text_edge_style_none',
            cc_text_edge_style_raised: 'cc_text_edge_style_raised',
            cc_text_edge_style_uniform: 'cc_text_edge_style_uniform',
            cc_window_color: 'cc_window_color',
            cc_window_opacity: 'cc_window_opacity',
            cc_reset: 'cc_reset',
            closecaption: 'closecaption',
            close_text: 'close_text',
            playbackspeed: 'playbackspeed',
            playbackspeed_normal: 'playbackspeed_normal',
            sharing_label: 'sharing_label',
            sharing_facebook: 'sharing_facebook',
            sharing_twitter: 'sharing_twitter',
            sharing_linkedin: 'sharing_linkedin',
            sharing_skype: 'sharing_skype',
            sharing_mail: 'sharing_mail',
            sharing_copy: 'sharing_copy',
            loading_value_text: 'loading_value_text',
            loading_aria_label: 'loading_aria_label',
            descriptive_audio: 'descriptive_audio',
            unknown_language: 'unknown_language',
            download_label: 'download_label',
            download_transcript: 'download_transcript',
            download_audio: 'download_audio',
            download_video: 'download_video',
            download_videoWithCC: 'download_videoWithCC',
            agegate_day: 'agegate_day',
            agegate_month: 'agegate_month',
            agegate_year: 'agegate_year',
            agegate_enterdate: 'agegate_enterdate',
            agegate_enterdate_arialabel: 'agegate_enterdate_arialabel',
            agegate_fail: 'agegate_fail',
            agegate_verifyyourage: 'agegate_verifyyourage',
            agegate_submit: 'agegate_submit',
            agegate_dateorder: 'agegate_dateorder',
            previous_menu_aria_label: 'previous_menu_aria_label',
            reactive_menu_aria_label: 'reactive_menu_aria_label',
            reactive_menu_aria_label_closedcaption: 'reactive_menu_aria_label_closedcaption',
            interactivity_show: 'interactivity_show',
            interactivity_hide: 'interactivity_hide'
        };
        var downloadableMediaTypeMap = {
            transcript: 'download_transcript',
            audio: 'download_audio',
            video: 'download_video',
            videoWithCC: 'download_videoWithCC'
        };
        var LocalizationHelper = (function () {
            function LocalizationHelper(market, resHost, resHash, onErrorCallback) {
                this.market = market;
                this.resHost = resHost;
                this.resHash = resHash;
                this.onErrorCallback = onErrorCallback;
            }
            LocalizationHelper.prototype.getCorrectResourceHost = function () {
                return this.resHost ||
                    (player_config_3.PlayerConfig.resourceHost.indexOf('%playerResourceHost') === -1
                        ? player_config_3.PlayerConfig.resourceHost
                        : player_config_3.PlayerConfig.defaultResourceHost);
            };
            LocalizationHelper.prototype.getResourceHash = function () {
                return this.resHash || (player_config_3.PlayerConfig.resourceHash.indexOf('%playerResourceHash') === -1 ? player_config_3.PlayerConfig.resourceHash : 'latest');
            };
            LocalizationHelper.prototype.queueRequest = function (onCompleteCallback) {
                var _this = this;
                if (LocalizationHelper.requestQueue[this.market]) {
                    LocalizationHelper.requestQueue[this.market].push(onCompleteCallback);
                    return;
                }
                LocalizationHelper.requestQueue[this.market] = [onCompleteCallback];
                var locUrl = stringExtensions_9.format(player_config_3.PlayerConfig.resourcesUrl, this.getCorrectResourceHost(), this.market, this.getResourceHash());
                player_utility_4.PlayerUtility.ajax(locUrl, function (result) {
                    if (result && result.length) {
                        try {
                            LocalizationHelper.resources[_this.market] = JSON.parse(result);
                        }
                        catch (e) {
                            if (_this.onErrorCallback) {
                                _this.onErrorCallback({ errorType: 'oneplayer.error.LocalizationHelper.queueRequest.parse',
                                    errorDesc: 'Parsing error ' + locUrl });
                            }
                        }
                    }
                    else {
                        if (_this.onErrorCallback) {
                            _this.onErrorCallback({ errorType: 'oneplayer.error.LocalizationHelper.queueRequest.ajaxcall',
                                errorDesc: 'No result for file: ' + locUrl });
                        }
                    }
                    _this.completeRequest();
                }, this.completeRequest);
            };
            LocalizationHelper.prototype.completeRequest = function () {
                if (LocalizationHelper.requestQueue[this.market]) {
                    for (var _i = 0, _a = LocalizationHelper.requestQueue[this.market]; _i < _a.length; _i++) {
                        var callback = _a[_i];
                        this.doCallback(callback);
                    }
                    LocalizationHelper.requestQueue[this.market] = null;
                }
            };
            LocalizationHelper.prototype.doCallback = function (onCompleteCallback) {
                if (onCompleteCallback && typeof onCompleteCallback === 'function') {
                    onCompleteCallback();
                }
            };
            LocalizationHelper.prototype.loadResources = function (onCompleteCallback) {
                if (!this.market || LocalizationHelper.resources[this.market]) {
                    this.doCallback(onCompleteCallback);
                    return;
                }
                this.queueRequest(onCompleteCallback);
            };
            LocalizationHelper.prototype.getLocalizedValue = function (key) {
                if (!key) {
                    return '';
                }
                return (LocalizationHelper.resources[this.market] && LocalizationHelper.resources[this.market][key]) ||
                    defaultLocStrings[key] || '';
            };
            LocalizationHelper.prototype.getLanguageNameFromLocale = function (locale) {
                return exports.ccCultureLocStrings[locale] || this.getLocalizedValue(exports.playerLocKeys.unknown_language);
            };
            LocalizationHelper.prototype.getLanguageCodeFromLocale = function (locale) {
                return exports.ccLanguageCodes[locale] || null;
            };
            LocalizationHelper.prototype.getLocalizedMediaTypeName = function (mediaType) {
                if (!mediaType || !downloadableMediaTypeMap[mediaType]) {
                    return '';
                }
                var key = downloadableMediaTypeMap[mediaType];
                return (LocalizationHelper.resources[this.market] && LocalizationHelper.resources[this.market][key]) ||
                    defaultLocStrings[key] || '';
            };
            LocalizationHelper.resources = {};
            LocalizationHelper.requestQueue = {};
            return LocalizationHelper;
        }());
        exports.LocalizationHelper = LocalizationHelper;
    });
    define("controls/video-controls", ["require", "exports", "mwf/utilities/componentFactory", "mwf/slider/slider", "mwf/utilities/utility", "mwf/utilities/htmlExtensions", "helpers/localization-helper", "mwf/utilities/stringExtensions", "utilities/environment"], function (require, exports, componentFactory_1, slider_1, utility_10, htmlExtensions_8, localization_helper_1, stringExtensions_10, environment_3) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.VideoControls = void 0;
        var VideoControls = (function () {
            function VideoControls(videoControls, videoPlayer, localizationHelper, contextMenu) {
                var _this = this;
                this.videoControls = videoControls;
                this.localizationHelper = localizationHelper;
                this.contextMenu = contextMenu;
                this.closeMenuRequested = false;
                this.isEscapeButtonPressed = false;
                this.isWindowZoomedIn = false;
                this.defaultMenuRight = '90px';
                this.focusedMenuItemIndex = 0;
                this.currentVolume = 0;
                this.volumeAutoHideTimer = null;
                this.tooltipElements = [];
                this.reactiveControls = [];
                this.preventKeyUpOnLastButton = false;
                this.reactiveWidths = [
                    100,
                    430,
                    540,
                    650,
                    768,
                    926,
                    1084
                ];
                this.userInteractionCallbacks = [];
                this.activeMenuButton = null;
                this.xboxControlsEnabled = false;
                this.onControlKeyboardEvent = function (event) {
                    var key = utility_10.getKeyCode(event);
                    _this.triggerUserInteractionCallback();
                    switch (key) {
                        case 36:
                            htmlExtensions_8.stopPropagation(event);
                            htmlExtensions_8.preventDefault(event);
                            _this.videoPlayer.seek(_this.toAbsoluteTime(0));
                            break;
                        case 35:
                            htmlExtensions_8.stopPropagation(event);
                            htmlExtensions_8.preventDefault(event);
                            _this.videoPlayer.seek(_this.videoPlayer.getPlayPosition().endTime);
                            break;
                        case 27:
                            if (_this.videoPlayer.isFullScreen()) {
                                htmlExtensions_8.stopPropagation(event);
                            }
                            if (!_this.closeMenuRequested) {
                                window.parent.postMessage(JSON.stringify({
                                    eventName: 'escape',
                                    playerId: utility_10.getQSPValue('pid', false)
                                }), '*');
                            }
                            _this.hideAllMenus();
                            _this.hideVolumeContainer();
                            _this.closeMenuRequested = false;
                            break;
                        case 37:
                        case 39:
                            htmlExtensions_8.stopPropagation(event);
                            htmlExtensions_8.preventDefault(event);
                            var position = _this.videoPlayer.getPlayPosition();
                            if (position) {
                                var currentTime = position.currentTime;
                                var jumpToTime = (key === 37)
                                    ? currentTime - VideoControls.seekSteps
                                    : currentTime + VideoControls.seekSteps;
                                jumpToTime = Math.min(Math.max(position.startTime, jumpToTime), position.endTime);
                                _this.videoPlayer.seek(jumpToTime);
                            }
                            else {
                                _this.videoPlayer.seek(0);
                            }
                            break;
                        case 38:
                        case 40:
                            htmlExtensions_8.stopPropagation(event);
                            htmlExtensions_8.preventDefault(event);
                            _this.showVolumeContainer(true);
                            var volume = _this.videoPlayer.getVolume() * 100;
                            if (key === 38) {
                                _this.setVolume(Math.min((volume + VideoControls.volumeSteps) / 100, 1), true);
                            }
                            else {
                                _this.setVolume(Math.max((volume - VideoControls.volumeSteps) / 100, 0), true);
                            }
                            break;
                    }
                };
                this.focusTrapHandler = function (event) {
                    event = htmlExtensions_8.getEvent(event);
                    var target = htmlExtensions_8.getEventTargetOrSrcElement(event);
                    var key = utility_10.getKeyCode(event);
                    if (key !== 9) {
                        return;
                    }
                    if (target === _this.focusTrapStart && event.shiftKey) {
                        event.preventDefault();
                        if (_this.contextMenu && _this.contextMenu.checkContextMenuIsVisible()) {
                            _this.contextMenu.setFocusOnFirstElement();
                        }
                        else {
                            _this.setFocus(_this.fullScreenButton);
                        }
                    }
                    else if (target === _this.fullScreenButton && !event.shiftKey) {
                        event.preventDefault();
                        if (_this.contextMenu && _this.contextMenu.checkContextMenuIsVisible()) {
                            _this.contextMenu.setFocusOnFirstElement();
                        }
                        else {
                            _this.setFocus(_this.focusTrapStart);
                        }
                    }
                };
                this.onPlayPauseEvents = function (event) {
                    switch (event.type) {
                        case 'click':
                            _this.videoPlayer.setUserInteracted(true);
                            if (_this.videoPlayer.isPaused()) {
                                _this.videoPlayer.setUserIntiatedPause(false);
                                _this.play();
                            }
                            else {
                                _this.videoPlayer.setUserIntiatedPause(true);
                                _this.pause();
                            }
                            break;
                        case 'mouseover':
                        case 'focus':
                            if (environment_3.Environment.isChrome) {
                                if (_this.videoPlayer.isPaused()) {
                                    _this.setAriaLabelForPlayButton();
                                }
                                else {
                                    _this.playButton.setAttribute(VideoControls.ariaLabel, _this.locPause);
                                }
                            }
                            _this.showElement(_this.playTooltip);
                            break;
                        case 'mouseout':
                        case 'blur':
                            _this.hideElement(_this.playTooltip);
                            break;
                    }
                };
                this.onLiveButtonEvents = function (event) {
                    switch (event.type) {
                        case 'click':
                            if (_this.videoPlayer) {
                                _this.videoPlayer.seek(_this.videoPlayer.getPlayPosition().endTime);
                            }
                            break;
                        case 'mouseover':
                        case 'focus':
                            _this.showElement(_this.liveTooltip);
                            break;
                        case 'mouseout':
                        case 'blur':
                            _this.hideElement(_this.liveTooltip);
                            break;
                    }
                };
                this.onVolumeEvents = function (event) {
                    switch (event.type) {
                        case 'click':
                            if (htmlExtensions_8.getEventTargetOrSrcElement(event) === _this.volumeButton) {
                                if (!_this.videoPlayer.isMuted()) {
                                    _this.currentVolume = _this.videoPlayer.getVolume() * 100;
                                    _this.setMuted(true, true);
                                    _this.setVolume(0, false);
                                    _this.videoPlayer.updateScreenReaderElement(_this.locMute);
                                }
                                else {
                                    _this.currentVolume = _this.currentVolume === 0 ? 100 : _this.currentVolume;
                                    _this.setMuted(false, true);
                                    _this.setVolume(Math.min((_this.currentVolume) / 100, 1), false);
                                    _this.videoPlayer.updateScreenReaderElement(_this.locUnmute);
                                }
                            }
                            break;
                        case 'mouseover':
                        case 'focus':
                            if (_this.isEscapeButtonPressed) {
                                _this.isEscapeButtonPressed = false;
                            }
                            else {
                                _this.showVolumeContainer();
                            }
                            break;
                        case 'mouseout':
                        case 'blur':
                            _this.hideVolumeContainer();
                            break;
                    }
                };
                this.onVolumeSliderEvents = function (event) {
                    switch (event.type) {
                        case 'focus':
                            _this.showVolumeContainer();
                            break;
                        case 'blur':
                            _this.hideVolumeContainer();
                            break;
                        case 'keydown':
                            var key = utility_10.getKeyCode(event);
                            _this.showVolumeContainer(true);
                            if (key === 27) {
                                htmlExtensions_8.stopPropagation(event);
                                _this.isEscapeButtonPressed = true;
                                _this.closeMenuRequested = true;
                                _this.hideVolumeContainer();
                                _this.setFocus(_this.volumeButton);
                            }
                    }
                };
                this.onSliderKeyboardEvents = function (event) {
                    var key = utility_10.getKeyCode(event);
                    switch (key) {
                        case 40:
                        case 38:
                        case 37:
                        case 39:
                        case 34:
                        case 33:
                        case 36:
                        case 35:
                            htmlExtensions_8.stopPropagation(event);
                            htmlExtensions_8.preventDefault(event);
                            break;
                    }
                    _this.triggerUserInteractionCallback();
                };
                this.onMoreOptionsEvents = function (event) {
                    switch (event.type) {
                        case 'click':
                            _this.toggleOptionsDialog(false);
                            break;
                        case 'keyup':
                        case 'keydown':
                            var key = utility_10.getKeyCode(htmlExtensions_8.getEvent(event));
                            if (key === 32 || key === 13) {
                                htmlExtensions_8.preventDefault(event);
                                if (event.type === 'keyup') {
                                    _this.toggleOptionsDialog(true);
                                }
                            }
                            break;
                        case 'mouseover':
                        case 'focus':
                            if (!_this.activeMenu) {
                                _this.showElement(_this.moreOptionsTooltip);
                            }
                            break;
                        case 'mouseout':
                        case 'blur':
                            _this.hideElement(_this.moreOptionsTooltip);
                            break;
                    }
                };
                this.onFullScreenEvents = function (event) {
                    switch (event.type) {
                        case 'click':
                            if (!!_this.videoPlayer) {
                                _this.videoPlayer.toggleFullScreen();
                            }
                            break;
                        case 'mouseover':
                        case 'focus':
                            _this.showElement(_this.fullScreenTooltip);
                            break;
                        case 'mouseout':
                        case 'blur':
                            _this.hideElement(_this.fullScreenTooltip);
                            break;
                    }
                };
                this.onMenuButtonClick = function (event) {
                    var target = htmlExtensions_8.getEventTargetOrSrcElement(event);
                    var id = target.getAttribute('data-menu-id');
                    switch (event.type) {
                        case 'click':
                            _this.toggleMenuById(target, false, id);
                            break;
                        case 'keyup':
                        case 'keydown':
                            if (_this.videoControls.getAttribute('aria-hidden') === 'true') {
                                _this.videoControls.setAttribute('aria-hidden', 'false');
                            }
                            var key = utility_10.getKeyCode(htmlExtensions_8.getEvent(event));
                            if (key === 32 || key === 13) {
                                htmlExtensions_8.preventDefault(event);
                                if (event.type === 'keyup' && !_this.preventKeyUpOnLastButton) {
                                    _this.toggleMenuById(target, true, id);
                                }
                                else {
                                    _this.preventKeyUpOnLastButton = false;
                                }
                            }
                            break;
                        case 'mouseover':
                        case 'focus':
                            if (!_this.activeMenu) {
                                _this.showElement(htmlExtensions_8.selectFirstElement('span', target));
                            }
                            break;
                        case 'mouseout':
                        case 'blur':
                            _this.hideElement(htmlExtensions_8.selectFirstElement('span', target));
                            break;
                    }
                };
                this.onMenuEvents = function (event, arrivedViaKeyboard) {
                    switch (event.type) {
                        case 'click':
                            _this.onMenuItemClick(event, arrivedViaKeyboard);
                            break;
                        case 'keyup':
                            var key = utility_10.getKeyCode(event);
                            if (key === 32) {
                                htmlExtensions_8.preventDefault(event);
                            }
                            break;
                        case 'keydown':
                            _this.onMenuKeyPressed(event);
                            break;
                    }
                };
                this.onMenuItemClick = function (event, arrivedViaKeyboard) {
                    event = htmlExtensions_8.getEvent(event);
                    var target = htmlExtensions_8.getEventTargetOrSrcElement(event);
                    var nextMenuId = target.getAttribute('data-next-menu');
                    htmlExtensions_8.preventDefault(event);
                    if (nextMenuId === 'back') {
                        var label = target.getAttribute('aria-label');
                        var reactiveAriaLabel = _this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.reactive_menu_aria_label).replace('{0}', '');
                        if (htmlExtensions_8.hasClass(target, 'closed-caption')) {
                            reactiveAriaLabel = _this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.reactive_menu_aria_label_closedcaption).replace('{0}', '');
                        }
                        if (!!label && label.indexOf(reactiveAriaLabel) >= 0) {
                            _this.focusOnLastButton();
                            _this.preventKeyUpOnLastButton = true;
                            return;
                        }
                        var previousMenu = _this.menuBackStack.pop();
                        if (previousMenu) {
                            _this.showMenu(previousMenu, arrivedViaKeyboard);
                        }
                        return;
                    }
                    if (nextMenuId) {
                        _this.activeMenu && _this.pushToMenuBackStack(_this.activeMenu.id);
                        _this.showMenu(nextMenuId, arrivedViaKeyboard);
                        return;
                    }
                    if (_this.activeMenu) {
                        var targetParent = target.parentElement;
                        var id = targetParent.id || (targetParent.parentElement && targetParent.parentElement.id);
                        var data = target.getAttribute('data-info') || targetParent.getAttribute('data-info');
                        _this.updateMenuSelection(_this.activeMenu.id, id);
                        if (!!_this.videoPlayer) {
                            _this.videoPlayer.onPlayerMenuItemClick({
                                category: _this.activeMenu.getAttribute('data-category'),
                                id: id,
                                data: data
                            });
                        }
                    }
                    if (!target.getAttribute('data-persist')) {
                        _this.hideAllMenus();
                    }
                };
                this.hideAllMenus = function (isControlPanelTimeout) {
                    var menus = htmlExtensions_8.selectElements(VideoControls.menuSelector, _this.menuContainer);
                    for (var _i = 0, menus_1 = menus; _i < menus_1.length; _i++) {
                        var menu = menus_1[_i];
                        _this.hideElement(menu);
                    }
                    _this.activeMenu = null;
                    _this.clearMenuBackStack();
                    _this.updateReactiveControlDisplay();
                    _this.optionsButton.setAttribute('aria-expanded', 'false');
                    if (!!_this.activeMenuButton) {
                        _this.activeMenuButton.setAttribute('aria-expanded', 'false');
                        if (isControlPanelTimeout) {
                            _this.activeMenuButton.focus();
                        }
                        _this.activeMenuButton = null;
                    }
                    _this.menuContainer.setAttribute('aria-hidden', 'true');
                };
                if (!videoControls || !videoPlayer) {
                    return;
                }
                this.videoPlayer = videoPlayer;
                this.videoTitle = this.videoPlayer.getVideoTitle();
                this.initializeLocalization();
                this.initializeComponents();
                if (!this.playButton || !this.playTooltip ||
                    !this.fullScreenButton || !this.fullScreenTooltip ||
                    !this.liveButton || !this.liveTooltip ||
                    !this.progressSliderElement || !this.volumeButton ||
                    !this.volumeContainer || !this.volumeSliderElement ||
                    !this.timeElement || !this.timeCurrent || !this.timeDuration ||
                    !this.optionsButton || !this.menuContainer || !!this.xboxControlsEnabled) {
                    return null;
                }
                this.focusTrapStart = this.playButton;
                this.updatePlayPauseState();
                this.isWindowZoomedIn = Math.round(window.devicePixelRatio * 100) > 100;
                htmlExtensions_8.addEvent(window, htmlExtensions_8.eventTypes.resize, function () {
                    _this.isWindowZoomedIn = Math.round(window.devicePixelRatio * 100) > 100;
                    _this.hideAllMenus();
                });
                htmlExtensions_8.addEvent(window, htmlExtensions_8.eventTypes.scroll, function () {
                    !_this.isWindowZoomedIn && _this.hideAllMenus();
                });
                htmlExtensions_8.addEvent(this.videoControls, htmlExtensions_8.eventTypes.keydown, this.onControlKeyboardEvent);
                htmlExtensions_8.addEvents(this.playButton, 'click mouseover mouseout focus blur', this.onPlayPauseEvents);
                htmlExtensions_8.addEvents(this.liveButton, 'click mouseover mouseout focus blur', this.onLiveButtonEvents);
                htmlExtensions_8.addEvents(this.fullScreenButton, 'click mouseover mouseout focus blur', this.onFullScreenEvents);
                htmlExtensions_8.addEvents([this.volumeButton, this.volumeContainer], 'click mouseover mouseout focus blur', this.onVolumeEvents);
                htmlExtensions_8.addEvents(this.optionsButton, 'click mouseover mouseout focus blur keydown keyup', this.onMoreOptionsEvents);
                componentFactory_1.ComponentFactory.create([{
                        component: slider_1.Slider,
                        eventToBind: 'DOMContentLoaded',
                        elements: [this.progressSliderElement, this.volumeSliderElement],
                        callback: function (results) {
                            if (!!results && !!results.length && (results.length === 2)) {
                                _this.progressSlider = results[0];
                                _this.volumeSlider = results[1];
                                _this.progressSlider.subscribe({
                                    'onValueChanged': function (notification) { return _this.onProgressChanged(notification); }
                                });
                                _this.volumeSlider.subscribe({
                                    'onValueChanged': function (notification) { return _this.onVolumeChanged(notification); }
                                });
                                htmlExtensions_8.addEvents(htmlExtensions_8.selectFirstElement('button', _this.volumeSliderElement), 'focus blur keydown', _this.onVolumeSliderEvents);
                                htmlExtensions_8.addEvents([_this.progressSliderElement, _this.volumeSliderElement], 'keydown', _this.onSliderKeyboardEvents);
                            }
                        }
                    }]);
            }
            VideoControls.prototype.getSeekSteps = function () {
                return VideoControls.seekSteps;
            };
            VideoControls.prototype.getAriaLabel = function () {
                return VideoControls.ariaLabel;
            };
            VideoControls.prototype.getLocalizationHelper = function () {
                return this.localizationHelper;
            };
            VideoControls.prototype.getVideoPlayer = function () {
                return this.videoPlayer;
            };
            VideoControls.prototype.setVideoControls = function (v) {
                this.videoControls = v;
            };
            VideoControls.prototype.getVideoControls = function () {
                return this.videoControls;
            };
            VideoControls.prototype.setPlayButton = function (v) {
                this.playButton = v;
            };
            VideoControls.prototype.getPlayButton = function () {
                return this.playButton;
            };
            VideoControls.prototype.setLiveButton = function (v) {
                this.liveButton = v;
            };
            VideoControls.prototype.getLiveButton = function () {
                return this.liveButton;
            };
            VideoControls.prototype.setTimeElement = function (v) {
                this.timeElement = v;
            };
            VideoControls.prototype.getTimeElement = function () {
                return this.timeElement;
            };
            VideoControls.prototype.setTimeCurrent = function (v) {
                this.timeCurrent = v;
            };
            VideoControls.prototype.getTimeCurrent = function () {
                return this.timeCurrent;
            };
            VideoControls.prototype.setTimeDuration = function (v) {
                this.timeDuration = v;
            };
            VideoControls.prototype.getTimeDuration = function () {
                return this.timeDuration;
            };
            VideoControls.prototype.setProgressSliderElement = function (v) {
                this.progressSliderElement = v;
            };
            VideoControls.prototype.getProgressSliderElement = function () {
                return this.progressSliderElement;
            };
            VideoControls.prototype.setOptionsButton = function (v) {
                this.optionsButton = v;
            };
            VideoControls.prototype.getOptionsButton = function () {
                return this.optionsButton;
            };
            VideoControls.prototype.setMenuContainer = function (v) {
                this.menuContainer = v;
            };
            VideoControls.prototype.getMenuContainer = function () {
                return this.menuContainer;
            };
            VideoControls.prototype.setVolumeButton = function (v) {
                this.volumeButton = v;
            };
            VideoControls.prototype.getVolumeButton = function () {
                return this.volumeButton;
            };
            VideoControls.prototype.setFullScreenButton = function (v) {
                this.fullScreenButton = v;
            };
            VideoControls.prototype.getFullScreenButton = function () {
                return this.fullScreenButton;
            };
            VideoControls.prototype.setXboxControlsEnabled = function (v) {
                this.xboxControlsEnabled = v;
            };
            VideoControls.prototype.initializeComponents = function () {
                if (!this.videoControls) {
                    return;
                }
                var locLive = this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.live_caption);
                var locLiveLabel = this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.live_label);
                var locSeek = this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.seek);
                var locMore = this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.more_caption);
                var locVolume = this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.volume);
                if (!this.videoControls.children.length) {
                    var controlHtml = "<button type='button' class='f-play-pause c-glyph glyph-play' aria-label='" + this.locPlay + "' role='button'>\n    <span aria-hidden='true'>" + this.locPlay + "</span>\n</button>\n<button type='button' class='f-live f-live-current c-glyph glyph-view' aria-label='" + locLive + "' aria-hidden='true'>\n    <span aria-hidden='true'>" + locLive + "</span>\n    " + locLiveLabel + "\n</button>\n<span class='f-time'>\n    <span class='f-current-time'>00:00</span>\n    /\n    <span class='f-duration'>00:00</span>\n</span>\n<div class='c-slider f-progress'>\n    <input type='range' class='f-seek-bar' aria-label='" + locSeek + "' value='0' min='0' tabindex='-1' step=" + VideoControls.seekSteps + ">\n</div>\n<button type='button' class='f-options c-glyph glyph-more' aria-label='" + locMore + "' aria-expanded='false'>\n    <span aria-hidden='true'>" + locMore + "</span>\n</button>\n<div class='f-menu-container'></div>\n<button type='button' class='f-volume-button c-glyph glyph-volume' aria-label='" + this.locMute + "'></button>\n<div class='f-volume-slider' data-show='false' role='presentation'>\n    <div class='c-slider f-vertical' role='presentation'>\n        <input type='range' class='f-volume-bar f-vertical' aria-label='" + locVolume + "' \n            min='0' max='100' step='" + VideoControls.volumeSteps + "' value='100' tabindex='-1'>\n    </div>\n</div>\n<button type='button' class='f-full-screen c-glyph glyph-full-screen' aria-label='" + this.locFullScreen + "'>\n    <span aria-hidden='true'>" + this.locFullScreen + "</span>\n</button>";
                    this.videoControls.innerHTML = controlHtml;
                }
                this.playButton = htmlExtensions_8.selectFirstElementT('.f-play-pause', this.videoControls);
                this.setAriaLabelForPlayButton();
                this.playTooltip = htmlExtensions_8.selectFirstElement('span', this.playButton);
                htmlExtensions_8.setText(this.playTooltip, this.locPlay);
                this.tooltipElements.push(this.playTooltip);
                this.liveButton = htmlExtensions_8.selectFirstElementT('.f-live', this.videoControls);
                this.liveTooltip = htmlExtensions_8.selectFirstElement('span', this.liveButton);
                this.tooltipElements.push(this.liveTooltip);
                this.timeElement = htmlExtensions_8.selectFirstElement('.f-time', this.videoControls);
                this.timeCurrent = htmlExtensions_8.selectFirstElement('.f-current-time', this.timeElement);
                this.timeDuration = htmlExtensions_8.selectFirstElement('.f-duration', this.timeElement);
                this.progressSliderElement = htmlExtensions_8.selectFirstElement('.c-slider.f-progress', this.videoControls);
                this.optionsButton = htmlExtensions_8.selectFirstElementT('.f-options', this.videoControls);
                this.optionsButton.setAttribute(VideoControls.ariaLabel, this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.more_caption));
                this.moreOptionsTooltip = htmlExtensions_8.selectFirstElement('span', this.optionsButton);
                htmlExtensions_8.setText(this.moreOptionsTooltip, locMore);
                this.tooltipElements.push(this.moreOptionsTooltip);
                this.menuContainer = htmlExtensions_8.selectFirstElement('.f-menu-container', this.videoControls);
                this.volumeButton = htmlExtensions_8.selectFirstElementT('.f-volume-button', this.videoControls);
                this.volumeButton.setAttribute(VideoControls.ariaLabel, this.locMute);
                this.volumeContainer = htmlExtensions_8.selectFirstElement('.f-volume-slider', this.videoControls);
                this.volumeSliderElement = htmlExtensions_8.selectFirstElement('.c-slider', this.volumeContainer);
                this.fullScreenButton = htmlExtensions_8.selectFirstElementT('.f-full-screen', this.videoControls);
                this.fullScreenButton.setAttribute(VideoControls.ariaLabel, this.locFullScreen);
                this.fullScreenTooltip = htmlExtensions_8.selectFirstElement('span', this.fullScreenButton);
                htmlExtensions_8.setText(this.fullScreenTooltip, this.locFullScreen);
                this.tooltipElements.push(this.fullScreenTooltip);
            };
            VideoControls.prototype.setAriaLabelForPlayButton = function () {
                if (this.videoTitle !== '') {
                    this.playButton.setAttribute(VideoControls.ariaLabel, this.locPlay +
                        ' ' + this.videoTitle);
                }
                else {
                    this.playButton.setAttribute(VideoControls.ariaLabel, this.locPlayVideo);
                }
            };
            VideoControls.prototype.initializeLocalization = function () {
                this.locPlay = this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.play);
                this.locPlayVideo = this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.play_video);
                this.locPlaying = this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.playing);
                this.locPaused = this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.paused);
                this.locPause = this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.pause);
                this.locMute = this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.mute);
                this.locUnmute = this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.unmute);
                this.locFullScreen = this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.expand);
                this.locExitFullScreen = this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.unexpand);
            };
            VideoControls.prototype.setPlayPosition = function (position) {
                if (!this.videoPlayer || !position) {
                    this.playPosition = undefined;
                    return;
                }
                var dvrLength = position.endTime - position.startTime;
                var previousDvrLength = (this.playPosition) ? this.playPosition.endTime - this.playPosition.startTime : 0;
                var isLive = this.videoPlayer.isLive();
                if (isLive) {
                    var absTimeDifference = Math.abs(position.currentTime - position.endTime);
                    var relTimeDifference = absTimeDifference / (position.endTime - position.startTime);
                    if (absTimeDifference < 20 || relTimeDifference < 0.01) {
                        htmlExtensions_8.addClass(this.liveButton, 'f-live-current');
                    }
                    else {
                        htmlExtensions_8.removeClass(this.liveButton, 'f-live-current');
                    }
                }
                if (isNaN(dvrLength)
                    || isNaN(previousDvrLength)
                    || Math.abs(dvrLength - previousDvrLength) > 1
                    || !this.playPosition) {
                    if (this.progressSlider) {
                        this.progressSlider.resetSlider(0, dvrLength, position.currentTime - position.startTime, VideoControls.seekSteps);
                    }
                    if (this.timeDuration) {
                        htmlExtensions_8.setText(this.timeDuration, utility_10.toElapsedTimeString(dvrLength, false));
                    }
                }
                else {
                    if (this.progressSlider) {
                        this.progressSlider.setValue(position.currentTime - position.startTime);
                    }
                }
                if (this.timeCurrent) {
                    var displayTime = isLive ? position.currentTime - position.endTime : position.currentTime;
                    htmlExtensions_8.setText(this.timeCurrent, utility_10.toElapsedTimeString(displayTime, false));
                }
                this.playPosition = utility_10.extend({}, position);
            };
            VideoControls.prototype.addUserInteractionListener = function (callback) {
                callback && this.userInteractionCallbacks.push(callback);
            };
            VideoControls.prototype.triggerUserInteractionCallback = function () {
                if (this.userInteractionCallbacks && this.userInteractionCallbacks.length) {
                    for (var _i = 0, _a = this.userInteractionCallbacks; _i < _a.length; _i++) {
                        var callback = _a[_i];
                        callback();
                    }
                }
            };
            VideoControls.prototype.setVolume = function (volume, isUserInitiated) {
                if (utility_10.isNumber(volume) && !!this.videoPlayer) {
                    this.videoPlayer.setVolume(volume, isUserInitiated);
                }
            };
            VideoControls.prototype.setMuted = function (muted, isUserInitiated) {
                if (!!this.videoPlayer) {
                    muted ? this.videoPlayer.mute(isUserInitiated) : this.videoPlayer.unmute(isUserInitiated);
                }
            };
            VideoControls.prototype.updateVolumeState = function () {
                this.updateMuteGlyph();
                if (!!this.videoPlayer && !!this.volumeSlider) {
                    var isMuted = this.videoPlayer.isMuted() || (this.videoPlayer.getVolume() === 0);
                    if (isMuted) {
                        this.volumeSlider.setValue(0);
                    }
                    else {
                        var volume = this.videoPlayer.getVolume();
                        this.volumeSlider.setValue(Math.round(volume * 100));
                    }
                }
            };
            VideoControls.prototype.updateMuteGlyph = function () {
                if (!!this.videoPlayer && !!this.volumeButton) {
                    htmlExtensions_8.removeClasses(this.volumeButton, ['glyph-volume', 'glyph-mute']);
                    var isMuted = this.videoPlayer.isMuted() || (this.videoPlayer.getVolume() === 0);
                    htmlExtensions_8.addClass(this.volumeButton, isMuted ? 'glyph-mute' : 'glyph-volume');
                    this.volumeButton.setAttribute(VideoControls.ariaLabel, isMuted ? this.locUnmute : this.locMute);
                }
            };
            VideoControls.prototype.prepareToHide = function () {
                this.hideAllMenus(true);
                this.hideVolumeContainer();
            };
            VideoControls.prototype.hideControls = function () {
                var _this = this;
                setTimeout(function () {
                    for (var _i = 0, _a = _this.tooltipElements; _i < _a.length; _i++) {
                        var tooltip = _a[_i];
                        _this.hideElement(tooltip);
                    }
                }, 0);
            };
            VideoControls.prototype.onProgressChanged = function (notification) {
                if (!notification || !this.videoPlayer) {
                    return null;
                }
                var displayTime;
                var isLive = this.videoPlayer.isLive();
                if (isLive) {
                    var position = this.videoPlayer.getPlayPosition();
                    displayTime = notification.value + position.startTime - position.endTime;
                }
                else {
                    displayTime = notification.value;
                    if (this.timeCurrent) {
                        htmlExtensions_8.setText(this.timeCurrent, utility_10.toElapsedTimeString(displayTime, false));
                    }
                }
                if (this.videoPlayer && notification.userInitiated) {
                    this.videoPlayer.seek(this.toAbsoluteTime(notification.value));
                }
                return utility_10.toElapsedTimeString(displayTime, !isLive);
            };
            VideoControls.prototype.toAbsoluteTime = function (relTime) {
                if (this.videoPlayer && this.videoPlayer.isLive()) {
                    return relTime + this.videoPlayer.getPlayPosition().startTime;
                }
                return relTime;
            };
            VideoControls.prototype.onVolumeChanged = function (notification) {
                if (!notification) {
                    return null;
                }
                if (!!this.videoPlayer && (notification.value > 0)) {
                    this.setMuted(false);
                }
                if (!!this.videoPlayer && (notification.value === 0)) {
                    this.setMuted(true);
                }
                var volume = Math.round(notification.value);
                if (notification.userInitiated) {
                    this.setVolume(volume / 100, true);
                }
                return volume.toString();
            };
            VideoControls.prototype.play = function () {
                if (!!this.videoPlayer) {
                    this.videoPlayer.play();
                    this.videoPlayer.updateScreenReaderElement(this.locPlaying);
                }
            };
            VideoControls.prototype.pause = function () {
                if (!!this.videoPlayer) {
                    this.videoPlayer.pause(true);
                    this.videoPlayer.updateScreenReaderElement(this.locPaused);
                }
            };
            VideoControls.prototype.updatePlayPauseState = function () {
                if (!!this.videoPlayer && !!this.playButton) {
                    if (this.videoPlayer.isPlayable()) {
                        this.playButton.removeAttribute('disabled');
                        if (this.videoPlayer.isPaused()) {
                            if (!!this.playTooltip) {
                                htmlExtensions_8.setText(this.playTooltip, this.locPlay);
                            }
                            htmlExtensions_8.removeClass(this.playButton, 'glyph-pause');
                            htmlExtensions_8.addClass(this.playButton, 'glyph-play');
                            this.setAriaLabelForPlayButton();
                        }
                        else {
                            if (!!this.playTooltip) {
                                htmlExtensions_8.setText(this.playTooltip, this.locPause);
                            }
                            htmlExtensions_8.removeClass(this.playButton, 'glyph-play');
                            htmlExtensions_8.addClass(this.playButton, 'glyph-pause');
                            this.playButton.setAttribute(VideoControls.ariaLabel, this.locPause);
                            this.prepareToHide();
                        }
                    }
                    else {
                        if (!!this.playTooltip) {
                            htmlExtensions_8.setText(this.playTooltip, this.locPlay);
                        }
                        htmlExtensions_8.removeClass(this.playButton, 'glyph-pause');
                        htmlExtensions_8.addClass(this.playButton, 'glyph-play');
                        this.setAriaLabelForPlayButton();
                        this.playButton.setAttribute('disabled', 'disabled');
                    }
                }
            };
            VideoControls.prototype.setLive = function (isLive) {
                if (!this.liveButton || !this.timeElement) {
                    return;
                }
                this.liveButton.setAttribute(VideoControls.ariaHidden, isLive ? 'false' : 'true');
                this.timeElement.setAttribute(VideoControls.ariaHidden, isLive ? 'true' : 'false');
            };
            VideoControls.prototype.updateFullScreenState = function () {
                if (!this.videoPlayer || !this.fullScreenButton) {
                    return;
                }
                var isExpanded = this.videoPlayer.isFullScreen();
                if (isExpanded) {
                    htmlExtensions_8.removeClass(this.fullScreenButton, 'glyph-full-screen');
                    htmlExtensions_8.addClass(this.fullScreenButton, 'glyph-back-to-window');
                    this.setFocus(this.fullScreenButton);
                }
                else {
                    htmlExtensions_8.removeClass(this.fullScreenButton, 'glyph-back-to-window');
                    htmlExtensions_8.addClass(this.fullScreenButton, 'glyph-full-screen');
                }
                var newText = isExpanded ? this.locExitFullScreen : this.locFullScreen;
                this.fullScreenButton.setAttribute('aria-label', newText);
                if (!!this.fullScreenTooltip) {
                    htmlExtensions_8.setText(this.fullScreenTooltip, newText);
                    this.videoPlayer.updateScreenReaderElement(newText);
                }
            };
            VideoControls.prototype.setFocusOnControlBar = function () {
                this.setFocus(this.playButton);
            };
            VideoControls.prototype.setFocusTrap = function (trapStart) {
                if (trapStart === null) {
                    trapStart = this.playButton;
                }
                this.focusTrapStart = trapStart;
                htmlExtensions_8.addEvent([trapStart, this.fullScreenButton], htmlExtensions_8.eventTypes.keydown, this.focusTrapHandler);
            };
            VideoControls.prototype.removeFocusTrap = function () {
                htmlExtensions_8.removeEvents([this.focusTrapStart, this.fullScreenButton], 'keydown', this.focusTrapHandler);
            };
            VideoControls.prototype.showVolumeContainer = function (autohide) {
                var _this = this;
                if (!!this.volumeContainer) {
                    this.volumeContainer.setAttribute('data-show', 'true');
                    this.onlyOneDialog(this.volumeContainer);
                    clearTimeout(this.volumeAutoHideTimer);
                    if (autohide && document.activeElement !== this.volumeButton) {
                        this.volumeAutoHideTimer = setTimeout(function () {
                            _this.hideVolumeContainer();
                        }, VideoControls.volumeAutoHideTimeout);
                    }
                }
            };
            VideoControls.prototype.hideVolumeContainer = function () {
                this.volumeContainer.setAttribute('data-show', 'false');
                clearTimeout(this.volumeAutoHideTimer);
            };
            VideoControls.prototype.showElement = function (element) {
                element && element.setAttribute(VideoControls.ariaHidden, 'false');
            };
            VideoControls.prototype.hideElement = function (element) {
                element && element.setAttribute(VideoControls.ariaHidden, 'true');
            };
            VideoControls.prototype.toggleMenuById = function (button, arrivedViaKeyboard, id) {
                if (this.activeMenu && this.activeMenu.id === id) {
                    this.hideAllMenus();
                }
                else {
                    button.setAttribute('aria-expanded', 'true');
                    this.showMenu(id, arrivedViaKeyboard, button);
                    var menuButton = htmlExtensions_8.selectFirstElement('button', this.activeMenu);
                    if (!!menuButton) {
                        htmlExtensions_8.removeClass(menuButton, 'glyph-chevron-left');
                    }
                }
            };
            VideoControls.prototype.resetMenuPosition = function (menu, button) {
                var elements = htmlExtensions_8.selectElements('.f-player-menu', this.videoControls);
                if (!!elements && elements.length > 0) {
                    for (var i = 0; i < elements.length; i++) {
                        var button_1 = htmlExtensions_8.selectFirstElement('button', elements[i]);
                        if (!!button_1 && button_1.hasAttribute('data-next-menu')) {
                            htmlExtensions_8.addClass(button_1, 'glyph-chevron-left');
                        }
                    }
                }
                if (!!button) {
                    this.menuRight = htmlExtensions_8.css(button, 'right');
                }
                htmlExtensions_8.css(menu, 'right', this.menuRight);
            };
            VideoControls.prototype.createReactiveButton = function (glyph, priority, id, label, cssClass) {
                var exists = this.hasReactiveClass(glyph);
                if (!exists) {
                    var tooltipString = "<span aria-hidden='true'>" + label + "</span>";
                    var buttonString = "\n            <button class='f-reactive c-glyph " + glyph + " " + cssClass + "' aria-label='" + label + "' aria-hidden='true' \n            data-menu-id='" + id + "' aria-expanded='false'>\n                " + tooltipString + "\n            </button>";
                    var tempDiv = document.createElement('div');
                    tempDiv.innerHTML = buttonString;
                    var button = htmlExtensions_8.selectFirstElementT('button', tempDiv);
                    this.videoControls.insertBefore(button, this.optionsButton);
                    htmlExtensions_8.setText(button.firstElementChild, label);
                    this.tooltipElements.push(button.firstElementChild);
                    htmlExtensions_8.addEvents(button, 'click mouseover mouseout focus blur keydown keyup', this.onMenuButtonClick);
                    this.reactiveControls.push({
                        button: button,
                        priority: priority
                    });
                    this.sortReactiveControls();
                }
            };
            VideoControls.prototype.sortReactiveControls = function () {
                this.reactiveControls.sort(function (a, b) {
                    if (a.priority < b.priority) {
                        return -1;
                    }
                    else if (a.priority > b.priority) {
                        return 1;
                    }
                    return 0;
                });
            };
            VideoControls.prototype.hasReactiveClass = function (cssClass) {
                for (var i = 0; i < this.reactiveControls.length; i++) {
                    if (htmlExtensions_8.hasClass(this.reactiveControls[i].button, cssClass)) {
                        return true;
                    }
                }
                return false;
            };
            VideoControls.prototype.toggleReactiveButtonLabelAndHandlers = function (reactiveControl, visible) {
                var id = reactiveControl.button.getAttribute('data-menu-id');
                var menu = document.getElementById(id);
                if (!!menu) {
                    var titleButton = menu.getElementsByTagName('button')[0];
                    if (!!titleButton && titleButton.hasAttribute('data-next-menu')) {
                        var previousAriaLabel = this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.previous_menu_aria_label).replace('{0}', '');
                        var reactiveAriaLabel = this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.reactive_menu_aria_label).replace('{0}', '');
                        if (htmlExtensions_8.hasClass(titleButton, 'closed-caption')) {
                            reactiveAriaLabel = this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.reactive_menu_aria_label_closedcaption).replace('{0}', '');
                        }
                        var label = titleButton.getAttribute('aria-label');
                        if (!label || label.indexOf(previousAriaLabel) !== -1 && label.indexOf(reactiveAriaLabel) !== -1) {
                            return;
                        }
                        label = label.replace(previousAriaLabel, '').replace(reactiveAriaLabel, '');
                        if (visible) {
                            titleButton.setAttribute('aria-label', stringExtensions_10.format(this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.previous_menu_aria_label), label));
                        }
                        else {
                            if (htmlExtensions_8.hasClass(titleButton, 'closed-caption')) {
                                titleButton.setAttribute('aria-label', stringExtensions_10.format(this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.reactive_menu_aria_label_closedcaption), label));
                            }
                            else {
                                titleButton.setAttribute('aria-label', stringExtensions_10.format(this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.reactive_menu_aria_label), label));
                            }
                        }
                    }
                }
            };
            VideoControls.prototype.toggleMoreOptionsItemVisibility = function (reactiveControl, visible) {
                var id = reactiveControl.button.getAttribute('data-menu-id');
                if (!!id) {
                    var subMenuElement = document.getElementById(id + '_item');
                    if (!!subMenuElement && !!subMenuElement.parentElement && !!subMenuElement.parentElement.parentElement) {
                        var optionsContainer = subMenuElement.parentElement.parentElement;
                        if (visible) {
                            subMenuElement.setAttribute(VideoControls.ariaHidden, 'false');
                            htmlExtensions_8.addClass((subMenuElement.firstElementChild), 'active');
                        }
                        else {
                            subMenuElement.setAttribute(VideoControls.ariaHidden, 'true');
                            htmlExtensions_8.removeClass((subMenuElement.firstElementChild), 'active');
                        }
                        var liArray = optionsContainer.querySelectorAll('li');
                        var optionsContainerHeight = 0;
                        for (var i = 0; i < liArray.length; i++) {
                            var hidden = liArray[i].getAttribute(VideoControls.ariaHidden);
                            if (!hidden || hidden === 'false') {
                                optionsContainerHeight += 40;
                            }
                        }
                        if (optionsContainerHeight !== 0) {
                            this.optionsButton.setAttribute(VideoControls.ariaHidden, 'false');
                            htmlExtensions_8.css(optionsContainer, 'height', (optionsContainerHeight + 4) + 'px');
                            var itemCount = optionsContainerHeight / 40;
                            var itemIndex = 1;
                            for (var j = 0; j < liArray.length; j++) {
                                var hidden = liArray[j].getAttribute(VideoControls.ariaHidden);
                                if (!hidden || hidden === 'false') {
                                    liArray[j].firstElementChild.setAttribute('aria-setsize', itemCount.toString());
                                    liArray[j].firstElementChild.setAttribute('aria-posinset', itemIndex.toString());
                                    itemIndex++;
                                }
                            }
                        }
                        else {
                            this.optionsButton.setAttribute(VideoControls.ariaHidden, 'true');
                        }
                    }
                }
            };
            VideoControls.prototype.updateReactiveControlDisplay = function () {
                var padding = parseInt(htmlExtensions_8.css(this.optionsButton, 'padding-right'), 10);
                var rightButtonPosition = utility_10.getDimensions(this.optionsButton).width + padding;
                if (this.reactiveControls.length > 0) {
                    var controlBarWidth = utility_10.getDimensions(this.videoControls).width;
                    if (controlBarWidth !== 0) {
                        var controlBarOffset = rightButtonPosition * 3;
                        var setInitialBarOffset = true;
                        for (var i = (this.reactiveControls.length - 1); i >= 0; i--) {
                            var reactiveControl = this.reactiveControls[i];
                            if (controlBarWidth < this.reactiveWidths[reactiveControl.priority]) {
                                this.toggleReactiveButtonLabelAndHandlers(reactiveControl, true);
                                this.toggleMoreOptionsItemVisibility(reactiveControl, true);
                                reactiveControl.button.setAttribute(VideoControls.ariaHidden, 'true');
                            }
                            else if (controlBarWidth > this.reactiveWidths[reactiveControl.priority]) {
                                this.toggleReactiveButtonLabelAndHandlers(reactiveControl, false);
                                this.toggleMoreOptionsItemVisibility(reactiveControl, false);
                                if (this.optionsButton.getAttribute(VideoControls.ariaHidden) === 'true' && setInitialBarOffset) {
                                    controlBarOffset = rightButtonPosition * 2;
                                    setInitialBarOffset = false;
                                }
                                reactiveControl.button.setAttribute(VideoControls.ariaHidden, 'false');
                                htmlExtensions_8.css(reactiveControl.button, 'right', (2 + controlBarOffset) + 'px');
                                if (htmlExtensions_8.hasClass(reactiveControl.button, 'f-volume-button')) {
                                    htmlExtensions_8.css(this.volumeContainer, 'right', (2 + controlBarOffset) + 'px');
                                }
                                controlBarOffset += rightButtonPosition;
                            }
                        }
                        htmlExtensions_8.css(this.progressSliderElement, 'width', 'calc(100% - ' + (controlBarOffset + 140) + 'px)');
                    }
                }
            };
            VideoControls.prototype.initializePlayerMenus = function () {
                var menuItems = htmlExtensions_8.selectElements(VideoControls.menuSelector + ' ul', this.menuContainer);
                if (menuItems && menuItems.length) {
                    htmlExtensions_8.addEvents(menuItems, 'click keydown keyup', this.onMenuEvents);
                }
            };
            VideoControls.prototype.disposeReactiveControls = function () {
                for (var _i = 0, _a = this.reactiveControls; _i < _a.length; _i++) {
                    var reactiveControl = _a[_i];
                    htmlExtensions_8.removeElement(reactiveControl.button);
                }
                this.reactiveControls = [];
            };
            VideoControls.prototype.disposePlayerMenus = function () {
                var menuItems = htmlExtensions_8.selectElements(VideoControls.menuSelector + ' ul', this.menuContainer);
                if (menuItems && menuItems.length) {
                    htmlExtensions_8.removeEvents(menuItems, 'click keydown keyup', this.onMenuEvents);
                }
                htmlExtensions_8.removeInnerHtml(this.menuContainer);
                this.disposeReactiveControls();
            };
            VideoControls.prototype.toggleOptionsDialog = function (arrivedViaKeyboard) {
                if (this.activeMenu && htmlExtensions_8.css(this.activeMenu, 'right') === this.defaultMenuRight) {
                    this.hideAllMenus();
                }
                else {
                    this.showMenu(this.optionsButton.getAttribute('data-menu-id'), arrivedViaKeyboard, this.optionsButton);
                    this.optionsButton.setAttribute('aria-expanded', 'true');
                }
            };
            VideoControls.prototype.onlyOneDialog = function (dialog) {
                if (!!this.activeMenu && !!this.volumeContainer &&
                    (this.activeMenu.getAttribute(VideoControls.ariaHidden) === 'false') &&
                    (this.volumeContainer.getAttribute('data-show') === 'true')) {
                    if (dialog === this.activeMenu) {
                        this.hideVolumeContainer();
                    }
                    else {
                        this.hideAllMenus();
                    }
                }
            };
            VideoControls.prototype.onMenuKeyPressed = function (event) {
                var key = utility_10.getKeyCode(event);
                var target = htmlExtensions_8.getEventTargetOrSrcElement(event);
                var targetParent = target && target.parentElement;
                if (!this.activeMenu || !targetParent) {
                    return;
                }
                var activeMenuId = this.activeMenu.id;
                this.triggerUserInteractionCallback();
                switch (key) {
                    case 37:
                    case 39:
                        htmlExtensions_8.stopPropagation(event);
                        htmlExtensions_8.preventDefault(event);
                        if (target.getAttribute('data-next-menu')) {
                            this.onMenuItemClick(event, true);
                        }
                        break;
                    case 13:
                    case 32:
                        htmlExtensions_8.preventDefault(event);
                        this.onMenuItemClick(event, true);
                        if (!!this.activeMenu) {
                            var menuButtons = this.activeMenu.getElementsByTagName('button');
                            var buttonIndex = 0;
                            if (!!menuButtons && menuButtons.length > 0) {
                                for (var i = 0; i < menuButtons.length; i++) {
                                    if (menuButtons[i].getAttribute('data-next-menu') === activeMenuId) {
                                        this.setFocus(menuButtons[i]);
                                        this.focusedMenuItemIndex = buttonIndex;
                                    }
                                    else if (htmlExtensions_8.hasClass(menuButtons[i], 'active')) {
                                        buttonIndex++;
                                    }
                                }
                            }
                        }
                        break;
                    case 38:
                    case 40:
                        htmlExtensions_8.stopPropagation(event);
                        htmlExtensions_8.preventDefault(event);
                        var activeMenuItems = htmlExtensions_8.selectElements('.active', this.activeMenu);
                        if (activeMenuItems && activeMenuItems.length) {
                            if (key === 38) {
                                this.focusedMenuItemIndex -= 1;
                                if (this.focusedMenuItemIndex < 0) {
                                    this.focusedMenuItemIndex = activeMenuItems.length - 1;
                                }
                            }
                            else {
                                this.focusedMenuItemIndex = ((this.focusedMenuItemIndex + 1) % activeMenuItems.length);
                            }
                            this.setFocus(activeMenuItems[this.focusedMenuItemIndex]);
                        }
                        break;
                    case 33:
                    case 36:
                        htmlExtensions_8.stopPropagation(event);
                        htmlExtensions_8.preventDefault(event);
                        this.setFocus(htmlExtensions_8.selectFirstElement('.active', this.activeMenu));
                        break;
                    case 35:
                    case 34:
                        htmlExtensions_8.stopPropagation(event);
                        htmlExtensions_8.preventDefault(event);
                        var buttons = htmlExtensions_8.selectElements('.active', this.activeMenu);
                        if (buttons && buttons.length) {
                            this.setFocus(buttons[buttons.length - 1]);
                        }
                        break;
                    case 27:
                        if (this.activeMenu) {
                            htmlExtensions_8.stopPropagation(event);
                        }
                        this.closeMenuRequested = true;
                        this.focusOnLastButton();
                        break;
                    case 9:
                        this.focusedMenuItemIndex += event.shiftKey ? -1 : 1;
                        this.focusOnNextButton(event);
                        break;
                }
            };
            VideoControls.prototype.focusOnLastButton = function () {
                if (!!this.activeMenu) {
                    for (var i = 0; i < this.reactiveControls.length; i++) {
                        var button = this.reactiveControls[i].button;
                        if (!!this.activeMenuButton &&
                            this.activeMenuButton.getAttribute('data-menu-id') === button.getAttribute('data-menu-id')) {
                            this.hideAllMenus();
                            this.setFocus(button);
                            htmlExtensions_8.removeClass(button, 'x-hidden-focus');
                            return;
                        }
                        else if (this.activeMenu.id === button.getAttribute('data-menu-id')) {
                            this.hideAllMenus();
                            this.setFocus(button);
                            htmlExtensions_8.removeClass(button, 'x-hidden-focus');
                            return;
                        }
                    }
                    if (!!this.activeMenu) {
                        this.hideAllMenus();
                        this.setFocus(this.optionsButton);
                    }
                }
            };
            VideoControls.prototype.focusOnNextButton = function (event) {
                if (!!this.activeMenu && !!this.activeMenuButton) {
                    var activeMenuItems = htmlExtensions_8.selectElements('.active', this.activeMenu);
                    if (this.focusedMenuItemIndex >= activeMenuItems.length) {
                        htmlExtensions_8.stopPropagation(event);
                        htmlExtensions_8.preventDefault(event);
                        var nextItem = this.activeMenuButton.nextElementSibling;
                        while (!!nextItem) {
                            if (nextItem.nodeName.toLowerCase() === 'button' &&
                                nextItem.getAttribute(VideoControls.ariaHidden) !== 'true') {
                                this.setFocus(nextItem);
                                break;
                            }
                            nextItem = nextItem.nextElementSibling;
                        }
                        if (!nextItem) {
                            this.setFocus(this.playButton);
                        }
                        this.hideAllMenus();
                    }
                    else if (this.focusedMenuItemIndex < 0) {
                        htmlExtensions_8.stopPropagation(event);
                        htmlExtensions_8.preventDefault(event);
                        this.setFocus((this.activeMenuButton));
                        this.hideAllMenus();
                    }
                }
            };
            VideoControls.prototype.calcHeight = function (menu) {
                if (!menu || !this.videoControls) {
                    return 0;
                }
                var subMenuHeight = htmlExtensions_8.getClientRect(menu).height;
                var videoDimensions = htmlExtensions_8.getClientRect(this.videoControls.parentElement);
                var videoControlsDimensions = htmlExtensions_8.getClientRect(this.videoControls);
                var availableHeight = videoDimensions.height - videoControlsDimensions.height - 10;
                if (subMenuHeight > availableHeight) {
                    subMenuHeight = availableHeight;
                }
                return subMenuHeight;
            };
            VideoControls.prototype.createMenu = function (menu) {
                if (!this.menuContainer || !menu || !menu.category || !menu.id || !menu.items || !menu.items.length) {
                    return;
                }
                var menuItemsHtml = '';
                var itemCount = menu.items.length;
                var itemIndex = 1;
                if (menu.label && this.localizationHelper && (!menu.hideBackButton)) {
                    var backAriaLabel = stringExtensions_10.format(this.localizationHelper.getLocalizedValue(localization_helper_1.playerLocKeys.previous_menu_aria_label), menu.label);
                    itemCount += 1;
                    if (menu.cssClass === 'closed-caption') {
                        menuItemsHtml +=
                            "<li role='presentation'>\n    <button class='c-action-trigger c-glyph glyph-chevron-left active closed-caption' data-next-menu='back'\n    aria-label='" + backAriaLabel + "'aria-setsize='" + itemCount + "' aria-posinset='" + itemIndex++ + "' role='menuitem'>\n    " + menu.label + "</button>\n</li>";
                    }
                    else {
                        menuItemsHtml +=
                            "<li role='presentation'>\n    <button class='c-action-trigger c-glyph glyph-chevron-left active' data-next-menu='back' aria-label='" + backAriaLabel + "'\n    aria-setsize='" + itemCount + "' aria-posinset='" + itemIndex++ + "' role='menuitem'>\n    " + menu.label + "</button>\n</li>";
                    }
                }
                for (var _i = 0, _a = menu.items; _i < _a.length; _i++) {
                    var item = _a[_i];
                    if (item.subMenu) {
                        item.subMenuId = item.subMenu.id;
                        this.createMenu(item.subMenu);
                    }
                    var menuItemClass = 'c-action-trigger active';
                    menuItemClass += item.subMenuId || item.glyph || item.selectable ? ' c-glyph' : '';
                    menuItemClass += item.selectable && item.selected ? ' glyph-check-mark' : '';
                    menuItemClass += item.subMenuId ? ' glyph-chevron-right' : '';
                    menuItemClass += item.glyph ? ' ' + item.glyph : '';
                    menuItemsHtml +=
                        "<li id='" + item.id + "' role='presentation'>\n    <button class='" + menuItemClass + "' " + (item.data ? "data-info='" + item.data + "'" : '') + "\n        role=" + (item.selectable ? "'menuitemradio'" : "'menuitem'") + "\n        aria-setsize='" + itemCount + "' aria-posinset='" + itemIndex++ + "'\n        " + (item.selectable && item.selected ? "aria-selected='true' aria-checked='true'" : '') + " \n        " + (item.selectable ? "data-video-selectable='true'" : '') + "\n        " + (item.subMenuId ? "data-next-menu=" + item.subMenuId + " aria-expanded='false' aria-haspopup='true'" : '') + "\n        " + (item.persistOnClick ? "data-persist='true'" : '') + " " + (item.ariaLabel ? "aria-label='" + item.ariaLabel + "'" : '') + "\n        " + (item.language ? "lang=" + item.language : '') + ">\n            " + (item.image ? "<img src='" + item.image + "' alt='" + (item.imageAlt || '') + "' class='c-image'/>" : '') + "\n            " + item.label + "\n    </button>\n</li>";
                }
                var menuHtml = "<div id='" + menu.id + "' class='f-player-menu' aria-hidden='true' data-category='" + menu.category + "'>\n    <ul role='menu' class='c-list f-bare'>\n        " + menuItemsHtml + "\n    </ul>\n</div>";
                var menuDiv = document.createElement('div');
                menuDiv.innerHTML = menuHtml;
                this.menuContainer.appendChild(menuDiv.firstChild);
            };
            VideoControls.prototype.showMenu = function (id, arrivedViaKeyboard, button) {
                if (!id) {
                    return;
                }
                if (!!button) {
                    this.activeMenuButton = button;
                }
                this.hideControls();
                this.focusedMenuItemIndex = 0;
                this.hideActiveMenu();
                this.menuContainer.setAttribute('aria-hidden', 'false');
                var menu = htmlExtensions_8.selectFirstElement('#' + id, this.menuContainer);
                this.resetMenuPosition(menu, button);
                if (menu) {
                    var menuHeight = htmlExtensions_8.css(menu, 'height');
                    this.showElement(menu);
                    var height = this.calcHeight(menu);
                    if (menuHeight === 'auto') {
                        height += 2;
                    }
                    htmlExtensions_8.css(menu, 'height', height + 'px');
                    htmlExtensions_8.css(menu, 'right', this.menuRight);
                    this.activeMenu = menu;
                    this.onlyOneDialog(menu);
                    arrivedViaKeyboard = true;
                    if (arrivedViaKeyboard) {
                        this.setFocus(htmlExtensions_8.selectFirstElement('li:not([aria-hidden]) button', menu));
                    }
                }
            };
            VideoControls.prototype.setFocusonPlayButton = function () {
                this.setFocus(this.playButton);
            };
            VideoControls.prototype.setFocus = function (element) {
                if (!!element) {
                    setTimeout(function () { element.focus(); }, 0);
                }
            };
            VideoControls.prototype.hideActiveMenu = function () {
                if (this.activeMenu) {
                    this.hideElement(this.activeMenu);
                    this.activeMenu = null;
                }
            };
            VideoControls.prototype.pushToMenuBackStack = function (id) {
                if (this.menuBackStack && id) {
                    this.menuBackStack.push(id);
                }
            };
            VideoControls.prototype.popFromMenuBackStack = function () {
                if (this.menuBackStack && this.menuBackStack.length) {
                    return this.menuBackStack.pop();
                }
                return null;
            };
            VideoControls.prototype.clearMenuBackStack = function () {
                this.menuBackStack = [];
            };
            VideoControls.prototype.setupPlayerMenus = function (menuCollection) {
                if (!this.videoControls || !menuCollection || !menuCollection.length) {
                    return;
                }
                this.disposePlayerMenus();
                var optionsMenuItems = [];
                for (var _i = 0, menuCollection_1 = menuCollection; _i < menuCollection_1.length; _i++) {
                    var menu = menuCollection_1[_i];
                    optionsMenuItems.push({
                        id: menu.id + '_item',
                        label: menu.label,
                        subMenu: menu
                    });
                    if (!!menu.glyph && !!menu.priority) {
                        this.createReactiveButton(menu.glyph, menu.priority, menu.id, menu.label, menu.cssClass !== undefined ? menu.cssClass : '');
                    }
                }
                var optionsMenuId = this.videoPlayer.getPlayerId() + '-options-menu';
                var optionsMenu = {
                    id: optionsMenuId,
                    items: optionsMenuItems,
                    category: 'options'
                };
                this.createMenu(optionsMenu);
                this.optionsButton.setAttribute('data-menu-id', optionsMenuId);
                this.initializePlayerMenus();
                this.updateReactiveControlDisplay();
            };
            VideoControls.prototype.updateMenuSelection = function (menuId, itemId) {
                if (!menuId || !this.menuContainer) {
                    return;
                }
                var menu = htmlExtensions_8.selectFirstElement('#' + menuId, this.menuContainer);
                if (!menu) {
                    return;
                }
                var menuItems = htmlExtensions_8.selectElements('li', menu);
                for (var _i = 0, menuItems_1 = menuItems; _i < menuItems_1.length; _i++) {
                    var item = menuItems_1[_i];
                    var menuButton = htmlExtensions_8.selectFirstElement('button', item);
                    if (menuButton && menuButton.getAttribute('data-video-selectable')) {
                        if (itemId && itemId === item.id) {
                            htmlExtensions_8.addClasses(menuButton, ['c-glyph', 'glyph-check-mark']);
                            menuButton.setAttribute('aria-selected', 'true');
                            menuButton.setAttribute('aria-checked', 'true');
                        }
                        else {
                            htmlExtensions_8.removeClass(menuButton, 'glyph-check-mark');
                            menuButton.removeAttribute('aria-selected');
                            menuButton.removeAttribute('aria-checked');
                        }
                    }
                }
            };
            VideoControls.prototype.resetSlidersWorkaround = function () {
                var newBounds = this.videoControls.getBoundingClientRect();
                if (!this.controlsBounds
                    || this.controlsBounds.height !== newBounds.height
                    || this.controlsBounds.width !== newBounds.width) {
                    this.controlsBounds = newBounds;
                    if (this.progressSlider && this.videoPlayer) {
                        var position = this.videoPlayer.getPlayPosition();
                        var dvrLength = position.endTime - position.startTime;
                        this.progressSlider.resetSlider(0, dvrLength, position.currentTime - position.startTime, VideoControls.seekSteps);
                    }
                    if (this.volumeSlider && this.videoPlayer) {
                        this.volumeSlider.resetSlider(0, 100, this.videoPlayer.getVolume() * 100, VideoControls.volumeSteps);
                    }
                }
            };
            VideoControls.selector = '.f-video-controls';
            VideoControls.ariaHidden = 'aria-hidden';
            VideoControls.ariaLabel = 'aria-label';
            VideoControls.menuSelector = '.f-player-menu';
            VideoControls.seekSteps = 5;
            VideoControls.volumeSteps = 5;
            VideoControls.volumeAutoHideTimeout = 2000;
            return VideoControls;
        }());
        exports.VideoControls = VideoControls;
    });
    define("video-wrappers/video-wrapper-interface", ["require", "exports"], function (require, exports) {
        Object.defineProperty(exports, "__esModule", { value: true });
    });
    define("video-wrappers/html5-video-wrapper", ["require", "exports", "data/player-data-interfaces", "mwf/utilities/htmlExtensions", "constants/player-constants", "mwf/utilities/utility", "utilities/environment", "constants/enums"], function (require, exports, player_data_interfaces_4, htmlExtensions_9, player_constants_3, utility_11, environment_4, enums_1) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.Html5VideoWrapper = void 0;
        var Html5VideoWrapper = (function () {
            function Html5VideoWrapper(videoPlayer) {
                var _this = this;
                this.triggerEvents = function (event) {
                    if (_this.onMediaEventCallback) {
                        _this.onMediaEventCallback(event);
                    }
                };
                this.videoPlayer = videoPlayer;
            }
            Html5VideoWrapper.prototype.bindVideoEvents = function (onMediaEventCallback) {
                if (this.videoTag) {
                    this.onMediaEventCallback = onMediaEventCallback;
                    for (var _i = 0, MediaEvents_1 = player_constants_3.MediaEvents; _i < MediaEvents_1.length; _i++) {
                        var mediaEvent = MediaEvents_1[_i];
                        htmlExtensions_9.addEvents(this.videoTag, mediaEvent, this.triggerEvents);
                    }
                }
            };
            Html5VideoWrapper.prototype.unbindVideoEvents = function () {
                if (this.videoTag) {
                    for (var _i = 0, MediaEvents_2 = player_constants_3.MediaEvents; _i < MediaEvents_2.length; _i++) {
                        var mediaEvent = MediaEvents_2[_i];
                        htmlExtensions_9.removeEvents(this.videoTag, mediaEvent, this.triggerEvents);
                    }
                }
            };
            Html5VideoWrapper.prototype.load = function (playerContainer, playOnLoad, onLoadedCallback, onLoadFailedCallback, onAudioStreamSelectedCallback) {
                if (!playerContainer) {
                    console.log('player container is null');
                    onLoadFailedCallback && onLoadFailedCallback();
                }
                if (this.videoTag) {
                    this.dispose();
                }
                this.playerContainer = playerContainer;
                this.videoTag = htmlExtensions_9.selectFirstElementT('video', this.playerContainer);
                this.videoTag.autoplay = playOnLoad;
                if (!this.videoTag && onLoadFailedCallback) {
                    console.log('video tag not found');
                    onLoadFailedCallback();
                }
                if (onLoadedCallback) {
                    setTimeout(onLoadedCallback, 0);
                }
            };
            Html5VideoWrapper.prototype.play = function () {
                this.videoTag && this.videoTag.play();
            };
            Html5VideoWrapper.prototype.pause = function () {
                this.videoTag && this.videoTag.pause();
            };
            Html5VideoWrapper.prototype.isPaused = function () {
                return this.videoTag && this.videoTag.paused;
            };
            Html5VideoWrapper.prototype.isLive = function () {
                return false;
            };
            Html5VideoWrapper.prototype.getPlayPosition = function () {
                if (this.videoTag) {
                    return {
                        currentTime: this.videoTag.currentTime,
                        startTime: 0,
                        endTime: this.videoTag.duration
                    };
                }
                return { currentTime: 0, endTime: 0, startTime: 0 };
            };
            Html5VideoWrapper.prototype.getVolume = function () {
                if (this.videoTag) {
                    return this.videoTag.volume;
                }
                return 0;
            };
            Html5VideoWrapper.prototype.setVolume = function (volume) {
                if (this.videoTag) {
                    this.videoTag.volume = volume;
                }
            };
            Html5VideoWrapper.prototype.isMuted = function () {
                if (this.videoTag) {
                    return this.videoTag.muted;
                }
                return false;
            };
            Html5VideoWrapper.prototype.mute = function () {
                if (this.videoTag) {
                    this.videoTag.muted = true;
                    this.videoTag.setAttribute('muted', 'muted');
                }
            };
            Html5VideoWrapper.prototype.unmute = function () {
                if (this.videoTag) {
                    this.videoTag.muted = false;
                    this.videoTag.removeAttribute('muted');
                }
            };
            Html5VideoWrapper.prototype.setCurrentTime = function (time) {
                if (this.videoTag) {
                    this.videoTag.currentTime = time;
                }
            };
            Html5VideoWrapper.prototype.isSeeking = function () {
                if (this.videoTag) {
                    return this.videoTag.seeking;
                }
                return false;
            };
            Html5VideoWrapper.prototype.getBufferedDuration = function () {
                var buffered = 0;
                if (this.videoTag && this.videoTag.buffered && this.videoTag.buffered.length) {
                    buffered = this.videoTag.buffered.end(this.videoTag.buffered.length - 1);
                }
                return buffered;
            };
            Html5VideoWrapper.prototype.setSource = function (videoSrc) {
                if (this.videoTag && videoSrc && videoSrc.length) {
                    var currentSrc = this.videoTag.getAttribute('src');
                    if (videoSrc[0].url !== currentSrc) {
                        this.videoTag.setAttribute('src', videoSrc[0].url);
                        this.videoTag.load && this.videoTag.load();
                        if (environment_4.Environment.isIProduct) {
                            this.videoTag.removeAttribute(enums_1.Attributes.ARIA_HIDDEN);
                            this.videoTag.removeAttribute(enums_1.Attributes.TABINDEX);
                            var videoContainer = this.videoPlayer.getPlayerContainer();
                            if (videoContainer) {
                                videoContainer.removeAttribute(enums_1.Attributes.TABINDEX);
                            }
                        }
                    }
                }
            };
            Html5VideoWrapper.prototype.addNativeClosedCaption = function (ccUrls, format, localizationHelper) {
                if (ccUrls && ccUrls.length && this.videoTag) {
                    this.clearNativeCc(this.videoTag);
                    this.videoTag.setAttribute('crossorigin', 'anonymous');
                    for (var _i = 0, ccUrls_1 = ccUrls; _i < ccUrls_1.length; _i++) {
                        var ccUrl = ccUrls_1[_i];
                        if (ccUrl.ccType === format) {
                            var track = document.createElement('track');
                            track.setAttribute('src', ccUrl.url);
                            track.setAttribute('kind', 'captions');
                            track.setAttribute('srclang', ccUrl.locale);
                            track.setAttribute('label', localizationHelper.getLanguageNameFromLocale(ccUrl.locale));
                            this.videoTag.appendChild(track);
                        }
                    }
                    this.videoTag.load && this.videoTag.load();
                }
            };
            Html5VideoWrapper.prototype.clearNativeCc = function (currentVideoTag) {
                if (currentVideoTag) {
                    var currentTracks = htmlExtensions_9.selectElements('track', currentVideoTag);
                    for (var _i = 0, currentTracks_1 = currentTracks; _i < currentTracks_1.length; _i++) {
                        var track = currentTracks_1[_i];
                        if (track && track.parentElement === currentVideoTag) {
                            currentVideoTag.removeChild(track);
                        }
                    }
                }
            };
            Html5VideoWrapper.prototype.clearSource = function () {
                if (this.videoTag) {
                    this.videoTag.setAttribute('src', '');
                    this.videoTag.load && this.videoTag.load();
                }
            };
            Html5VideoWrapper.prototype.setPosterFrame = function (url) {
                if (url && this.videoTag && this.videoTag.poster !== url) {
                    this.videoTag.poster = url;
                }
            };
            Html5VideoWrapper.prototype.getError = function () {
                var contentErrorCode;
                if (this.videoTag !== null && this.videoTag.error !== null) {
                    switch (this.videoTag.error.code) {
                        case this.videoTag.error.MEDIA_ERR_ABORTED:
                            contentErrorCode = player_data_interfaces_4.VideoErrorCodes.MediaErrorAborted;
                            break;
                        case this.videoTag.error.MEDIA_ERR_NETWORK:
                            contentErrorCode = player_data_interfaces_4.VideoErrorCodes.MediaErrorNetwork;
                            break;
                        case this.videoTag.error.MEDIA_ERR_DECODE:
                            contentErrorCode = player_data_interfaces_4.VideoErrorCodes.MediaErrorDecode;
                            break;
                        case this.videoTag.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                            contentErrorCode = player_data_interfaces_4.VideoErrorCodes.MediaErrorSourceNotSupported;
                            break;
                        default:
                            contentErrorCode = player_data_interfaces_4.VideoErrorCodes.MediaErrorUnknown;
                            break;
                    }
                    return { errorCode: contentErrorCode };
                }
                return null;
            };
            Html5VideoWrapper.prototype.setPlaybackRate = function (rate) {
                if (this.videoTag && rate && utility_11.isNumber(rate)) {
                    this.videoTag.playbackRate = rate;
                }
            };
            Html5VideoWrapper.prototype.getPlayerTechName = function () {
                return 'html5';
            };
            Html5VideoWrapper.prototype.getWrapperName = function () {
                return 'html5video';
            };
            Html5VideoWrapper.prototype.getAudioTracks = function () {
                return null;
            };
            Html5VideoWrapper.prototype.switchToAudioTrack = function (trackIndex) {
                throw new Error('HTML5.switchToAudioTrack is not supported');
            };
            Html5VideoWrapper.prototype.getCurrentAudioTrack = function () {
                return null;
            };
            Html5VideoWrapper.prototype.getVideoTracks = function () {
                return null;
            };
            Html5VideoWrapper.prototype.switchToVideoTrack = function (trackIndex) {
                throw new Error('HTML5.switchToVideoTrack is not supported');
            };
            Html5VideoWrapper.prototype.getCurrentVideoTrack = function () {
                return null;
            };
            Html5VideoWrapper.prototype.setAutoPlay = function () {
                if (!!this.videoTag) {
                    this.videoTag.autoplay = true;
                    this.videoTag.setAttribute('playsinline', '');
                }
            };
            Html5VideoWrapper.prototype.dispose = function () {
                this.unbindVideoEvents();
                this.clearSource();
            };
            Html5VideoWrapper.supportedMediaTypes = [player_data_interfaces_4.MediaTypes.HLS, player_data_interfaces_4.MediaTypes.MP4];
            return Html5VideoWrapper;
        }());
        exports.Html5VideoWrapper = Html5VideoWrapper;
    });
    define("video-wrappers/amp-wrapper", ["require", "exports", "data/player-data-interfaces", "mwf/utilities/htmlExtensions", "mwf/utilities/stringExtensions", "constants/player-constants", "utilities/player-utility", "mwf/utilities/utility", "data/player-config"], function (require, exports, player_data_interfaces_5, htmlExtensions_10, stringExtensions_11, player_constants_4, player_utility_5, utility_12, player_config_4) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.AmpWrapper = void 0;
        var AmpWrapper = (function () {
            function AmpWrapper(useAMPVersion2) {
                var _this = this;
                this.ampPlayer = null;
                this.triggerEvents = function (event) {
                    if (_this.onMediaEventCallback) {
                        _this.onMediaEventCallback(event);
                    }
                };
                this.setupAmpPlayer = function (playOnLoad) {
                    var videoTag = htmlExtensions_10.selectFirstElementT('video', _this.playerContainer);
                    if (!videoTag) {
                        videoTag = htmlExtensions_10.selectFirstElementT('.f-video-player', _this.playerContainer);
                    }
                    if (!videoTag) {
                        console.log('could not find video tag');
                        _this.onLoadFailedCallback && _this.onLoadFailedCallback();
                        return;
                    }
                    _this.ampPlayer = window.amp(videoTag, {
                        'nativeControlsForTouch': false,
                        autoplay: playOnLoad,
                        controls: false,
                        logo: { enabled: false }
                    }, _this.onAmpPlayerInit);
                    _this.ampPlayer.options_.autoplay = playOnLoad;
                    if (videoTag.hasAttribute('aria-hidden')) {
                        videoTag.removeAttribute('aria-hidden');
                    }
                    _this.onLoadedCallback && _this.onLoadedCallback();
                };
                this.onAmpPlayerInit = function () {
                    var ampContainer = htmlExtensions_10.selectFirstElement('.f-video-player', _this.playerContainer);
                    if (ampContainer) {
                        if (_this.useAMPVersion2) {
                            var childDiv = htmlExtensions_10.selectFirstElement('div', ampContainer);
                            var childDivs = Array.prototype.slice.call(childDiv.children);
                            var videoTag = htmlExtensions_10.selectFirstElementT('video', ampContainer);
                            for (var _i = 0, childDivs_1 = childDivs; _i < childDivs_1.length; _i++) {
                                var div = childDivs_1[_i];
                                if (div && div.parentElement === childDiv && !(div.contains(videoTag))) {
                                    childDiv.removeChild(div);
                                }
                                else {
                                    if (div.hasAttribute('aria-label')) {
                                        div.removeAttribute('aria-label');
                                    }
                                    if (!div.hasAttribute('role')) {
                                        div.setAttribute('role', 'none');
                                    }
                                }
                            }
                            videoTag.removeAttribute('aria-hidden');
                        }
                        else {
                            var childDivs = htmlExtensions_10.selectElements('div', ampContainer);
                            for (var _a = 0, childDivs_2 = childDivs; _a < childDivs_2.length; _a++) {
                                var div = childDivs_2[_a];
                                if (div && div.parentElement === ampContainer) {
                                    ampContainer.removeChild(div);
                                }
                            }
                        }
                        ampContainer.removeAttribute('title');
                        ampContainer.removeAttribute('style');
                        ampContainer.removeAttribute('tabindex');
                        ampContainer.removeAttribute('aria-label');
                        ampContainer.removeAttribute('vjs-label');
                        ampContainer.removeAttribute('aria-hidden');
                        _this.videoTag = htmlExtensions_10.selectFirstElementT('video', ampContainer);
                    }
                };
                this.useAMPVersion2 = useAMPVersion2;
                if (!AmpWrapper.isAmpScriptLoaded()) {
                    player_utility_5.PlayerUtility.loadScript(useAMPVersion2 ? player_config_4.PlayerConfig.ampVersion2Url : player_config_4.PlayerConfig.ampUrl);
                }
            }
            AmpWrapper.isAmpScriptLoaded = function () {
                return window && window.amp;
            };
            AmpWrapper.prototype.bindVideoEvents = function (onMediaEventCallback) {
                if (this.ampPlayer) {
                    this.onMediaEventCallback = onMediaEventCallback;
                    for (var _i = 0, MediaEvents_3 = player_constants_4.MediaEvents; _i < MediaEvents_3.length; _i++) {
                        var mediaEvent = MediaEvents_3[_i];
                        this.ampPlayer.addEventListener(mediaEvent, this.triggerEvents);
                    }
                }
            };
            AmpWrapper.prototype.unbindVideoEvents = function () {
                if (this.ampPlayer) {
                    for (var _i = 0, MediaEvents_4 = player_constants_4.MediaEvents; _i < MediaEvents_4.length; _i++) {
                        var mediaEvent = MediaEvents_4[_i];
                        this.ampPlayer.removeEventListener(mediaEvent, this.triggerEvents);
                    }
                }
            };
            AmpWrapper.prototype.load = function (playerContainer, playOnLoad, onLoadedCallback, onLoadFailedCallback, onAudioStreamSelectedCallback) {
                var _this = this;
                if (!playerContainer) {
                    console.log('player container is null');
                    onLoadFailedCallback && onLoadFailedCallback();
                }
                if (this.ampPlayer) {
                    this.dispose();
                }
                this.playerContainer = playerContainer;
                this.onLoadedCallback = onLoadedCallback;
                this.onLoadFailedCallback = onLoadFailedCallback;
                this.onAudioStreamSelectedCallback = onAudioStreamSelectedCallback;
                if (AmpWrapper.isAmpScriptLoaded()) {
                    this.setupAmpPlayer(playOnLoad);
                }
                else {
                    utility_12.poll(AmpWrapper.isAmpScriptLoaded, AmpWrapper.pollingInterval, AmpWrapper.pollingTimeout, function () { _this.setupAmpPlayer(playOnLoad); }, this.onLoadFailedCallback);
                }
            };
            AmpWrapper.prototype.play = function () {
                this.ampPlayer && this.ampPlayer.play();
            };
            AmpWrapper.prototype.pause = function () {
                this.ampPlayer && this.ampPlayer.pause();
            };
            AmpWrapper.prototype.isPaused = function () {
                return this.ampPlayer && this.ampPlayer.paused();
            };
            AmpWrapper.prototype.isLive = function () {
                return this.ampPlayer && this.ampPlayer.isLive();
            };
            AmpWrapper.prototype.getPlayPosition = function () {
                if (!this.ampPlayer) {
                    return { currentTime: 0, endTime: 0, startTime: 0 };
                }
                if (this.ampPlayer.isLive()) {
                    var playableWindow = this.ampPlayer.currentPlayableWindow();
                    return {
                        startTime: playableWindow.startInSec,
                        endTime: playableWindow.endInSec,
                        currentTime: this.ampPlayer.currentAbsoluteTime() || playableWindow.endInSec
                    };
                }
                else {
                    return {
                        currentTime: this.ampPlayer.currentTime(),
                        startTime: 0,
                        endTime: this.ampPlayer.duration()
                    };
                }
            };
            AmpWrapper.prototype.getVolume = function () {
                if (this.ampPlayer) {
                    return this.ampPlayer.volume();
                }
                return 0;
            };
            AmpWrapper.prototype.setVolume = function (volume) {
                if (this.ampPlayer) {
                    this.ampPlayer.volume(volume);
                }
            };
            AmpWrapper.prototype.isMuted = function () {
                if (this.ampPlayer) {
                    return this.ampPlayer.muted();
                }
                return false;
            };
            AmpWrapper.prototype.mute = function () {
                if (this.ampPlayer) {
                    this.ampPlayer.muted(true);
                }
            };
            AmpWrapper.prototype.unmute = function () {
                if (this.ampPlayer) {
                    this.ampPlayer.muted(false);
                }
            };
            AmpWrapper.prototype.setCurrentTime = function (time) {
                if (this.ampPlayer) {
                    this.ampPlayer.currentTime(this.ampPlayer.fromPresentationTime(time));
                }
            };
            AmpWrapper.prototype.isSeeking = function () {
                if (this.ampPlayer) {
                    return this.ampPlayer.seeking();
                }
                return false;
            };
            AmpWrapper.prototype.getBufferedDuration = function () {
                var buffered = 0;
                if (this.ampPlayer && this.ampPlayer.buffered && this.ampPlayer.buffered().length) {
                    var bufferedTimeRange = this.ampPlayer.buffered();
                    if (bufferedTimeRange.length) {
                        buffered = bufferedTimeRange.end(bufferedTimeRange.length - 1);
                    }
                }
                return buffered;
            };
            AmpWrapper.prototype.setSource = function (videoSrc) {
                if (!videoSrc || !videoSrc.length) {
                    return;
                }
                var srcObj = [];
                for (var _i = 0, videoSrc_1 = videoSrc; _i < videoSrc_1.length; _i++) {
                    var src = videoSrc_1[_i];
                    if (src && src.url && this.ampPlayer) {
                        var type = 'video/mp4';
                        switch (src.mediaType) {
                            case player_data_interfaces_5.MediaTypes.HLS:
                                type = 'application/vnd.apple.mpegurl';
                                break;
                            case player_data_interfaces_5.MediaTypes.DASH:
                                type = 'application/dash-xml';
                                break;
                            case player_data_interfaces_5.MediaTypes.SMOOTH:
                                type = 'application/vnd.ms-sstr+xml';
                                break;
                        }
                        srcObj.push({ src: src.url, type: type });
                    }
                }
                this.ampPlayer.src(srcObj);
            };
            AmpWrapper.prototype.addNativeClosedCaption = function (ccUrls, format, localizationHelper) {
                if (ccUrls && ccUrls.length && this.videoTag) {
                    this.clearNativeCc(this.videoTag);
                    this.videoTag.setAttribute('crossorigin', 'anonymous');
                    for (var _i = 0, ccUrls_2 = ccUrls; _i < ccUrls_2.length; _i++) {
                        var ccUrl = ccUrls_2[_i];
                        if (ccUrl.ccType === format) {
                            var track = document.createElement('track');
                            track.setAttribute('src', ccUrl.url);
                            track.setAttribute('kind', 'captions');
                            track.setAttribute('srclang', ccUrl.locale);
                            track.setAttribute('label', localizationHelper.getLanguageNameFromLocale(ccUrl.locale));
                            this.videoTag.appendChild(track);
                        }
                    }
                    this.videoTag.load && this.videoTag.load();
                }
            };
            AmpWrapper.prototype.clearNativeCc = function (currentVideoTag) {
                if (currentVideoTag) {
                    var currentTracks = htmlExtensions_10.selectElements('track', currentVideoTag);
                    for (var _i = 0, currentTracks_2 = currentTracks; _i < currentTracks_2.length; _i++) {
                        var track = currentTracks_2[_i];
                        if (track && track.parentElement === currentVideoTag) {
                            currentVideoTag.removeChild(track);
                        }
                    }
                }
            };
            AmpWrapper.prototype.clearSource = function () {
            };
            AmpWrapper.prototype.setPosterFrame = function (url) {
                if (url && this.ampPlayer && this.ampPlayer.poster() !== url) {
                    this.ampPlayer.poster(url);
                }
            };
            AmpWrapper.prototype.getError = function () {
                var error = this.ampPlayer && this.ampPlayer.error();
                if (error) {
                    var contentErrorCode;
                    var ampWindow = (window);
                    if (error.code & ampWindow.amp.errorCode.abortedErrStart) {
                        contentErrorCode = player_data_interfaces_5.VideoErrorCodes.MediaErrorAborted;
                    }
                    else if (error.code & ampWindow.amp.errorCode.networkErrStart) {
                        contentErrorCode = player_data_interfaces_5.VideoErrorCodes.MediaErrorNetwork;
                    }
                    else if (error.code & ampWindow.amp.errorCode.decodeErrStart) {
                        contentErrorCode = player_data_interfaces_5.VideoErrorCodes.MediaErrorDecode;
                    }
                    else if (error.code & ampWindow.amp.errorCode.srcErrStart) {
                        contentErrorCode = player_data_interfaces_5.VideoErrorCodes.MediaErrorSourceNotSupported;
                    }
                    else if (error.code & ampWindow.amp.errorCode.encryptErrStart) {
                        contentErrorCode = player_data_interfaces_5.VideoErrorCodes.AmpEncryptError;
                    }
                    else if (error.code & ampWindow.amp.errorCode.srcPlayerMismatchStart) {
                        contentErrorCode = player_data_interfaces_5.VideoErrorCodes.AmpPlayerMismatch;
                    }
                    else {
                        contentErrorCode = player_data_interfaces_5.VideoErrorCodes.MediaErrorUnknown;
                    }
                    return { errorCode: contentErrorCode, message: 'AMP Error Code: ' + error.code };
                }
                return null;
            };
            AmpWrapper.prototype.setPlaybackRate = function (rate) {
            };
            AmpWrapper.prototype.getPlayerTechName = function () {
                return this.ampPlayer && this.ampPlayer.currentTechName();
            };
            AmpWrapper.prototype.getWrapperName = function () {
                return 'amp';
            };
            AmpWrapper.prototype.getAudioTracks = function () {
                var ampAudioStreamList = this.ampPlayer && this.ampPlayer.currentAudioStreamList && this.ampPlayer.currentAudioStreamList();
                if (!ampAudioStreamList) {
                    return null;
                }
                var ampAudioStreams = ampAudioStreamList.streams;
                if (!ampAudioStreams) {
                    return null;
                }
                if (!!this.onAudioStreamSelectedCallback) {
                    ampAudioStreamList.addEventListener('streamselected', this.onAudioStreamSelectedCallback);
                }
                var audioTracks = [];
                for (var _i = 0, ampAudioStreams_1 = ampAudioStreams; _i < ampAudioStreams_1.length; _i++) {
                    var ampStream = ampAudioStreams_1[_i];
                    var isDescriptiveAudioTrack = (ampStream.language && stringExtensions_11.startsWith(ampStream.language, 'dau-', true))
                        || (ampStream.title && stringExtensions_11.startsWith(ampStream.title, 'dau-', true));
                    var languageCode = (isDescriptiveAudioTrack && ampStream.language) ? ampStream.language.substring(4) : ampStream.language;
                    audioTracks.push({
                        isDescriptiveAudio: isDescriptiveAudioTrack,
                        bitrate: ampStream.bitrate,
                        languageCode: languageCode,
                        name: ampStream.name,
                        title: ampStream.title
                    });
                }
                return audioTracks;
            };
            AmpWrapper.prototype.switchToAudioTrack = function (trackIndex) {
                var ampAudioStreamList = this.ampPlayer && this.ampPlayer.currentAudioStreamList && this.ampPlayer.currentAudioStreamList();
                if (!ampAudioStreamList) {
                    return;
                }
                ampAudioStreamList.switchIndex(trackIndex);
            };
            AmpWrapper.prototype.getCurrentAudioTrack = function () {
                var ampAudioStreamList = this.ampPlayer && this.ampPlayer.currentAudioStreamList && this.ampPlayer.currentAudioStreamList();
                if (!ampAudioStreamList || !ampAudioStreamList.enabledIndices) {
                    return undefined;
                }
                var enabledStreamIndices = ampAudioStreamList.enabledIndices;
                return enabledStreamIndices.length > 0 ? enabledStreamIndices[0] : -1;
            };
            AmpWrapper.prototype.getVideoTracks = function () {
                var selectedAmpStream = this.getSelectedAmpVideoStream();
                if (!selectedAmpStream || !selectedAmpStream.tracks) {
                    return null;
                }
                var videoTracks = [];
                for (var _i = 0, _a = selectedAmpStream.tracks; _i < _a.length; _i++) {
                    var ampTrack = _a[_i];
                    videoTracks.push({
                        bitrate: ampTrack.bitrate,
                        width: ampTrack.width,
                        height: ampTrack.height
                    });
                }
                return videoTracks;
            };
            AmpWrapper.prototype.getSelectedAmpVideoStream = function () {
                if (!this.ampPlayer || !this.ampPlayer.currentVideoStreamList) {
                    return null;
                }
                var ampVideoStreamList = this.ampPlayer.currentVideoStreamList();
                if (!ampVideoStreamList) {
                    return null;
                }
                if (!ampVideoStreamList.streams ||
                    ampVideoStreamList.selectedIndex < 0 ||
                    ampVideoStreamList.selectedIndex >= ampVideoStreamList.streams.length) {
                    return null;
                }
                return ampVideoStreamList.streams[ampVideoStreamList.selectedIndex];
            };
            AmpWrapper.prototype.switchToVideoTrack = function (trackIndex) {
                var selectedAmpStream = this.getSelectedAmpVideoStream();
                if (!selectedAmpStream || !selectedAmpStream.selectTrackByIndex) {
                    return null;
                }
                selectedAmpStream.selectTrackByIndex(trackIndex);
            };
            AmpWrapper.prototype.getCurrentVideoTrack = function () {
                var selectedAmpStream = this.getSelectedAmpVideoStream();
                if (!selectedAmpStream || !selectedAmpStream.tracks || selectedAmpStream.tracks.length === 0) {
                    return null;
                }
                var ampTracks = selectedAmpStream.tracks;
                var enabledTracksCount = ampTracks.reduce(function (n, val) {
                    return val.selectable ? n + 1 : n;
                }, 0);
                if (enabledTracksCount === ampTracks.length) {
                    return { auto: true, trackIndex: null };
                }
                if (enabledTracksCount === 1) {
                    for (var trackIndex = 0; trackIndex < ampTracks.length; trackIndex++) {
                        if (ampTracks[trackIndex].selectable) {
                            return { auto: false, trackIndex: trackIndex };
                        }
                    }
                }
                return null;
            };
            AmpWrapper.prototype.setAutoPlay = function () {
                if (!this.useAMPVersion2) {
                    if (!!this.videoTag) {
                        this.videoTag.autoplay = true;
                        this.videoTag.setAttribute('playsinline', '');
                    }
                }
                else {
                    this.ampPlayer.autoplay(true);
                }
            };
            AmpWrapper.prototype.dispose = function () {
                this.clearSource();
                this.unbindVideoEvents();
                this.ampPlayer && this.ampPlayer.dispose && this.ampPlayer.dispose();
                this.ampPlayer = null;
            };
            AmpWrapper.pollingInterval = 50;
            AmpWrapper.pollingTimeout = 30000;
            return AmpWrapper;
        }());
        exports.AmpWrapper = AmpWrapper;
    });
    define("video-wrappers/has-video-wrapper", ["require", "exports", "data/player-data-interfaces", "mwf/utilities/htmlExtensions", "constants/player-constants", "utilities/player-utility", "mwf/utilities/utility", "data/player-config"], function (require, exports, player_data_interfaces_6, htmlExtensions_11, player_constants_5, player_utility_6, utility_13, player_config_5) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.HasPlayerVideoWrapper = void 0;
        var HasPlayerVideoWrapper = (function () {
            function HasPlayerVideoWrapper() {
                var _this = this;
                this.hasPlayer = null;
                this.setupHasPlayer = function (playOnLoad) {
                    _this.videoTag = htmlExtensions_11.selectFirstElementT('video', _this.playerContainer);
                    if (!_this.videoTag) {
                        _this.videoTag = htmlExtensions_11.selectFirstElementT('.f-video-player', _this.playerContainer);
                    }
                    if (!_this.videoTag) {
                        console.log('could not find video tag');
                        _this.onLoadFailedCallback && _this.onLoadFailedCallback();
                        return;
                    }
                    _this.hasPlayer = new window.MediaPlayer();
                    _this.hasPlayer.init(_this.videoTag);
                    _this.hasPlayer.setAutoPlay(playOnLoad);
                    _this.onLoadedCallback && _this.onLoadedCallback();
                };
                this.triggerEvents = function (event) {
                    if (_this.onMediaEventCallback) {
                        _this.onMediaEventCallback(event);
                    }
                };
                if (!HasPlayerVideoWrapper.isHasPlayerScriptLoaded()) {
                    var playerUrl = player_config_5.PlayerConfig.hasPlayerUrl.replace('url(', '').replace(')', '').trim();
                    player_utility_6.PlayerUtility.loadScript(playerUrl);
                }
            }
            HasPlayerVideoWrapper.isHasPlayerScriptLoaded = function () {
                return window && window.MediaPlayer;
            };
            HasPlayerVideoWrapper.prototype.bindVideoEvents = function (onMediaEventCallback) {
                if (this.videoTag) {
                    this.onMediaEventCallback = onMediaEventCallback;
                    for (var _i = 0, MediaEvents_5 = player_constants_5.MediaEvents; _i < MediaEvents_5.length; _i++) {
                        var mediaEvent = MediaEvents_5[_i];
                        htmlExtensions_11.addEvents(this.videoTag, mediaEvent, this.triggerEvents);
                    }
                }
            };
            HasPlayerVideoWrapper.prototype.unbindVideoEvents = function () {
                if (this.videoTag) {
                    for (var _i = 0, MediaEvents_6 = player_constants_5.MediaEvents; _i < MediaEvents_6.length; _i++) {
                        var mediaEvent = MediaEvents_6[_i];
                        htmlExtensions_11.removeEvents(this.videoTag, mediaEvent, this.triggerEvents);
                    }
                }
            };
            HasPlayerVideoWrapper.prototype.load = function (playerContainer, playOnLoad, onLoadedCallback, onLoadFailedCallback, onAudioStreamSelectedCallback) {
                var _this = this;
                if (!playerContainer) {
                    console.log('player container is null');
                    onLoadFailedCallback && onLoadFailedCallback();
                }
                if (this.videoTag) {
                    this.dispose();
                }
                this.playerContainer = playerContainer;
                this.onLoadedCallback = onLoadedCallback;
                this.onLoadFailedCallback = onLoadFailedCallback;
                if (HasPlayerVideoWrapper.isHasPlayerScriptLoaded()) {
                    this.setupHasPlayer(playOnLoad);
                }
                else {
                    utility_13.poll(HasPlayerVideoWrapper.isHasPlayerScriptLoaded, HasPlayerVideoWrapper.pollingInterval, HasPlayerVideoWrapper.pollingTimeout, function () { _this.setupHasPlayer(playOnLoad); }, this.onLoadFailedCallback);
                }
            };
            HasPlayerVideoWrapper.prototype.play = function () {
                if (this.videoTag) {
                    this.videoTag.play();
                }
            };
            HasPlayerVideoWrapper.prototype.pause = function () {
                if (this.videoTag) {
                    this.videoTag.pause();
                }
            };
            HasPlayerVideoWrapper.prototype.isPaused = function () {
                return this.videoTag && (this.videoTag.paused || this.videoTag.ended);
            };
            HasPlayerVideoWrapper.prototype.isLive = function () {
                return false;
            };
            HasPlayerVideoWrapper.prototype.getPlayPosition = function () {
                if (this.videoTag) {
                    return {
                        currentTime: this.videoTag.currentTime,
                        startTime: 0,
                        endTime: this.videoTag.duration
                    };
                }
                return { currentTime: 0, endTime: 0, startTime: 0 };
            };
            HasPlayerVideoWrapper.prototype.getVolume = function () {
                if (this.videoTag) {
                    return this.videoTag.volume;
                }
                return 0;
            };
            HasPlayerVideoWrapper.prototype.setVolume = function (volume) {
                if (this.videoTag) {
                    this.videoTag.volume = volume;
                }
            };
            HasPlayerVideoWrapper.prototype.isMuted = function () {
                if (this.videoTag) {
                    return this.videoTag.muted;
                }
                return false;
            };
            HasPlayerVideoWrapper.prototype.mute = function () {
                if (this.videoTag) {
                    this.videoTag.muted = true;
                }
            };
            HasPlayerVideoWrapper.prototype.unmute = function () {
                if (this.videoTag) {
                    this.videoTag.muted = false;
                }
            };
            HasPlayerVideoWrapper.prototype.setCurrentTime = function (time) {
                if (this.videoTag) {
                    this.videoTag.currentTime = time;
                }
            };
            HasPlayerVideoWrapper.prototype.isSeeking = function () {
                if (this.videoTag) {
                    return this.videoTag.seeking;
                }
                return false;
            };
            HasPlayerVideoWrapper.prototype.getBufferedDuration = function () {
                var buffered = 0;
                if (this.videoTag && this.videoTag.buffered && this.videoTag.buffered.length) {
                    buffered = this.videoTag.buffered.end(this.videoTag.buffered.length - 1);
                }
                return buffered;
            };
            HasPlayerVideoWrapper.prototype.setSource = function (videoSrc) {
                if (this.hasPlayer && videoSrc && videoSrc.length) {
                    if (videoSrc[0].url) {
                        this.hasPlayer.setInitialQualityFor('video', 999);
                        this.hasPlayer.setQualityFor('video', 999);
                        var stream = {
                            url: videoSrc[0].url,
                            protocol: (videoSrc[0].mediaType === player_data_interfaces_6.MediaTypes.HLS) ? 'HLS' : null
                        };
                        this.hasPlayer.load(stream);
                    }
                }
            };
            HasPlayerVideoWrapper.prototype.addNativeClosedCaption = function (ccUrls, format, localizationHelper) {
                if (ccUrls && ccUrls.length && this.videoTag) {
                    this.clearNativeCc(this.videoTag);
                    this.videoTag.setAttribute('crossorigin', 'anonymous');
                    for (var _i = 0, ccUrls_3 = ccUrls; _i < ccUrls_3.length; _i++) {
                        var ccUrl = ccUrls_3[_i];
                        if (ccUrl.ccType === format) {
                            var track = document.createElement('track');
                            track.setAttribute('src', ccUrl.url);
                            track.setAttribute('kind', 'captions');
                            track.setAttribute('srclang', ccUrl.locale);
                            track.setAttribute('label', localizationHelper.getLanguageNameFromLocale(ccUrl.locale));
                            this.videoTag.appendChild(track);
                        }
                    }
                    this.videoTag.load && this.videoTag.load();
                }
            };
            HasPlayerVideoWrapper.prototype.clearNativeCc = function (currentVideoTag) {
                if (currentVideoTag) {
                    var currentTracks = htmlExtensions_11.selectElements('track', currentVideoTag);
                    for (var _i = 0, currentTracks_3 = currentTracks; _i < currentTracks_3.length; _i++) {
                        var track = currentTracks_3[_i];
                        if (track && track.parentElement === currentVideoTag) {
                            currentVideoTag.removeChild(track);
                        }
                    }
                }
            };
            HasPlayerVideoWrapper.prototype.clearSource = function () {
                if (this.hasPlayer) {
                    this.hasPlayer.reset(1);
                }
            };
            HasPlayerVideoWrapper.prototype.setPosterFrame = function (url) {
                if (url && this.videoTag && this.videoTag.poster !== url) {
                    this.videoTag.poster = url;
                }
            };
            HasPlayerVideoWrapper.prototype.getError = function () {
                var contentErrorCode;
                if (this.videoTag !== null && this.videoTag.error !== null) {
                    switch (this.videoTag.error.code) {
                        case this.videoTag.error.MEDIA_ERR_ABORTED:
                            contentErrorCode = player_data_interfaces_6.VideoErrorCodes.MediaErrorAborted;
                            break;
                        case this.videoTag.error.MEDIA_ERR_NETWORK:
                            contentErrorCode = player_data_interfaces_6.VideoErrorCodes.MediaErrorNetwork;
                            break;
                        case this.videoTag.error.MEDIA_ERR_DECODE:
                            contentErrorCode = player_data_interfaces_6.VideoErrorCodes.MediaErrorDecode;
                            break;
                        case this.videoTag.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                            contentErrorCode = player_data_interfaces_6.VideoErrorCodes.MediaErrorSourceNotSupported;
                            break;
                        default:
                            contentErrorCode = player_data_interfaces_6.VideoErrorCodes.MediaErrorUnknown;
                            break;
                    }
                    return { errorCode: contentErrorCode };
                }
                return null;
            };
            HasPlayerVideoWrapper.prototype.setPlaybackRate = function (rate) {
                if (this.videoTag && rate && utility_13.isNumber(rate)) {
                    this.videoTag.playbackRate = rate;
                }
            };
            HasPlayerVideoWrapper.prototype.getPlayerTechName = function () {
                return 'hasplayer';
            };
            HasPlayerVideoWrapper.prototype.getWrapperName = function () {
                return 'hasplayerVideo';
            };
            HasPlayerVideoWrapper.prototype.getAudioTracks = function () {
                return null;
            };
            HasPlayerVideoWrapper.prototype.switchToAudioTrack = function (trackIndex) {
                throw new Error('HTML5.switchToAudioTrack is not supported');
            };
            HasPlayerVideoWrapper.prototype.getCurrentAudioTrack = function () {
                return null;
            };
            HasPlayerVideoWrapper.prototype.getVideoTracks = function () {
                return null;
            };
            HasPlayerVideoWrapper.prototype.switchToVideoTrack = function (trackIndex) {
                throw new Error('HTML5.switchToVideoTrack is not supported');
            };
            HasPlayerVideoWrapper.prototype.getCurrentVideoTrack = function () {
                return null;
            };
            HasPlayerVideoWrapper.prototype.setAutoPlay = function () {
                this.hasPlayer.setAutoPlay(true);
            };
            HasPlayerVideoWrapper.prototype.dispose = function () {
                this.unbindVideoEvents();
                this.clearSource();
                this.hasPlayer && this.hasPlayer.dispose && this.hasPlayer.dispose();
                this.hasPlayer = null;
            };
            HasPlayerVideoWrapper.pollingInterval = 50;
            HasPlayerVideoWrapper.pollingTimeout = 30000;
            HasPlayerVideoWrapper.supportedMediaTypes = [player_data_interfaces_6.MediaTypes.HLS, player_data_interfaces_6.MediaTypes.MP4];
            return HasPlayerVideoWrapper;
        }());
        exports.HasPlayerVideoWrapper = HasPlayerVideoWrapper;
    });
    define("video-wrappers/hls-video-wrapper", ["require", "exports", "data/player-data-interfaces", "mwf/utilities/htmlExtensions", "constants/player-constants", "utilities/player-utility", "mwf/utilities/utility", "data/player-config"], function (require, exports, player_data_interfaces_7, htmlExtensions_12, player_constants_6, player_utility_7, utility_14, player_config_6) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.HlsPlayerVideoWrapper = void 0;
        var HlsPlayerVideoWrapper = (function () {
            function HlsPlayerVideoWrapper() {
                var _this = this;
                this.hlsPlayer = null;
                this.setupHlsPlayer = function (playOnLoad) {
                    _this.videoTag = htmlExtensions_12.selectFirstElementT('video', _this.playerContainer);
                    if (!_this.videoTag) {
                        _this.videoTag = htmlExtensions_12.selectFirstElementT('.f-video-player', _this.playerContainer);
                    }
                    if (!_this.videoTag) {
                        console.log('could not find video tag');
                        _this.onLoadFailedCallback && _this.onLoadFailedCallback();
                        return;
                    }
                    _this.hlsPlayer = new window.Hls();
                    _this.hlsPlayer.attachMedia(_this.videoTag);
                    _this.onLoadedCallback && _this.onLoadedCallback();
                };
                this.triggerEvents = function (event) {
                    if (_this.onMediaEventCallback) {
                        _this.onMediaEventCallback(event);
                    }
                };
                if (!HlsPlayerVideoWrapper.isHlsPlayerScriptLoaded()) {
                    var playerUrl = player_config_6.PlayerConfig.hlsPlayerUrl.replace('url(', '').replace(')', '').trim();
                    player_utility_7.PlayerUtility.loadScript(playerUrl);
                }
            }
            HlsPlayerVideoWrapper.isHlsPlayerScriptLoaded = function () {
                return window && window.Hls;
            };
            HlsPlayerVideoWrapper.prototype.bindVideoEvents = function (onMediaEventCallback) {
                if (this.videoTag) {
                    this.onMediaEventCallback = onMediaEventCallback;
                    for (var _i = 0, MediaEvents_7 = player_constants_6.MediaEvents; _i < MediaEvents_7.length; _i++) {
                        var mediaEvent = MediaEvents_7[_i];
                        htmlExtensions_12.addEvents(this.videoTag, mediaEvent, this.triggerEvents);
                    }
                }
            };
            HlsPlayerVideoWrapper.prototype.unbindVideoEvents = function () {
                if (this.videoTag) {
                    for (var _i = 0, MediaEvents_8 = player_constants_6.MediaEvents; _i < MediaEvents_8.length; _i++) {
                        var mediaEvent = MediaEvents_8[_i];
                        htmlExtensions_12.removeEvents(this.videoTag, mediaEvent, this.triggerEvents);
                    }
                }
            };
            HlsPlayerVideoWrapper.prototype.load = function (playerContainer, playOnLoad, onLoadedCallback, onLoadFailedCallback, onAudioStreamSelectedCallback) {
                var _this = this;
                if (!playerContainer) {
                    console.log('player container is null');
                    onLoadFailedCallback && onLoadFailedCallback();
                }
                if (this.videoTag) {
                    this.dispose();
                }
                this.playerContainer = playerContainer;
                this.onLoadedCallback = onLoadedCallback;
                this.onLoadFailedCallback = onLoadFailedCallback;
                if (HlsPlayerVideoWrapper.isHlsPlayerScriptLoaded()) {
                    this.setupHlsPlayer(playOnLoad);
                }
                else {
                    utility_14.poll(HlsPlayerVideoWrapper.isHlsPlayerScriptLoaded, HlsPlayerVideoWrapper.pollingInterval, HlsPlayerVideoWrapper.pollingTimeout, function () { _this.setupHlsPlayer(playOnLoad); }, this.onLoadFailedCallback);
                }
            };
            HlsPlayerVideoWrapper.prototype.play = function () {
                if (this.videoTag) {
                    this.videoTag.play();
                }
            };
            HlsPlayerVideoWrapper.prototype.pause = function () {
                if (this.videoTag) {
                    this.videoTag.pause();
                }
            };
            HlsPlayerVideoWrapper.prototype.isPaused = function () {
                return this.videoTag && (this.videoTag.paused || this.videoTag.ended);
            };
            HlsPlayerVideoWrapper.prototype.isLive = function () {
                return false;
            };
            HlsPlayerVideoWrapper.prototype.getPlayPosition = function () {
                if (this.videoTag) {
                    return {
                        currentTime: this.videoTag.currentTime,
                        startTime: 0,
                        endTime: this.videoTag.duration
                    };
                }
                return { currentTime: 0, endTime: 0, startTime: 0 };
            };
            HlsPlayerVideoWrapper.prototype.getVolume = function () {
                if (this.videoTag) {
                    return this.videoTag.volume;
                }
                return 0;
            };
            HlsPlayerVideoWrapper.prototype.setVolume = function (volume) {
                if (this.videoTag) {
                    this.videoTag.volume = volume;
                }
            };
            HlsPlayerVideoWrapper.prototype.isMuted = function () {
                if (this.videoTag) {
                    return this.videoTag.muted;
                }
                return false;
            };
            HlsPlayerVideoWrapper.prototype.mute = function () {
                if (this.videoTag) {
                    this.videoTag.muted = true;
                }
            };
            HlsPlayerVideoWrapper.prototype.unmute = function () {
                if (this.videoTag) {
                    this.videoTag.muted = false;
                }
            };
            HlsPlayerVideoWrapper.prototype.setCurrentTime = function (time) {
                if (this.videoTag) {
                    this.videoTag.currentTime = time;
                }
            };
            HlsPlayerVideoWrapper.prototype.isSeeking = function () {
                if (this.videoTag) {
                    return this.videoTag.seeking;
                }
                return false;
            };
            HlsPlayerVideoWrapper.prototype.getBufferedDuration = function () {
                var buffered = 0;
                if (this.videoTag && this.videoTag.buffered && this.videoTag.buffered.length) {
                    buffered = this.videoTag.buffered.end(this.videoTag.buffered.length - 1);
                }
                return buffered;
            };
            HlsPlayerVideoWrapper.prototype.setSource = function (videoSrc) {
                if (this.hlsPlayer && videoSrc && videoSrc.length) {
                    if (videoSrc[0].url) {
                        this.hlsPlayer.loadSource(videoSrc[0].url);
                    }
                }
            };
            HlsPlayerVideoWrapper.prototype.addNativeClosedCaption = function (ccUrls, format, localizationHelper) {
                if (ccUrls && ccUrls.length && this.videoTag) {
                    this.clearNativeCc(this.videoTag);
                    this.videoTag.setAttribute('crossorigin', 'anonymous');
                    for (var _i = 0, ccUrls_4 = ccUrls; _i < ccUrls_4.length; _i++) {
                        var ccUrl = ccUrls_4[_i];
                        if (ccUrl.ccType === format) {
                            var track = document.createElement('track');
                            track.setAttribute('src', ccUrl.url);
                            track.setAttribute('kind', 'captions');
                            track.setAttribute('srclang', ccUrl.locale);
                            track.setAttribute('label', localizationHelper.getLanguageNameFromLocale(ccUrl.locale));
                            this.videoTag.appendChild(track);
                        }
                    }
                    this.videoTag.load && this.videoTag.load();
                }
            };
            HlsPlayerVideoWrapper.prototype.clearNativeCc = function (currentVideoTag) {
                if (currentVideoTag) {
                    var currentTracks = htmlExtensions_12.selectElements('track', currentVideoTag);
                    for (var _i = 0, currentTracks_4 = currentTracks; _i < currentTracks_4.length; _i++) {
                        var track = currentTracks_4[_i];
                        if (track && track.parentElement === currentVideoTag) {
                            currentVideoTag.removeChild(track);
                        }
                    }
                }
            };
            HlsPlayerVideoWrapper.prototype.clearSource = function () {
                if (this.hlsPlayer) {
                    this.hlsPlayer.detachMedia();
                }
            };
            HlsPlayerVideoWrapper.prototype.setPosterFrame = function (url) {
                if (url && this.videoTag && this.videoTag.poster !== url) {
                    this.videoTag.poster = url;
                }
            };
            HlsPlayerVideoWrapper.prototype.getError = function () {
                var contentErrorCode;
                if (this.videoTag !== null && this.videoTag.error !== null) {
                    switch (this.videoTag.error.code) {
                        case this.videoTag.error.MEDIA_ERR_ABORTED:
                            contentErrorCode = player_data_interfaces_7.VideoErrorCodes.MediaErrorAborted;
                            break;
                        case this.videoTag.error.MEDIA_ERR_NETWORK:
                            contentErrorCode = player_data_interfaces_7.VideoErrorCodes.MediaErrorNetwork;
                            break;
                        case this.videoTag.error.MEDIA_ERR_DECODE:
                            contentErrorCode = player_data_interfaces_7.VideoErrorCodes.MediaErrorDecode;
                            break;
                        case this.videoTag.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                            contentErrorCode = player_data_interfaces_7.VideoErrorCodes.MediaErrorSourceNotSupported;
                            break;
                        default:
                            contentErrorCode = player_data_interfaces_7.VideoErrorCodes.MediaErrorUnknown;
                            break;
                    }
                    return { errorCode: contentErrorCode };
                }
                return null;
            };
            HlsPlayerVideoWrapper.prototype.setPlaybackRate = function (rate) {
                if (this.videoTag && rate && utility_14.isNumber(rate)) {
                    this.videoTag.playbackRate = rate;
                }
            };
            HlsPlayerVideoWrapper.prototype.getPlayerTechName = function () {
                return 'hlsplayer';
            };
            HlsPlayerVideoWrapper.prototype.getWrapperName = function () {
                return 'hlsplayerVideo';
            };
            HlsPlayerVideoWrapper.prototype.getAudioTracks = function () {
                return null;
            };
            HlsPlayerVideoWrapper.prototype.switchToAudioTrack = function (trackIndex) {
                throw new Error('HTML5.switchToAudioTrack is not supported');
            };
            HlsPlayerVideoWrapper.prototype.getCurrentAudioTrack = function () {
                return null;
            };
            HlsPlayerVideoWrapper.prototype.getVideoTracks = function () {
                return null;
            };
            HlsPlayerVideoWrapper.prototype.switchToVideoTrack = function (trackIndex) {
                throw new Error('HTML5.switchToVideoTrack is not supported');
            };
            HlsPlayerVideoWrapper.prototype.getCurrentVideoTrack = function () {
                return null;
            };
            HlsPlayerVideoWrapper.prototype.setAutoPlay = function () {
                this.videoTag.autoplay = true;
                this.videoTag.muted = true;
                this.setVolume(0);
                this.videoTag.setAttribute('playsinline', '');
                this.videoTag.setAttribute('muted', '');
            };
            HlsPlayerVideoWrapper.prototype.dispose = function () {
                this.unbindVideoEvents();
                this.clearSource();
                this.hlsPlayer && this.hlsPlayer.dispose && this.hlsPlayer.dispose();
                this.hlsPlayer = null;
            };
            HlsPlayerVideoWrapper.pollingInterval = 50;
            HlsPlayerVideoWrapper.pollingTimeout = 30000;
            HlsPlayerVideoWrapper.supportedMediaTypes = [player_data_interfaces_7.MediaTypes.HLS, player_data_interfaces_7.MediaTypes.MP4];
            return HlsPlayerVideoWrapper;
        }());
        exports.HlsPlayerVideoWrapper = HlsPlayerVideoWrapper;
    });
    define("video-wrappers/native-video-wrapper", ["require", "exports", "mwf/utilities/htmlExtensions"], function (require, exports, htmlExtensions_13) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.NativeVideoWrapper = void 0;
        var NativeVideoWrapper = (function () {
            function NativeVideoWrapper() {
                var _this = this;
                this.triggerEvents = function (event) {
                    var mediaEvent = null;
                    if (event.state === 'MediaOpened') {
                        _this.ensureLoadEventRaised();
                    }
                    else if (event.state === 'MediaEnded') {
                        mediaEvent = document.createEvent('CustomEvent');
                        mediaEvent.initEvent('ended');
                    }
                    else if (event.state === 'MediaFailed') {
                        mediaEvent = document.createEvent('CustomEvent');
                        mediaEvent.initEvent('error');
                    }
                    else {
                        mediaEvent = _this.createMediaPlaybackEvent(event.target);
                    }
                    if (mediaEvent) {
                        _this.onMediaEventCallback(mediaEvent);
                    }
                };
            }
            NativeVideoWrapper.prototype.bindVideoEvents = function (onMediaEventCallback) {
                if (this.hasStoreApi) {
                    this.onMediaEventCallback = onMediaEventCallback;
                    window.storeApi.backgroundVideoPlayer.addEventListener('mediaplayerstatechanged', this.triggerEvents);
                }
            };
            NativeVideoWrapper.prototype.unbindVideoEvents = function () {
                if (this.hasStoreApi) {
                    window.storeApi.backgroundVideoPlayer.removeEventListener('mediaplayerstatechanged', this.triggerEvents);
                }
            };
            NativeVideoWrapper.prototype.load = function (playerContainer, playOnLoad, onLoadedCallback, onLoadFailedCallback, onAudioStreamSelectedCallback) {
                if (!playerContainer) {
                    console.log('player container is null');
                    onLoadFailedCallback && onLoadFailedCallback();
                }
                if (this.hasLoaded) {
                    this.dispose();
                }
                this.playerContainer = playerContainer;
                var videoTag = htmlExtensions_13.selectFirstElementT('video', this.playerContainer);
                if (!videoTag && onLoadFailedCallback) {
                    console.log('video tag not found');
                    onLoadFailedCallback();
                }
                if (window &&
                    window.storeApi &&
                    window.storeApi.backgroundVideoPlayer) {
                    this.hasStoreApi = true;
                }
                else if (onLoadFailedCallback) {
                    console.log('native store host api not found');
                    this.hasStoreApi = false;
                    onLoadFailedCallback();
                }
                this.autoPlay = playOnLoad;
                if (videoTag && this.hasStoreApi) {
                    var element = videoTag;
                    while (element.parentElement) {
                        element.style.background = 'transparent';
                        element = element.parentElement;
                    }
                    var fakeVideo = document.createElement('DIV');
                    fakeVideo.className = videoTag.className;
                    fakeVideo.style.position = 'absolute';
                    fakeVideo.style.width = '100%';
                    fakeVideo.style.height = '100%';
                    videoTag.parentNode.insertBefore(fakeVideo, videoTag);
                    videoTag.remove();
                }
                if (onLoadedCallback) {
                    setTimeout(onLoadedCallback, 0);
                }
                this.hasLoaded = true;
            };
            NativeVideoWrapper.prototype.play = function () {
                if (!this.hasStoreApi) {
                    return;
                }
                if (!this.autoPlay && this.sourceUri) {
                    window.storeApi.backgroundVideoPlayer.source = this.sourceUri;
                    this.sourceUri = null;
                }
                else {
                    window.storeApi.backgroundVideoPlayer.play();
                }
            };
            NativeVideoWrapper.prototype.pause = function () {
                if (!this.hasStoreApi) {
                    return;
                }
                window.storeApi.backgroundVideoPlayer.pause();
            };
            NativeVideoWrapper.prototype.isPaused = function () {
                if (!this.hasStoreApi) {
                    return false;
                }
                return !(window.storeApi.backgroundVideoPlayer.mediaPlaybackState === 'Opening' ||
                    window.storeApi.backgroundVideoPlayer.mediaPlaybackState === 'Buffering' ||
                    window.storeApi.backgroundVideoPlayer.mediaPlaybackState === 'Playing');
            };
            NativeVideoWrapper.prototype.isLive = function () {
                return false;
            };
            NativeVideoWrapper.prototype.getPlayPosition = function () {
                return { currentTime: 0, endTime: 0, startTime: 0 };
            };
            NativeVideoWrapper.prototype.getVolume = function () {
                return 0;
            };
            NativeVideoWrapper.prototype.setVolume = function (volume) {
            };
            NativeVideoWrapper.prototype.isMuted = function () {
                if (!this.hasStoreApi) {
                    return false;
                }
                return window.storeApi.backgroundVideoPlayer.isMuted;
            };
            NativeVideoWrapper.prototype.mute = function () {
                if (!this.hasStoreApi) {
                    return;
                }
                window.storeApi.backgroundVideoPlayer.isMuted = true;
            };
            NativeVideoWrapper.prototype.unmute = function () {
                if (!this.hasStoreApi) {
                    return;
                }
                window.storeApi.backgroundVideoPlayer.isMuted = false;
            };
            NativeVideoWrapper.prototype.setCurrentTime = function (time) {
            };
            NativeVideoWrapper.prototype.isSeeking = function () {
                return false;
            };
            NativeVideoWrapper.prototype.getBufferedDuration = function () {
                return 0;
            };
            NativeVideoWrapper.prototype.setSource = function (videoSrc) {
                if (!this.hasStoreApi) {
                    return;
                }
                if (window.storeApi.backgroundVideoPlayer.source) {
                    this.ensureLoadEventRaised();
                    var mediaEvent = this.createMediaPlaybackEvent(window.storeApi.backgroundVideoPlayer);
                    if (mediaEvent) {
                        this.onMediaEventCallback(mediaEvent);
                    }
                }
                else {
                    var videoUrl = videoSrc[0].url;
                    if (videoUrl.charAt(0) === '/') {
                        videoUrl = 'http:' + videoUrl;
                    }
                    if (this.autoPlay) {
                        window.storeApi.backgroundVideoPlayer.source = videoUrl;
                    }
                    else {
                        this.sourceUri = videoUrl;
                    }
                }
            };
            NativeVideoWrapper.prototype.addNativeClosedCaption = function (ccUrls, format, localizationHelper) {
            };
            NativeVideoWrapper.prototype.clearSource = function () {
                if (!this.hasStoreApi) {
                    return;
                }
                window.storeApi.backgroundVideoPlayer.source = null;
                window.storeApi.backgroundVideoPlayer.posterSource = null;
            };
            NativeVideoWrapper.prototype.setPosterFrame = function (url) {
                if (!this.hasStoreApi) {
                    return;
                }
                if (!window.storeApi.backgroundVideoPlayer.posterSource) {
                    if (url.charAt(0) === '/') {
                        url = 'http:' + url;
                    }
                    window.storeApi.backgroundVideoPlayer.posterSource = url;
                }
            };
            NativeVideoWrapper.prototype.getError = function () {
                return null;
            };
            NativeVideoWrapper.prototype.setPlaybackRate = function (rate) {
            };
            NativeVideoWrapper.prototype.getPlayerTechName = function () {
                return 'nativeplayer';
            };
            NativeVideoWrapper.prototype.getWrapperName = function () {
                return 'nativeplayer';
            };
            NativeVideoWrapper.prototype.getAudioTracks = function () {
                return null;
            };
            NativeVideoWrapper.prototype.switchToAudioTrack = function (trackIndex) {
                throw new Error('HTML5.switchToAudioTrack is not supported');
            };
            NativeVideoWrapper.prototype.getCurrentAudioTrack = function () {
                return null;
            };
            NativeVideoWrapper.prototype.getVideoTracks = function () {
                return null;
            };
            NativeVideoWrapper.prototype.switchToVideoTrack = function (trackIndex) {
                throw new Error('HTML5.switchToVideoTrack is not supported');
            };
            NativeVideoWrapper.prototype.getCurrentVideoTrack = function () {
                return null;
            };
            NativeVideoWrapper.prototype.setAutoPlay = function () {
            };
            NativeVideoWrapper.prototype.dispose = function () {
                this.unbindVideoEvents();
                this.clearSource();
            };
            NativeVideoWrapper.prototype.ensureLoadEventRaised = function () {
                if (this.hasRaisedLoadedEvent) {
                    return;
                }
                if (this.onMediaEventCallback) {
                    var mediaEvent = document.createEvent('CustomEvent');
                    mediaEvent.initEvent('loadeddata', false, false);
                    this.hasRaisedLoadedEvent = true;
                    this.onMediaEventCallback(mediaEvent);
                }
            };
            NativeVideoWrapper.prototype.createMediaPlaybackEvent = function (backgroundPlayer) {
                var mediaEvent = null;
                switch (backgroundPlayer.mediaPlaybackState) {
                    case 'Paused':
                        mediaEvent = document.createEvent('CustomEvent');
                        mediaEvent.initEvent('pause', false, false);
                        break;
                    case 'Playing':
                        mediaEvent = document.createEvent('CustomEvent');
                        mediaEvent.initEvent('playing', false, false);
                        break;
                }
                return mediaEvent;
            };
            return NativeVideoWrapper;
        }());
        exports.NativeVideoWrapper = NativeVideoWrapper;
    });
    define("utilities/stopwatch", ["require", "exports", "mwf/utilities/utility"], function (require, exports, utility_15) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.Stopwatch = void 0;
        var Stopwatch = (function () {
            function Stopwatch() {
                this.timestamp = null;
                this.timeValue = null;
                this.firstValue = null;
                this.totalValue = null;
                this.intervals = null;
            }
            Stopwatch.prototype.start = function () {
                if (!this.timestamp) {
                    this.timestamp = new Date();
                    this.intervals++;
                }
            };
            Stopwatch.prototype.stop = function () {
                if (this.timestamp) {
                    var inc = new Date().valueOf() - this.timestamp.valueOf();
                    this.timeValue += inc;
                    this.totalValue += inc;
                    if (!this.firstValue) {
                        this.firstValue = this.timeValue;
                    }
                    this.timestamp = null;
                }
            };
            Stopwatch.prototype.reset = function () {
                this.timestamp = null;
                this.timeValue = this.intervals = this.firstValue = this.totalValue = 0;
            };
            Stopwatch.prototype.isStarted = function () {
                return !!this.intervals;
            };
            Stopwatch.prototype.isStopped = function () {
                return !this.timestamp;
            };
            Stopwatch.prototype.hasReached = function (value) {
                if (utility_15.isNumber(value) && this.getValue() >= value) {
                    if (this.timestamp) {
                        this.totalValue += new Date().valueOf() - this.timestamp.valueOf();
                        this.timestamp = new Date();
                    }
                    this.timeValue = 0;
                    this.intervals = 0;
                    return true;
                }
                return false;
            };
            Stopwatch.prototype.getValue = function () {
                var value = this.timeValue;
                if (this.timestamp) {
                    value += new Date().valueOf() - this.timestamp.valueOf();
                }
                return value;
            };
            Stopwatch.prototype.getTotalValue = function () {
                var value = this.totalValue;
                if (this.timestamp) {
                    value += new Date().valueOf() - this.timestamp.valueOf();
                }
                return value;
            };
            Stopwatch.prototype.getFirstValue = function () {
                return this.firstValue;
            };
            Stopwatch.prototype.getIntervals = function () {
                return this.intervals;
            };
            return Stopwatch;
        }());
        exports.Stopwatch = Stopwatch;
    });
    define("helpers/screen-manager-helper", ["require", "exports"], function (require, exports) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.ScreenManagerHelper = void 0;
        var ScreenManagerHelper = (function () {
            function ScreenManagerHelper() {
                this.screenElements = [];
                this.nextScreenElementId = 0;
            }
            ScreenManagerHelper.prototype.registerElement = function (element) {
                if (element.HtmlObject == null || element.Priority == null || element.Height == null) {
                    return null;
                }
                if (element.Transition == null) {
                    element.Transition = 'bottom 0.5s ease-in';
                }
                if (element.Height <= 0) {
                    element.Height = element.HtmlObject.clientHeight;
                }
                element.Id = this.nextScreenElementId;
                this.nextScreenElementId++;
                element.HtmlObject.style.bottom = '-' + element.Height + 'px';
                element.HtmlObject.style.transition = element.Transition;
                this.screenElements.push(element);
                this.sortScreenElements();
                return element;
            };
            ScreenManagerHelper.prototype.updateElementDisplay = function (element, isVisible) {
                var offset = 0;
                var updateOffset = false;
                for (var i = (this.screenElements.length - 1); i >= 0; i--) {
                    var item = this.screenElements[i];
                    if (item.Id === element.Id && item.IsVisible !== isVisible) {
                        item.IsVisible = isVisible;
                        updateOffset = true;
                        if (item.IsVisible) {
                            item.HtmlObject.style.bottom = offset + 'px';
                            offset += item.Height;
                        }
                        else {
                            item.HtmlObject.style.bottom = '-' + element.Height + 'px';
                        }
                    }
                    else if (item.IsVisible) {
                        if (updateOffset) {
                            item.HtmlObject.style.bottom = offset + 'px';
                        }
                        offset += item.Height;
                    }
                }
            };
            ScreenManagerHelper.prototype.updateElementHeight = function (element, height) {
                var offset = 0;
                var updateOffset = false;
                for (var i = (this.screenElements.length - 1); i >= 0; i--) {
                    var item = this.screenElements[i];
                    if (item.Id === element.Id && item.Height !== height) {
                        item.Height = height;
                        updateOffset = true;
                        if (item.IsVisible) {
                            item.HtmlObject.style.bottom = offset + 'px';
                            offset += item.Height;
                        }
                    }
                    else if (item.IsVisible) {
                        if (updateOffset) {
                            item.HtmlObject.style.bottom = offset + 'px';
                        }
                        offset += item.Height;
                    }
                }
            };
            ScreenManagerHelper.prototype.deleteElement = function (element) {
                this.updateElementDisplay(element, false);
                var index = -1;
                for (var i = 0; i < this.screenElements.length; i++) {
                    if (this.screenElements[i].Id === element.Id) {
                        index = i;
                        break;
                    }
                }
                this.screenElements.splice(index, 1);
            };
            ScreenManagerHelper.prototype.sortScreenElements = function () {
                this.screenElements.sort((function (a, b) {
                    if (a.Priority < b.Priority) {
                        return -1;
                    }
                    if (a.Priority > b.Priority) {
                        return 1;
                    }
                    return 0;
                }));
            };
            return ScreenManagerHelper;
        }());
        exports.ScreenManagerHelper = ScreenManagerHelper;
    });
    define("helpers/interactive-triggers-helper", ["require", "exports", "utilities/player-utility", "mwf/utilities/utility", "mwf/utilities/htmlExtensions", "constants/player-constants", "data/video-shim-data-fetcher", "helpers/localization-helper"], function (require, exports, player_utility_8, utility_16, htmlExtensions_14, player_constants_7, video_shim_data_fetcher_2, localization_helper_2) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.VideoPlayerInteractiveTriggersHelper = exports.CustomHtmlPostMessageType = exports.OverlayTemplate = exports.OverlayType = void 0;
        var OverlayType;
        (function (OverlayType) {
            OverlayType[OverlayType["WebLink"] = 1] = "WebLink";
            OverlayType[OverlayType["StoreOffer"] = 2] = "StoreOffer";
            OverlayType[OverlayType["VideoBranch"] = 3] = "VideoBranch";
            OverlayType[OverlayType["Poll"] = 4] = "Poll";
            OverlayType[OverlayType["Graphic"] = 5] = "Graphic";
            OverlayType[OverlayType["CustomHtml"] = 6] = "CustomHtml";
        })(OverlayType = exports.OverlayType || (exports.OverlayType = {}));
        var OverlayTemplate;
        (function (OverlayTemplate) {
            OverlayTemplate["LowerThird"] = "lowerThird";
            OverlayTemplate["UpperThird"] = "upperThird";
            OverlayTemplate["LeftVertical"] = "leftVertical";
            OverlayTemplate["RightVertical"] = "rightVertical";
            OverlayTemplate["Fullscreen"] = "fullScreen";
            OverlayTemplate["Default"] = "default";
        })(OverlayTemplate = exports.OverlayTemplate || (exports.OverlayTemplate = {}));
        (function (CustomHtmlPostMessageType) {
            CustomHtmlPostMessageType["VideoBranch"] = "VideoBranch";
            CustomHtmlPostMessageType["WebLink"] = "WebLink";
            CustomHtmlPostMessageType["Telemetry"] = "Telemetry";
        })(exports.CustomHtmlPostMessageType || (exports.CustomHtmlPostMessageType = {}));
        var VideoPlayerInteractiveTriggersHelper = (function () {
            function VideoPlayerInteractiveTriggersHelper(playerContainer, interactivityInfoUrl, corePlayer, localizationHelper, telemetryEventCallback) {
                var _this = this;
                this.playerContainer = playerContainer;
                this.interactivityInfoUrl = interactivityInfoUrl;
                this.telemetryEventCallback = telemetryEventCallback;
                this.streamLinkBackStack = [];
                this.screenManagerObjects = [];
                this.minimizedOverlays = {};
                this.onScreenOverlays = {};
                this.interactedTriggers = [];
                this.isEndSlateOn = false;
                this.isStreamLinkBackStackPop = false;
                this.isInteractivityJSONReady = false;
                this.preRollDefaultDurationMs = 5000;
                this.onInteractivityInfoSuccess = function (result) {
                    try {
                        _this.interactivityInfo = JSON.parse(result);
                        _this.preloadContent();
                        htmlExtensions_14.addThrottledEvent(window, htmlExtensions_14.eventTypes.resize, _this.onResized);
                        window.addEventListener('message', _this.onCustomHtmlMessageReceived);
                        _this.isInteractivityJSONReady = true;
                    }
                    catch (e) {
                        _this.isInteractivityJSONReady = true;
                    }
                };
                this.onCustomHtmlMessageReceived = function (event) {
                    if (!!event && !!event.data && !!event.data.type) {
                        var overlayElementId = event.data.customHtmlOverlayId;
                        if (!!overlayElementId) {
                            var overlayId = overlayElementId.split('-').pop();
                            var onScreenOverlay = _this.onScreenOverlays[overlayId];
                            if (!!overlayId && !!onScreenOverlay) {
                                switch (event.data.type) {
                                    case 'VideoBranch':
                                        if (!!event.data.streamLink) {
                                            _this.handleClickByOverlayType(onScreenOverlay, OverlayType.VideoBranch, event.data.streamLink);
                                        }
                                        break;
                                    case 'WebLink':
                                    default:
                                        if (!!event.data.webLink) {
                                            _this.handleClickByOverlayType(onScreenOverlay, OverlayType.WebLink, event.data.webLink);
                                        }
                                        break;
                                }
                            }
                        }
                    }
                };
                this.onInteractivityInfoFailed = function () {
                    _this.isInteractivityJSONReady = true;
                };
                this.onMinimizeClick = function (event) {
                    var target = htmlExtensions_14.getEventTargetOrSrcElement(event);
                    if (!target || !target.parentElement || !target.parentElement.parentElement) {
                        return;
                    }
                    var overlayElementId = target.parentElement.id;
                    var overlayId = overlayElementId.split('-').pop();
                    if (overlayId) {
                        var onScreenOverlay = _this.onScreenOverlays[overlayId];
                        _this.minimizeOverlay(onScreenOverlay);
                        _this.telemetryEventCallback && _this.telemetryEventCallback(player_constants_7.PlayerEvents.InteractiveOverlayMinimize, onScreenOverlay);
                    }
                };
                this.onMaximizeButtonClick = function (event) {
                    var target = htmlExtensions_14.getEventTargetOrSrcElement(event);
                    if (!target || !target.parentElement || !target.parentElement.parentElement) {
                        return;
                    }
                    var maximizeButtonElementId = target.id;
                    var triggerWindowId = maximizeButtonElementId.split('-').pop();
                    if (triggerWindowId) {
                        var minimizedOverlay = _this.minimizedOverlays[triggerWindowId];
                        if (minimizedOverlay) {
                            _this.removeMaximizeButton(minimizedOverlay);
                            delete _this.minimizedOverlays[triggerWindowId];
                            _this.createContainerAndShowOverlay(minimizedOverlay.onScreenOverlay.overlay, minimizedOverlay.onScreenOverlay.trigger, true);
                            _this.telemetryEventCallback &&
                                _this.telemetryEventCallback(player_constants_7.PlayerEvents.InteractiveOverlayMinimize, minimizedOverlay.onScreenOverlay);
                        }
                    }
                };
                this.onOverlayClick = function (event) {
                    var target = htmlExtensions_14.getEventTargetOrSrcElement(event);
                    if (!target || !target.parentElement || !target.parentElement.parentElement) {
                        return;
                    }
                    var overlayElementId = target.parentElement.parentElement.id;
                    var overlayId = overlayElementId.split('-').pop();
                    var onScreenOverlay = _this.onScreenOverlays[overlayId];
                    if (onScreenOverlay.trigger.triggerWindowId) {
                        _this.interactedTriggers.push(onScreenOverlay.trigger.triggerWindowId);
                    }
                    _this.handleClickByOverlayType(onScreenOverlay);
                };
                this.onBackButtonClick = function (event) {
                    if (_this.streamLinkBackStack.length < 1) {
                        return;
                    }
                    _this.streamLinkBackstackPop();
                    _this.telemetryEventCallback && _this.telemetryEventCallback(player_constants_7.PlayerEvents.InteractiveBackButtonClick);
                };
                this.onResized = function () {
                    if (Object.keys(_this.onScreenOverlays).length < 1 || !_this.interactivityInfo) {
                        return;
                    }
                    utility_16.getDimensions(_this.playerContainer);
                    for (var _i = 0, _a = Object.keys(_this.onScreenOverlays); _i < _a.length; _i++) {
                        var overlayId = _a[_i];
                        var onScreenOverlay = _this.onScreenOverlays[overlayId];
                        if (utility_16.getDimensions(_this.playerContainer).width < utility_16.Viewports.allWidths[1]) {
                            _this.hideOverlay(onScreenOverlay);
                            return;
                        }
                    }
                    if (_this.screenManagerObjects.length > 0) {
                        for (var _b = 0, _c = _this.screenManagerObjects; _b < _c.length; _b++) {
                            var screenManagerObject = _c[_b];
                            _this.corePlayer.screenManagerHelper.updateElementHeight(screenManagerObject, _this.getOverlayHeight(screenManagerObject.HtmlObject));
                        }
                    }
                };
                this.onPlayerEvent = function (e) {
                    switch (e.name) {
                        case player_constants_7.PlayerEvents.ContentComplete:
                            _this.onContentComplete();
                            break;
                        case player_constants_7.PlayerEvents.Seek:
                            if (e.data && e.data.seekTo) {
                                _this.onSeek(e.data.seekTo);
                            }
                            break;
                        case player_constants_7.PlayerEvents.Resume:
                            _this.onPlay();
                            break;
                    }
                };
                this.corePlayer = corePlayer;
                this.localizationHelper = localizationHelper;
                this.corePlayer.addPlayerEventListener(this.onPlayerEvent);
                this.createBackButton();
                if (playerContainer && interactivityInfoUrl) {
                    this.requestInteractivityJSON();
                }
            }
            VideoPlayerInteractiveTriggersHelper.prototype.dispose = function () {
                this.hideAllOverlays();
                htmlExtensions_14.removeEvent(window, htmlExtensions_14.eventTypes.resize, this.onResized);
            };
            VideoPlayerInteractiveTriggersHelper.prototype.requestInteractivityJSON = function () {
                player_utility_8.PlayerUtility.ajax(this.interactivityInfoUrl, this.onInteractivityInfoSuccess, this.onInteractivityInfoFailed);
            };
            VideoPlayerInteractiveTriggersHelper.prototype.createGraphicContainer = function (currentOverlay) {
                var graphicContainerId = 'interactive-graphic-overlay-' + currentOverlay.overlay.overlayId;
                if (!htmlExtensions_14.selectFirstElement('#' + graphicContainerId, this.playerContainer)) {
                    var html = "<img aria-hidden='true' alt='' id='" + graphicContainerId + "' class='f-interactive-overlay \n                interactive-fullscreen interactive-graphic'>\n            <img>";
                    this.appendHtmlToPlayerContainer(html, graphicContainerId, currentOverlay);
                }
                currentOverlay.overlayContainer = htmlExtensions_14.selectFirstElement('#' + graphicContainerId, this.playerContainer);
            };
            VideoPlayerInteractiveTriggersHelper.prototype.createCustomHtmlContainer = function (currentOverlay) {
                var overlayTemplateClass = 'interactive-fullscreen';
                switch (currentOverlay.trigger.overlayTemplate) {
                    case OverlayTemplate.LeftVertical:
                        overlayTemplateClass = 'interactive-left';
                        break;
                    case OverlayTemplate.RightVertical:
                        overlayTemplateClass = 'interactive-right';
                        break;
                    case OverlayTemplate.UpperThird:
                        overlayTemplateClass = 'interactive-upper';
                        break;
                    case OverlayTemplate.LowerThird:
                        overlayTemplateClass = 'interactive-lower';
                        break;
                }
                var customHtmlOverlayId = 'custom-html-overlay-' + currentOverlay.overlay.overlayId;
                var html = "<div aria-hidden='true' id='" + customHtmlOverlayId + "' \n        class='f-interactive-overlay " + overlayTemplateClass + " f-interactive-overlay-customhtml'>\n        <iframe src='" + currentOverlay.overlay.overlayData.customHtml + "' name='" + customHtmlOverlayId + "' \n        style='height: 100%; width: 100%; border: none;'></iframe>\n        </div>";
                this.appendHtmlToPlayerContainer(html, customHtmlOverlayId, currentOverlay);
                this.createScreenManagerObject(currentOverlay);
            };
            VideoPlayerInteractiveTriggersHelper.prototype.createBakedInOverlayContainer = function (currentOverlay) {
                var overlayTemplateClass = 'interactive-lower';
                var overlayMinimizeButtonClass = 'f-overlay-minimize-lowerthird';
                switch (currentOverlay.trigger.overlayTemplate) {
                    case OverlayTemplate.LeftVertical:
                        overlayTemplateClass = 'interactive-left';
                        break;
                    case OverlayTemplate.RightVertical:
                        overlayTemplateClass = 'interactive-right';
                        break;
                    case OverlayTemplate.UpperThird:
                        overlayMinimizeButtonClass = 'f-overlay-minimize-upperthird';
                        overlayTemplateClass = 'interactive-upper';
                        break;
                }
                var bakedInOverlayContainerId = 'interactive-overlay-' + currentOverlay.overlay.overlayId;
                if (!htmlExtensions_14.selectFirstElement('#' + bakedInOverlayContainerId, this.playerContainer)) {
                    var html = "<div aria-hidden='true' id='" + bakedInOverlayContainerId + "' class='f-interactive-overlay " + overlayTemplateClass + "'>\n<div class='f-overlay-info'>\n    <h2 class='c-headline'></h2>\n    <p class='c-paragraph'></p>\n</div>\n<div class='f-overlay-link'>\n    <button class='c-action-trigger f-heavyweight'></button>\n</div>\n<button type='button' class='f-overlay-minimizeMaximize " + overlayMinimizeButtonClass + " c-glyph glyph-chevron-left'>\n</button>  \n</div>";
                    this.appendHtmlToPlayerContainer(html, bakedInOverlayContainerId, currentOverlay);
                }
                currentOverlay.overlayContainer = htmlExtensions_14.selectFirstElement('#' + bakedInOverlayContainerId, this.playerContainer);
                currentOverlay.overlayHeadline = htmlExtensions_14.selectFirstElement('h2', currentOverlay.overlayContainer);
                currentOverlay.overlayText = htmlExtensions_14.selectFirstElement('p', currentOverlay.overlayContainer);
                currentOverlay.overlayButton = htmlExtensions_14.selectFirstElement('button', currentOverlay.overlayContainer);
                currentOverlay.minimizeButton = htmlExtensions_14.selectFirstElement('.f-overlay-minimizeMaximize', currentOverlay.overlayContainer);
                this.createScreenManagerObject(currentOverlay);
                htmlExtensions_14.addEvent(currentOverlay.overlayButton, htmlExtensions_14.eventTypes.click, this.onOverlayClick);
                htmlExtensions_14.addEvent(currentOverlay.minimizeButton, htmlExtensions_14.eventTypes.click, this.onMinimizeClick);
            };
            VideoPlayerInteractiveTriggersHelper.prototype.createOverlayContainer = function (currentOverlay) {
                switch (currentOverlay.overlay.overlayType) {
                    case OverlayType.StoreOffer:
                    case OverlayType.WebLink:
                    case OverlayType.VideoBranch:
                        this.createBakedInOverlayContainer(currentOverlay);
                        break;
                    case OverlayType.Graphic:
                        this.createGraphicContainer(currentOverlay);
                        break;
                    case OverlayType.CustomHtml:
                        this.createCustomHtmlContainer(currentOverlay);
                        break;
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.appendHtmlToPlayerContainer = function (html, containerId, currentOverlay) {
                var tempDiv = document.createElement('div');
                tempDiv.innerHTML = html;
                var videoClosedCaptionContainer = htmlExtensions_14.selectFirstElement('.f-video-cc-overlay', this.playerContainer);
                this.playerContainer.insertBefore(tempDiv.firstChild, videoClosedCaptionContainer);
                currentOverlay.overlayContainer = htmlExtensions_14.selectFirstElement('#' + containerId, this.playerContainer);
            };
            VideoPlayerInteractiveTriggersHelper.prototype.createScreenManagerObject = function (currentOverlay) {
                if (currentOverlay.trigger.overlayTemplate === OverlayTemplate.LowerThird) {
                    this.screenManagerObjects.push(this.corePlayer.screenManagerHelper.registerElement({
                        HtmlObject: currentOverlay.overlayContainer,
                        Height: this.getOverlayHeight(currentOverlay.overlayContainer),
                        Id: null,
                        IsVisible: false,
                        Priority: 1,
                        Transition: null
                    }));
                    if (this.screenManagerObjects[this.screenManagerObjects.length - 1] == null) {
                        this.screenManagerObjects.pop();
                    }
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.createBackButton = function () {
                if (!this.backButtonContainer) {
                    var html = "<button type='button' aria-hidden='true' class='f-interactive-back-button c-glyph glyph-chevron-left'>\n                </button>";
                    var tempDiv = document.createElement('div');
                    tempDiv.innerHTML = html;
                    var videoClosedCaptionContainer = htmlExtensions_14.selectFirstElement('.f-video-cc-overlay', this.playerContainer);
                    this.playerContainer.insertBefore(tempDiv.firstChild, videoClosedCaptionContainer);
                    this.backButtonContainer = htmlExtensions_14.selectFirstElement('.f-interactive-back-button', this.playerContainer);
                    this.backButtonContainer.setAttribute(VideoPlayerInteractiveTriggersHelper.ariaLabel, this.localizationHelper.getLocalizedValue(localization_helper_2.playerLocKeys.close_text));
                }
                htmlExtensions_14.addEvent(this.backButtonContainer, htmlExtensions_14.eventTypes.click, this.onBackButtonClick);
            };
            VideoPlayerInteractiveTriggersHelper.prototype.removeMaximizeButton = function (minimizedOverlay) {
                htmlExtensions_14.removeEvent(minimizedOverlay.maximizeButton, htmlExtensions_14.eventTypes.click, this.onMaximizeButtonClick);
                htmlExtensions_14.removeElement(minimizedOverlay.maximizeButton);
            };
            VideoPlayerInteractiveTriggersHelper.prototype.updateCurrentOverlay = function (currentTime) {
                if (!this.interactivityInfo) {
                    return;
                }
                this.updateInteractivity(currentTime);
            };
            VideoPlayerInteractiveTriggersHelper.prototype.updateOverlays = function (currentTime) {
                var currentTimeTicks = currentTime * 10000000;
                var midWindowOnTriggers = {};
                for (var _i = 0, _a = this.interactivityInfo.triggers; _i < _a.length; _i++) {
                    var trigger = _a[_i];
                    if (trigger.triggerTimeTicks > currentTimeTicks) {
                        break;
                    }
                    if (trigger.isOverlayOn === true &&
                        !this.userAlreadyInteractedWithTrigger(trigger.triggerWindowId)) {
                        midWindowOnTriggers[trigger.triggerWindowId] = trigger;
                    }
                    else {
                        delete midWindowOnTriggers[trigger.triggerWindowId];
                    }
                }
                for (var _b = 0, _c = Object.keys(this.minimizedOverlays); _b < _c.length; _b++) {
                    var triggerWindowId = _c[_b];
                    var minimizedOverlay = this.minimizedOverlays[triggerWindowId];
                    var shouldOverlayStillBeOn = midWindowOnTriggers[minimizedOverlay.onScreenOverlay.trigger.triggerWindowId] ? true : false;
                    if (shouldOverlayStillBeOn) {
                        delete midWindowOnTriggers[minimizedOverlay.onScreenOverlay.trigger.triggerWindowId];
                    }
                    else {
                        this.hideOverlay(minimizedOverlay.onScreenOverlay);
                    }
                }
                for (var _d = 0, _e = Object.keys(this.onScreenOverlays); _d < _e.length; _d++) {
                    var overlayId = _e[_d];
                    var onScreenOverlay = this.onScreenOverlays[overlayId];
                    var shouldOverlayStillBeOn = midWindowOnTriggers[onScreenOverlay.trigger.triggerWindowId] ? true : false;
                    if (shouldOverlayStillBeOn) {
                        delete midWindowOnTriggers[onScreenOverlay.trigger.triggerWindowId];
                    }
                    else {
                        this.hideOverlay(onScreenOverlay);
                    }
                }
                for (var _f = 0, _g = Object.keys(midWindowOnTriggers); _f < _g.length; _f++) {
                    var triggerWindowId = _g[_f];
                    var trigger = midWindowOnTriggers[triggerWindowId];
                    var overlayId = trigger.overlayId;
                    trigger.zIndex = this.normalizeZIndex(trigger.zIndex);
                    var overlay = this.getOverlayInfo(overlayId);
                    if (!!overlay) {
                        this.createContainerAndShowOverlay(overlay, trigger);
                    }
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.createContainerAndShowOverlay = function (overlay, trigger, isMaximize) {
                if (utility_16.getDimensions(this.playerContainer).width < utility_16.Viewports.allWidths[1]) {
                    return;
                }
                var onScreenOverlayEntry = {
                    overlay: overlay,
                    overlayContainer: null,
                    trigger: trigger,
                    hideTimer: null,
                    showTimer: null
                };
                this.createOverlayContainer(onScreenOverlayEntry);
                this.setOverlayData(onScreenOverlayEntry, trigger.zIndex);
                this.showOverlay(onScreenOverlayEntry, isMaximize);
            };
            VideoPlayerInteractiveTriggersHelper.prototype.showOverlay = function (onScreenOverlay, isMaximize) {
                if (!onScreenOverlay.overlayContainer) {
                    return;
                }
                this.onScreenOverlays[onScreenOverlay.overlay.overlayId] = onScreenOverlay;
                switch (onScreenOverlay.overlay.overlayType) {
                    case OverlayType.Graphic:
                        if (onScreenOverlay.trigger.overlayTemplate === OverlayTemplate.Default) {
                            onScreenOverlay.trigger.overlayTemplate = OverlayTemplate.Fullscreen;
                        }
                        break;
                    case OverlayType.CustomHtml:
                    case OverlayType.WebLink:
                    case OverlayType.StoreOffer:
                    case OverlayType.VideoBranch:
                    default:
                        if (onScreenOverlay.trigger.overlayTemplate === OverlayTemplate.Default) {
                            onScreenOverlay.trigger.overlayTemplate = OverlayTemplate.LowerThird;
                        }
                        if (!this.isContentStreamLink()) {
                            this.corePlayer.resetFocusTrap(this.findInteractivityFocusTrapStart());
                        }
                        onScreenOverlay.overlayContainer.setAttribute('role', 'alert');
                        break;
                }
                clearTimeout(onScreenOverlay.showTimer);
                this.displayOverlayContainer(onScreenOverlay);
                var srOverlayData = null;
                if (onScreenOverlay && onScreenOverlay.overlay) {
                    srOverlayData = onScreenOverlay.overlay.overlayData;
                }
                if (srOverlayData && srOverlayData.headline) {
                    onScreenOverlay.overlayContainer.setAttribute('aria-label', srOverlayData.headline);
                }
                if (!isMaximize) {
                    this.telemetryEventCallback && this.telemetryEventCallback(player_constants_7.PlayerEvents.InteractiveOverlayShow, onScreenOverlay);
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.isContentStreamLink = function () {
                return this.streamLinkBackStack.length >= 1;
            };
            VideoPlayerInteractiveTriggersHelper.prototype.hideAllOverlays = function () {
                if (Object.keys(this.minimizedOverlays).length > 0) {
                    for (var _i = 0, _a = Object.keys(this.minimizedOverlays); _i < _a.length; _i++) {
                        var key = _a[_i];
                        this.removeMaximizeButton(this.minimizedOverlays[key]);
                    }
                }
                if (Object.keys(this.onScreenOverlays).length < 1 || !this.interactivityInfo) {
                    return;
                }
                for (var _b = 0, _c = Object.keys(this.onScreenOverlays); _b < _c.length; _b++) {
                    var overlayId = _c[_b];
                    var onScreenOverlay = this.onScreenOverlays[overlayId];
                    this.hideOverlay(onScreenOverlay);
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.hideOverlay = function (onScreenOverlay) {
                if (!onScreenOverlay.overlayContainer) {
                    return;
                }
                switch (onScreenOverlay.overlay.overlayType) {
                    case OverlayType.Graphic:
                    case OverlayType.CustomHtml:
                        if (onScreenOverlay.trigger.overlayTemplate === OverlayTemplate.Default) {
                            onScreenOverlay.trigger.overlayTemplate = OverlayTemplate.Fullscreen;
                        }
                        break;
                    case OverlayType.WebLink:
                    case OverlayType.StoreOffer:
                    case OverlayType.VideoBranch:
                    default:
                        if (onScreenOverlay.trigger.overlayTemplate === OverlayTemplate.Default) {
                            onScreenOverlay.trigger.overlayTemplate = OverlayTemplate.LowerThird;
                        }
                        break;
                }
                this.removeOverlayFromScreen(onScreenOverlay);
                this.telemetryEventCallback && this.telemetryEventCallback(player_constants_7.PlayerEvents.InteractiveOverlayHide, onScreenOverlay);
            };
            VideoPlayerInteractiveTriggersHelper.prototype.removeOverlayFromScreen = function (onScreenOverlay, completeCallback) {
                var minimizedOverlay = this.minimizedOverlays[onScreenOverlay.trigger.triggerWindowId];
                if (minimizedOverlay) {
                    this.removeMaximizeButton(minimizedOverlay);
                    delete this.minimizedOverlays[minimizedOverlay.onScreenOverlay.trigger.triggerWindowId];
                }
                else {
                    this.hideOveralyContainer(onScreenOverlay, function () {
                        if (!!completeCallback) {
                            completeCallback();
                        }
                    });
                    delete this.onScreenOverlays[onScreenOverlay.overlay.overlayId];
                }
                if (!this.isContentStreamLink()) {
                    this.corePlayer.resetFocusTrap(this.findInteractivityFocusTrapStart());
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.displayOverlayContainer = function (onScreenOverlay) {
                var _this = this;
                onScreenOverlay.overlayContainer.setAttribute('aria-hidden', 'false');
                var animationClassToAdd = 'f-interactive-overlay-slidein';
                var animationClassToRemove = 'f-interactive-overlay-slideout';
                switch (onScreenOverlay.trigger.overlayTemplate) {
                    case OverlayTemplate.LeftVertical:
                    case OverlayTemplate.RightVertical:
                    case OverlayTemplate.UpperThird:
                        htmlExtensions_14.addClass(onScreenOverlay.overlayContainer, animationClassToAdd);
                        htmlExtensions_14.removeClass(onScreenOverlay.overlayContainer, animationClassToRemove);
                        break;
                    case OverlayTemplate.Fullscreen:
                        break;
                    case OverlayTemplate.LowerThird:
                    default:
                        onScreenOverlay.showTimer = setTimeout(function () {
                            _this.corePlayer.screenManagerHelper.updateElementDisplay(_this.getScreenManagerObjectByOverlayId(onScreenOverlay.overlay.overlayId), true);
                        }, 100);
                        break;
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.hideOveralyContainer = function (onScreenOverlay, completeCallback) {
                var _this = this;
                var animationClassToAdd = 'f-interactive-overlay-slideout';
                var animationClassToRemove = 'f-interactive-overlay-slidein';
                switch (onScreenOverlay.trigger.overlayTemplate) {
                    case OverlayTemplate.LeftVertical:
                    case OverlayTemplate.RightVertical:
                    case OverlayTemplate.UpperThird:
                        htmlExtensions_14.addClass(onScreenOverlay.overlayContainer, animationClassToAdd);
                        htmlExtensions_14.removeClass(onScreenOverlay.overlayContainer, animationClassToRemove);
                        onScreenOverlay.hideTimer = setTimeout(function () {
                            onScreenOverlay.overlayContainer.setAttribute('aria-hidden', 'true');
                            onScreenOverlay.overlayButton &&
                                htmlExtensions_14.removeEvent(onScreenOverlay.overlayButton, htmlExtensions_14.eventTypes.click, _this.onOverlayClick);
                            htmlExtensions_14.removeElement(onScreenOverlay.overlayContainer);
                            if (!!completeCallback()) {
                                completeCallback();
                            }
                        }, 500);
                        break;
                    case OverlayTemplate.Fullscreen:
                        onScreenOverlay.overlayContainer.setAttribute('aria-hidden', 'true');
                        htmlExtensions_14.removeElement(onScreenOverlay.overlayContainer);
                        break;
                    case OverlayTemplate.LowerThird:
                    default:
                        if (this.screenManagerObjects.length > 0) {
                            this.corePlayer.screenManagerHelper.deleteElement(this.deleteScreenManagerObjectByOverlayId(onScreenOverlay.overlay.overlayId));
                            onScreenOverlay.hideTimer = setTimeout(function () {
                                onScreenOverlay.overlayContainer.setAttribute('aria-hidden', 'true');
                                onScreenOverlay.overlayButton &&
                                    htmlExtensions_14.removeEvent(onScreenOverlay.overlayButton, htmlExtensions_14.eventTypes.click, _this.onOverlayClick);
                                htmlExtensions_14.removeElement(onScreenOverlay.overlayContainer);
                                if (!!completeCallback()) {
                                    completeCallback();
                                }
                            }, 500);
                        }
                        break;
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.setOverlayData = function (onScreenOverlay, zindex) {
                if (!onScreenOverlay.overlayContainer || !onScreenOverlay.overlay) {
                    return;
                }
                switch (onScreenOverlay.overlay.overlayType) {
                    case OverlayType.Graphic:
                        this.setGraphicOverlay(onScreenOverlay, zindex);
                        break;
                    case OverlayType.WebLink:
                    case OverlayType.StoreOffer:
                    case OverlayType.VideoBranch:
                    default:
                        this.setBakedInOverlayContainerFields(onScreenOverlay, zindex);
                        break;
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.setGraphicOverlay = function (onScreenOverlay, zindex) {
                var graphicOverlayInfo = onScreenOverlay.overlay.overlayData;
                if (!!zindex) {
                    htmlExtensions_14.css(onScreenOverlay.overlayContainer, 'z-index', zindex);
                }
                var graphicImageContainer = onScreenOverlay.overlayContainer;
                graphicImageContainer.src = graphicOverlayInfo.graphicUrl;
            };
            VideoPlayerInteractiveTriggersHelper.prototype.setBakedInOverlayContainerFields = function (onScreenOverlay, zindex) {
                var overlayData = onScreenOverlay.overlay.overlayData;
                onScreenOverlay.overlayHeadline && htmlExtensions_14.setText(onScreenOverlay.overlayHeadline, overlayData.headline);
                onScreenOverlay.overlayText && htmlExtensions_14.setText(onScreenOverlay.overlayText, overlayData.bodyText);
                if (!!zindex) {
                    htmlExtensions_14.css(onScreenOverlay.overlayContainer, 'z-index', zindex);
                }
                overlayData.imageUrl && htmlExtensions_14.css(onScreenOverlay.overlayContainer, 'background-image', "url('" + overlayData.imageUrl + "')");
                if (onScreenOverlay.overlayButton) {
                    htmlExtensions_14.setText(onScreenOverlay.overlayButton, overlayData.buttonText);
                    onScreenOverlay.overlayButton.setAttribute('aria-label', overlayData.buttonText);
                }
                if (onScreenOverlay.minimizeButton) {
                    if (typeof onScreenOverlay.trigger.isMinimizable !== 'undefined' &&
                        !onScreenOverlay.trigger.isMinimizable) {
                        onScreenOverlay.minimizeButton.setAttribute('aria-hidden', 'true');
                    }
                    else {
                        onScreenOverlay.minimizeButton.setAttribute(VideoPlayerInteractiveTriggersHelper.ariaLabel, this.localizationHelper.getLocalizedValue(localization_helper_2.playerLocKeys.interactivity_hide) + ' ' +
                            onScreenOverlay.overlay.overlayData.headline);
                    }
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.getOverlayInfo = function (overlayId) {
                if (!this.interactivityInfo || !this.interactivityInfo.overlays
                    || !this.interactivityInfo.overlays || !this.interactivityInfo.overlays.length) {
                    return null;
                }
                for (var _i = 0, _a = this.interactivityInfo.overlays; _i < _a.length; _i++) {
                    var overlay = _a[_i];
                    if (overlay.overlayId === overlayId) {
                        return overlay;
                    }
                }
                return null;
            };
            VideoPlayerInteractiveTriggersHelper.prototype.getScreenManagerObjectByOverlayId = function (overlayId) {
                if (this.screenManagerObjects.length === 0) {
                    return null;
                }
                for (var _i = 0, _a = this.screenManagerObjects; _i < _a.length; _i++) {
                    var screenManagerObject = _a[_i];
                    if (screenManagerObject.HtmlObject.id.split('-').pop() === overlayId) {
                        return screenManagerObject;
                    }
                }
                return null;
            };
            VideoPlayerInteractiveTriggersHelper.prototype.deleteScreenManagerObjectByOverlayId = function (overlayId) {
                if (this.screenManagerObjects.length === 0) {
                    return null;
                }
                var smo = this.getScreenManagerObjectByOverlayId(overlayId);
                var returnObjects = this.screenManagerObjects.splice(this.screenManagerObjects.indexOf(smo), 1);
                return returnObjects.length > 0 ? returnObjects[0] : null;
            };
            VideoPlayerInteractiveTriggersHelper.prototype.getOverlayHeight = function (overlayContainer) {
                var height = overlayContainer.clientHeight;
                if (height <= 0 && !!overlayContainer.parentElement) {
                    height = overlayContainer.parentElement.clientHeight * 0.2;
                }
                return height;
            };
            VideoPlayerInteractiveTriggersHelper.prototype.createMaximizeButton = function (onScreenOverlay) {
                var triggerWindowId = onScreenOverlay.trigger.triggerWindowId;
                var buttonCssClass = 'f-overlay-maximize-lowerthird';
                if (onScreenOverlay.trigger.overlayTemplate === OverlayTemplate.UpperThird) {
                    buttonCssClass = 'f-overlay-maximize-upperthird';
                }
                var html = "<button type='button' id='" + triggerWindowId + "' class='f-overlay-minimizeMaximize " + buttonCssClass + " c-glyph glyph-chevron-left'>\n        </button>";
                var tempDiv = document.createElement('div');
                tempDiv.innerHTML = html;
                var videoClosedCaptionContainer = htmlExtensions_14.selectFirstElement('.f-video-cc-overlay', this.playerContainer);
                this.playerContainer.insertBefore(tempDiv.firstChild, videoClosedCaptionContainer);
                var maximizeButtonContainer = htmlExtensions_14.selectFirstElement('#' + triggerWindowId, this.playerContainer);
                maximizeButtonContainer.setAttribute(VideoPlayerInteractiveTriggersHelper.ariaLabel, this.localizationHelper.getLocalizedValue(localization_helper_2.playerLocKeys.interactivity_show) + ' ' +
                    onScreenOverlay.overlay.overlayData.headline);
                htmlExtensions_14.addEvent(maximizeButtonContainer, htmlExtensions_14.eventTypes.click, this.onMaximizeButtonClick);
                return maximizeButtonContainer;
            };
            VideoPlayerInteractiveTriggersHelper.prototype.minimizeOverlay = function (onScreenOverlay) {
                var _this = this;
                if (onScreenOverlay) {
                    var minimizedOverlay_1 = {
                        onScreenOverlay: onScreenOverlay
                    };
                    this.removeOverlayFromScreen(onScreenOverlay, function () {
                        minimizedOverlay_1.maximizeButton = _this.createMaximizeButton(onScreenOverlay);
                        _this.corePlayer.resetFocusTrap(_this.findInteractivityFocusTrapStart());
                    });
                    this.minimizedOverlays[onScreenOverlay.trigger.triggerWindowId] = minimizedOverlay_1;
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.streamLinkBackstackPop = function () {
                var streamToNavigateBackTo;
                streamToNavigateBackTo = this.streamLinkBackStack.pop();
                if (!this.isContentStreamLink() && this.backButtonContainer) {
                    this.backButtonContainer.setAttribute('aria-hidden', 'true');
                    this.corePlayer.resetFocusTrap(this.findInteractivityFocusTrapStart());
                }
                this.hideAllOverlays();
                this.isStreamLinkBackStackPop = true;
                this.corePlayer.load(streamToNavigateBackTo.corePlayer);
                this.interactivityInfo = streamToNavigateBackTo.interactivityInfo;
                this.interactedTriggers = streamToNavigateBackTo.interactedTriggers;
                this.minimizedOverlays = streamToNavigateBackTo.minimizedOverlays;
                this.isInteractivityJSONReady = true;
                this.corePlayer.getPlayerData().options.startTime = 0;
                this.finalizeBackStackPop(streamToNavigateBackTo.paused);
            };
            VideoPlayerInteractiveTriggersHelper.prototype.finalizeBackStackPop = function (streamPaused) {
                var _this = this;
                if (!!streamPaused) {
                    var corePlayerObj = this.corePlayer;
                    if (corePlayerObj.playerState === 'loading' || corePlayerObj.playerState === 'init') {
                        setTimeout(function () {
                            _this.finalizeBackStackPop(streamPaused);
                        }, 50);
                    }
                    else {
                        corePlayerObj.pause();
                    }
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.handleClickByOverlayType = function (onScreenOverlay, overlayType, data) {
                if (!onScreenOverlay) {
                    return;
                }
                if (!overlayType) {
                    overlayType = onScreenOverlay.overlay.overlayType;
                }
                if (!data) {
                    data = onScreenOverlay.overlay.overlayData;
                }
                this.hideOverlay(onScreenOverlay);
                switch (overlayType) {
                    case OverlayType.VideoBranch:
                        this.navigateToStreamLink(data);
                        break;
                    case OverlayType.WebLink:
                }
                this.telemetryEventCallback && this.telemetryEventCallback(player_constants_7.PlayerEvents.InteractiveOverlayClick, onScreenOverlay);
            };
            VideoPlayerInteractiveTriggersHelper.prototype.setFocusOnInteractivity = function (element) {
                if (!!element && element.tagName !== 'IMG') {
                    element.setAttribute('tabindex', '1');
                    setTimeout(function () { element.focus(); }, 0);
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.findInteractivityFocusTrapStart = function () {
                if (this.streamLinkBackStack.length > 0) {
                    return this.backButtonContainer;
                }
                for (var _i = 0, _a = Object.keys(this.minimizedOverlays); _i < _a.length; _i++) {
                    var triggerWindowId = _a[_i];
                    var maximizeButton = this.minimizedOverlays[triggerWindowId].maximizeButton;
                    if (maximizeButton) {
                        return maximizeButton;
                    }
                }
                for (var _b = 0, _c = Object.keys(this.onScreenOverlays); _b < _c.length; _b++) {
                    var overlayId = _c[_b];
                    var onScreenOverlay = this.onScreenOverlays[overlayId];
                    if (onScreenOverlay.overlayButton !== undefined) {
                        return onScreenOverlay.overlayButton;
                    }
                }
                return null;
            };
            VideoPlayerInteractiveTriggersHelper.prototype.navigateToStreamLink = function (videoData) {
                var backStackPlayerData = this.corePlayer.getPlayerData();
                backStackPlayerData.options.startTime = this.corePlayer.getPlayPosition().currentTime;
                backStackPlayerData.options.lazyLoad = false;
                var backStackMinimizedOverlays = {};
                utility_16.extend(backStackMinimizedOverlays, this.minimizedOverlays);
                var backStackInteractedTriggers = [];
                utility_16.extend(backStackInteractedTriggers, this.interactedTriggers);
                var backStackEntry = {
                    corePlayer: backStackPlayerData,
                    interactivityInfo: this.interactivityInfo,
                    minimizedOverlays: backStackMinimizedOverlays,
                    interactedTriggers: backStackInteractedTriggers,
                    paused: this.corePlayer.isPaused()
                };
                this.hideAllOverlays();
                this.clearOutInteractedTriggers();
                this.minimizedOverlays = {};
                this.interactivityInfo = null;
                this.streamLinkBackStack.push(backStackEntry);
                var streamLinkPlayerData = {};
                streamLinkPlayerData.options = {};
                utility_16.extend(streamLinkPlayerData.options, backStackPlayerData.options);
                streamLinkPlayerData.options.startTime = videoData.startTime ? videoData.startTime : 0;
                this.fetchStreamLinkMetadataAndSwitch(streamLinkPlayerData, videoData.videoId);
            };
            VideoPlayerInteractiveTriggersHelper.prototype.clearOutInteractedTriggers = function () {
                if (this.isStreamLinkBackStackPop) {
                    this.isStreamLinkBackStackPop = false;
                }
                else {
                    this.interactedTriggers.length = 0;
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.fetchStreamLinkMetadataAndSwitch = function (playerData, videoId) {
                var _this = this;
                var dataFetcher = new video_shim_data_fetcher_2.VideoShimDataFetcher(playerData.options.shimServiceEnv, playerData.options.shimServiceUrl);
                dataFetcher.getMetadata(videoId, function (result) {
                    playerData.metadata = result;
                    _this.isInteractivityJSONReady = false;
                    _this.corePlayer.stop();
                    _this.corePlayer.load(playerData);
                    if (playerData.metadata.interactiveTriggersEnabled && playerData.metadata.interactiveTriggersUrl) {
                        _this.interactivityInfoUrl = playerData.metadata.interactiveTriggersUrl;
                        _this.requestInteractivityJSON();
                    }
                    if (_this.backButtonContainer) {
                        _this.backButtonContainer.setAttribute('aria-hidden', 'false');
                        _this.corePlayer.resetFocusTrap(_this.backButtonContainer);
                    }
                }, function () {
                });
            };
            VideoPlayerInteractiveTriggersHelper.prototype.userAlreadyInteractedWithTrigger = function (triggerWindowId) {
                for (var _i = 0, _a = this.interactedTriggers; _i < _a.length; _i++) {
                    var interactedTriggerWindowId = _a[_i];
                    if (interactedTriggerWindowId === triggerWindowId) {
                        return true;
                    }
                }
                return false;
            };
            VideoPlayerInteractiveTriggersHelper.prototype.displayEndSlate = function () {
                var endSlates = this.interactivityInfo.showOnVideoEnd;
                for (var _i = 0, endSlates_1 = endSlates; _i < endSlates_1.length; _i++) {
                    var endSlate = endSlates_1[_i];
                    var endOverlay = this.getOverlayInfo(endSlate.overlayId);
                    if (!!endOverlay) {
                        var endSlateTrigger = {
                            overlayId: endSlate.overlayId,
                            overlayTemplate: endSlate.overlayTemplate,
                            zIndex: this.normalizeZIndex(endSlate.zIndex)
                        };
                        this.createContainerAndShowOverlay(endOverlay, endSlateTrigger);
                        this.isEndSlateOn = true;
                    }
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.displayPreRoll = function (preRollComplete) {
                try {
                    if (!this.interactivityInfo || this.interactivityInfo.showOnVideoStart.length < 1
                        || this.corePlayer.getPlayerData().options.startTime !== 0) {
                        preRollComplete();
                        return;
                    }
                    var preRolls = this.interactivityInfo.showOnVideoStart;
                    if (preRolls.length < 1) {
                        preRollComplete();
                        return;
                    }
                    for (var _i = 0, preRolls_1 = preRolls; _i < preRolls_1.length; _i++) {
                        var preRollOverlay = preRolls_1[_i];
                        var startOverlay = this.getOverlayInfo(preRollOverlay.overlayId);
                        if (!!startOverlay) {
                            var preRollTrigger = {
                                overlayId: preRollOverlay.overlayId,
                                overlayTemplate: preRollOverlay.overlayTemplate,
                                zIndex: this.normalizeZIndex(preRollOverlay.zIndex)
                            };
                            this.createContainerAndShowOverlay(startOverlay, preRollTrigger);
                        }
                    }
                    var preRollDurationMs = this.interactivityInfo.preRollDurationSecs ?
                        this.interactivityInfo.preRollDurationSecs * 1000 : this.preRollDefaultDurationMs;
                    setTimeout(function () {
                        preRollComplete();
                    }, preRollDurationMs);
                }
                catch (e) {
                    preRollComplete();
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.normalizeZIndex = function (zIndex) {
                return isNaN(zIndex) ? 1 : Math.max(1, Math.min(50, zIndex));
            };
            VideoPlayerInteractiveTriggersHelper.prototype.onSeek = function (currentTime) {
                if (!!this.interactivityInfo) {
                    if (this.isStreamLinkBackStackPop) {
                        this.isStreamLinkBackStackPop = false;
                    }
                    else {
                        this.clearOutInteractedTriggers();
                    }
                    this.updateInteractivity(currentTime);
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.updateInteractivity = function (currentTime) {
                if (currentTime > 0) {
                    this.updateOverlays(currentTime);
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.onPlay = function () {
                if (!!this.interactivityInfo) {
                    if (this.isEndSlateOn) {
                        this.hideAllOverlays();
                        this.isEndSlateOn = false;
                    }
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.onContentComplete = function () {
                var areWeInStreamLink = this.streamLinkBackStack.length > 0;
                if (areWeInStreamLink) {
                    this.streamLinkBackstackPop();
                }
                else {
                    if (!!this.interactivityInfo) {
                        this.displayEndSlate();
                    }
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.postIFrameMessage = function (message) {
                for (var _i = 0, _a = Object.keys(this.onScreenOverlays); _i < _a.length; _i++) {
                    var overlayId = _a[_i];
                    var overlay = this.onScreenOverlays[overlayId];
                    if (!!overlay) {
                        if (overlay.overlay.overlayType === OverlayType.CustomHtml) {
                            var iframe = (overlay.overlayContainer.firstElementChild);
                            iframe.contentWindow.postMessage(message, '*');
                        }
                    }
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.preloadContent = function () {
                var imagesToCache = [];
                var iframesToCache = [];
                for (var _i = 0, _a = this.interactivityInfo.overlays; _i < _a.length; _i++) {
                    var overlay = _a[_i];
                    switch (overlay.overlayType) {
                        case OverlayType.WebLink:
                        case OverlayType.StoreOffer:
                        case OverlayType.VideoBranch:
                            if (!!overlay.overlayData && !!overlay.overlayData.imageUrl) {
                                imagesToCache.push(overlay.overlayData.imageUrl);
                            }
                            break;
                        case OverlayType.Graphic:
                            if (!!overlay.overlayData && !!overlay.overlayData.graphicUrl) {
                                imagesToCache.push(overlay.overlayData.graphicUrl);
                            }
                            break;
                        case OverlayType.CustomHtml:
                            if (!!overlay.overlayData && !!overlay.overlayData.customHtml) {
                                iframesToCache.push(overlay.overlayData.customHtml);
                            }
                    }
                }
                if (imagesToCache.length > 0) {
                    this.cacheImages(imagesToCache);
                }
                if (iframesToCache.length > 0) {
                    this.cacheIFrames(iframesToCache);
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.cacheImages = function (images) {
                for (var _i = 0, images_1 = images; _i < images_1.length; _i++) {
                    var image = images_1[_i];
                    var cachedImage = new Image();
                    cachedImage.src = image;
                }
            };
            VideoPlayerInteractiveTriggersHelper.prototype.cacheIFrames = function (urls) {
            };
            VideoPlayerInteractiveTriggersHelper.ariaLabel = 'aria-label';
            return VideoPlayerInteractiveTriggersHelper;
        }());
        exports.VideoPlayerInteractiveTriggersHelper = VideoPlayerInteractiveTriggersHelper;
    });
    define("telemetry/reporting-data", ["require", "exports"], function (require, exports) {
        Object.defineProperty(exports, "__esModule", { value: true });
    });
    define("telemetry/base-reporter", ["require", "exports", "constants/player-constants", "utilities/player-utility", "mwf/utilities/utility"], function (require, exports, player_constants_8, player_utility_9, utility_17) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.BaseReporter = void 0;
        var perfMarkers = [player_constants_8.videoPerfMarkers.playerInit,
            player_constants_8.videoPerfMarkers.playerLoadStart,
            player_constants_8.videoPerfMarkers.locLoadStart,
            player_constants_8.videoPerfMarkers.locReady,
            player_constants_8.videoPerfMarkers.metadataFetchStart,
            player_constants_8.videoPerfMarkers.metadataFetchEnd,
            player_constants_8.videoPerfMarkers.wrapperLoadStart,
            player_constants_8.videoPerfMarkers.wrapperReady,
            player_constants_8.videoPerfMarkers.playerReady,
            player_constants_8.videoPerfMarkers.playTriggered,
            player_constants_8.videoPerfMarkers.ttvs];
        var BaseReporter = (function () {
            function BaseReporter(videoComponent) {
                this.videoComponent = videoComponent;
                this.isDebugMode = false;
                if (!videoComponent) {
                    console.log('base-reporter: video component is null');
                    return;
                }
                this.playerId = videoComponent.getAttribute('id');
                this.isDebugMode = videoComponent.getAttribute('data-debug') === 'true';
            }
            BaseReporter.prototype.reportEvent = function (event, data) {
                if (!event) {
                    return;
                }
                switch (event) {
                    case player_constants_8.PlayerEvents.CommonPlayerImpression:
                        player_utility_9.PlayerUtility.createVideoPerfMarker(this.playerId, player_constants_8.videoPerfMarkers.playerReady);
                        this.onCommonPlayerImpression(data);
                        break;
                    case player_constants_8.PlayerEvents.Replay:
                        this.onReplay(data);
                        break;
                    case player_constants_8.PlayerEvents.BufferComplete:
                        this.onBufferComplete(data);
                        break;
                    case player_constants_8.PlayerEvents.ContentStart:
                        player_utility_9.PlayerUtility.createVideoPerfMarker(this.playerId, player_constants_8.videoPerfMarkers.ttvs);
                        this.onContentStart(data);
                        break;
                    case player_constants_8.PlayerEvents.ContentError:
                        this.onContentError(data);
                        break;
                    case player_constants_8.PlayerEvents.ContentComplete:
                        this.onContentComplete(data);
                        break;
                    case player_constants_8.PlayerEvents.ContentCheckpoint:
                        this.onContentCheckpoint(data);
                        break;
                    case player_constants_8.PlayerEvents.ContentLoaded3PP:
                        this.on3ppVideoLoaded(data);
                        break;
                    case player_constants_8.PlayerEvents.Pause:
                        this.onPause(data);
                        break;
                    case player_constants_8.PlayerEvents.Resume:
                        this.onResume(data);
                        break;
                    case player_constants_8.PlayerEvents.Seek:
                        this.onSeek(data);
                        break;
                    case player_constants_8.PlayerEvents.VideoQualityChanged:
                        this.onVideoQualityChanged(data);
                        break;
                    case player_constants_8.PlayerEvents.Mute:
                        this.onMute(data);
                        break;
                    case player_constants_8.PlayerEvents.Unmute:
                        this.onUnmute(data);
                        break;
                    case player_constants_8.PlayerEvents.FullScreenEnter:
                        this.onFullScreenEnter(data);
                        break;
                    case player_constants_8.PlayerEvents.FullScreenExit:
                        this.onFullScreenExit(data);
                        break;
                    case player_constants_8.PlayerEvents.InteractiveOverlayClick:
                        this.onInteractiveOverlayClick(data);
                        break;
                    case player_constants_8.PlayerEvents.InteractiveOverlayShow:
                        this.onInteractiveOverlayShow(data);
                        break;
                    case player_constants_8.PlayerEvents.InteractiveOverlayHide:
                        this.onInteractiveOverlayHide(data);
                        break;
                    case player_constants_8.PlayerEvents.InteractiveOverlayMaximize:
                        this.onInteractiveOverlayMaximize(data);
                        break;
                    case player_constants_8.PlayerEvents.InteractiveOverlayMinimize:
                        this.onInteractiveOverlayMinimize(data);
                        break;
                    case player_constants_8.PlayerEvents.InteractiveBackButtonClick:
                        this.onInteractiveBackButtonClick(data);
                        break;
                    case player_constants_8.PlayerEvents.PlayerError:
                        this.onPlayerErrors(data);
                        break;
                    case player_constants_8.PlayerEvents.VideoShared:
                        this.onVideoShared(data);
                        break;
                    case player_constants_8.PlayerEvents.ClosedCaptionsChanged:
                        this.onClosedCaptionsChanged(data);
                        break;
                    case player_constants_8.PlayerEvents.ClosedCaptionSettingsChanged:
                        this.onClosedCaptionSettingsChanged(data);
                        break;
                    case player_constants_8.PlayerEvents.PlaybackRateChanged:
                        this.onPlaybackRateChanged(data);
                        break;
                    case player_constants_8.PlayerEvents.MediaDownloaded:
                        this.onMediaDownloaded(data);
                        break;
                    case player_constants_8.PlayerEvents.AudioTrackChanged:
                        this.onAudioTrackChanged(data);
                        break;
                    case player_constants_8.PlayerEvents.AgeGateSubmitClick:
                        this.onAgeGateSubmitClick(data);
                        break;
                    case player_constants_8.PlayerEvents.Volume:
                        this.onVolumeChanged(data);
                        break;
                }
            };
            BaseReporter.prototype.getPerfMarkers = function () {
                var markers = {};
                var scriptLoadedValue = utility_17.getPerfMarkerValue(player_constants_8.videoPerfMarkers.scriptLoaded);
                if (scriptLoadedValue) {
                    markers["p." + player_constants_8.videoPerfMarkers.scriptLoaded] = scriptLoadedValue;
                }
                for (var _i = 0, perfMarkers_1 = perfMarkers; _i < perfMarkers_1.length; _i++) {
                    var perfMarker = perfMarkers_1[_i];
                    var value = player_utility_9.PlayerUtility.getVideoPerfMarker(this.playerId, perfMarker);
                    if (value) {
                        markers["p." + perfMarker] = value;
                    }
                }
                return markers;
            };
            BaseReporter.prototype.log = function (message, origin) {
                if (origin === void 0) { origin = 'Reporter'; }
                if (this.isDebugMode) {
                    player_utility_9.PlayerUtility.logConsoleMessage(message, origin);
                }
            };
            return BaseReporter;
        }());
        exports.BaseReporter = BaseReporter;
    });
    define("telemetry/jsll-reporter", ["require", "exports", "telemetry/base-reporter", "mwf/utilities/utility", "utilities/environment"], function (require, exports, base_reporter_1, utility_18, environment_5) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.JsllReporter = void 0;
        var JsllReporter = (function (_super) {
            __extends(JsllReporter, _super);
            function JsllReporter(videoComponent, jsllPostMsg) {
                var _this = _super.call(this, videoComponent) || this;
                _this.postJsllMsg = false;
                _this.playerIdfromUrl = null;
                var postJsll = utility_18.getQSPValue('postJsllMsg', false);
                if ((postJsll) && (environment_5.Environment.isInIframe) && jsllPostMsg) {
                    _this.postJsllMsg = true;
                    _this.playerIdfromUrl = utility_18.getQSPValue('pid', false);
                }
                return _this;
            }
            JsllReporter.prototype.doPing = function (playerData, behavior, usageCounter, extraData) {
                var report = this.getDefaultParams(playerData, usageCounter);
                utility_18.extend(report, extraData);
                this.log('jsll - t: ' + report.t + ' behavior : ' + behavior + ' data : ' + JSON.stringify(report));
                var contentTags = {
                    vidnm: '',
                    vidid: '',
                    vidpct: 0,
                    vidpctwtchd: 0,
                    vidwt: 0,
                    viddur: 0,
                    vidtimeseconds: 0,
                    sessiontimeseconds: 0,
                    live: false,
                    parentpage: '',
                    containerName: 'oneplayer',
                    dlid: '',
                    dltype: '',
                    socchn: '',
                    name: '',
                    id: ''
                };
                this.populateContentTags(contentTags, playerData, extraData);
                var playerTagOverride = { videoObj: report };
                var overrides = {
                    behavior: behavior,
                    actionType: 'O',
                    pageTags: playerTagOverride,
                    contentTags: contentTags
                };
                var jsllWindow = window;
                try {
                    if (this.postJsllMsg) {
                        window.parent.postMessage(JSON.stringify({
                            eventName: 'postjsllmessage',
                            playerId: this.playerIdfromUrl, data: overrides
                        }), '*');
                    }
                    else if (jsllWindow.awa && jsllWindow.awa.ct) {
                        jsllWindow.awa.ct.captureContentPageAction(overrides);
                    }
                }
                catch (exception) {
                    this.log("jsll logger threw exception : " + exception);
                }
            };
            JsllReporter.prototype.populateContentTags = function (contentTags, playerData, extraData) {
                contentTags.vidnm = playerData.videoMetadata && playerData.videoMetadata.title;
                contentTags.vidid = playerData.videoMetadata && playerData.videoMetadata.videoId;
                contentTags.live = playerData.live;
                var viddur = playerData.videoDuration;
                var vidwt = playerData.videoElapsedTime;
                var vidtimeseconds = playerData.currentVideoTotalTimePlaying / 1000;
                var sessiontimeseconds = playerData.totalTimePlaying / 1000;
                var videoPercent = 0;
                var videoPercentWatched = 0;
                if (viddur && utility_18.isNumber(viddur) && vidwt && utility_18.isNumber(vidwt)) {
                    videoPercent = Math.round((vidwt / viddur) * 100);
                    videoPercent = Math.min(videoPercent, 100);
                }
                if (viddur && utility_18.isNumber(viddur) && vidtimeseconds && utility_18.isNumber(vidtimeseconds)) {
                    videoPercentWatched = Math.round((vidtimeseconds / viddur) * 100);
                    videoPercentWatched = Math.min(videoPercentWatched, 100);
                }
                contentTags.viddur = Math.round(viddur);
                contentTags.vidwt = Math.round(vidwt);
                contentTags.vidtimeseconds = Math.round(vidtimeseconds);
                contentTags.sessiontimeseconds = Math.round(sessiontimeseconds);
                contentTags.vidpct = videoPercent;
                contentTags.vidpctwtchd = videoPercentWatched;
                contentTags.parentpage = parent !== window ? document.referrer : window.location.href;
                contentTags.name = extraData && extraData.interactiveOverlayAndTrigger &&
                    extraData.interactiveOverlayAndTrigger.overlay.friendlyName;
                contentTags.id = extraData && extraData.interactiveOverlayAndTrigger &&
                    extraData.interactiveOverlayAndTrigger.trigger.triggerId;
                contentTags.dlid = extraData && extraData.downloadMedia;
                contentTags.dltype = extraData && extraData.downloadType;
                contentTags.socchn = extraData && extraData.socchn;
            };
            JsllReporter.prototype.getDefaultParams = function (reportData, usageCounter) {
                var defaults = {};
                if (usageCounter) {
                    utility_18.extend(defaults, usageCounter);
                }
                if (reportData) {
                    utility_18.extend(defaults, {
                        'd': reportData.videoDuration,
                        'piid': reportData.playerInstanceId,
                        'plt': reportData.playerType,
                        'ptech': reportData.playerTechnology,
                        'size': reportData.videoSize ? (reportData.videoSize.width + 'x' + reportData.videoSize.height) : null,
                        'vt': reportData.playerType,
                        'te': reportData.videoElapsedTime
                    });
                    if (reportData.currentVideoFile) {
                        utility_18.extend(defaults, {
                            'vfc': reportData.currentVideoFile.formatCode,
                            'vfile': reportData.currentVideoFile.url,
                            'vmedia': reportData.currentVideoFile.mediaType,
                            'vQuality': reportData.currentVideoFile.quality
                        });
                    }
                    if (reportData.playerOptions) {
                        utility_18.extend(defaults, {
                            'isAutoplay': reportData.playerOptions.autoplay,
                            'playerOptions': reportData.playerOptions
                        });
                    }
                    if (reportData.videoMetadata) {
                        utility_18.extend(defaults, {
                            'eid': reportData.videoMetadata.videoId,
                            'vtitle': reportData.videoMetadata.title,
                            'vmetadata': reportData.videoMetadata
                        });
                    }
                }
                return defaults;
            };
            JsllReporter.prototype.onCommonPlayerImpression = function (data) {
                this.log('jsll - OnCommonPlayerImpression()');
                var behavior = window.awa ? window.awa.behavior.VIDEOPLAYERLOAD : null;
                this.doPing(data, behavior, JsllReporter.usageCounters.commonPlayerImpression, this.getPerfMarkers());
            };
            JsllReporter.prototype.onBufferComplete = function (data) {
                this.log('jsll - OnBufferComplete()');
                var behavior = window.awa ? window.awa.behavior.VIDEOBUFFERING : null;
                this.doPing(data, behavior, JsllReporter.usageCounters.contentBuffering, { 'bd': data.totalBufferWaitTime });
            };
            JsllReporter.prototype.onContentStart = function (data) {
                this.log('jsll - OnContentStart()');
                var behavior = window.awa ? window.awa.behavior.VIDEOSTART : null;
                this.doPing(data, behavior, JsllReporter.usageCounters.contentStart, this.getPerfMarkers());
            };
            JsllReporter.prototype.onContentCheckpoint = function (data) {
                this.log('jsll - OnContentCheckpoint()');
                var behavior = window.awa ? window.awa.behavior.VIDEOCHECKPOINT : null;
                this.doPing(data, behavior, null, { 'cp': data.checkpoint, 'checkpointtype': data.checkpointType });
            };
            JsllReporter.prototype.onContentComplete = function (data) {
                this.log('jsll - OnContentComplete()');
                var behavior = window.awa ? window.awa.behavior.VIDEOCOMPLETE : null;
                this.doPing(data, behavior, JsllReporter.usageCounters.contentComplete);
            };
            JsllReporter.prototype.onContentError = function (data) {
                this.log('jsll - OnContentError()');
                var params = {
                    'fi': data.currentVideoFile && data.currentVideoFile.url,
                    'et': data.errorType,
                    'etd': data.errorDesc
                };
                var behavior = window.awa ? window.awa.behavior.VIDEOERROR : null;
                this.doPing(data, behavior, JsllReporter.usageCounters.contentError, params);
            };
            JsllReporter.prototype.onMute = function (data) {
                this.log('jsll - OnMute()');
                var behavior = window.awa ? window.awa.behavior.VIDEOMUTE : null;
                this.doPing(data, behavior, JsllReporter.usageCounters.mute);
            };
            JsllReporter.prototype.onUnmute = function (data) {
                this.log('jsll - OnMute()');
                var behavior = window.awa ? window.awa.behavior.VIDEOUNMUTE : null;
                this.doPing(data, behavior, JsllReporter.usageCounters.unmute);
            };
            JsllReporter.prototype.onVolumeChanged = function (data) {
                this.log('jsll - onVolumeChange()');
                var behavior = window.awa ? window.awa.behavior.VIDEOVOLUMECONTROL : null;
                this.doPing(data, behavior, null, { 'startvol': data.lastVolume, 'endvol': data.newVolume });
            };
            JsllReporter.prototype.onPause = function (data) {
                this.log('jsll - OnPause()');
                var behavior = window.awa ? window.awa.behavior.VIDEOPAUSE : null;
                this.doPing(data, behavior, JsllReporter.usageCounters.pause);
            };
            JsllReporter.prototype.onSeek = function (data) {
                if (data.seekFrom === data.seekTo) {
                    return;
                }
                this.log('jsll - OnSeek()');
                var behavior = window.awa ? window.awa.behavior.VIDEOJUMP : null;
                this.doPing(data, behavior, JsllReporter.usageCounters.seek, {
                    'te': data.seekFrom, 'st': data.seekTo,
                    'startloc': data.seekFrom, 'endloc': data.seekTo
                });
            };
            JsllReporter.prototype.onVideoQualityChanged = function (data) {
                this.log('jsll - OnVideoQualityChanged()');
                var behavior = window.awa ? window.awa.behavior.VIDEORESOLUTIONCONTROL : null;
                this.doPing(data, behavior, JsllReporter.usageCounters.videoQuality, { 'q': data.endRes, 'startres': data.startRes, 'endres': data.endRes });
            };
            JsllReporter.prototype.onFullScreenEnter = function (data) {
                this.log('jsll - OnFullScreenEnter()');
                var behavior = window.awa ? window.awa.behavior.VIDEOFULLSCREEN : null;
                this.doPing(data, behavior, JsllReporter.usageCounters.fullScreenEnter);
            };
            JsllReporter.prototype.onFullScreenExit = function (data) {
                this.log('jsll - OnFullScreenExit()');
                var behavior = window.awa ? window.awa.behavior.VIDEOUNFULLSCREEN : null;
                this.doPing(data, behavior, JsllReporter.usageCounters.fullScreenExit);
            };
            JsllReporter.prototype.onReplay = function (data) {
                this.log('jsll - OnReplay()');
                var behavior = window.awa ? window.awa.behavior.VIDEOREPLAY : null;
                this.doPing(data, behavior, JsllReporter.usageCounters.replay);
            };
            JsllReporter.prototype.onResume = function (data) {
                this.log('jsll - OnResume()');
                var behavior = window.awa ? window.awa.behavior.VIDEOCONTINUE : null;
                this.doPing(data, behavior, null, JsllReporter.usageCounters.resume);
            };
            JsllReporter.prototype.on3ppVideoLoaded = function (data) {
                this.log('jsll - On3ppVideoLoaded()');
                this.doPing(data, null, JsllReporter.usageCounters.contentImpression3PP);
            };
            JsllReporter.prototype.onInteractiveOverlayClick = function (data) {
                this.log('jsll - onInteractiveTriggerClick');
                var behavior = window.awa ? window.awa.behavior.VIDEOLAYERCLICK : null;
                this.doPing(data, behavior, JsllReporter.usageCounters.overlayClick, { 'interactiveOverlayAndTrigger': data.interactiveTriggerAndOverlay });
            };
            JsllReporter.prototype.onInteractiveBackButtonClick = function (data) {
                this.log('jsll - onInteractiveTriggerClick');
                var behavior = window.awa ? window.awa.behavior.BACKBUTTON : null;
                this.doPing(data, behavior, JsllReporter.usageCounters.streamLinkBackButtonClick);
            };
            JsllReporter.prototype.onInteractiveOverlayShow = function (data) {
                this.log('jsll - onInteractiveOverlayShow');
                var behavior = window.awa ? window.awa.behavior.SHOW : null;
                this.doPing(data, behavior, JsllReporter.usageCounters.overlayShow, { 'interactiveOverlayAndTrigger': data.interactiveTriggerAndOverlay });
            };
            JsllReporter.prototype.onInteractiveOverlayHide = function (data) {
                this.log('jsll - onInteractiveOverlayHide');
                var behavior = window.awa ? window.awa.behavior.HIDE : null;
                this.doPing(data, behavior, JsllReporter.usageCounters.overlayHide, { 'interactiveOverlayAndTrigger': data.interactiveTriggerAndOverlay });
            };
            JsllReporter.prototype.onInteractiveOverlayMaximize = function (data) {
                this.log('jsll - onInteractiveOverlayMaximize');
                var behavior = window.awa ? window.awa.behavior.MAXIMIZE : null;
                this.doPing(data, behavior, JsllReporter.usageCounters.maximizeOverlay, { 'interactiveOverlayAndTrigger': data.interactiveTriggerAndOverlay });
            };
            JsllReporter.prototype.onInteractiveOverlayMinimize = function (data) {
                this.log('jsll - onInteractiveOverlayMinimize');
                var behavior = window.awa ? window.awa.behavior.MINIMIZE : null;
                this.doPing(data, behavior, JsllReporter.usageCounters.minimizeOverlay, { 'interactiveOverlayAndTrigger': data.interactiveTriggerAndOverlay });
            };
            JsllReporter.prototype.onAgeGateSubmitClick = function (data) {
                this.log('jsll - onAgeGateSubmitClick');
                var behavior = window.awa ? window.awa.behavior.PROCESSCHECKPOINT : null;
                this.doPing(data, behavior, JsllReporter.usageCounters.ageGateSubmitClick, {
                    'ageGatePassed': data.ageGatePassed,
                    'scn': 'OnePlayerAgeGate', 'isSuccess': data.ageGatePassed
                });
            };
            JsllReporter.prototype.onPlayerErrors = function (data) {
                this.log('jsll - onPlayerErrors()');
                var behavior = window.awa ? window.awa.behavior.VIDEOERROR : null;
                this.doPing(data, behavior, JsllReporter.usageCounters.contentError, { 'et': data.errorType, 'etd': data.errorDesc });
            };
            JsllReporter.prototype.onVideoShared = function (data) {
                this.log('jsll - onVideoShared');
                var behavior = window.awa ? window.awa.behavior.SOCIALSHARE : null;
                this.doPing(data, behavior, null, { 'videoShare': data.videoShare, 'socchn': data.videoShare });
            };
            JsllReporter.prototype.onClosedCaptionsChanged = function (data) {
                this.log('jsll - onClosedCaptionsChanged');
                var behavior = window.awa ? window.awa.behavior.VIDEOCLOSEDCAPTIONCONTROL : null;
                this.doPing(data, behavior, null, {
                    'closedCaptions': data.endCaptionSelection,
                    'startcaptionselection': data.startCaptionSelection, 'endcaptionselection': data.endCaptionSelection
                });
            };
            JsllReporter.prototype.onClosedCaptionSettingsChanged = function (data) {
                this.log('jsll - onClosedCaptionSettingsChanged');
                var behavior = window.awa ? window.awa.behavior.VIDEOCLOSEDCAPTIONSTYLE : null;
                this.doPing(data, behavior, null, { 'closedCaptionSettings': data.closedCaptionSettings, 'appsel': data.closedCaptionSettings });
            };
            JsllReporter.prototype.onPlaybackRateChanged = function (data) {
                this.log('jsll - onPlaybackRateChanged');
                this.doPing(data, null, null, { 'playbackRate': data.playbackRate });
            };
            JsllReporter.prototype.onMediaDownloaded = function (data) {
                this.log('jsll - onMediaDownloaded');
                var behavior = window.awa ? window.awa.behavior.DOWNLOAD : null;
                this.doPing(data, behavior, null, {
                    'downloadMedia': data.downloadMedia,
                    'dlnm': 'Download', 'dlid': data.downloadMedia, 'dltype': data.downloadType
                });
            };
            JsllReporter.prototype.onAudioTrackChanged = function (data) {
                this.log('jsll - onAudioTrackChanged');
                var behavior = window.awa ? window.awa.behavior.VIDEOAUDIOTRACKCONTROL : null;
                this.doPing(data, behavior, null, {
                    'audioTrack': data.audioTrack,
                    'starttrackselection': data.startTrackSelection, 'endtrackselection': data.endTrackSelection
                });
            };
            JsllReporter.usageCounters = {
                contentBuffering: { t: '2', evt: 'ContentPlay' },
                contentError: { t: '20', evt: 'ContentPlay' },
                contentStart: { t: '21', evt: 'ContentPlay' },
                contentContinue: { t: '22', evt: 'ContentPlay' },
                contentComplete: { t: '23', evt: 'ContentPlay' },
                contentImpression3PP: { t: '41', evt: 'ContentPlay' },
                commonPlayerImpression: { t: '61', evt: 'ContentPlay' },
                cc: { t: '30', evt: 'Click_Non-nav' },
                pause: { t: '31', evt: 'Click_Non-nav' },
                seek: { t: '32', evt: 'Click_Non-nav' },
                mute: { t: '33', evt: 'Click_Non-nav' },
                fullScreenEnter: { t: '34', evt: 'Click_Non-nav' },
                info: { t: '35', evt: 'Click_Non-nav' },
                videoQuality: { t: '36', evt: 'Click_Non-nav' },
                resume: { t: '37', evt: 'Click_Non-nav' },
                fullScreenExit: { t: '38', evt: 'Click_Non-nav' },
                replay: { t: '39', evt: 'Click_Non-nav' },
                unmute: { t: '40', evt: 'Click_Non-nav' },
                facebook: { t: '51', evt: 'Click_Non-nav' },
                twitter: { t: '52', evt: 'Click_Non-nav' },
                email: { t: '53', evt: 'Click_Non-nav' },
                overlayClick: { t: '70', evt: 'Click_Non-nav' },
                streamLinkBackButtonClick: { t: '71', evt: 'Click_Non-nav' },
                overlayShow: { t: '72', evt: 'Show_Overlay' },
                overlayHide: { t: '73', evt: 'Hide_Overlay' },
                minimizeOverlay: { t: '74', evt: 'Minimize_Overlay' },
                maximizeOverlay: { t: '75', evt: 'Maximize_Overlay' },
                ageGateSubmitClick: { t: '80', evt: 'Click_Non-nav' }
            };
            return JsllReporter;
        }(base_reporter_1.BaseReporter));
        exports.JsllReporter = JsllReporter;
    });
    define("helpers/sharing-helper", ["require", "exports", "mwf/utilities/htmlExtensions", "helpers/localization-helper", "constants/player-constants"], function (require, exports, htmlExtensions_15, localization_helper_3, player_constants_9) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.SharingHelper = void 0;
        var shareEmbargoList = {
            'zh-cn': [player_constants_9.shareTypes.facebook, player_constants_9.shareTypes.twitter, player_constants_9.shareTypes.linkedin, player_constants_9.shareTypes.skype]
        };
        var SharingHelper = (function () {
            function SharingHelper() {
            }
            SharingHelper.getCurrentPageUrl = function () {
                return window.location.href.replace('&jsapi=true', '');
            };
            SharingHelper.tryCopyTextToClipboard = function (text) {
                if (window.clipboardData) {
                    window.clipboardData.setData('text', text);
                }
                else {
                    var scrollTop = 0;
                    var textArea = document.createElement('textarea');
                    textArea.value = text;
                    var bodyElement = htmlExtensions_15.selectFirstElement('body');
                    scrollTop = bodyElement.scrollTop;
                    bodyElement.appendChild(textArea);
                    textArea.select();
                    try {
                        document.execCommand('copy');
                    }
                    catch (err) {
                    }
                    textArea.remove();
                    bodyElement.scrollTop = scrollTop;
                }
            };
            SharingHelper.getShareOptionsData = function (localizationHelper, playerOptions, shareUrl) {
                if (!playerOptions || !playerOptions.share || !playerOptions.shareOptions || !localizationHelper) {
                    return null;
                }
                var shareOptionsData = [];
                var encodedPageUrl = encodeURIComponent(shareUrl || SharingHelper.getCurrentPageUrl());
                for (var _i = 0, _a = playerOptions.shareOptions; _i < _a.length; _i++) {
                    var shareType = _a[_i];
                    shareType = shareType.toLowerCase();
                    if (playerOptions.market && shareEmbargoList[playerOptions.market] &&
                        shareEmbargoList[playerOptions.market].indexOf(shareType) >= 0) {
                        continue;
                    }
                    switch (shareType) {
                        case player_constants_9.shareTypes.facebook:
                            shareOptionsData.push({
                                url: "//www.facebook.com/share.php?u=" + encodedPageUrl,
                                id: shareType,
                                label: localizationHelper.getLocalizedValue(localization_helper_3.playerLocKeys.sharing_facebook),
                                image: 'data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMzIgMzIiPjxzdHlsZT4uc3Qwe2Rpc3BsYXk6bm9uZTt9IC5zdDF7ZGlzcGxheTppbmxpbmU7fSAuc3Qye2ZpbGw6bm9uZTt9IC5zdDN7ZmlsbDojRkZGRkZGO308L3N0eWxlPjxnIGlkPSJSZXN0XzNfIiBjbGFzcz0ic3QwIj48ZyBpZD0iVHdpdHRlcl8zXyIgY2xhc3M9InN0MSI+PHBhdGggY2xhc3M9InN0MiIgZD0iTTAgMGgzMnYzMkgweiIvPjxwYXRoIGNsYXNzPSJzdDMiIGQ9Ik0yOC40IDguNmMtLjkuNC0xLjkuNy0yLjkuOCAxLS42IDEuOC0xLjYgMi4yLTIuOC0xIC42LTIuMSAxLTMuMiAxLjItLjktMS0yLjItMS42LTMuNy0xLjYtMi44IDAtNSAyLjMtNSA1IDAgLjQgMCAuOC4xIDEuMi00LjItLjItNy45LTIuMi0xMC40LTUuMy0uNC44LS43IDEuNy0uNyAyLjYgMCAxLjggMSAzLjMgMi4zIDQuMi0uOCAwLTIuMi0uMy0yLjItLjZ2LjFjMCAyLjQgMS42IDQuNSAzLjkgNS0uNC4xLS45LjItMS40LjItLjMgMC0uNyAwLTEtLjEuNiAyIDIuNSAzLjUgNC43IDMuNS0xLjUgMS4yLTMuNyAyLTYuMSAyLS40IDAtLjggMC0xLjItLjEgMi4yIDEuNCA0LjkgMi4zIDcuNyAyLjMgOS4zIDAgMTQuNC03LjcgMTQuNC0xNC40di0uN2MxLS42IDEuOC0xLjUgMi41LTIuNXoiLz48L2c+PC9nPjxwYXRoIGNsYXNzPSJzdDIiIGQ9Ik0wIDBoMzJ2MzJIMHoiIGlkPSJGYWNlYm9va183XyIvPjxwYXRoIGlkPSJXaGl0ZV8yXyIgY2xhc3M9InN0MyIgZD0iTTMwLjIgMEgxLjhDLjggMCAwIC44IDAgMS44djI4LjVjMCAxIC44IDEuOCAxLjggMS44aDE1LjNWMTkuNmgtNC4ydi00LjhoNC4ydi0zLjZjMC00LjEgMi41LTYuNCA2LjItNi40IDEuOCAwIDMuMy4yIDMuNy4ydjQuM2gtMi42Yy0yIDAtMi40IDEtMi40IDIuNHYzLjFoNC44bC0uNiA0LjhIMjJWMzJoOC4yYzEgMCAxLjgtLjggMS44LTEuOFYxLjhjMC0xLS44LTEuOC0xLjgtMS44eiIvPjwvc3ZnPg=='
                            });
                            break;
                        case player_constants_9.shareTypes.twitter:
                            shareOptionsData.push({
                                url: "//twitter.com/share?url=" + encodedPageUrl + "&text=",
                                id: shareType,
                                label: localizationHelper.getLocalizedValue(localization_helper_3.playerLocKeys.sharing_twitter),
                                image: 'data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMzIgMzIiPjxzdHlsZT4uc3Qwe2ZpbGw6I0ZGRkZGRjt9PC9zdHlsZT48cGF0aCBjbGFzcz0ic3QwIiBkPSJNMzIgNi4xYy0xLjIuNS0yLjUuOS0zLjggMSAxLjMtLjggMi4zLTIuMSAyLjktMy42LTEuMy44LTIuNyAxLjMtNC4yIDEuNkMyNS44IDMuOCAyNC4xIDMgMjIuMSAzYy0zLjYgMC02LjUgMy02LjUgNi41IDAgLjUgMCAxIC4xIDEuNi01LjQtLjMtMTAuMi0yLjktMTMuNS02LjktLjUgMS0uOSAyLjItLjkgMy40IDAgMi4zIDEuMyA0LjMgMyA1LjUtMSAwLTIuOS0uNC0yLjktLjh2LjFjMCAzLjEgMi4xIDUuOSA1LjEgNi41LS41LjEtMS4yLjItMS44LjItLjQgMC0uOSAwLTEuMy0uMS44IDIuNiAzLjMgNC42IDYuMSA0LjYtMiAxLjYtNC44IDIuNi03LjkgMi42LS41IDAtMSAwLTEuNi0uMSAyLjkgMS44IDYuNCAzIDEwIDMgMTIuMSAwIDE4LjctMTAgMTguNy0xOC43di0uOWMxLjMtLjkgMi40LTIuMSAzLjMtMy40eiIvPjwvc3ZnPg=='
                            });
                            break;
                        case player_constants_9.shareTypes.skype:
                            shareOptionsData.push({
                                url: "//web.skype.com/share?url=" + encodedPageUrl + "&amp;lang=" + playerOptions.market,
                                id: shareType,
                                label: localizationHelper.getLocalizedValue(localization_helper_3.playerLocKeys.sharing_skype),
                                image: 'data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMzIgMzIiPjxzdHlsZT4uc3Qwe2Rpc3BsYXk6bm9uZTt9IC5zdDF7ZGlzcGxheTppbmxpbmU7fSAuc3Qye2ZpbGw6bm9uZTt9IC5zdDN7ZmlsbDojRkZGRkZGO308L3N0eWxlPjxnIGlkPSJMYXllcl8xXzFfIiBjbGFzcz0ic3QwIj48ZyBpZD0iUmVzdF8zXyIgY2xhc3M9InN0MSI+PGcgaWQ9IlR3aXR0ZXJfM18iPjxwYXRoIGNsYXNzPSJzdDIiIGQ9Ik0wIDBoMzJ2MzJIMHoiLz48cGF0aCBjbGFzcz0ic3QzIiBkPSJNMjguNCA4LjZjLS45LjQtMS45LjctMi45LjggMS0uNiAxLjgtMS42IDIuMi0yLjgtMSAuNi0yLjEgMS0zLjIgMS4yLS45LTEtMi4yLTEuNi0zLjctMS42LTIuOCAwLTUgMi4zLTUgNSAwIC40IDAgLjguMSAxLjItNC4yLS4yLTcuOS0yLjItMTAuNC01LjMtLjQuOC0uNyAxLjctLjcgMi42IDAgMS44IDEgMy4zIDIuMyA0LjItLjggMC0yLjItLjMtMi4yLS42di4xYzAgMi40IDEuNiA0LjUgMy45IDUtLjQuMS0uOS4yLTEuNC4yLS4zIDAtLjcgMC0xLS4xLjYgMiAyLjUgMy41IDQuNyAzLjUtMS41IDEuMi0zLjcgMi02LjEgMi0uNCAwLS44IDAtMS4yLS4xIDIuMiAxLjQgNC45IDIuMyA3LjcgMi4zIDkuMyAwIDE0LjQtNy43IDE0LjQtMTQuNHYtLjdjMS0uNiAxLjgtMS41IDIuNS0yLjV6Ii8+PC9nPjwvZz48ZyBpZD0iRmFjZWJvb2tfN18iIGNsYXNzPSJzdDEiPjxwYXRoIGNsYXNzPSJzdDIiIGQ9Ik0wIDBoMzJ2MzJIMHoiLz48cGF0aCBpZD0iZl82XyIgY2xhc3M9InN0MyIgZD0iTTE4IDI2di05aDIuNmwuNS00SDE4di0xLjljMC0xLS4yLTIuMSAxLjMtMi4xSDIxVjYuMVMxOS43IDYgMTguNCA2QzE1LjcgNiAxNCA3LjcgMTQgMTAuN1YxM2gtM3Y0aDN2OWg0eiIvPjwvZz48L2c+PHBhdGggY2xhc3M9InN0MyIgZD0iTTMwLjkgMTguNmMuMS0uOC4xLTEuOC4xLTIuNiAwLTguMy02LjctMTUtMTUtMTUtMSAwLTEuOCAwLTIuNi4yQzEyLjIuMyAxMC42IDAgOSAwIDQgMCAwIDQgMCA5YzAgMS42LjUgMy4yIDEuMSA0LjUtLjEuNy0uMSAxLjctLjEgMi41IDAgOC4zIDYuNyAxNSAxNSAxNSAxIDAgMS44IDAgMi42LS4yIDEuMy44IDIuOSAxLjEgNC41IDEuMSA1IDAgOS00IDktOS0uMS0xLjYtLjQtMy4xLTEuMi00LjN6bS0xNC43IDYuNWMtNS4xIDAtNy41LTIuNi03LjUtNC41IDAtMSAuOC0xLjYgMS44LTEuNiAyLjIgMCAxLjYgMy4yIDUuOCAzLjIgMi4xIDAgMy40LTEuMyAzLjQtMi40IDAtLjYtLjUtMS40LTEuOC0xLjhsLTQuOC0xYy0zLjctMS00LjMtMy00LjMtNC44IDAtMy44IDMuNS01LjMgNy01LjMgMy4yIDAgNi45IDEuOCA2LjkgNC4yIDAgMS0uOCAxLjYtMS44IDEuNi0xLjkgMC0xLjYtMi42LTUuMy0yLjYtMS45IDAtMi45LjgtMi45IDIuMXMxLjQgMS42IDIuNyAxLjlsMy40LjhjMy43LjggNC42IDMgNC42IDUuMS4xIDIuNy0yLjQgNS4xLTcuMiA1LjF6Ii8+PC9zdmc+'
                            });
                            break;
                        case player_constants_9.shareTypes.linkedin:
                            shareOptionsData.push({
                                url: "//www.linkedin.com/shareArticle?mini=true&url=" + encodedPageUrl + "&title=&summary=&source=",
                                id: shareType,
                                label: localizationHelper.getLocalizedValue(localization_helper_3.playerLocKeys.sharing_linkedin),
                                image: 'data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMzIgMzIiPjxzdHlsZT4uc3Qwe2Rpc3BsYXk6bm9uZTt9IC5zdDF7ZGlzcGxheTppbmxpbmU7fSAuc3Qye2ZpbGw6bm9uZTt9IC5zdDN7ZmlsbDojRkZGRkZGO308L3N0eWxlPjxnIGlkPSJMYXllcl8xXzFfIiBjbGFzcz0ic3QwIj48ZyBpZD0iUmVzdF8zXyIgY2xhc3M9InN0MSI+PGcgaWQ9IlR3aXR0ZXJfM18iPjxwYXRoIGNsYXNzPSJzdDIiIGQ9Ik0wIDBoMzJ2MzJIMHoiLz48cGF0aCBjbGFzcz0ic3QzIiBkPSJNMjguNCA4LjZjLS45LjQtMS45LjctMi45LjggMS0uNiAxLjgtMS42IDIuMi0yLjgtMSAuNi0yLjEgMS0zLjIgMS4yLS45LTEtMi4yLTEuNi0zLjctMS42LTIuOCAwLTUgMi4zLTUgNSAwIC40IDAgLjguMSAxLjItNC4yLS4yLTcuOS0yLjItMTAuNC01LjMtLjQuOC0uNyAxLjctLjcgMi42IDAgMS44IDEgMy4zIDIuMyA0LjItLjggMC0yLjItLjMtMi4yLS42di4xYzAgMi40IDEuNiA0LjUgMy45IDUtLjQuMS0uOS4yLTEuNC4yLS4zIDAtLjcgMC0xLS4xLjYgMiAyLjUgMy41IDQuNyAzLjUtMS41IDEuMi0zLjcgMi02LjEgMi0uNCAwLS44IDAtMS4yLS4xIDIuMiAxLjQgNC45IDIuMyA3LjcgMi4zIDkuMyAwIDE0LjQtNy43IDE0LjQtMTQuNHYtLjdjMS0uNiAxLjgtMS41IDIuNS0yLjV6Ii8+PC9nPjwvZz48ZyBpZD0iRmFjZWJvb2tfN18iIGNsYXNzPSJzdDEiPjxwYXRoIGNsYXNzPSJzdDIiIGQ9Ik0wIDBoMzJ2MzJIMHoiLz48cGF0aCBpZD0iZl82XyIgY2xhc3M9InN0MyIgZD0iTTE4IDI2di05aDIuNmwuNS00SDE4di0xLjljMC0xLS4yLTIuMSAxLjMtMi4xSDIxVjYuMVMxOS43IDYgMTguNCA2QzE1LjcgNiAxNCA3LjcgMTQgMTAuN1YxM2gtM3Y0aDN2OWg0eiIvPjwvZz48L2c+PGcgaWQ9IkxheWVyXzMiIGNsYXNzPSJzdDAiPjxnIGlkPSJTa3lwZV83XyIgY2xhc3M9InN0MSI+PHBhdGggY2xhc3M9InN0MiIgZD0iTTAgMGgzMnYzMkgweiIvPjxwYXRoIGNsYXNzPSJzdDMiIGQ9Ik0yNS4yIDE3LjZjLjEtLjUuMS0xLjEuMS0xLjYgMC01LjItNC4yLTkuNC05LjQtOS40LS42IDAtMS4xIDAtMS42LjEtLjgtLjUtMS44LS43LTIuOC0uNy0zLjEgMC01LjYgMi41LTUuNiA1LjYgMCAxIC4zIDIgLjcgMi44LS4xLjUtLjEgMS4xLS4xIDEuNiAwIDUuMiA0LjIgOS40IDkuNCA5LjQuNiAwIDEuMSAwIDEuNi0uMS44LjUgMS44LjcgMi44LjcgMy4xIDAgNS42LTIuNSA1LjYtNS42IDAtMS4xLS4yLTItLjctMi44ek0xNiAyMS43Yy0zLjIgMC00LjctMS42LTQuNy0yLjggMC0uNi41LTEgMS4xLTEgMS40IDAgMSAyIDMuNiAyIDEuMyAwIDIuMS0uOCAyLjEtMS41IDAtLjQtLjMtLjktMS4xLTEuMWwtMi45LS43Yy0yLjMtLjYtMi43LTEuOS0yLjctMyAwLTIuNCAyLjItMy4zIDQuNC0zLjMgMiAwIDQuMyAxLjEgNC4zIDIuNiAwIC42LS41IDEtMS4xIDEtMS4yIDAtMS0xLjYtMy4zLTEuNi0xLjIgMC0xLjguNS0xLjggMS4zcy45IDEgMS43IDEuMmwyLjEuNWMyLjMuNSAyLjkgMS45IDIuOSAzLjIgMCAxLjctMS42IDMuMi00LjYgMy4yeiIvPjwvZz48L2c+PHBhdGggY2xhc3M9InN0MyIgZD0iTTI5LjYgMEgyLjRDMS4xIDAgMCAxIDAgMi4zdjI3LjRDMCAzMSAxLjEgMzIgMi40IDMyaDI3LjNjMS4zIDAgMi40LTEgMi40LTIuM1YyLjNDMzIgMSAzMC45IDAgMjkuNiAwek05LjUgMjcuM0g0LjdWMTJoNC43djE1LjN6TTcuMSA5LjljLTEuNSAwLTIuOC0xLjItMi44LTIuOCAwLTEuNSAxLjItMi44IDIuOC0yLjggMS41IDAgMi44IDEuMiAyLjggMi44IDAgMS42LTEuMyAyLjgtMi44IDIuOHptMjAuMiAxNy40aC00Ljd2LTcuNGMwLTEuOCAwLTQtMi41LTRzLTIuOCAxLjktMi44IDMuOXY3LjZoLTQuN1YxMkgxN3YyLjFoLjFjLjYtMS4yIDIuMi0yLjUgNC41LTIuNSA0LjggMCA1LjcgMy4yIDUuNyA3LjN2OC40eiIvPjwvc3ZnPg=='
                            });
                            break;
                        case player_constants_9.shareTypes.mail:
                            shareOptionsData.push({
                                url: "mailto:?subject=Check out this great video&body=" + encodedPageUrl,
                                id: shareType,
                                label: localizationHelper.getLocalizedValue(localization_helper_3.playerLocKeys.sharing_mail),
                                glyph: 'glyph-mail'
                            });
                            break;
                        case player_constants_9.shareTypes.copy:
                            shareOptionsData.push({
                                url: encodedPageUrl,
                                id: shareType,
                                label: localizationHelper.getLocalizedValue(localization_helper_3.playerLocKeys.sharing_copy),
                                glyph: 'glyph-copy'
                            });
                            break;
                    }
                }
                return shareOptionsData;
            };
            return SharingHelper;
        }());
        exports.SharingHelper = SharingHelper;
    });
    define("mwf/utilities/viewportCollision", ["require", "exports", "mwf/utilities/htmlExtensions"], function (require, exports, htmlExtensions_16) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.getCollisionExtents = exports.collidesWith = void 0;
        function collidesWith(element, viewport) {
            var elementRectangle = htmlExtensions_16.getClientRect(element);
            elementRectangle.left = Math.round(elementRectangle.left);
            elementRectangle.top = Math.round(elementRectangle.top);
            elementRectangle.right = Math.round(elementRectangle.right);
            elementRectangle.bottom = Math.round(elementRectangle.bottom);
            if (elementRectangle.width !== 0) {
                var collisionDetected = false;
                var collisionsDetected = {
                    top: false,
                    bottom: false,
                    left: false,
                    right: false
                };
                if (!viewport) {
                    var width = Math.min(window.innerWidth, document.documentElement.clientWidth);
                    var height = Math.min(window.innerHeight, document.documentElement.clientHeight);
                    viewport = {
                        left: 0,
                        top: 0,
                        right: width,
                        bottom: height,
                        width: width,
                        height: height
                    };
                }
                if (elementRectangle.left < viewport.left) {
                    collisionDetected = true;
                    collisionsDetected.left = true;
                }
                if (elementRectangle.top < viewport.top) {
                    collisionDetected = true;
                    collisionsDetected.top = true;
                }
                if (elementRectangle.right > viewport.right) {
                    collisionDetected = true;
                    collisionsDetected.right = true;
                }
                if (elementRectangle.bottom > viewport.bottom) {
                    collisionDetected = true;
                    collisionsDetected.bottom = true;
                }
                if (collisionDetected) {
                    return collisionsDetected;
                }
            }
            return false;
        }
        exports.collidesWith = collidesWith;
        function getCollisionExtents(element, viewport) {
            var elementRectangle = htmlExtensions_16.getClientRect(element);
            if (elementRectangle.width === 0) {
                return null;
            }
            if (!viewport) {
                var right_1 = Math.min(window.innerWidth, document.documentElement.clientWidth);
                var bottom_1 = Math.min(window.innerHeight, document.documentElement.clientHeight);
                viewport = { top: 0, right: right_1, bottom: bottom_1, left: 0, height: bottom_1, width: right_1 };
            }
            var top = Math.round(elementRectangle.top - viewport.top);
            var right = Math.round(viewport.right - elementRectangle.right);
            var bottom = Math.round(viewport.bottom - elementRectangle.bottom);
            var left = Math.round(elementRectangle.left - viewport.left);
            return top >= 0 && right >= 0 && bottom >= 0 && left >= 0
                ? null
                : {
                    top: top,
                    right: right,
                    bottom: bottom,
                    left: left,
                    clientRect: elementRectangle,
                    viewport: viewport
                };
        }
        exports.getCollisionExtents = getCollisionExtents;
    });
    define("mwf/selectMenu/selectMenu", ["require", "exports", "mwf/utilities/publisher", "mwf/utilities/htmlExtensions", "mwf/utilities/stringExtensions", "mwf/utilities/viewportCollision", "mwf/utilities/utility"], function (require, exports, publisher_2, htmlExtensions_17, stringExtensions_12, viewportCollision_1, utility_19) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.SelectMenu = void 0;
        var SelectMenu = (function (_super) {
            __extends(SelectMenu, _super);
            function SelectMenu(element) {
                var _this = _super.call(this, element) || this;
                _this.onTriggerClick = function (event) {
                    event = htmlExtensions_17.getEvent(event);
                    htmlExtensions_17.preventDefault(event);
                    _this.onTriggerToggled(event);
                };
                _this.onItemClick = function (event) {
                    event = htmlExtensions_17.getEvent(event);
                    _this.onItemSelected(htmlExtensions_17.getEventTargetOrSrcElement(event), false, true);
                };
                _this.onNonSelectMenuClick = function (event) {
                    event = htmlExtensions_17.getEvent(event);
                    if (!!_this.element && !!_this.menu) {
                        var target = htmlExtensions_17.getEventTargetOrSrcElement(event);
                        if (!_this.element.contains(target)) {
                            if ((target !== _this.menu) && (target.parentElement !== _this.menu)) {
                                _this.collapse();
                            }
                        }
                    }
                };
                _this.onNonSelectMenuTab = function (event) {
                    event = htmlExtensions_17.getEvent(event);
                    var keycode = utility_19.getKeyCode(event);
                    if (keycode === 9) {
                        _this.collapse();
                    }
                };
                _this.onTriggerKeyPress = function (event) {
                    event = htmlExtensions_17.getEvent(event);
                    var keycode = utility_19.getKeyCode(event);
                    switch (keycode) {
                        case 13:
                        case 32:
                            htmlExtensions_17.preventDefault(event);
                            _this.onTriggerToggled();
                    }
                };
                _this.handleMenuKeydownEvent = function (event) {
                    event = htmlExtensions_17.getEvent(event);
                    var keyCode = utility_19.getKeyCode(event);
                    if (keyCode !== 9 && _this.isExpanded()) {
                        htmlExtensions_17.preventDefault(event);
                    }
                    _this.handleMenuKeydown(htmlExtensions_17.getEventTargetOrSrcElement(event), keyCode);
                };
                _this.handleMenuItemBlur = function (event) {
                    var item = htmlExtensions_17.getEventTargetOrSrcElement(event);
                    htmlExtensions_17.removeEvent(item, htmlExtensions_17.eventTypes.blur, _this.handleMenuItemBlur);
                    htmlExtensions_17.removeClass(item, SelectMenu.hiddenFocus);
                };
                _this.update();
                return _this;
            }
            SelectMenu.prototype.update = function () {
                if (!this.element) {
                    return;
                }
                this.persist = htmlExtensions_17.hasClass(this.element, 'f-persist');
                this.trigger = htmlExtensions_17.selectFirstElementT('[role="button"]', this.element);
                if (!this.trigger) {
                    this.trigger = htmlExtensions_17.selectFirstElementT('button', this.element);
                }
                this.menu = htmlExtensions_17.selectFirstElement('.c-menu', this.element);
                var isAnchor = htmlExtensions_17.selectElementsT('.c-menu-item a', this.element);
                if (isAnchor.length > 0) {
                    this.items = isAnchor;
                }
                else {
                    this.items = htmlExtensions_17.selectElementsT('.c-menu-item span', this.element);
                }
                this.isLtr = htmlExtensions_17.getDirection(this.menu) === htmlExtensions_17.Direction.left;
                var hasImg = !!htmlExtensions_17.selectFirstElement('img', this.menu);
                if (hasImg) {
                    this.ignoreNextDOMChange = true;
                    var triggerImg = document.createElement('img');
                    var triggerSpan = document.createElement('span');
                    htmlExtensions_17.setText(triggerSpan, htmlExtensions_17.getText(this.trigger));
                    htmlExtensions_17.setText(this.trigger, '');
                    this.trigger.appendChild(triggerImg);
                    this.trigger.appendChild(triggerSpan);
                }
                if (!!this.trigger && !!this.menu && !!this.items && !!this.items.length) {
                    var selectedItem = null;
                    for (var _i = 0, _a = this.items; _i < _a.length; _i++) {
                        var item = _a[_i];
                        if (this.itemIsSelected(item) && selectedItem === null) {
                            selectedItem = item;
                            item.setAttribute(this.getSelectedAttribute(item), 'true');
                        }
                        else {
                            item.setAttribute(this.getSelectedAttribute(item), 'false');
                        }
                        item.setAttribute('tabindex', '-1');
                        this.cleanSelectedAttributes(item);
                        if (!item.hasAttribute('role')) {
                            item.setAttribute('role', 'menuitem');
                        }
                    }
                    var showExpanded = this.isExpanded();
                    this.onItemSelected(selectedItem, true, false);
                    if (!this.selectedItem) {
                        this.updateAriaLabel();
                    }
                    this.addEventListeners();
                    if (showExpanded) {
                        this.expand();
                    }
                }
            };
            SelectMenu.prototype.teardown = function () {
                htmlExtensions_17.removeEvent(this.trigger, htmlExtensions_17.eventTypes.click, this.onTriggerClick);
                htmlExtensions_17.removeEvent(this.trigger, htmlExtensions_17.eventTypes.keydown, this.onTriggerKeyPress);
                htmlExtensions_17.removeEvent(this.menu, htmlExtensions_17.eventTypes.keydown, this.handleMenuKeydownEvent, true);
                for (var _i = 0, _a = this.items; _i < _a.length; _i++) {
                    var item = _a[_i];
                    htmlExtensions_17.removeEvent(item, htmlExtensions_17.eventTypes.click, this.onItemClick);
                }
                htmlExtensions_17.removeEvent(document, htmlExtensions_17.eventTypes.click, this.onNonSelectMenuClick);
                htmlExtensions_17.removeEvent(this.items[this.items.length - 1], htmlExtensions_17.eventTypes.keydown, this.onNonSelectMenuTab);
                htmlExtensions_17.removeEvent(this.items, htmlExtensions_17.eventTypes.blur, this.handleMenuItemBlur);
                this.persist = false;
                this.trigger = null;
                this.menu = null;
                this.items = null;
                this.selectedItem = null;
            };
            SelectMenu.prototype.setSelectedItem = function (id) {
                if (!id || !this.element) {
                    return false;
                }
                var item = htmlExtensions_17.selectFirstElement("[id=\"" + id + "\"] > a", this.element) || htmlExtensions_17.selectFirstElement("[id=\"" + id + "\"] > span", this.element);
                return !item ? false : this.onItemSelected(item, false, false);
            };
            SelectMenu.prototype.updateAriaLabel = function () {
                var dataAriaLabelFormatValue = this.trigger.getAttribute(SelectMenu.dataAriaLabelFormat);
                if (dataAriaLabelFormatValue != null) {
                    var actionTriggerText = this.selectedItem
                        ? this.selectedItem.getAttribute(SelectMenu.ariaLabel) || htmlExtensions_17.getText(this.selectedItem)
                        : htmlExtensions_17.getText(this.trigger);
                    var dataAriaLabel = stringExtensions_12.format(dataAriaLabelFormatValue, actionTriggerText);
                    this.trigger.setAttribute(SelectMenu.ariaLabel, dataAriaLabel);
                }
            };
            SelectMenu.prototype.isExpanded = function () {
                return (!!this.trigger && !!this.menu &&
                    (this.trigger.getAttribute(SelectMenu.ariaExpanded) === 'true') &&
                    (this.menu.getAttribute(SelectMenu.ariaHidden) === 'false'));
            };
            SelectMenu.prototype.itemIsSelected = function (item) {
                return item.getAttribute(SelectMenu.ariaSelected) === 'true' || item.getAttribute(SelectMenu.ariaChecked) === 'true';
            };
            SelectMenu.prototype.getSelectedAttribute = function (item) {
                return item.getAttribute('role') === 'menuitemradio' ? SelectMenu.ariaChecked : SelectMenu.ariaSelected;
            };
            SelectMenu.prototype.cleanSelectedAttributes = function (item) {
                var attributeToRemove = this.getSelectedAttribute(item) === SelectMenu.ariaSelected
                    ? SelectMenu.ariaChecked
                    : SelectMenu.ariaSelected;
                item.removeAttribute(attributeToRemove);
            };
            SelectMenu.prototype.positionMenu = function () {
                var floatValue = htmlExtensions_17.css(this.element, 'float');
                var forceRight = floatValue === 'right';
                var forceLeft = !forceRight && (floatValue === 'left');
                var alignLeft = forceLeft ? true : (forceRight || !this.isLtr) ? false : true;
                htmlExtensions_17.css(this.menu, 'top', 'auto');
                htmlExtensions_17.css(this.menu, 'bottom', 'auto');
                htmlExtensions_17.css(this.menu, alignLeft ? 'left' : 'right', '0');
                htmlExtensions_17.css(this.menu, 'height', 'auto');
                var menuCollisions = viewportCollision_1.getCollisionExtents(this.menu);
                if (!!menuCollisions) {
                    if ((menuCollisions.right < 0 || menuCollisions.left < 0)) {
                        if (menuCollisions.clientRect.width <= menuCollisions.viewport.width) {
                            if (alignLeft) {
                                htmlExtensions_17.css(this.menu, 'left', menuCollisions.right + 'px');
                            }
                            else {
                                htmlExtensions_17.css(this.menu, 'right', menuCollisions.left + 'px');
                            }
                        }
                        else {
                            htmlExtensions_17.css(this.menu, 'left', -menuCollisions.left + 'px');
                            htmlExtensions_17.css(this.menu, 'width', menuCollisions.viewport.width + 'px');
                        }
                    }
                    if (menuCollisions.bottom < 0) {
                        var triggerHeight = parseFloat(htmlExtensions_17.css(this.trigger, 'height'));
                        if (menuCollisions.clientRect.height <= menuCollisions.top) {
                            htmlExtensions_17.css(this.menu, 'bottom', triggerHeight + 'px');
                        }
                        else if (menuCollisions.clientRect.height <= menuCollisions.viewport.height) {
                            htmlExtensions_17.css(this.menu, 'top', (menuCollisions.bottom + triggerHeight) + 'px');
                        }
                        else {
                            htmlExtensions_17.css(this.menu, 'top', (-menuCollisions.top + triggerHeight) + 'px');
                            htmlExtensions_17.css(this.menu, 'height', menuCollisions.viewport.height + 'px');
                        }
                    }
                }
            };
            SelectMenu.prototype.expand = function (event) {
                if (!!this.trigger && !!this.menu) {
                    this.trigger.setAttribute(SelectMenu.ariaExpanded, 'true');
                    this.menu.setAttribute(SelectMenu.ariaHidden, 'false');
                    this.positionMenu();
                    if (!!this.items) {
                        var selectedIndex = this.items.indexOf(this.selectedItem);
                        var focusIndex = selectedIndex === -1 ? 0 : selectedIndex;
                        var item = this.items[focusIndex];
                        item.focus();
                        if (event && event.type === 'click') {
                            htmlExtensions_17.addClass(item, SelectMenu.hiddenFocus);
                            htmlExtensions_17.addEvent(item, htmlExtensions_17.eventTypes.blur, this.handleMenuItemBlur);
                        }
                    }
                }
            };
            SelectMenu.prototype.collapse = function () {
                if (!!this.trigger && !!this.menu) {
                    this.trigger.setAttribute(SelectMenu.ariaExpanded, 'false');
                    this.menu.setAttribute(SelectMenu.ariaHidden, 'true');
                }
            };
            SelectMenu.prototype.addEventListeners = function () {
                if (!!this.trigger && !!this.items) {
                    htmlExtensions_17.addEvent(this.trigger, htmlExtensions_17.eventTypes.click, this.onTriggerClick);
                    htmlExtensions_17.addEvent(this.trigger, htmlExtensions_17.eventTypes.keydown, this.onTriggerKeyPress);
                    htmlExtensions_17.addEvent(this.menu, htmlExtensions_17.eventTypes.keydown, this.handleMenuKeydownEvent, true);
                    for (var _i = 0, _a = this.items; _i < _a.length; _i++) {
                        var item = _a[_i];
                        htmlExtensions_17.addEvent(item, htmlExtensions_17.eventTypes.click, this.onItemClick);
                    }
                    htmlExtensions_17.addEvent(this.items[this.items.length - 1], htmlExtensions_17.eventTypes.keydown, this.onNonSelectMenuTab);
                    htmlExtensions_17.addEvent(document, htmlExtensions_17.eventTypes.click, this.onNonSelectMenuClick);
                }
            };
            SelectMenu.prototype.onTriggerToggled = function (event) {
                if (this.element.getAttribute('aria-disabled') === 'true') {
                    return;
                }
                if (this.isExpanded()) {
                    this.collapse();
                }
                else {
                    this.expand(event);
                }
            };
            SelectMenu.prototype.onItemSelected = function (item, internal, userInitiated) {
                if (!item || (item === this.selectedItem)) {
                    this.collapse();
                    return false;
                }
                if (item.nodeName === 'P' || item.nodeName === 'IMG') {
                    item = item.parentElement;
                }
                if (this.persist && this.trigger) {
                    var triggerImg = htmlExtensions_17.selectFirstElementT('img', this.trigger);
                    this.ignoreNextDOMChange = true;
                    if (triggerImg) {
                        var selectedImg = htmlExtensions_17.selectFirstElementT('img', item);
                        var imageSrc = selectedImg ? selectedImg.getAttribute('src') : '';
                        triggerImg.setAttribute('src', imageSrc);
                        var triggerSpan = htmlExtensions_17.selectFirstElementT('span', this.trigger);
                        htmlExtensions_17.setText(triggerSpan, htmlExtensions_17.getText(item));
                        if (htmlExtensions_17.hasClass(this.trigger, 'f-icon') && !selectedImg) {
                            htmlExtensions_17.removeClass(this.trigger, 'f-icon');
                        }
                        else if (!htmlExtensions_17.hasClass(this.trigger, 'f-icon') && selectedImg) {
                            htmlExtensions_17.addClass(this.trigger, 'f-icon');
                        }
                    }
                    else {
                        htmlExtensions_17.setText(this.trigger, htmlExtensions_17.getText(item));
                    }
                }
                if (this.selectedItem) {
                    this.selectedItem.setAttribute(this.getSelectedAttribute(this.selectedItem), 'false');
                }
                this.selectedItem = item;
                this.selectedItem.setAttribute(this.getSelectedAttribute(this.selectedItem), 'true');
                this.updateAriaLabel();
                this.collapse();
                var currentElement = this.selectedItem;
                while (currentElement.parentElement !== this.menu) {
                    currentElement = currentElement.parentElement;
                }
                this.initiatePublish({
                    id: currentElement.id,
                    href: this.selectedItem.getAttribute('href'),
                    internal: internal,
                    userInitiated: userInitiated
                });
                return true;
            };
            SelectMenu.prototype.publish = function (subscriber, context) {
                if (!!this.selectedItem) {
                    subscriber.onSelectionChanged(context);
                }
            };
            SelectMenu.prototype.handleMenuKeydown = function (target, keycode) {
                switch (keycode) {
                    case 32:
                    case 13:
                        this.handleMenuEnterKey(target);
                        this.trigger.focus();
                        break;
                    case 27:
                        this.trigger.focus();
                        this.collapse();
                        break;
                    case 38:
                        this.handleMenuArrowKey(true, target);
                        break;
                    case 40:
                        this.handleMenuArrowKey(false, target);
                        break;
                    case 9:
                        if (this.isExpanded()) {
                            this.handleMenuEnterKey(target);
                        }
                }
            };
            SelectMenu.prototype.handleMenuArrowKey = function (isUpArrow, currentItem) {
                var currentItemIndex = this.items.indexOf(currentItem);
                if (currentItemIndex === -1) {
                    return;
                }
                currentItemIndex += isUpArrow ? -1 : 1;
                if (currentItemIndex < 0) {
                    currentItemIndex = this.items.length - 1;
                }
                else if (currentItemIndex >= this.items.length) {
                    currentItemIndex = 0;
                }
                this.items[currentItemIndex].focus();
            };
            SelectMenu.prototype.handleMenuEnterKey = function (currentItem) {
                this.onItemSelected(currentItem, false, true);
            };
            SelectMenu.selector = '.c-select-menu';
            SelectMenu.typeName = 'SelectMenu';
            SelectMenu.dataAriaLabelFormat = 'data-aria-label-format';
            SelectMenu.ariaExpanded = 'aria-expanded';
            SelectMenu.ariaHidden = 'aria-hidden';
            SelectMenu.ariaSelected = 'aria-selected';
            SelectMenu.ariaLabel = 'aria-label';
            SelectMenu.ariaChecked = 'aria-checked';
            SelectMenu.hiddenFocus = 'x-hidden-focus';
            return SelectMenu;
        }(publisher_2.Publisher));
        exports.SelectMenu = SelectMenu;
    });
    define("helpers/age-gate-helper", ["require", "exports", "mwf/utilities/utility", "mwf/utilities/htmlExtensions", "mwf/selectMenu/selectMenu", "mwf/utilities/componentFactory", "utilities/environment", "helpers/localization-helper"], function (require, exports, utility_20, htmlExtensions_18, selectMenu_1, componentFactory_2, environment_6, localization_helper_4) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.AgeGateHelper = void 0;
        var AgeGateHelper = (function () {
            function AgeGateHelper(playerContainer, corePlayer, localizationHelper, onCompleteCallback) {
                var _this = this;
                this.playerContainer = playerContainer;
                this.corePlayer = corePlayer;
                this.localizationHelper = localizationHelper;
                this.onCompleteCallback = onCompleteCallback;
                this.ageGateData = {};
                this.contentMinimumAge = 0;
                this.isUserOldEnough = false;
                this.didUserClickSubmit = false;
                this.ageGateIsDisplayed = false;
                this.onAgeGateButtonClick = function (event) {
                    htmlExtensions_18.preventDefault(event);
                    var target = htmlExtensions_18.getEventTargetOrSrcElement(event);
                    if (target) {
                        var monthSelectMenuButton = htmlExtensions_18.selectFirstElement('.month-button', _this.ageGateDialogue.monthSelectMenu);
                        var daySelectMenuButton = htmlExtensions_18.selectFirstElement('.day-button', _this.ageGateDialogue.daySelectMenu);
                        var yearSelectMenuButton = htmlExtensions_18.selectFirstElement('.year-button', _this.ageGateDialogue.yearSelectMenu);
                        if (monthSelectMenuButton && daySelectMenuButton && yearSelectMenuButton) {
                            var selectedMonth = Number(htmlExtensions_18.getText(monthSelectMenuButton));
                            var selectedDay = Number(htmlExtensions_18.getText(daySelectMenuButton));
                            var selectedYear = Number(htmlExtensions_18.getText(yearSelectMenuButton));
                            if (selectedMonth && selectedDay && selectedYear) {
                                _this.didUserClickSubmit = true;
                                var today = new Date();
                                var age = today.getFullYear() - selectedYear;
                                var birthdayMonthHasNotHappenedYet = today.getMonth() + 1 < selectedMonth;
                                var birthdayDayHasNotHappenedYet = (today.getMonth() + 1 === selectedMonth && today.getDate() < selectedDay);
                                if (birthdayMonthHasNotHappenedYet || birthdayDayHasNotHappenedYet) {
                                    age--;
                                }
                                _this.addAgeGateVerifiedToUserSession(age + '');
                                _this.playerData.options.lazyLoad = false;
                                if (!_this.isUserOldEnoughToViewContent(_this.contentMinimumAge)) {
                                    _this.onCompleteCallback && _this.onCompleteCallback();
                                }
                                else {
                                    _this.isUserOldEnough = true;
                                    _this.onCompleteCallback && _this.onCompleteCallback();
                                }
                                _this.ageGateDialogue.container.setAttribute('aria-hidden', 'true');
                                _this.ageGateIsDisplayed = false;
                                if (!!environment_6.Environment.isIProduct) {
                                    var videoTag = htmlExtensions_18.selectFirstElement('video', _this.playerContainer);
                                    videoTag.style.visibility = '';
                                    _this.playerContainer.style.backgroundColor = '';
                                }
                            }
                        }
                    }
                };
            }
            AgeGateHelper.prototype.verifyAgeGate = function () {
                this.playerData = this.corePlayer.getPlayerData();
                this.contentMinimumAge = this.playerData.metadata.minimumAge ?
                    this.playerData.metadata.minimumAge : 0;
                if (this.contentMinimumAge <= 0 || !this.playerData.options.ageGate) {
                    this.isUserOldEnough = true;
                    this.onCompleteCallback && this.onCompleteCallback();
                    return false;
                }
                this.addUserAgeFromExternalLogin();
                if (!this.isUserAgeAlreadyVerified()) {
                    this.displayAgeGateDialogue();
                    return true;
                }
                else if (this.isUserOldEnoughToViewContent(this.contentMinimumAge)) {
                    this.isUserOldEnough = true;
                    this.onCompleteCallback && this.onCompleteCallback();
                }
                else {
                    this.onCompleteCallback && this.onCompleteCallback();
                }
                return false;
            };
            AgeGateHelper.prototype.didUserSubmitAge = function () {
                return this.didUserClickSubmit;
            };
            AgeGateHelper.prototype.resetAgeGateSubmit = function () {
                this.didUserClickSubmit = false;
            };
            AgeGateHelper.prototype.doesUserPassAgeGate = function () {
                return this.isUserOldEnough;
            };
            AgeGateHelper.prototype.addUserAgeFromExternalLogin = function () {
                var xboxCookieValue = utility_20.getCookie(AgeGateHelper.xboxDotComAgeGateCookieName);
                if (!!Number(xboxCookieValue)) {
                    utility_20.saveToSessionStorage(AgeGateHelper.ageGateSessionStorageKey, xboxCookieValue);
                }
                else {
                    var userMinimumAge = this.playerData.options.userMinimumAge;
                    if (userMinimumAge > 0) {
                        utility_20.saveToSessionStorage(AgeGateHelper.ageGateSessionStorageKey, userMinimumAge + '');
                    }
                }
            };
            AgeGateHelper.prototype.addAgeGateVerifiedToUserSession = function (userAge) {
                utility_20.saveToSessionStorage(AgeGateHelper.ageGateSessionStorageKey, userAge);
            };
            AgeGateHelper.prototype.isUserAgeAlreadyVerified = function () {
                return !!utility_20.getValueFromSessionStorage(AgeGateHelper.ageGateSessionStorageKey);
            };
            AgeGateHelper.prototype.isUserOldEnoughToViewContent = function (minimumAge) {
                var UserAge = Number(utility_20.getValueFromSessionStorage(AgeGateHelper.ageGateSessionStorageKey));
                if (UserAge >= minimumAge) {
                    return true;
                }
                return false;
            };
            AgeGateHelper.prototype.displayAgeGateDialogue = function () {
                this.ageGateIsDisplayed = true;
                this.getLocalizedAgeGateStrings();
                if (!this.ageGateDialogue) {
                    this.setDefaultSelectMenuContainer();
                    this.createAgeGateContainer();
                }
                this.populateDateDropDowns();
                if (!!environment_6.Environment.isIProduct) {
                    var videoTag = htmlExtensions_18.selectFirstElement('video', this.playerContainer);
                    videoTag.style.visibility = 'hidden';
                    this.playerContainer.style.backgroundColor = 'black';
                }
            };
            AgeGateHelper.prototype.setDefaultSelectMenuContainer = function () {
                this.defaultDateSelectMenuContainer = "<div class=\"select-menu-month c-select-menu f-border f-persist\">\n        <a href=\"#\" role=\"button\" aria-expanded=\"false\" class=\"month-button\" aria-label=\"" + this.ageGateData.monthLabel + "\">\n        " + this.ageGateData.monthLabel + "\n        </a>\n        <ul role=\"menu\" class=\"c-menu f-scroll\" aria-hidden=\"true\">\n        </ul>\n    </div>\n    <div class=\"select-menu-day c-select-menu f-border f-persist\">\n        <a href=\"#\" role=\"button\" aria-expanded=\"false\" class=\"day-button\" aria-label=\"" + this.ageGateData.dayLabel + "\">\n        " + this.ageGateData.dayLabel + "\n        </a>\n        <ul role=\"menu\" class=\"c-menu f-scroll\" aria-hidden=\"true\">\n        </ul>\n    </div>\n    <div class=\"select-menu-year c-select-menu f-border f-persist\">\n        <a href=\"#\" role=\"button\" aria-expanded=\"false\" class=\"year-button\" aria-label=\"" + this.ageGateData.yearLabel + "\">\n        " + this.ageGateData.yearLabel + "\n        </a>\n        <ul role=\"menu\" class=\"c-menu f-scroll\" aria-hidden=\"true\">\n        </ul>\n    </div>";
            };
            AgeGateHelper.prototype.getLocalizedAgeGateStrings = function () {
                this.ageGateData.buttonText = this.localizationHelper.getLocalizedValue(localization_helper_4.playerLocKeys.agegate_submit);
                this.ageGateData.heading = this.localizationHelper.getLocalizedValue(localization_helper_4.playerLocKeys.agegate_enterdate);
                this.ageGateData.dropDownAriaLabel = this.localizationHelper.getLocalizedValue(localization_helper_4.playerLocKeys.agegate_enterdate_arialabel);
                this.ageGateData.monthLabel = this.localizationHelper.getLocalizedValue(localization_helper_4.playerLocKeys.agegate_month);
                this.ageGateData.dayLabel = this.localizationHelper.getLocalizedValue(localization_helper_4.playerLocKeys.agegate_day);
                this.ageGateData.yearLabel = this.localizationHelper.getLocalizedValue(localization_helper_4.playerLocKeys.agegate_year);
                this.ageGateData.monthDayYearOrder = this.localizationHelper.getLocalizedValue(localization_helper_4.playerLocKeys.agegate_dateorder);
                this.ageGateData.monthAriaLabel = this.ageGateData.dropDownAriaLabel.replace('{0}', this.ageGateData.monthLabel);
                this.ageGateData.dayAriaLabel = this.ageGateData.dropDownAriaLabel.replace('{0}', this.ageGateData.dayLabel);
                this.ageGateData.yearAriaLabel = this.ageGateData.dropDownAriaLabel.replace('{0}', this.ageGateData.yearLabel);
            };
            AgeGateHelper.prototype.setSelectMenuMonthDayYearOrder = function () {
                try {
                    var separators = ['\\/', '\\.', '\\. ', '\\-'];
                    var localizedSelectMenuOrder = '';
                    var monthDayYearSplit = this.ageGateData.monthDayYearOrder.toLowerCase().split(new RegExp(separators.join('|')), 3);
                    var monthDayYearAdded = true;
                    for (var i = 0; i < monthDayYearSplit.length; i++) {
                        if (monthDayYearSplit[i].indexOf('m') > -1) {
                            localizedSelectMenuOrder +=
                                "<div class=\"select-menu-month c-select-menu f-border f-persist\">\n                    <a href=\"#\" role=\"button\" aria-expanded=\"false\" class=\"month-button\" aria-label=\"" + this.ageGateData.monthAriaLabel + "\">\n                    " + this.ageGateData.monthLabel + "\n                    </a>\n                    <ul role=\"menu\" class=\"c-menu f-scroll\" aria-hidden=\"true\">\n                    </ul>\n                </div>";
                        }
                        else if (monthDayYearSplit[i].indexOf('d') > -1) {
                            localizedSelectMenuOrder +=
                                "<div class=\"select-menu-day c-select-menu f-border f-persist\">\n                    <a href=\"#\" role=\"button\" aria-expanded=\"false\" class=\"day-button\" aria-label=\"" + this.ageGateData.dayAriaLabel + "\">\n                    " + this.ageGateData.dayLabel + "\n                    </a>\n                    <ul role=\"menu\" class=\"c-menu f-scroll\" aria-hidden=\"true\">\n                    </ul>\n                </div>";
                        }
                        else if (monthDayYearSplit[i].indexOf('y') > -1) {
                            localizedSelectMenuOrder +=
                                "<div class=\"select-menu-year c-select-menu f-border f-persist\">\n                    <a href=\"#\" role=\"button\" aria-expanded=\"false\" class=\"year-button\" aria-label=\"" + this.ageGateData.yearAriaLabel + "\">\n                    " + this.ageGateData.yearLabel + "\n                    </a>\n                    <ul role=\"menu\" class=\"c-menu f-scroll\" aria-hidden=\"true\">\n                    </ul>\n                </div>";
                        }
                        else {
                            monthDayYearAdded = false;
                        }
                    }
                    return monthDayYearAdded ? localizedSelectMenuOrder : this.defaultDateSelectMenuContainer;
                }
                catch (ex) {
                    return this.defaultDateSelectMenuContainer;
                }
            };
            AgeGateHelper.prototype.createAgeGateContainer = function () {
                var _this = this;
                var localizedSelectMenuOrder = this.setSelectMenuMonthDayYearOrder();
                var html = "\n<div class=\"theme-dark c-update-dark-theme\">\n    <div class=\"\">\n        <h3 aria-hidden=\"true\" class=\"c-heading-3 c-font-weight-override\">" + this.ageGateData.heading + "</h3>\n        <fieldset>" +
                    localizedSelectMenuOrder +
                    ("<button name=\"button\" class=\"c-button\" type=\"submit\" disabled>" + this.ageGateData.buttonText + "</button>\n        </fieldset>\n    </div>\n</div>\n");
                var tempAgeGateDiv = document.createElement('div');
                tempAgeGateDiv.innerHTML = html;
                htmlExtensions_18.addClass(tempAgeGateDiv, 'f-age-gate-dialogue');
                var videoClosedCaptionContainer = htmlExtensions_18.selectFirstElement('.f-video-cc-overlay', this.playerContainer);
                this.playerContainer.insertBefore(tempAgeGateDiv, videoClosedCaptionContainer);
                this.ageGateDialogue = {};
                this.ageGateDialogue.container = document.createElement('div');
                this.ageGateDialogue.container = htmlExtensions_18.selectFirstElement('.f-age-gate-dialogue', this.playerContainer);
                this.ageGateDialogue.button = htmlExtensions_18.selectFirstElement('.c-button', this.ageGateDialogue.container);
                htmlExtensions_18.addEvent(this.ageGateDialogue.button, htmlExtensions_18.eventTypes.click, this.onAgeGateButtonClick);
                this.ageGateDialogue.button.setAttribute(AgeGateHelper.ariaLabel, this.localizationHelper.getLocalizedValue(localization_helper_4.playerLocKeys.agegate_submit));
                this.ageGateDialogue.monthSelectMenu = htmlExtensions_18.selectFirstElement('.select-menu-month', this.ageGateDialogue.container);
                this.ageGateDialogue.daySelectMenu = htmlExtensions_18.selectFirstElement('.select-menu-day', this.ageGateDialogue.container);
                this.ageGateDialogue.yearSelectMenu = htmlExtensions_18.selectFirstElement('.select-menu-year', this.ageGateDialogue.container);
                this.ageGateDialogue.monthSelectMenuList = htmlExtensions_18.selectFirstElement('.c-menu', this.ageGateDialogue.monthSelectMenu);
                this.ageGateDialogue.daySelectMenuList = htmlExtensions_18.selectFirstElement('.c-menu', this.ageGateDialogue.daySelectMenu);
                this.ageGateDialogue.yearSelectMenuList = htmlExtensions_18.selectFirstElement('.c-menu', this.ageGateDialogue.yearSelectMenu);
                componentFactory_2.ComponentFactory.create([{
                        component: selectMenu_1.SelectMenu,
                        eventToBind: 'DOMContentLoaded',
                        elements: [this.ageGateDialogue.monthSelectMenu, this.ageGateDialogue.daySelectMenu, this.ageGateDialogue.yearSelectMenu],
                        callback: function (results) {
                            if (!!results || !!results.length) {
                                _this.selectMenuMonth = results[0];
                                _this.selectMenuDay = results[1];
                                _this.selectMenuYear = results[2];
                                _this.selectMenuDay.subscribe({
                                    'onSelectionChanged': function (notification) { return _this.onMonthDayYearDropDownSelect(notification); }
                                });
                                _this.selectMenuMonth.subscribe({
                                    'onSelectionChanged': function (notification) { return _this.onMonthDayYearDropDownSelect(notification); }
                                });
                                _this.selectMenuYear.subscribe({
                                    'onSelectionChanged': function (notification) { return _this.onMonthDayYearDropDownSelect(notification); }
                                });
                            }
                        }
                    }]);
            };
            AgeGateHelper.prototype.populateDateDropDowns = function () {
                if (!!this.ageGateDialogue.monthSelectMenuList) {
                    var monthIterator = void 0;
                    for (monthIterator = 1; monthIterator <= 12; monthIterator++) {
                        var listItem = this.createListItem('month-', monthIterator);
                        var listItemInnerText = "<a role=\"menuitem\" href=\"#\" aria-selected=\"false\" tabindex=\"-1\">" + (monthIterator + '') + "</a>";
                        listItem.innerHTML = listItemInnerText;
                        this.ageGateDialogue.monthSelectMenuList.appendChild(listItem);
                    }
                }
                if (!!this.ageGateDialogue.daySelectMenuList) {
                    var dayIterator = void 0;
                    for (dayIterator = 1; dayIterator <= 31; dayIterator++) {
                        var listItem = this.createListItem('day-', dayIterator);
                        var listItemInnerText = "<a role=\"menuitem\" href=\"#\" aria-selected=\"false\" tabindex=\"-1\">" + (dayIterator + '') + "</a>";
                        listItem.innerHTML = listItemInnerText;
                        this.ageGateDialogue.daySelectMenuList.appendChild(listItem);
                    }
                }
                if (!!this.ageGateDialogue.yearSelectMenuList) {
                    var currentYear = new Date().getFullYear();
                    var startYear = currentYear - AgeGateHelper.numberOfSelectableYears;
                    var yearIterator = void 0;
                    for (yearIterator = currentYear; yearIterator >= startYear; yearIterator--) {
                        var listItem = this.createListItem('year-', yearIterator);
                        var listItemInnerText = "<a role=\"menuitem\" href=\"#\" aria-selected=\"false\" tabindex=\"-1\">" + (yearIterator + '') + "</a>";
                        listItem.innerHTML = listItemInnerText;
                        this.ageGateDialogue.yearSelectMenuList.appendChild(listItem);
                    }
                }
            };
            AgeGateHelper.prototype.createListItem = function (idRoot, idValue) {
                var listItem = document.createElement('li');
                listItem.id = idRoot + idValue;
                htmlExtensions_18.addClass(listItem, 'c-menu-item');
                listItem.setAttribute('role', 'presentation');
                return listItem;
            };
            AgeGateHelper.prototype.onMonthDayYearDropDownSelect = function (notification) {
                if (!notification) {
                    return;
                }
                var monthSelectMenuButton = htmlExtensions_18.selectFirstElement('.month-button', this.ageGateDialogue.monthSelectMenu);
                var daySelectMenuButton = htmlExtensions_18.selectFirstElement('.day-button', this.ageGateDialogue.daySelectMenu);
                var yearSelectMenuButton = htmlExtensions_18.selectFirstElement('.year-button', this.ageGateDialogue.yearSelectMenu);
                if (monthSelectMenuButton && daySelectMenuButton && yearSelectMenuButton) {
                    var selectedMonth = Number(htmlExtensions_18.getText(monthSelectMenuButton));
                    var selectedDay = Number(htmlExtensions_18.getText(daySelectMenuButton));
                    var selectedYear = Number(htmlExtensions_18.getText(yearSelectMenuButton));
                    if (selectedMonth) {
                        monthSelectMenuButton.setAttribute('aria-label', selectedMonth + " " + this.ageGateData.monthLabel);
                    }
                    if (selectedDay) {
                        daySelectMenuButton.setAttribute('aria-label', selectedDay + " " + this.ageGateData.dayLabel);
                    }
                    if (selectedYear) {
                        yearSelectMenuButton.setAttribute('aria-label', selectedYear + " " + this.ageGateData.yearLabel);
                    }
                    if (selectedMonth && selectedDay && selectedYear) {
                        this.ageGateDialogue.button.removeAttribute('disabled');
                    }
                    selectedDay = selectedDay ? selectedDay : 1;
                    selectedMonth = selectedMonth ? selectedMonth : 1;
                    selectedYear = selectedYear ? selectedYear : new Date().getFullYear();
                    var numberOfDaysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
                    var dayIterator = void 0;
                    for (dayIterator = 28; 31 >= dayIterator; dayIterator++) {
                        var dayListItem = htmlExtensions_18.selectFirstElement('#day-' + dayIterator);
                        if (dayIterator > numberOfDaysInMonth) {
                            htmlExtensions_18.addClass(dayListItem, 'c-hide-menu-item');
                        }
                        else {
                            htmlExtensions_18.removeClass(dayListItem, 'c-hide-menu-item');
                        }
                    }
                    if (selectedDay > numberOfDaysInMonth) {
                        this.selectMenuDay.setSelectedItem('day-' + 1);
                    }
                }
            };
            AgeGateHelper.ageGateSessionStorageKey = 'UserAge';
            AgeGateHelper.xboxDotComAgeGateCookieName = 'maturityRatingAge';
            AgeGateHelper.ariaLabel = 'aria-label';
            AgeGateHelper.numberOfSelectableYears = 110;
            return AgeGateHelper;
        }());
        exports.AgeGateHelper = AgeGateHelper;
    });
    define("helpers/inview-helper", ["require", "exports", "mwf/utilities/htmlExtensions", "mwf/utilities/utility", "players/core-player"], function (require, exports, htmlExtensions_19, utility_21, core_player_2) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.InviewManager = exports.DocumentVisibility = void 0;
        exports.DocumentVisibility = {
            msHidden: 'msvisibilitychange',
            webkitHidden: 'webkitvisibilitychange',
            mozHidden: 'mozvisibilitychange',
            hidden: 'visibilitychange',
        };
        var InviewManager = (function () {
            function InviewManager() {
                var _this = this;
                this.isAnyPlayerPlaying = false;
                this.defaultInViewWidthFraction = 0.5;
                this.defaultInViewHeightFraction = 0.5;
                this.onDocumentVisibilityChanged = function (event) {
                    if (InviewManager.isDocumentVisible()) {
                        _this.triggerInViewPlay(false);
                    }
                    else {
                        if (_this.isAnyPlayerPlaying && InviewManager.currentPlayer) {
                            if (!(InviewManager.currentPlayer.hasUserInteracted()
                                && InviewManager.currentPlayer.hasUserIntiatedPause())) {
                                _this.clearCurrentPlayer();
                            }
                            else {
                                InviewManager.currentPlayer.pause();
                            }
                        }
                        else {
                            _this.triggerInViewPlay(false);
                        }
                    }
                };
                this.onInViewPlayHandler = function (event) {
                    setTimeout(_this.triggerInViewPlay(false), 500);
                };
                InviewManager.players = [];
                InviewManager.currentPlayer = null;
                for (var stateKey in exports.DocumentVisibility) {
                    if (stateKey in document) {
                        InviewManager.hidden = stateKey;
                        InviewManager.visibilityChange = exports.DocumentVisibility[stateKey];
                        break;
                    }
                }
                this.bindInViewEvents();
            }
            InviewManager.Instance = function () {
                if (this._instance === null || this._instance === undefined) {
                    this._instance = new InviewManager();
                }
                return this._instance;
            };
            InviewManager.prototype.clearCurrentPlayer = function () {
                if (InviewManager.currentPlayer) {
                    InviewManager.currentPlayer.pause();
                }
                InviewManager.currentPlayer = null;
                this.isAnyPlayerPlaying = false;
            };
            InviewManager.prototype.setCurrentPlayer = function (player) {
                if (player && (InviewManager.currentPlayer !== player)) {
                    InviewManager.currentPlayer = player;
                    this.isAnyPlayerPlaying = true;
                }
            };
            InviewManager.prototype.insertByPosition = function (player) {
                var playerToInsertPos = this.getPlayerPosition(player.getPlayerContainer());
                if (!playerToInsertPos) {
                    InviewManager.players.push(player);
                    return;
                }
                var i = 0;
                while (i < InviewManager.players.length) {
                    if (InviewManager.players[i].getPlayerId() === player.getPlayerId()) {
                        return;
                    }
                    var playerPos = this.getPlayerPosition(InviewManager.players[i].getPlayerContainer());
                    if (playerPos && playerToInsertPos.top < playerPos.top) {
                        break;
                    }
                    i++;
                }
                InviewManager.players.splice(i, 0, player);
            };
            InviewManager.prototype.registerPlayer = function (player) {
                if (!player) {
                    return;
                }
                this.insertByPosition(player);
                if (!InviewManager.currentPlayer) {
                    this.triggerInViewPlay(true);
                }
            };
            InviewManager.prototype.disposePlayer = function (player) {
                if (!player) {
                    return;
                }
                if (InviewManager.currentPlayer === player) {
                    this.clearCurrentPlayer();
                }
                var i = InviewManager.players.indexOf(player);
                i >= 0 && InviewManager.players.splice(i, 1);
                if (InviewManager.players.length === 0) {
                    this.dispose();
                }
            };
            InviewManager.prototype.dispose = function () {
                InviewManager.players = [];
                InviewManager.currentPlayer = null;
            };
            InviewManager.isDocumentVisible = function () {
                var docHidden = document[this.hidden];
                return !docHidden;
            };
            InviewManager.prototype.triggerInViewPlay = function (fromPlayerRegistration) {
                if (!InviewManager.isDocumentVisible()) {
                    return;
                }
                var isCurrentPlayerInView = false;
                if (InviewManager.currentPlayer) {
                    if (this.isAnyPlayerPlaying) {
                        isCurrentPlayerInView = this.isPlayerInView(InviewManager.currentPlayer);
                        if (!isCurrentPlayerInView) {
                            if (!(InviewManager.currentPlayer.hasUserInteracted()
                                && InviewManager.currentPlayer.hasUserIntiatedPause())) {
                                this.clearCurrentPlayer();
                            }
                            else {
                                InviewManager.currentPlayer.pause();
                            }
                        }
                    }
                }
                if (this.isAnyPlayerPlaying && InviewManager.currentPlayer
                    && (InviewManager.currentPlayer.hasUserInteracted() || isCurrentPlayerInView)) {
                    return;
                }
                if (InviewManager.players && InviewManager.players.length) {
                    for (var i = 0; i < InviewManager.players.length; i++) {
                        var player = InviewManager.players[i];
                        if (InviewManager.currentPlayer === player) {
                            continue;
                        }
                        if (fromPlayerRegistration || !(player.hasUserInteracted() && player.hasUserIntiatedPause())) {
                            if (!(player.hasUserInteracted() && player.hasUserIntiatedPause())) {
                                var isInview = this.isPlayerInView(player);
                                var currentState = player.getCurrentPlayState();
                                if (!isInview && ((currentState === core_player_2.PlayerStates.Playing))) {
                                    player.pause();
                                    this.clearCurrentPlayer();
                                    break;
                                }
                                if (isInview && (player.isPaused() || (currentState === core_player_2.PlayerStates.Paused))
                                    && currentState !== core_player_2.PlayerStates.Ended) {
                                    player.play();
                                    this.setCurrentPlayer(player);
                                    break;
                                }
                                if (isInview && ((currentState === core_player_2.PlayerStates.Playing))) {
                                    this.setCurrentPlayer(player);
                                    break;
                                }
                            }
                            else {
                                this.handledUserInteractedPlay(player);
                            }
                        }
                        else {
                            if (player.hasUserInteracted() && player.hasUserIntiatedPause()) {
                                this.handledUserInteractedPlay(player);
                            }
                        }
                    }
                }
            };
            InviewManager.prototype.handledUserInteractedPlay = function (player) {
                if (player) {
                    var isInview = this.isPlayerInView(player);
                    if (!isInview && ((player.getCurrentPlayState() === core_player_2.PlayerStates.Playing))) {
                        player.pause();
                        this.clearCurrentPlayer();
                    }
                }
            };
            InviewManager.prototype.isPlayerInView = function (player) {
                var windowWidth = utility_21.getWindowWidth();
                var windowHeight = utility_21.getWindowHeight();
                if ((!windowWidth) || (!windowHeight) || (windowWidth <= 0) || (windowHeight <= 0)) {
                    return false;
                }
                var position = this.getPlayerPosition(player.getPlayerContainer());
                if (!position || !position.width || !position.height) {
                    return false;
                }
                var inViewWidthFraction = this.defaultInViewWidthFraction;
                var inViewHeightFraction = this.defaultInViewHeightFraction;
                if (player.getPlayerData().options) {
                    if (player.getPlayerData().options.inViewWidthFraction) {
                        inViewWidthFraction = player.getPlayerData().options.inViewWidthFraction;
                    }
                    if (player.getPlayerData().options.inViewHeightFraction) {
                        inViewHeightFraction = player.getPlayerData().options.inViewHeightFraction;
                    }
                }
                var minReqWidth = position.width * Math.abs(inViewWidthFraction);
                var minReqHeight = position.height * Math.abs(inViewHeightFraction);
                return this.isInView(windowWidth, windowHeight, position, minReqWidth, minReqHeight);
            };
            InviewManager.prototype.isInView = function (windowWidth, windowHeight, elemDimensions, minReqWidth, minReqHeight) {
                var visibleHeight = (elemDimensions.bottom < 0 || elemDimensions.top > windowHeight) ?
                    0 : Math.min(windowHeight, elemDimensions.bottom) - Math.max(elemDimensions.top, 0);
                var visibleWidth = (elemDimensions.right < 0 || elemDimensions.left > windowWidth) ?
                    0 : Math.min(windowWidth, elemDimensions.right) - Math.max(0, elemDimensions.left);
                return visibleHeight && visibleHeight >= minReqHeight && visibleWidth && visibleWidth >= minReqWidth;
            };
            InviewManager.prototype.listenForInviewThresholdChanges = function (container, threshold, callback) {
                if (!container || !threshold || threshold < 0 || threshold > 1) {
                    return;
                }
                this.inviewChange = {
                    enter: true,
                    exit: false
                };
                this.inviewContainer = container;
                this.inviewThreshold = threshold;
                this.inviewCallback = callback;
                var that = this;
                htmlExtensions_19.addEvents(window, 'scroll', function () { that.checkInviewThreshold(); });
            };
            InviewManager.prototype.checkInviewThreshold = function () {
                if (this.inviewChange.enter === true) {
                    if (!this.inviewVerticalThreshold() || !this.inviewHorizontalThreshold()) {
                        this.inviewChange.enter = false;
                        this.inviewChange.exit = true;
                        this.inviewCallback('InviewExit');
                    }
                }
                else if (this.inviewChange.exit === true) {
                    if (this.inviewVerticalThreshold() && this.inviewHorizontalThreshold()) {
                        this.inviewChange.enter = true;
                        this.inviewChange.exit = false;
                        this.inviewCallback('InviewEnter');
                    }
                }
            };
            InviewManager.prototype.inviewVerticalThreshold = function () {
                var windowHeight = utility_21.getWindowHeight();
                var position = this.getPlayerPosition(this.inviewContainer);
                var uPositionTop = position.top < 0 ? position.top * -1 : position.top;
                var uPositionBottom = position.bottom < 0 ? position.bottom * -1 : position.bottom;
                var threshold = this.inviewThreshold * position.height;
                if (!position || !position.height) {
                    return false;
                }
                if (position.bottom < 0 || position.top > windowHeight) {
                    return false;
                }
                else if (position.top < 0 &&
                    uPositionTop < threshold) {
                    return true;
                }
                else if (position.bottom > windowHeight &&
                    (uPositionBottom - windowHeight) < threshold) {
                    return true;
                }
                else if (position.top >= 0 && position.bottom <= windowHeight) {
                    return true;
                }
                return false;
            };
            InviewManager.prototype.inviewHorizontalThreshold = function () {
                var windowWidth = utility_21.getWindowWidth();
                var position = this.getPlayerPosition(this.inviewContainer);
                var uPositionLeft = position.left < 0 ? position.left * -1 : position.left;
                var uPositionRight = position.right < 0 ? position.right * -1 : position.right;
                var threshold = this.inviewThreshold * position.width;
                if (!position || !position.width) {
                    return false;
                }
                if (position.right < 0 || position.left > windowWidth) {
                    return false;
                }
                else if (position.left < 0 &&
                    uPositionLeft < threshold) {
                    return true;
                }
                else if (position.right >= windowWidth &&
                    (uPositionRight - windowWidth) < threshold) {
                    return true;
                }
                else if (position.left >= 0 && position.right <= windowWidth) {
                    return true;
                }
                return false;
            };
            InviewManager.prototype.getPlayerPosition = function (container) {
                if (!container || (container.childElementCount === 0)) {
                    return null;
                }
                var element = container.firstElementChild;
                var rect = element.getBoundingClientRect();
                if (!rect || !rect.width || !rect.height) {
                    return null;
                }
                return rect;
            };
            InviewManager.prototype.bindInViewEvents = function () {
                htmlExtensions_19.addEvents(document, InviewManager.visibilityChange, this.onDocumentVisibilityChanged);
                htmlExtensions_19.addEvents(window, 'scroll', this.onInViewPlayHandler);
                htmlExtensions_19.addEvents(window, 'resize', this.onInViewPlayHandler);
            };
            InviewManager.hidden = 'hidden';
            InviewManager.visibilityChange = 'visibilitychange';
            return InviewManager;
        }());
        exports.InviewManager = InviewManager;
    });
    define("players/core-player", ["require", "exports", "controls/video-controls", "closed-captions/video-closed-captions", "closed-captions/video-closed-captions-settings", "mwf/utilities/utility", "mwf/utilities/htmlExtensions", "mwf/utilities/stringExtensions", "data/player-data-interfaces", "data/player-options", "video-wrappers/html5-video-wrapper", "video-wrappers/amp-wrapper", "video-wrappers/has-video-wrapper", "video-wrappers/hls-video-wrapper", "video-wrappers/native-video-wrapper", "utilities/environment", "utilities/stopwatch", "utilities/player-utility", "constants/player-constants", "telemetry/jsll-reporter", "helpers/localization-helper", "data/player-config", "helpers/sharing-helper", "constants/player-constants", "helpers/interactive-triggers-helper", "helpers/screen-manager-helper", "helpers/age-gate-helper", "helpers/inview-helper", "data/video-shim-data-fetcher", "controls/context-menu", "constants/attributes", "constants/dom-selectors"], function (require, exports, video_controls_1, video_closed_captions_2, video_closed_captions_settings_1, utility_22, htmlExtensions_20, stringExtensions_13, player_data_interfaces_8, player_options_2, html5_video_wrapper_1, amp_wrapper_1, has_video_wrapper_1, hls_video_wrapper_1, native_video_wrapper_1, environment_7, stopwatch_1, player_utility_10, player_constants_10, jsll_reporter_1, localization_helper_5, player_config_7, sharing_helper_1, player_constants_11, interactive_triggers_helper_1, screen_manager_helper_1, age_gate_helper_1, inview_helper_1, video_shim_data_fetcher_3, context_menu_1, attributes_1, dom_selectors_1) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.CorePlayer = exports.PlayerStates = void 0;
        exports.PlayerStates = {
            Init: 'init',
            PlayerLoaded: 'playerLoaded',
            Loading: 'loading',
            Ready: 'ready',
            Playing: 'playing',
            Paused: 'paused',
            Buffering: 'buffering',
            Seeking: 'seeking',
            Ended: 'ended',
            Error: 'error',
            Stopped: 'stopped'
        };
        var MenuCategories = {
            AudioTracks: 'audio-tracks',
            ClosedCaption: 'close-caption',
            ClosedCaptionSettings: 'cc-settings',
            PlaybackSpeed: 'playback-speed',
            Quality: 'quality',
            Share: 'share',
            Download: 'download'
        };
        var ContextMenuCategories = {
            PlayPause: 'play-pause',
            MuteUnMute: 'mute-unMute'
        };
        var mediaQualityOrder = [player_data_interfaces_8.MediaQuality.HD, player_data_interfaces_8.MediaQuality.HQ, player_data_interfaces_8.MediaQuality.SD, player_data_interfaces_8.MediaQuality.LO];
        var CorePlayer = (function () {
            function CorePlayer(videoComponent, playerData) {
                var _this = this;
                this.videoComponent = videoComponent;
                this.videoElementIsFocus = false;
                this.canPlay = false;
                this.isFallbackVideo = false;
                this.playerData = {};
                this.wrapperLoadCalled = false;
                this.errorMessageDisplayed = false;
                this.isInFullscreen = false;
                this.isAudioTracksDoneSwitching = true;
                this.videoMetadata = null;
                this.playerOptions = null;
                this.isBuffering = false;
                this.isWindowClosing = false;
                this.isFirstTimePlayed = true;
                this.showcontrolFirstTime = true;
                this.isVideoMuted = false;
                this.commonPlayerImpressionReported = false;
                this.areMediaEventsBound = false;
                this.areControlsInitialized = false;
                this.areControlsVisible = false;
                this.seekFrom = null;
                this.volumeStart = null;
                this.playerTechnology = null;
                this.nextCheckpoint = null;
                this.stopwatchBuffering = new stopwatch_1.Stopwatch();
                this.stopwatchLoading = new stopwatch_1.Stopwatch();
                this.stopwatchPlaying = new stopwatch_1.Stopwatch();
                this.currentVideoStopwatchPlaying = new stopwatch_1.Stopwatch();
                this.firstByteTimer = null;
                this.lastVolume = player_config_7.PlayerConfig.defaultVolume;
                this.currentVideoFile = null;
                this.reporters = [];
                this.playOnDataLoad = false;
                this.startTimeOnDataLoad = 0;
                this.locReady = false;
                this.playerId = null;
                this.playTriggered = false;
                this.playPauseTrigger = false;
                this.hasProgressive = false;
                this.hasAdaptive = false;
                this.useAdaptive = false;
                this.hasHLS = false;
                this.hasInteractivity = false;
                this.isVideoPlayerSupported = true;
                this.hasDataError = false;
                this.dataErrorShown = false;
                this.playerEventCallbacks = [];
                this.isContentStartReported = false;
                this.showEndImage = false;
                this.wasUserInteracted = false;
                this.wasUserIntiatedPause = false;
                this.timeRemainingCheckpointReached = false;
                this.inviewManager = null;
                this.registedInviewManagerAlready = false;
                this.showingPosterImage = false;
                this.setAutoPlayNeeded = false;
                this.playerContainerEventHandler = function (event) {
                    switch (event.type) {
                        case 'contextmenu':
                            event.preventDefault();
                            if (!window.storeApi) {
                                switch (_this.playerState) {
                                    case exports.PlayerStates.Ready:
                                    case exports.PlayerStates.Playing:
                                    case exports.PlayerStates.Paused:
                                    case exports.PlayerStates.Ended:
                                    case exports.PlayerStates.Stopped:
                                        _this.setupCustomizeContextMenu();
                                        _this.contextMenu.showMenu(event, _this.playerContainer);
                                        break;
                                }
                            }
                            break;
                    }
                };
                this.documentEventHandler = function (event) {
                    event = htmlExtensions_20.getEvent(event);
                    switch (event.type) {
                        case 'click':
                            if (_this.customizedContextMenu) {
                                _this.customizedContextMenu.setAttribute('aria-hidden', 'true');
                            }
                            break;
                    }
                };
                this.videoControlsContainerEventHandler = function (event) {
                    event = htmlExtensions_20.getEvent(event);
                    switch (event.type) {
                        case 'contextmenu':
                            _this.customizedContextMenu.setAttribute('aria-hidden', 'true');
                            event.preventDefault();
                            event.stopPropagation();
                            break;
                    }
                };
                this.playPauseButtonEventHandler = function (event) {
                    event = htmlExtensions_20.getEvent(event);
                    switch (event.type) {
                        case 'mouseover':
                        case 'focus':
                            _this.showElement(_this.playPauseTooltip);
                            if (environment_7.Environment.isChrome) {
                                if (_this.isPaused()) {
                                    _this.setAriaLabelForButton(_this.playPauseButton);
                                }
                                else {
                                    _this.playPauseButton.setAttribute('aria-label', _this.locPause.toLowerCase());
                                }
                            }
                            break;
                        case 'mouseout':
                        case 'blur':
                            _this.hideElement(_this.playPauseTooltip);
                            break;
                    }
                };
                this.triggerPlayEventHandler = function (event) {
                    event = htmlExtensions_20.getEvent(event);
                    switch (event.type) {
                        case 'mouseover':
                        case 'focus':
                            _this.showElement(_this.triggerTooltip);
                            break;
                        case 'mouseout':
                        case 'blur':
                            _this.hideElement(_this.triggerTooltip);
                            break;
                    }
                };
                this.triggerContainerEventHandler = function (event) {
                    event = htmlExtensions_20.getEvent(event);
                    var startPlayOnTriggerEvent = function (setFocusToControlBar) {
                        _this.onVideoPlayerClicked(event);
                        if (setFocusToControlBar && _this.videoControls) {
                            _this.videoControls.setFocusOnControlBar();
                        }
                        if (_this.playerOptions && _this.playerOptions.playFullScreen) {
                            _this.enterFullScreen();
                        }
                        if (_this.playerOptions && _this.playerOptions.showEndImage) {
                            _this.hideImage();
                        }
                        _this.updateScreenReaderElement(_this.locPlaying, true);
                        event.preventDefault && event.preventDefault();
                        htmlExtensions_20.removeEvents(_this.triggerContainer, 'click keyup', _this.triggerContainerEventHandler, true);
                    };
                    switch (event.type) {
                        case 'click':
                            startPlayOnTriggerEvent(false);
                            break;
                        case 'keyup':
                            var key = utility_22.getKeyCode(htmlExtensions_20.getEvent(event));
                            if (key === 32) {
                                startPlayOnTriggerEvent(false);
                            }
                            break;
                    }
                };
                this.triggerPlayPauseContainerEventHandler = function (event) {
                    event = htmlExtensions_20.getEvent(event);
                    var startPlayPauseOnTriggerEvent = function () {
                        if (_this.isPlayable()) {
                            _this.setUserInteracted(true);
                            if (_this.isPaused()) {
                                _this.play();
                                _this.setUserIntiatedPause(false);
                                if (!!_this.playPauseButton) {
                                    htmlExtensions_20.removeClass(_this.playPauseButton, 'glyph-play');
                                    htmlExtensions_20.addClass(_this.playPauseButton, 'glyph-pause');
                                    if (environment_7.Environment.isChrome) {
                                        _this.playPauseButton.setAttribute('aria-label', _this.locPlaying);
                                    }
                                    else {
                                        _this.playPauseButton.setAttribute('aria-label', _this.locPause);
                                    }
                                    htmlExtensions_20.setText(_this.playPauseTooltip, _this.locPause);
                                    _this.updateScreenReaderElement(_this.locPlaying);
                                }
                            }
                            else {
                                _this.pause(true);
                                _this.setUserIntiatedPause(true);
                                if (!!_this.playPauseButton) {
                                    htmlExtensions_20.removeClass(_this.playPauseButton, 'glyph-pause');
                                    htmlExtensions_20.addClass(_this.playPauseButton, 'glyph-play');
                                    if (environment_7.Environment.isChrome) {
                                        _this.playPauseButton.setAttribute('aria-label', _this.locPaused);
                                    }
                                    else {
                                        _this.setAriaLabelForButton(_this.playPauseButton);
                                    }
                                    htmlExtensions_20.setText(_this.playPauseTooltip, _this.locPlay);
                                    _this.updateScreenReaderElement(_this.locPaused);
                                }
                            }
                        }
                    };
                    switch (event.type) {
                        case 'click':
                            startPlayPauseOnTriggerEvent();
                            break;
                        case 'keydown':
                            var key = utility_22.getKeyCode(htmlExtensions_20.getEvent(event));
                            if (key === 32) {
                                startPlayPauseOnTriggerEvent();
                            }
                            break;
                    }
                };
                this.onResourcesLoaded = function () {
                    player_utility_10.PlayerUtility.createVideoPerfMarker(_this.playerId, player_constants_11.videoPerfMarkers.locReady);
                    if ((_this.videoMetadata) && (_this.videoMetadata.geoFenced === true)) {
                        _this.playerState = exports.PlayerStates.Error;
                        _this.hideSpinner();
                        if ((_this.playerOptions.showImageForVideoError === true) && _this.videoMetadata && _this.videoMetadata.posterframeUrl) {
                            _this.hideTrigger();
                            _this.disablePlayPauseTrigger();
                            _this.displayImage(_this.videoMetadata.posterframeUrl);
                        }
                        else {
                            _this.displayErrorMessage({ title: _this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.geolocation_error) });
                        }
                        return;
                    }
                    _this.locPlay = _this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.play);
                    _this.locPlayVideo = _this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.play_video);
                    _this.locPause = _this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.pause);
                    _this.locMute = _this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.mute);
                    _this.locUnmute = _this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.unmute);
                    _this.locPlaying = _this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.playing);
                    _this.locPaused = _this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.paused);
                    _this.setSpinnerProperties();
                    _this.setTriggerProperties();
                    _this.locReady = true;
                    _this.initializeAgeGating();
                    var wasAgeGateDialogueDisplayed = _this.ageGateHelper.verifyAgeGate();
                    if (wasAgeGateDialogueDisplayed) {
                        _this.hideTrigger();
                        _this.hideSpinner();
                    }
                    if (_this.hasDataError && !_this.dataErrorShown) {
                        _this.showDataError();
                        _this.hasDataError = false;
                    }
                };
                this.onMediaEvent = function (event) {
                    if (!!event) {
                        htmlExtensions_20.customEvent(_this.videoComponent, event.type, { bubbles: event.bubbles, cancelable: event.cancelable });
                        if (_this.playerEventCallbacks && _this.playerEventCallbacks.length) {
                            for (var _i = 0, _a = _this.playerEventCallbacks; _i < _a.length; _i++) {
                                var callback = _a[_i];
                                callback && callback({ name: event.type });
                            }
                        }
                        switch (event.type.toLowerCase()) {
                            case 'canplay':
                            case 'canplaythrough':
                                _this.onVideoCanPlay(event);
                                break;
                            case 'error':
                                _this.onVideoError(event);
                                break;
                            case 'play':
                                _this.onVideoPlay(event);
                                break;
                            case 'pause':
                                _this.onVideoPause(event);
                                break;
                            case 'seeking':
                                _this.onVideoSeeking(event);
                                break;
                            case 'seeked':
                                _this.onVideoSeeked(event);
                                break;
                            case 'waiting':
                                _this.onVideoWaiting(event);
                                break;
                            case 'loadedmetadata':
                                _this.onVideoMetadataLoaded();
                                break;
                            case 'loadeddata':
                                _this.onVideoLoadedData();
                                break;
                            case 'timeupdate':
                                _this.onVideoTimeUpdate();
                                break;
                            case 'ended':
                                _this.onVideoEnded();
                                break;
                            case 'playing':
                                _this.onVideoPlaying();
                                break;
                            case 'volumechange':
                                _this.onVideoVolumeChange(event);
                                break;
                        }
                    }
                };
                this.onVideoPlaying = function () {
                    _this.updateState(exports.PlayerStates.Playing);
                    _this.checkReplacedVideoTag();
                    if (!!_this.videoControls && !!_this.videoWrapper) {
                        _this.videoControls.setLive(_this.isLive());
                        _this.videoControls.setPlayPosition(_this.videoWrapper.getPlayPosition());
                        _this.videoControls.resetSlidersWorkaround();
                    }
                    _this.setNextCheckpoint();
                    _this.reportContentStart();
                    if (environment_7.Environment.isAndroid) {
                        _this.logMessage('re-invoking play for Android only');
                        _this.videoWrapper.play();
                    }
                    if (_this.playerOptions && _this.playerOptions.inviewPlay) {
                        if (!_this.registedInviewManagerAlready) {
                            if (!_this.inviewManager) {
                                _this.inviewManager = inview_helper_1.InviewManager.Instance();
                            }
                            if (_this.inviewManager) {
                                _this.inviewManager.registerPlayer(_this);
                                _this.registedInviewManagerAlready = true;
                            }
                        }
                    }
                };
                this.onVideoWrapperLoaded = function () {
                    _this.checkReplacedVideoTag();
                    player_utility_10.PlayerUtility.createVideoPerfMarker(_this.playerId, player_constants_11.videoPerfMarkers.wrapperReady);
                    _this.loadVideo();
                    if (_this.showingPosterImage) {
                        if (!_this.posterImageUrl) {
                            if (_this.videoMetadata &&
                                _this.videoMetadata.posterframeUrl) {
                                _this.videoWrapper.setPosterFrame(_this.videoMetadata.posterframeUrl);
                            }
                            else {
                                console.log('no poster image passed in parameter or video metadata');
                            }
                        }
                        else {
                            _this.videoWrapper.setPosterFrame(_this.posterImageUrl);
                        }
                        _this.showingPosterImage = false;
                    }
                    else {
                        if (_this.playerOptions.autoplay) {
                            _this.displayPreRollAndPlayContent();
                        }
                    }
                };
                this.onBeforeUnload = function () {
                    _this.isWindowClosing = true;
                };
                this.onWindowResize = function () {
                    if (_this.closedCaptions) {
                        _this.closedCaptions.resetCaptions();
                        _this.closedCaptions.updateCaptions(_this.getPlayPosition().currentTime);
                    }
                };
                this.onVideoWrapperLoadFailed = function () {
                    if (_this.playerOptions && (_this.playerOptions.showImageForVideoError === true)
                        && _this.videoMetadata && _this.videoMetadata.posterframeUrl) {
                        _this.hideTrigger();
                        _this.disablePlayPauseTrigger();
                        _this.displayImage(_this.videoMetadata.posterframeUrl);
                    }
                    else {
                        _this.displayErrorMessage({ title: _this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.standarderror) });
                    }
                };
                this.onMouseEvent = function (event) {
                    event = htmlExtensions_20.getEvent(event);
                    if (event.type === 'mousemove') {
                        _this.showcontrolFirstTime = false;
                        if (!_this.playPauseTrigger && _this.videoControls) {
                            _this.showControlsBasedOnState();
                        }
                        if (_this.playPauseTrigger) {
                            _this.showPlayPauseTrigger(true);
                        }
                    }
                    else if (event.type === 'mouseout') {
                        _this.showcontrolFirstTime = false;
                        if (_this.playPauseTrigger) {
                            _this.showPlayPauseTrigger(false);
                        }
                        var node = (event.toElement || event.relatedTarget);
                        while (node && node.parentNode && node.parentNode !== window) {
                            if ((node.parentNode === _this) || (node === _this)) {
                                htmlExtensions_20.preventDefault(event);
                                return;
                            }
                            node = node.parentNode;
                        }
                    }
                };
                this.onKeyboardEvent = function (event) {
                    var key = utility_22.getKeyCode(event);
                    switch (key) {
                        case 9:
                            _this.showControlsBasedOnState();
                            break;
                    }
                };
                this.onVideoMetadataLoaded = function () {
                    _this.setupPlayerMenus();
                };
                this.onVideoLoadedData = function () {
                    _this.updateState(exports.PlayerStates.Ready);
                    var position = _this.getPlayPosition();
                    if (!!_this.videoControls) {
                        _this.videoControls.setLive(_this.isLive());
                        _this.videoControls.setPlayPosition(position);
                    }
                    if (_this.startTimeOnDataLoad
                        && _this.startTimeOnDataLoad > position.startTime
                        && _this.startTimeOnDataLoad < position.endTime) {
                        _this.seek(_this.startTimeOnDataLoad);
                        _this.startTimeOnDataLoad = null;
                    }
                    if (_this.playOnDataLoad) {
                        _this.play();
                        _this.playOnDataLoad = false;
                    }
                };
                this.onVideoTimeUpdate = function () {
                    if (!_this.videoWrapper) {
                        return;
                    }
                    var position = _this.getPlayPosition();
                    if (_this.videoControls) {
                        _this.videoControls.setPlayPosition(position);
                    }
                    if (position.startTime === position.endTime) {
                        return;
                    }
                    if (_this.closedCaptions) {
                        _this.closedCaptions.updateCaptions(position.currentTime);
                    }
                    if (_this.interactiveTriggersHelper) {
                        _this.interactiveTriggersHelper.updateCurrentOverlay(position.currentTime);
                    }
                    if (!_this.isPaused()) {
                        if (_this.playerState === exports.PlayerStates.Buffering) {
                            _this.updateState(exports.PlayerStates.Playing);
                        }
                        var duration = position.endTime - position.startTime;
                        _this.checkTimeRemainingCheckpoint(duration - position.currentTime);
                        var quartileCheckPointReached = _this.nextCheckpoint && duration > 0 &&
                            (Math.round(position.currentTime * 100) / 100) >= (Math.round((duration * _this.nextCheckpoint * 100) / 100) / 100);
                        var intervalCheckpointReached = _this.stopwatchPlaying.hasReached(player_config_7.PlayerConfig.eventCheckpointInterval);
                        if (quartileCheckPointReached) {
                            var checkpoint = _this.nextCheckpoint;
                            _this.reportEvent(player_constants_10.PlayerEvents.ContentCheckpoint, { checkpoint: checkpoint, checkpointType: 'quartile' });
                            _this.setNextCheckpoint();
                            _this.stopwatchBuffering.reset();
                        }
                        else if (intervalCheckpointReached) {
                            _this.reportEvent(player_constants_10.PlayerEvents.ContentCheckpoint, { checkpointType: 'interval' });
                        }
                    }
                };
                this.onVideoCanPlay = function (event) {
                    _this.canPlay = true;
                    if (_this.videoControls) {
                        _this.videoControls.updatePlayPauseState();
                    }
                };
                this.onVideoError = function (event) {
                    if (!_this.isWindowClosing && _this.playerState !== exports.PlayerStates.Init && _this.playerState !== exports.PlayerStates.Error) {
                        var error = _this.videoWrapper.getError();
                        if (error && error.errorCode) {
                            if (error.errorCode === player_data_interfaces_8.VideoErrorCodes.MediaErrorSourceNotSupported) {
                                var fallbackVideo = _this.getFallbackVideoFile();
                                if (_this.currentVideoFile
                                    && _this.currentVideoFile.mediaType !== player_data_interfaces_8.MediaTypes.MP4
                                    && fallbackVideo
                                    && fallbackVideo.mediaType === player_data_interfaces_8.MediaTypes.MP4) {
                                    _this.reportEvent(player_constants_10.PlayerEvents.PlayerError, {
                                        errorType: player_constants_10.PlayerEvents.SourceErrorAttemptRecovery,
                                        errorDesc: "Playback using media type " + _this.currentVideoFile.mediaType + " failed. Attempting to fallback to MP4 source."
                                    });
                                    _this.setVideoSrc(fallbackVideo);
                                    if (_this.playerOptions.autoplay) {
                                        _this.playOnDataLoad = true;
                                        _this.play();
                                    }
                                    _this.isFallbackVideo = true;
                                    return;
                                }
                            }
                            if (_this.playerOptions && _this.playerOptions.showImageForVideoError
                                && _this.videoMetadata && _this.videoMetadata.posterframeUrl) {
                                _this.hideControlPanel();
                                _this.videoControls = null;
                                _this.stopMedia();
                                _this.hideTrigger();
                                _this.disablePlayPauseTrigger();
                                _this.displayImage(_this.videoMetadata.posterframeUrl);
                                return;
                            }
                            _this.updateState(exports.PlayerStates.Error);
                            var errorMessage = void 0;
                            switch (error.errorCode) {
                                case player_data_interfaces_8.VideoErrorCodes.MediaErrorAborted:
                                    errorMessage = _this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.media_err_aborted);
                                    break;
                                case player_data_interfaces_8.VideoErrorCodes.MediaErrorNetwork:
                                    errorMessage = _this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.media_err_network);
                                    break;
                                case player_data_interfaces_8.VideoErrorCodes.MediaErrorDecode:
                                    errorMessage = _this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.media_err_decode);
                                    break;
                                case player_data_interfaces_8.VideoErrorCodes.MediaErrorSourceNotSupported:
                                    errorMessage = _this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.media_err_src_not_supported);
                                    break;
                                case player_data_interfaces_8.VideoErrorCodes.AmpEncryptError:
                                    errorMessage = _this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.media_err_amp_encrypt);
                                    break;
                                case player_data_interfaces_8.VideoErrorCodes.AmpPlayerMismatch:
                                    errorMessage = _this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.media_err_amp_player_mismatch);
                                    break;
                                default:
                                    errorMessage = _this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.media_err_unknown_error);
                                    break;
                            }
                            errorMessage = stringExtensions_13.format(_this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.playbackerror), errorMessage);
                            var contentErrorMsg = player_utility_10.PlayerUtility.formatContentErrorMessage(error.errorCode, errorMessage, error.message);
                            _this.stopMedia(errorMessage, contentErrorMsg);
                        }
                        else {
                            _this.stopMedia();
                        }
                    }
                };
                this.onErrorCallback = function (errorType, message) {
                    _this.reportEvent(player_constants_10.PlayerEvents.PlayerError, { 'errorType': errorType, 'errorDesc': message });
                };
                this.onVideoPlay = function (event) {
                    _this.hideTrigger();
                    if (_this.playTriggered) {
                        _this.reportEvent(player_constants_10.PlayerEvents.Resume);
                    }
                    else {
                        _this.playTriggered = true;
                        player_utility_10.PlayerUtility.createVideoPerfMarker(_this.playerId, player_constants_11.videoPerfMarkers.playTriggered);
                    }
                    if (_this.firstByteTimer) {
                        window.clearTimeout(_this.firstByteTimer);
                    }
                    var timeout = environment_7.Environment.isMobile ? player_config_7.PlayerConfig.firstByteTimeoutVideoMobile : player_config_7.PlayerConfig.firstByteTimeoutVideoDesktop;
                    if (timeout > 0) {
                        _this.firstByteTimer = setTimeout(function () {
                            if (!_this.getBufferedDuration() && _this.playerState === exports.PlayerStates.Buffering) {
                                _this.logMessage('Buffering stuck detected');
                                _this.updateState(exports.PlayerStates.Error);
                                if (_this.playerOptions && _this.playerOptions.showImageForVideoError
                                    && _this.videoMetadata && _this.videoMetadata.posterframeUrl) {
                                    _this.hideControlPanel();
                                    _this.videoControls = null;
                                    _this.stopMedia();
                                    _this.hideTrigger();
                                    _this.disablePlayPauseTrigger();
                                    _this.displayImage(_this.videoMetadata.posterframeUrl);
                                    return;
                                }
                                else {
                                    _this.stopMedia(_this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.standarderror), player_utility_10.PlayerUtility.formatContentErrorMessage(player_data_interfaces_8.VideoErrorCodes.BufferingFirstByteTimeout, 'Time out waiting for first byte.'));
                                }
                            }
                        }, timeout);
                    }
                };
                this.onVideoPause = function (event) {
                    if ((_this.videoWrapper && _this.videoWrapper.isSeeking()) || _this.playerState === exports.PlayerStates.Ended) {
                        return;
                    }
                    _this.updateState(exports.PlayerStates.Paused);
                };
                this.onVideoSeeking = function (event) {
                    if (_this.playerState !== exports.PlayerStates.Ended && _this.videoWrapper && _this.videoWrapper.isSeeking()) {
                        _this.nextCheckpoint = null;
                        if (_this.seekFrom === null) {
                            _this.seekFrom = _this.getPlayPosition().currentTime;
                        }
                        _this.updateState(exports.PlayerStates.Seeking);
                    }
                    else {
                        _this.seekFrom = null;
                    }
                };
                this.onVideoSeeked = function (event) {
                    var currentTime = _this.getPlayPosition().currentTime;
                    if (_this.playerState !== exports.PlayerStates.Ended &&
                        _this.videoWrapper && !_this.videoWrapper.isSeeking() && _this.seekFrom !== null && _this.seekFrom !== currentTime) {
                        _this.setNextCheckpoint();
                        _this.reportEvent(player_constants_10.PlayerEvents.Seek, { 'seekFrom': _this.seekFrom, 'seekTo': currentTime });
                        _this.seekFrom = null;
                        _this.updateState(_this.isPaused() ? exports.PlayerStates.Paused : exports.PlayerStates.Playing);
                    }
                };
                this.onVideoWaiting = function (event) {
                    _this.updateState(exports.PlayerStates.Buffering);
                };
                this.onVideoVolumeChange = function (event) {
                    if (event && event.target) {
                        if (_this.videoWrapper.isMuted()) {
                            _this.isVideoMuted = true;
                        }
                        else if (_this.isVideoMuted) {
                            _this.isVideoMuted = false;
                            if (environment_7.Environment.isMobile) {
                                _this.videoWrapper.unmute();
                            }
                        }
                    }
                    if (!!_this.videoControls) {
                        _this.videoControls.updateVolumeState();
                    }
                };
                this.onCcPresetFocus = function (event) {
                    if (!_this.videoControls || !_this.closedCaptions || !_this.closedCaptionsSettings) {
                        return;
                    }
                    if (!_this.closedCaptions.getCurrentCcLanguage()) {
                        _this.closedCaptions.showSampleCaptions();
                    }
                    var target = htmlExtensions_20.getEventTargetOrSrcElement(event);
                    var data = target.getAttribute('data-info');
                    if (data === 'reset') {
                        _this.closedCaptionsSettings.reset();
                    }
                    else {
                        var dataSplit = data.split(':');
                        if (!dataSplit && dataSplit.length < 0) {
                            return;
                        }
                        _this.closedCaptionsSettings.setSetting(dataSplit[0], dataSplit[1], false);
                    }
                    _this.closedCaptions.resetCaptions();
                    _this.closedCaptions.updateCaptions(_this.getPlayPosition().currentTime);
                };
                this.onCcPresetBlur = function (event) {
                    if (!_this.videoControls || !_this.closedCaptions || !_this.closedCaptionsSettings) {
                        return;
                    }
                    if (!_this.closedCaptions.getCurrentCcLanguage()) {
                        _this.closedCaptions.setCcLanguage('off', null);
                    }
                    var menuContainer = htmlExtensions_20.selectFirstElement('#' + _this.ccSettingsMenuId, _this.videoControlsContainer);
                    var checkedPreset = htmlExtensions_20.selectFirstElement('.glyph-check-mark', menuContainer);
                    if (checkedPreset != null) {
                        var data = checkedPreset.getAttribute('data-info');
                        if (data === 'reset') {
                            _this.closedCaptionsSettings.reset();
                        }
                        else {
                            var dataSplit = data.split(':');
                            if (!dataSplit && dataSplit.length < 0) {
                                return;
                            }
                            _this.closedCaptionsSettings.setSetting(dataSplit[0], dataSplit[1]);
                        }
                    }
                    else {
                        _this.closedCaptionsSettings.reset(false);
                    }
                    _this.closedCaptions.resetCaptions();
                    _this.closedCaptions.updateCaptions(_this.getPlayPosition().currentTime);
                };
                this.onVideoPlayerClicked = function (event) {
                    if (!(_this.playerOptions.useAMPVersion2 && _this.isFallbackVideo)) {
                        if (_this.playerOptions && _this.playerOptions.lazyLoad && !_this.wrapperLoadCalled) {
                            _this.playOnDataLoad = false;
                            if (_this.playerOptions.adsEnabled) {
                                _this.playerOptions.adsEnabled = false;
                                _this.playerOptions.autoplay = false;
                            }
                            else {
                                _this.playerOptions.autoplay = true;
                            }
                            _this.hasInteractivity ? _this.loadVideoWrapper(false) : _this.loadVideoWrapper(_this.playerOptions.autoplay);
                            if (_this.isFirstTimePlayed) {
                                _this.displayPreRollAndPlayContent();
                            }
                        }
                        else {
                            if (_this.isFirstTimePlayed) {
                                _this.displayPreRollAndPlayContent();
                            }
                            else if (_this.isPaused()) {
                                _this.play();
                                _this.setUserInteracted(true);
                                _this.setUserIntiatedPause(false);
                            }
                            else {
                                _this.pause(true);
                                _this.setUserInteracted(true);
                                _this.setUserIntiatedPause(true);
                            }
                        }
                        _this.hideTrigger();
                        _this.showSpinnerBasedOnState();
                        if (_this.videoControls && _this.isInFullscreen) {
                            _this.videoControls.setFocusOnControlBar();
                        }
                    }
                };
                this.onVideoEnded = function () {
                    _this.updateState(exports.PlayerStates.Ended);
                    _this.reportEvent(player_constants_10.PlayerEvents.ContentComplete);
                    if (!environment_7.Environment.useNativeControls) {
                        _this.stop();
                    }
                };
                this.onFullscreenChanged = function () {
                    var elementInFullScreen = CorePlayer.getElementInFullScreen();
                    var fullscreenContainer = _this.getFullscreenContainer();
                    if (elementInFullScreen) {
                        if (fullscreenContainer === elementInFullScreen && !_this.isInFullscreen) {
                            _this.onFullscreenEnter();
                        }
                    }
                    else {
                        if (_this.isInFullscreen) {
                            _this.onFullscreenExit();
                        }
                    }
                };
                this.onIOSFullscreenEnter = function () {
                    _this.play();
                    _this.onFullscreenEnter();
                };
                this.onIOSFullscreenExit = function () {
                    _this.onFullscreenExit();
                };
                this.onFullscreenError = function () {
                    _this.isInFullscreen = false;
                };
                this.onSetAudioCallback = function (event) {
                    _this.isAudioTracksDoneSwitching = true;
                };
                if (!videoComponent) {
                    return;
                }
                this.isVideoPlayerSupported = environment_7.Environment.isVideoPlayerSupported();
                this.createComponents(playerData);
                this.load(playerData);
            }
            CorePlayer.prototype.createComponents = function (playerData) {
                this.playPauseTrigger = playerData && playerData.options && playerData.options.playPauseTrigger;
                this.showEndImage = playerData && playerData.options && playerData.options.showEndImage;
                this.playerContainer = htmlExtensions_20.selectFirstElement(CorePlayer.playerContainerSelector, this.videoComponent);
                var maskLevel = playerData && playerData.options && playerData.options.maskLevel ? playerData.options.maskLevel : '40';
                var theme = playerData && playerData.options && playerData.options.theme ? playerData.options.theme : 'light';
                var playButtonTheme = playerData && playerData.options && playerData.options.playButtonTheme ? playerData.options.playButtonTheme : 'dark';
                var playButtonSize = playerData && playerData.options && playerData.options.playButtonSize ? playerData.options.playButtonSize : 'medium';
                var triggerEnabled = playerData && playerData.options && playerData.options.trigger;
                this.setAutoPlayNeeded = playerData && playerData.options && playerData.options.autoplay
                    && (environment_7.Environment.isChrome || environment_7.Environment.isMobile);
                var controlEnabled = playerData &&
                    playerData.options &&
                    playerData.options.controls &&
                    this.isVideoPlayerSupported &&
                    !this.playPauseTrigger &&
                    !environment_7.Environment.useNativeControls;
                if (!this.playerContainer) {
                    var playerHtml = "<div class=\"f-core-player\" tabindex=\"-1\">\n    " + (this.setAutoPlayNeeded ?
                        "<video class=\"f-video-player\" preload=\"metadata\" autoplay playsinline tabindex=\"-1\"></video>"
                        : "<video class=\"f-video-player\" preload=\"metadata\" tabindex=\"-1\"></video>") + "\n    " + (triggerEnabled ?
                        "<div class=\"f-video-trigger\" aria-hidden=\"true\" >\n                        <div class=\"f-mask-" + maskLevel + " theme-" + theme + "\" >\n                            <button class=\"c-action-trigger f-play-trigger c-glyph glyph-play ow-play-theme-" + playButtonTheme + " ow-" + playButtonSize + "\" aria-label=\"Play\" role=\"button\">\n                            </button>\n                            <span aria-hidden=\"true\" role=\"presentation\">Play</span>\n                        </div>\n                    </div>" : '') + "    \n    <div class=\"f-customize-context-menu-container\"></div> \n    <div class=\"f-video-cc-overlay\" aria-hidden=\"true\"></div>\n    <div class=\"f-screen-reader\" aria-live=\"polite\"></div>\n    " + (controlEnabled ?
                        "<div class=\"f-video-controls\" dir=\"ltr\" aria-hidden=\"true\" role=\"none\"></div>" : '') + "\n    <div aria-hidden=\"true\" class=\"c-progress f-indeterminate-local f-progress-large\" role=\"progressbar\" tabindex=\"0\">\n        <span></span>\n        <span></span>\n        <span></span>\n        <span></span>\n        <span></span>\n    </div>\n    " + (this.playPauseTrigger ?
                        "<div role=\"presentation\" class=\"f-play-pause-trigger\">\n            <button type=\"button\" class=\"f-play-pause c-action-trigger c-glyph glyph-pause f-play-pause-hide ow-" + playButtonSize + "\" aria-label=\"pause\">\n            </button>\n            <span aria-hidden=\"true\" role=\"presentation\">Pause</span>\n         </div>" : '') + "\n</div>";
                    this.videoComponent.innerHTML = playerHtml;
                    this.playerContainer = htmlExtensions_20.selectFirstElement(CorePlayer.playerContainerSelector, this.videoComponent);
                }
                this.checkReplacedVideoTag();
                this.spinner = htmlExtensions_20.selectFirstElement('.c-progress', this.playerContainer);
                this.triggerContainer = htmlExtensions_20.selectFirstElement('.f-video-trigger', this.videoComponent);
                this.triggerPlayPauseContainer = htmlExtensions_20.selectFirstElement('.f-play-pause-trigger', this.videoComponent);
                this.screenReaderElement = htmlExtensions_20.selectFirstElement('.f-screen-reader', this.videoComponent);
                this.customizedContextMenuContainer = htmlExtensions_20.selectFirstElement('.f-customize-context-menu-container', this.videoComponent);
                htmlExtensions_20.addEvents(this.playerContainer, 'contextmenu', this.playerContainerEventHandler, true);
                htmlExtensions_20.addEvents(document, 'click', this.documentEventHandler, true);
                if (!!this.triggerContainer) {
                    var div = htmlExtensions_20.selectFirstElement('div', this.triggerContainer);
                    var result = stringExtensions_13.format('background-color: rgba(0,0,0,{0})', Number(maskLevel) / 100);
                    div.setAttribute('style', result);
                    this.trigger = htmlExtensions_20.selectFirstElement('.c-action-trigger', this.triggerContainer);
                    this.triggerTooltip = htmlExtensions_20.selectFirstElement('span', this.triggerContainer);
                    htmlExtensions_20.addEvents(this.trigger, 'mouseover mouseout focus blur', this.triggerPlayEventHandler, true);
                    if (playerData && playerData.options && (!playerData.options.autoplay)) {
                        this.showTrigger();
                        this.hideControlPanel();
                        this.hideSpinner();
                    }
                }
                if (this.triggerPlayPauseContainer) {
                    if (playerData && playerData.options) {
                        this.playPauseButton = htmlExtensions_20.selectFirstElementT('.f-play-pause', this.triggerPlayPauseContainer);
                        this.playPauseButton.setAttribute('aria-label', 'pause');
                        this.playPauseTooltip = htmlExtensions_20.selectFirstElement('span', this.triggerPlayPauseContainer);
                        htmlExtensions_20.addEvents(this.playPauseButton, 'mouseover mouseout focus blur', this.playPauseButtonEventHandler, true);
                        htmlExtensions_20.addEvents(this.triggerPlayPauseContainer, 'click keydow', this.triggerPlayPauseContainerEventHandler, true);
                    }
                }
                if (environment_7.Environment.isInIframe) {
                    var docBody = document.getElementsByTagName('body');
                    if (docBody) {
                        docBody[0].setAttribute('tabindex', '-1');
                    }
                }
            };
            CorePlayer.prototype.initializeLocalization = function () {
                player_utility_10.PlayerUtility.createVideoPerfMarker(this.playerId, player_constants_11.videoPerfMarkers.locLoadStart);
                if (!this.localizationHelper) {
                    if (!this.playerOptions.market) {
                        this.playerOptions.market = this.videoComponent.getAttribute('data-market');
                    }
                    this.localizationHelper = new localization_helper_5.LocalizationHelper(this.playerOptions.market, this.playerOptions.resourceHost, this.playerOptions.resourceHash, this.onErrorCallback);
                    this.localizationHelper.loadResources(this.onResourcesLoaded);
                }
                else {
                    this.onResourcesLoaded();
                }
            };
            CorePlayer.prototype.initializeAgeGating = function () {
                var _this = this;
                this.ageGateHelper = new age_gate_helper_1.AgeGateHelper(this.playerContainer, this, this.localizationHelper, function () {
                    _this.finishPlayerLoad();
                });
            };
            CorePlayer.prototype.initializeReporting = function (playerData) {
                if (playerData && playerData.options && playerData.options.reporting &&
                    playerData.options.reporting.enabled && this.reporters.length < 1) {
                    if (playerData.options.reporting.jsll) {
                        this.reporters.push(new jsll_reporter_1.JsllReporter(this.videoComponent, playerData.options.jsllPostMessage));
                    }
                    if (playerData && playerData.options && playerData.options.inviewThreshold) {
                        if (!this.inviewManager) {
                            this.inviewManager = inview_helper_1.InviewManager.Instance();
                        }
                        if (this.inviewManager) {
                            var that = this;
                            this.inviewManager.listenForInviewThresholdChanges(this.playerContainer, playerData.options.inviewThreshold, function (event) {
                                that.reportEvent(event);
                            });
                        }
                    }
                }
            };
            CorePlayer.prototype.getPlayerId = function () {
                return this.playerId || this.videoComponent.id;
            };
            CorePlayer.prototype.getPlayerData = function () {
                return this.playerData;
            };
            CorePlayer.prototype.getPlayerContainer = function () {
                return this.playerContainer;
            };
            CorePlayer.prototype.hasUserInteracted = function () {
                return this.wasUserInteracted;
            };
            CorePlayer.prototype.setUserInteracted = function (userInteracted) {
                this.wasUserInteracted = userInteracted;
            };
            CorePlayer.prototype.hasUserIntiatedPause = function () {
                return this.wasUserIntiatedPause;
            };
            CorePlayer.prototype.setAutoPlay = function () {
                if (!!this.videoWrapper && this.wrapperLoadCalled) {
                    this.videoWrapper.setAutoPlay();
                }
            };
            CorePlayer.prototype.setUserIntiatedPause = function (userInteracted) {
                this.wasUserIntiatedPause = userInteracted;
            };
            CorePlayer.prototype.getCurrentPlayState = function () {
                return this.playerState;
            };
            CorePlayer.prototype.load = function (playerData) {
                if (!playerData) {
                    return;
                }
                this.playerData = playerData;
                this.currentVideoFile = null;
                this.playerId = this.videoComponent.getAttribute('id');
                this.updateState(exports.PlayerStates.Init);
                this.hideErrorMessage();
                this.videoMetadata = playerData.metadata;
                this.playerOptions = playerData.options || new player_options_2.PlayerOptions();
                this.screenManagerHelper = new screen_manager_helper_1.ScreenManagerHelper();
                this.startTimeOnDataLoad = this.playerOptions.startTime;
                if ((this.playerOptions.autoplay) || (this.playerOptions.lazyLoad && !this.playerOptions.trigger)) {
                    this.playerOptions.lazyLoad = false;
                }
                try {
                    this.initializeLocalization();
                    this.initializeReporting(playerData);
                }
                catch (e) {
                    this.reportEvent(player_constants_10.PlayerEvents.PlayerError, {
                        errorType: 'initializeError',
                        errorDesc: 'InitializeError with loc, reporting, age-gating : ' + e.message
                    });
                }
                if (!this.videoMetadata || !this.videoMetadata.videoFiles || !this.videoMetadata.videoFiles.length) {
                    this.hasDataError = true;
                    if (this.locReady) {
                        this.showDataError();
                    }
                    return;
                }
            };
            CorePlayer.prototype.finishPlayerLoad = function () {
                var userPassed = this.ageGateHelper.doesUserPassAgeGate();
                var shouldPlayOnLoad = false;
                if (this.ageGateHelper.didUserSubmitAge()) {
                    this.reportEvent(player_constants_10.PlayerEvents.AgeGateSubmitClick, { 'ageGatePassed': userPassed });
                    this.ageGateHelper.resetAgeGateSubmit();
                    shouldPlayOnLoad = true;
                }
                if (!userPassed) {
                    this.displayErrorMessage({ title: this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.agegate_fail) });
                    return;
                }
                try {
                    if (this.triggerPlayPauseContainer &&
                        !this.playerData.options.autoplay &&
                        !!this.playPauseButton) {
                        htmlExtensions_20.removeClass(this.playPauseButton, 'glyph-pause');
                        htmlExtensions_20.addClass(this.playPauseButton, 'glyph-play');
                        this.setAriaLabelForButton(this.playPauseButton);
                        htmlExtensions_20.setText(this.playPauseTooltip, this.locPlay);
                    }
                    this.contextMenu = new context_menu_1.ContextMenu(this.customizedContextMenuContainer, this);
                    this.initializeVideoControls();
                    if (!this.isVideoPlayerSupported) {
                        this.displayErrorWithDownloadLink();
                        return;
                    }
                    this.analyzeVideoFiles();
                    this.initializeClosedCaptions();
                    this.hasInteractivity = !environment_7.Environment.isMobile &&
                        this.playerOptions.interactivity &&
                        this.videoMetadata.interactiveTriggersEnabled &&
                        !!this.videoMetadata.interactiveTriggersUrl;
                    if (!this.interactiveTriggersHelper) {
                        this.initializeInteractiveTriggers();
                    }
                }
                catch (e) {
                    this.reportEvent(player_constants_10.PlayerEvents.PlayerError, {
                        errorType: 'initializeError',
                        errorDesc: 'InitializeError with video files, CC, interactiveTrigger: ' + e.message
                    });
                }
                if (this.videoTag) {
                    this.videoTag.title = this.videoMetadata.title;
                    this.videoTag.loop = this.playerOptions.loop;
                    if (this.videoMetadata.posterframeUrl &&
                        !this.playerOptions.hidePosterFrame) {
                        this.videoTag.poster = this.videoMetadata.posterframeUrl;
                    }
                }
                else {
                    this.reportEvent(player_constants_10.PlayerEvents.PlayerError, {
                        errorType: 'videoTagNotAvailable',
                        errorDesc: 'VideoTag not available'
                    });
                }
                this.videoWrapper = this.getVideoWrapper();
                this.playerTechnology = 'OnePlayer_' + this.videoWrapper.getWrapperName();
                if (!this.commonPlayerImpressionReported) {
                    this.reportEvent(player_constants_10.PlayerEvents.CommonPlayerImpression);
                    this.commonPlayerImpressionReported = true;
                }
                if (!this.playerOptions.lazyLoad) {
                    if (shouldPlayOnLoad) {
                        this.hasInteractivity ? this.loadVideoWrapper(false) : this.loadVideoWrapper(true);
                    }
                    else {
                        this.hasInteractivity ? this.loadVideoWrapper(false) : this.loadVideoWrapper(this.playerOptions.autoplay);
                    }
                }
                this.reportEvent(player_constants_10.PlayerEvents.Ready);
                this.updateState(exports.PlayerStates.PlayerLoaded);
                this.canPlay = true;
            };
            CorePlayer.prototype.setAriaLabelForButton = function (button, locPlayVideo) {
                if (this.videoMetadata.title !== '') {
                    button.setAttribute('aria-label', this.locPlay.toLowerCase() +
                        ' ' + this.videoMetadata.title);
                }
                else {
                    if (locPlayVideo) {
                        button.setAttribute('aria-label', locPlayVideo.toLowerCase());
                    }
                    else {
                        button.setAttribute('aria-label', this.locPlayVideo.toLowerCase());
                    }
                }
            };
            CorePlayer.prototype.updatePlayerSource = function (playerData) {
                var _this = this;
                if (!playerData) {
                    return;
                }
                this.playerData.options = new player_options_2.PlayerOptions(playerData.options);
                this.playerData.metadata = playerData.metadata;
                this.isFirstTimePlayed = true;
                this.isContentStartReported = false;
                this.wrapperLoadCalled = false;
                if (this.playerData.metadata && this.playerData.metadata.videoId &&
                    (!this.playerData.metadata.videoFiles || !this.playerData.metadata.videoFiles.length) &&
                    !this.playerData.metadata.playerName) {
                    var dataFetcher = new video_shim_data_fetcher_3.VideoShimDataFetcher(this.playerData.options.shimServiceEnv, this.playerData.options.shimServiceUrl);
                    dataFetcher.getMetadata(this.playerData.metadata.videoId, function (result) {
                        _this.pause();
                        _this.playerData.metadata = result;
                        _this.load(_this.playerData);
                    });
                }
                else {
                    this.pause();
                    this.load(this.playerData);
                }
            };
            CorePlayer.prototype.displayErrorWithDownloadLink = function () {
                var downloadfile = this.getVideoFileforDownload();
                var msg = '';
                if ((this.playerOptions.download) && (downloadfile)) {
                    var downloadLink = '<a href="' + downloadfile.url + '">'
                        + '<span style="text-decoration:underline">'
                        + this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.download_video)
                        + '</span></a>';
                    msg = this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.browserunsupported) + ' '
                        + this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.browserunsupported_download) + ' ' + downloadLink + '.';
                }
                else {
                    msg = this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.browserunsupported);
                }
                this.displayErrorMessage({ message: msg });
                this.reportEvent(player_constants_10.PlayerEvents.ContentError, {
                    'errorType': 'content:error', 'errorDesc': 'error to play video',
                    'errorMessage': 'error to play video, browser not supportted'
                });
            };
            CorePlayer.prototype.showDataError = function () {
                if (this.playerOptions && (this.playerOptions.showImageForVideoError === true)
                    && this.videoMetadata && this.videoMetadata.posterframeUrl) {
                    this.hideTrigger();
                    this.disablePlayPauseTrigger();
                    this.displayImage(this.videoMetadata.posterframeUrl);
                }
                else {
                    this.displayErrorMessage({ title: this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.data_error) });
                }
                this.dataErrorShown = true;
            };
            CorePlayer.prototype.checkTimeRemainingCheckpoint = function (currentTime) {
                if (!!this.playerData.options.timeRemainingCheckpoint) {
                    var TRCheckpoint = this.playerData.options.timeRemainingCheckpoint;
                    if (TRCheckpoint >= currentTime && !this.timeRemainingCheckpointReached) {
                        this.timeRemainingCheckpointReached = true;
                        this.reportEvent('TimeRemainingCheckpoint');
                    }
                    else if (TRCheckpoint < currentTime) {
                        this.timeRemainingCheckpointReached = false;
                    }
                }
            };
            CorePlayer.prototype.analyzeVideoFiles = function () {
                this.hasHLS = false;
                this.hasProgressive = false;
                this.hasAdaptive = false;
                for (var _i = 0, _a = this.videoMetadata.videoFiles; _i < _a.length; _i++) {
                    var videoFile = _a[_i];
                    switch (videoFile.mediaType) {
                        case player_data_interfaces_8.MediaTypes.DASH:
                        case player_data_interfaces_8.MediaTypes.SMOOTH:
                            this.hasAdaptive = true;
                            break;
                        case player_data_interfaces_8.MediaTypes.HLS:
                            this.hasHLS = true;
                            break;
                        case player_data_interfaces_8.MediaTypes.MP4:
                        default:
                            this.hasProgressive = true;
                            break;
                    }
                }
                this.useAdaptive = this.hasAdaptive && (this.playerOptions && this.playerOptions.useAdaptive || !this.hasProgressive);
                if ((this.hasProgressive) && (environment_7.Environment.isMobile)) ;
                if ((this.hasProgressive) &&
                    (this.playerOptions && this.playerOptions.autoplay && this.playerOptions.startTime === 0) &&
                    (environment_7.Environment.isChrome)) ;
            };
            CorePlayer.prototype.loadVideoWrapper = function (playOnLoad) {
                if (this.videoWrapper) {
                    if (environment_7.Environment.isMobile) {
                        playOnLoad = false;
                    }
                    this.wrapperLoadCalled = true;
                    player_utility_10.PlayerUtility.createVideoPerfMarker(this.playerId, player_constants_11.videoPerfMarkers.wrapperLoadStart);
                    this.videoWrapper.load(this.videoComponent, playOnLoad, this.onVideoWrapperLoaded, this.onVideoWrapperLoadFailed, this.onSetAudioCallback);
                }
            };
            CorePlayer.prototype.initializeInteractiveTriggers = function () {
                var _this = this;
                if (this.hasInteractivity) {
                    this.interactiveTriggersHelper = new interactive_triggers_helper_1.VideoPlayerInteractiveTriggersHelper(this.playerContainer, this.videoMetadata.interactiveTriggersUrl, this, this.localizationHelper, function (telemetryEvent, onScreenOverlayInfo) {
                        _this.reportInteractiveTelemetryEvent(telemetryEvent, onScreenOverlayInfo);
                    });
                }
            };
            CorePlayer.prototype.reportInteractiveTelemetryEvent = function (telemetryEvent, onScreenOverlayInfo) {
                switch (telemetryEvent) {
                    case player_constants_10.PlayerEvents.InteractiveOverlayClick:
                        if (onScreenOverlayInfo && onScreenOverlayInfo.overlay.overlayData.pauseVideoOnClick) {
                            this.pause();
                        }
                        if (onScreenOverlayInfo.overlay.overlayType === interactive_triggers_helper_1.OverlayType.VideoBranch) {
                            onScreenOverlayInfo.overlay.overlayData.linkUrl = onScreenOverlayInfo.overlay.overlayData.videoId;
                        }
                        this.reportEvent(player_constants_10.PlayerEvents.InteractiveOverlayClick, { 'interactiveTriggerAndOverlay': onScreenOverlayInfo });
                        if (onScreenOverlayInfo.overlay.overlayType === interactive_triggers_helper_1.OverlayType.VideoBranch) {
                            this.currentVideoStopwatchPlaying.reset();
                        }
                        break;
                    case player_constants_10.PlayerEvents.InteractiveOverlayShow:
                        break;
                    case player_constants_10.PlayerEvents.InteractiveOverlayHide:
                        break;
                    case player_constants_10.PlayerEvents.InteractiveOverlayMaximize:
                        this.reportEvent(player_constants_10.PlayerEvents.InteractiveOverlayMaximize, { 'interactiveTriggerAndOverlay': onScreenOverlayInfo });
                        break;
                    case player_constants_10.PlayerEvents.InteractiveOverlayMinimize:
                        this.reportEvent(player_constants_10.PlayerEvents.InteractiveOverlayMinimize, { 'interactiveTriggerAndOverlay': onScreenOverlayInfo });
                        break;
                    case player_constants_10.PlayerEvents.InteractiveBackButtonClick:
                        this.reportEvent(player_constants_10.PlayerEvents.InteractiveBackButtonClick);
                        break;
                }
            };
            CorePlayer.prototype.initializeVideoControls = function () {
                var _this = this;
                if (environment_7.Environment.useNativeControls) {
                    return;
                }
                this.videoControlsContainer = htmlExtensions_20.selectFirstElement(video_controls_1.VideoControls.selector, this.videoComponent);
                htmlExtensions_20.addEvents(this.videoControlsContainer, 'contextmenu', this.videoControlsContainerEventHandler, true);
                var addControls = !environment_7.Environment.useNativeControls &&
                    (this.playerOptions && this.playerOptions.controls) && !this.areControlsInitialized;
                var showControls = addControls && !this.playerOptions.trigger && !this.isTriggerShown();
                this.controlsScreenManagerObject = {
                    HtmlObject: this.videoControlsContainer,
                    Height: 44,
                    Id: null,
                    IsVisible: false,
                    Priority: 5,
                    Transition: null
                };
                this.screenManagerHelper.registerElement(this.controlsScreenManagerObject);
                if (this.videoControlsContainer) {
                    if (addControls) {
                        this.areControlsInitialized = true;
                        this.videoControlsContainer.setAttribute('aria-hidden', 'false');
                        this.videoControls = new video_controls_1.VideoControls(this.videoControlsContainer, this, this.localizationHelper, this.contextMenu);
                        this.videoControls.addUserInteractionListener(function () {
                            _this.showControlsBasedOnState();
                        });
                    }
                    if (!showControls) {
                        this.videoControlsTabbableElements = htmlExtensions_20.selectElementsT(dom_selectors_1.DialogTabbableSelectors, this.videoControlsContainer);
                        this.videoControlsContainer.setAttribute('aria-hidden', 'true');
                        this.addHiddenAttr(this.videoControlsTabbableElements);
                    }
                    if (!this.playerOptions.showControlOnLoad && this.showcontrolFirstTime) {
                        this.videoControlsContainer.setAttribute('aria-hidden', 'true');
                        this.addHiddenAttr(this.videoControlsTabbableElements);
                    }
                }
            };
            CorePlayer.prototype.getQualityMenu = function () {
                if (!this.videoMetadata.videoFiles || !this.videoMetadata.videoFiles.length) {
                    return null;
                }
                var qualityMenuItems = [];
                if (this.hasAdaptive && this.playerOptions && this.playerOptions.useAdaptive) {
                    var videoTracks = this.videoWrapper.getVideoTracks();
                    if (!qualityMenuItems.length && videoTracks && videoTracks.length > 1) {
                        var selectedTrack = this.videoWrapper.getCurrentVideoTrack();
                        qualityMenuItems.push({
                            id: this.addIdPrefix('auto'),
                            label: this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.quality_auto),
                            selected: selectedTrack.auto,
                            selectable: true,
                            persistOnClick: true
                        });
                        for (var trackIndex = 0; trackIndex < videoTracks.length; trackIndex++) {
                            var track = videoTracks[trackIndex];
                            qualityMenuItems.push({
                                id: this.addIdPrefix("video-" + trackIndex),
                                label: player_utility_10.PlayerUtility.toFriendlyBitrateString(track.bitrate),
                                selected: !selectedTrack.auto && selectedTrack.trackIndex === trackIndex,
                                selectable: true,
                                persistOnClick: true
                            });
                        }
                    }
                }
                else if (!qualityMenuItems.length) {
                    var selectedQuality = this.currentVideoFile && this.currentVideoFile.quality;
                    for (var _i = 0, mediaQualityOrder_1 = mediaQualityOrder; _i < mediaQualityOrder_1.length; _i++) {
                        var quality = mediaQualityOrder_1[_i];
                        var mediaFile = this.getVideoFileByQuality(quality);
                        if (mediaFile && mediaFile.url) {
                            var qualityMenuItem = {
                                id: this.addIdPrefix(player_data_interfaces_8.MediaQuality[quality]),
                                label: this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys['quality_' +
                                    player_data_interfaces_8.MediaQuality[quality].toLowerCase()]),
                                data: mediaFile.url,
                                selected: mediaFile.quality === selectedQuality,
                                selectable: true,
                                persistOnClick: true
                            };
                            qualityMenuItems.push(qualityMenuItem);
                        }
                    }
                }
                var qualityMenu = {
                    category: MenuCategories.Quality,
                    id: this.addIdPrefix(MenuCategories.Quality),
                    label: this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.quality),
                    items: qualityMenuItems
                };
                return qualityMenu;
            };
            CorePlayer.prototype.getAudioTracksMenu = function () {
                var audioTracks = this.videoWrapper.getAudioTracks();
                if (!audioTracks || audioTracks.length <= 1) {
                    return null;
                }
                var descriptiveAudioTrackCount = 0;
                for (var _i = 0, audioTracks_1 = audioTracks; _i < audioTracks_1.length; _i++) {
                    var track = audioTracks_1[_i];
                    if (track.isDescriptiveAudio) {
                        descriptiveAudioTrackCount++;
                    }
                }
                var audioTracksMenuItems = [];
                var selectedAudioTrack = this.videoWrapper.getCurrentAudioTrack();
                for (var trackIndex = 0; trackIndex < audioTracks.length; trackIndex++) {
                    var track = audioTracks[trackIndex];
                    var label = void 0;
                    var languageCode = null;
                    if (track.isDescriptiveAudio) {
                        var descriptiveAudioLabel = this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.descriptive_audio);
                        if (descriptiveAudioTrackCount > 1) {
                            var language = this.localizationHelper.getLanguageNameFromLocale(track.languageCode);
                            label = descriptiveAudioLabel + " - " + language;
                        }
                        else {
                            label = descriptiveAudioLabel;
                        }
                    }
                    else {
                        label = this.localizationHelper.getLanguageNameFromLocale(track.languageCode);
                        languageCode = this.localizationHelper.getLanguageCodeFromLocale(track.languageCode.toLowerCase());
                    }
                    var menuItem = {
                        label: label,
                        language: languageCode,
                        id: this.addIdPrefix("audio-" + trackIndex),
                        selected: trackIndex === selectedAudioTrack,
                        selectable: true,
                        persistOnClick: true
                    };
                    audioTracksMenuItems.push(menuItem);
                }
                var audioTrackMenu = {
                    category: MenuCategories.AudioTracks,
                    id: this.addIdPrefix(MenuCategories.AudioTracks),
                    label: this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.audio_tracks),
                    items: audioTracksMenuItems
                };
                return audioTrackMenu;
            };
            CorePlayer.prototype.getClosedCaptionsSettingsMenu = function () {
                if (!this.closedCaptionsSettings) {
                    return;
                }
                var currentSettings = this.closedCaptionsSettings.getCurrentSettings();
                var settingsMenuItems = [];
                for (var settingKey in video_closed_captions_settings_1.closedCaptionsSettingsMap) {
                    if (video_closed_captions_settings_1.closedCaptionsSettingsMap.hasOwnProperty(settingKey)) {
                        var setting = video_closed_captions_settings_1.closedCaptionsSettingsMap[settingKey];
                        var option = video_closed_captions_settings_1.closedCaptionsSettingsOptions[setting.option];
                        var optionMenuItem = [];
                        for (var optionKey in option.map) {
                            if (option.map.hasOwnProperty(optionKey)) {
                                optionMenuItem.push({
                                    id: this.getCCMenuItemId(settingKey, optionKey),
                                    label: this.localizationHelper.getLocalizedValue(option.pre + optionKey),
                                    selectable: true,
                                    selected: currentSettings[settingKey] === optionKey,
                                    persistOnClick: true,
                                    data: settingKey + ":" + optionKey
                                });
                            }
                        }
                        settingsMenuItems.push({
                            id: this.addIdPrefix(settingKey + '_item'),
                            label: this.localizationHelper.getLocalizedValue('cc_' + settingKey),
                            selectable: false,
                            subMenu: {
                                id: this.getCCSettingsMenuId(settingKey),
                                category: MenuCategories.ClosedCaptionSettings,
                                items: optionMenuItem,
                                label: this.localizationHelper.getLocalizedValue('cc_' + settingKey)
                            }
                        });
                    }
                }
                var settingsMenu = {
                    id: this.addIdPrefix(MenuCategories.ClosedCaptionSettings),
                    category: MenuCategories.ClosedCaptionSettings,
                    label: this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.cc_customize),
                    items: settingsMenuItems
                };
                var presetItems = [];
                for (var preset in video_closed_captions_settings_1.closedCaptionsPresetMap) {
                    if (video_closed_captions_settings_1.closedCaptionsPresetMap.hasOwnProperty(preset)) {
                        var presetSetting = video_closed_captions_settings_1.closedCaptionsPresetMap[preset];
                        var font = presetSetting['text_font'];
                        var color = presetSetting['text_color'];
                        var ariaLabelValue = stringExtensions_13.format(this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.cc_presettings), '', this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.cc_text_font), this.localizationHelper.getLocalizedValue('cc_font_name_' + font), this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.cc_text_color), this.localizationHelper.getLocalizedValue('cc_color_' + color));
                        presetItems.push({
                            id: this.getCCMenuItemId(video_closed_captions_settings_1.VideoClosedCaptionsSettings.presetKey, preset),
                            label: this.localizationHelper.getLocalizedValue('cc_' + preset),
                            data: 'preset:' + preset,
                            selectable: true,
                            selected: currentSettings[video_closed_captions_settings_1.VideoClosedCaptionsSettings.presetKey] === preset,
                            persistOnClick: true,
                            ariaLabel: ariaLabelValue
                        });
                    }
                }
                if (presetItems.length) {
                    presetItems.push({
                        id: this.addIdPrefix('cc-customize'),
                        label: this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.cc_customize),
                        subMenu: settingsMenu
                    });
                    presetItems.push({
                        id: this.addIdPrefix('cc-reset'),
                        label: this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.cc_reset),
                        data: 'reset',
                        persistOnClick: true
                    });
                }
                var presetsMenu = {
                    id: this.getCCSettingsMenuId(video_closed_captions_settings_1.VideoClosedCaptionsSettings.presetKey),
                    label: this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.cc_appearance),
                    category: MenuCategories.ClosedCaptionSettings,
                    items: presetItems
                };
                this.ccSettingsMenuId = presetsMenu.id;
                return presetsMenu;
            };
            CorePlayer.prototype.getCCSettingsMenuId = function (settingId) {
                return this.addIdPrefix("cc-" + settingId);
            };
            CorePlayer.prototype.getCCMenuItemId = function (settingId, optionId) {
                return this.addIdPrefix("cc-" + settingId + "-" + optionId);
            };
            CorePlayer.prototype.getClosedCaptionMenu = function () {
                if (!this.videoMetadata || !this.videoMetadata.ccFiles || !this.videoMetadata.ccFiles.length ||
                    !this.ccOverlay || !this.closedCaptions) {
                    return null;
                }
                var userLanguage = utility_22.getValueFromSessionStorage(CorePlayer.ccLangPrefKey);
                var autoCaptionsLang = this.playerOptions && this.playerOptions.autoCaptions;
                var autoCaptionsLocale = null;
                var ccMenuItems = [];
                var hasUserPrefernce = false;
                for (var _i = 0, _a = this.videoMetadata.ccFiles; _i < _a.length; _i++) {
                    var ccFile = _a[_i];
                    if (!ccFile.ccType || ccFile.ccType === player_data_interfaces_8.ClosedCaptionTypes.TTML) {
                        if (!hasUserPrefernce) {
                            hasUserPrefernce = ccFile.locale === userLanguage;
                        }
                        if (!autoCaptionsLocale && ccFile.locale.indexOf(autoCaptionsLang) > -1) {
                            autoCaptionsLocale = ccFile.locale;
                        }
                        var lang = this.localizationHelper.getLanguageCodeFromLocale(ccFile.locale.toLowerCase());
                        var ccMenuItem = {
                            id: this.addIdPrefix(ccFile.locale),
                            label: localization_helper_5.ccCultureLocStrings[ccFile.locale],
                            language: lang,
                            data: ccFile.url,
                            selected: false,
                            selectable: true,
                            persistOnClick: true,
                            ariaLabel: localization_helper_5.ccCultureLocStrings[ccFile.locale] + ' ' +
                                this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.closecaption)
                        };
                        ccMenuItems.push(ccMenuItem);
                    }
                }
                ccMenuItems.push({
                    id: this.addIdPrefix('appearance'),
                    label: this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.cc_appearance),
                    selected: false,
                    selectable: false,
                    subMenu: this.getClosedCaptionsSettingsMenu()
                });
                var selectedLocale = hasUserPrefernce ? userLanguage : autoCaptionsLocale;
                if (selectedLocale) {
                    var selectedId = this.addIdPrefix(selectedLocale);
                    for (var _b = 0, ccMenuItems_1 = ccMenuItems; _b < ccMenuItems_1.length; _b++) {
                        var menuItem = ccMenuItems_1[_b];
                        if (menuItem.id === selectedId) {
                            menuItem.selected = true;
                        }
                    }
                    this.setCC(selectedId);
                }
                ccMenuItems.unshift({
                    id: this.addIdPrefix('off'),
                    label: this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.closecaption_off),
                    selected: !selectedLocale,
                    selectable: true,
                    persistOnClick: true,
                    ariaLabel: this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.closecaption_off) + ' ' +
                        this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.closecaption)
                });
                var ccMenu = {
                    category: MenuCategories.ClosedCaption,
                    id: this.addIdPrefix(MenuCategories.ClosedCaption),
                    label: this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.closecaption),
                    items: ccMenuItems,
                    hideBackButton: true,
                    glyph: 'glyph-subtitles',
                    cssClass: 'closed-caption',
                    priority: 3
                };
                return ccMenu;
            };
            CorePlayer.prototype.getPlaybackRateMenu = function () {
                if (!this.playerOptions || !this.playerOptions.playbackSpeed ||
                    !this.videoWrapper || this.videoWrapper.getWrapperName() === 'amp') {
                    return null;
                }
                var selectedRate = utility_22.getValueFromSessionStorage(CorePlayer.playbackRatePrefKey) || player_config_7.PlayerConfig.defaultPlaybackRate;
                var rateMenuItems = [];
                for (var _i = 0, _a = player_config_7.PlayerConfig.playbackRates; _i < _a.length; _i++) {
                    var rate = _a[_i];
                    var selected = rate === +selectedRate;
                    var label = rate === 1 ? this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.playbackspeed_normal) : rate + "x";
                    var rateMenuItem = {
                        id: this.addIdPrefix("rate" + rate),
                        label: label,
                        selected: selected,
                        selectable: true,
                        persistOnClick: true
                    };
                    rateMenuItems.push(rateMenuItem);
                }
                this.setPlaybackRate(this.addIdPrefix("rate" + selectedRate));
                var rateMenu = {
                    category: MenuCategories.PlaybackSpeed,
                    id: this.addIdPrefix(MenuCategories.PlaybackSpeed),
                    label: this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.playbackspeed),
                    items: rateMenuItems
                };
                return rateMenu;
            };
            CorePlayer.prototype.getShareMenu = function () {
                if (!this.playerOptions || !this.playerOptions.share) {
                    return null;
                }
                var shareOptions = sharing_helper_1.SharingHelper.getShareOptionsData(this.localizationHelper, this.playerOptions, this.videoMetadata && this.videoMetadata.shareUrl);
                if (!shareOptions || !shareOptions.length) {
                    return;
                }
                var shareMenuItems = [];
                for (var _i = 0, shareOptions_1 = shareOptions; _i < shareOptions_1.length; _i++) {
                    var option = shareOptions_1[_i];
                    var shareMenuItem = {
                        id: this.addIdPrefix(option.id),
                        label: option.label,
                        data: option.url,
                        glyph: option.glyph,
                        image: option.image
                    };
                    shareMenuItems.push(shareMenuItem);
                }
                var shareMenu = {
                    category: MenuCategories.Share,
                    id: this.addIdPrefix(MenuCategories.Share),
                    label: this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.sharing_label),
                    items: shareMenuItems
                };
                return shareMenu;
            };
            CorePlayer.prototype.getDownloadMenu = function () {
                if (!this.videoMetadata
                    || !this.videoMetadata.downloadableFiles
                    || (this.videoMetadata.downloadableFiles.length < 1)) {
                    return;
                }
                var localeToMediaListMap = {};
                var localeCount = 0;
                for (var _i = 0, _a = this.videoMetadata.downloadableFiles; _i < _a.length; _i++) {
                    var file = _a[_i];
                    if (this.playerOptions && this.playerOptions.download) {
                        var mediaList = localeToMediaListMap[file.locale];
                        if (!mediaList) {
                            mediaList = [];
                            localeCount++;
                            localeToMediaListMap[file.locale] = mediaList;
                        }
                        mediaList.push(file);
                    }
                    else {
                        if (file.mediaType === player_data_interfaces_8.DownloadableMediaTypes.transcript) {
                            var mediaList = localeToMediaListMap[file.locale];
                            if (!mediaList) {
                                mediaList = [];
                                localeCount++;
                                localeToMediaListMap[file.locale] = mediaList;
                            }
                            mediaList.push(file);
                        }
                    }
                }
                if (localeCount > 0) {
                    var languageMenuItems = [];
                    for (var locale in localeToMediaListMap) {
                        if (localeToMediaListMap.hasOwnProperty(locale)) {
                            var downloadMenuItems = [];
                            for (var _b = 0, _c = localeToMediaListMap[locale]; _b < _c.length; _b++) {
                                var file = _c[_b];
                                if (this.playerOptions && this.playerOptions.download) {
                                    var downloadableMediaMenuItem = {
                                        id: this.addIdPrefix(file.locale + "-" + file.mediaType),
                                        label: this.localizationHelper.getLocalizedMediaTypeName(file.mediaType),
                                        selected: false,
                                        selectable: false,
                                        data: file.url
                                    };
                                    downloadMenuItems.push(downloadableMediaMenuItem);
                                }
                                else {
                                    if (file.mediaType === player_data_interfaces_8.DownloadableMediaTypes.transcript) {
                                        var downloadableMediaMenuItem = {
                                            id: this.addIdPrefix(file.locale + "-" + file.mediaType),
                                            label: this.localizationHelper.getLocalizedMediaTypeName(file.mediaType),
                                            selected: false,
                                            selectable: false,
                                            data: file.url
                                        };
                                        downloadMenuItems.push(downloadableMediaMenuItem);
                                    }
                                }
                            }
                            languageMenuItems.push({
                                id: this.addIdPrefix(MenuCategories.Download + locale),
                                label: this.localizationHelper.getLanguageNameFromLocale(locale),
                                selected: false,
                                selectable: false,
                                subMenuId: this.addIdPrefix(MenuCategories.Download + locale + 'menu'),
                                subMenu: {
                                    id: this.addIdPrefix(MenuCategories.Download + locale + 'menu'),
                                    category: MenuCategories.Download,
                                    label: this.localizationHelper.getLanguageNameFromLocale(locale),
                                    items: downloadMenuItems
                                }
                            });
                        }
                    }
                    var downloadMenu = {
                        category: MenuCategories.Download,
                        id: this.addIdPrefix(MenuCategories.Download),
                        label: this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.download_label),
                        hideBackButton: true,
                        items: languageMenuItems,
                        glyph: 'glyph-download',
                        priority: 2
                    };
                    return downloadMenu;
                }
            };
            CorePlayer.prototype.setupCustomizeContextMenu = function () {
                var menus = [];
                var playPauseMenu = this.getPlayPauseMenu();
                menus.push(playPauseMenu);
                if (!this.playerData.options.playPauseTrigger) {
                    var muteUnmuteMenu = this.getMuteUnMuteMenu();
                    menus.push(muteUnmuteMenu);
                }
                this.contextMenu.setupCustomizeContextMenu(menus);
                this.customizedContextMenu = htmlExtensions_20.selectFirstElement('.f-player-context-menu', this.playerContainer);
            };
            CorePlayer.prototype.getMuteUnMuteMenu = function () {
                var label;
                var glyph;
                if (this.isMuted()) {
                    label = this.locUnmute;
                    glyph = 'glyph-volume';
                }
                else {
                    label = this.locMute;
                    glyph = 'glyph-mute';
                }
                var playPauseMenu = {
                    id: 'context-menu-' + ContextMenuCategories.MuteUnMute,
                    label: label,
                    glyph: glyph,
                    priority: 2,
                    category: ContextMenuCategories.MuteUnMute
                };
                return playPauseMenu;
            };
            CorePlayer.prototype.getPlayPauseMenu = function () {
                var label;
                var glyph;
                if (this.isPaused()) {
                    label = this.locPlay;
                    glyph = 'glyph-play';
                }
                else {
                    label = this.locPause;
                    glyph = 'glyph-pause';
                }
                var playPauseMenu = {
                    id: 'context-menu-' + ContextMenuCategories.PlayPause,
                    label: label,
                    glyph: glyph,
                    priority: 1,
                    category: ContextMenuCategories.PlayPause
                };
                return playPauseMenu;
            };
            CorePlayer.prototype.setupPlayerMenus = function () {
                if (!this.videoControls || !this.videoMetadata) {
                    return;
                }
                var menus = [];
                var qualityMenu = this.getQualityMenu();
                if (qualityMenu && qualityMenu.items.length) {
                    menus.push(qualityMenu);
                }
                var audioTracksMenu = this.getAudioTracksMenu();
                if (audioTracksMenu && audioTracksMenu.items.length) {
                    menus.push(audioTracksMenu);
                }
                var downloadMenu = this.getDownloadMenu();
                if (downloadMenu && downloadMenu.items.length) {
                    menus.push(downloadMenu);
                }
                var ccMenu = this.getClosedCaptionMenu();
                if (ccMenu && ccMenu.items.length) {
                    menus.push(ccMenu);
                }
                var ratesMenu = this.getPlaybackRateMenu();
                if (ratesMenu && ratesMenu.items.length) {
                    menus.push(ratesMenu);
                }
                var shareMenu = this.getShareMenu();
                if (shareMenu && shareMenu.items.length) {
                    menus.push(shareMenu);
                }
                this.videoControls.setupPlayerMenus(menus);
                if (!!this.ccSettingsMenuId) {
                    var ccSettingsMenu = htmlExtensions_20.selectFirstElement('#' + this.ccSettingsMenuId, this.videoControlsContainer);
                    if (!!ccSettingsMenu) {
                        var buttons = htmlExtensions_20.selectElementsT('button', ccSettingsMenu);
                        for (var _i = 0, buttons_1 = buttons; _i < buttons_1.length; _i++) {
                            var button = buttons_1[_i];
                            if (button.innerHTML.toLowerCase().indexOf('preset') >= 0) {
                                htmlExtensions_20.addEvents(button, 'mouseover focus', this.onCcPresetFocus);
                                htmlExtensions_20.addEvents(button, 'mouseout blur', this.onCcPresetBlur);
                            }
                            else {
                                htmlExtensions_20.addEvents(button, 'mouseover focus', this.onCcPresetBlur);
                            }
                        }
                    }
                }
            };
            CorePlayer.prototype.dispose = function () {
                this.hideErrorMessage();
                this.unbindEvents();
                this.stop();
                this.updateState(exports.PlayerStates.Stopped);
                this.videoTag = null;
                this.videoWrapper && this.videoWrapper.dispose();
                this.interactiveTriggersHelper && this.interactiveTriggersHelper.dispose();
                if (this.inviewManager && this.registedInviewManagerAlready) {
                    this.inviewManager.disposePlayer(this);
                }
            };
            CorePlayer.prototype.restoreSettings = function () {
                if (this.playerOptions.mute || utility_22.getValueFromSessionStorage(CorePlayer.mutePrefKey) === '1') {
                    this.isVideoMuted = true;
                    this.mute(false);
                }
                else {
                    var userVol = parseInt(utility_22.getValueFromSessionStorage(CorePlayer.volumePrefKey), 10);
                    this.lastVolume = utility_22.isNumber(userVol) ? userVol / 10 : player_config_7.PlayerConfig.defaultVolume;
                    this.setVolume(this.lastVolume);
                }
                if (!!this.videoControls) {
                    this.videoControls.updateVolumeState();
                }
            };
            CorePlayer.prototype.checkReplacedVideoTag = function () {
                var _this = this;
                var videoTag = htmlExtensions_20.selectFirstElementT('video', this.playerContainer);
                if (videoTag && videoTag !== this.videoTag) {
                    this.videoTag = videoTag;
                    this.videoTag.tabIndex = -1;
                    this.videoTag.style.cursor = 'pointer';
                    this.videoTag.playsInline = true;
                    this.videoTag.setAttribute('aria-hidden', 'true');
                    if (environment_7.Environment.isIProduct) {
                        htmlExtensions_20.addEvents(this.videoTag, htmlExtensions_20.eventTypes[htmlExtensions_20.eventTypes.touchstart], function () {
                            _this.videoTag.controls = true;
                        });
                    }
                    else {
                        htmlExtensions_20.addEvents(this.videoTag, htmlExtensions_20.eventTypes[htmlExtensions_20.eventTypes.click], this.onVideoPlayerClicked);
                    }
                }
            };
            CorePlayer.prototype.loadVideo = function () {
                var _this = this;
                if (!this.locReady) {
                    setTimeout(function () { _this.loadVideo(); }, 50);
                    return;
                }
                if (!this.videoTag) {
                    return null;
                }
                this.checkReplacedVideoTag();
                this.restoreSettings();
                this.bindEvents();
                if (this.videoMetadata &&
                    this.videoMetadata.posterframeUrl &&
                    !this.playerOptions.hidePosterFrame) {
                    this.videoWrapper.setPosterFrame(this.videoMetadata.posterframeUrl);
                }
                this.currentVideoFile = this.getVideoFileToPlay();
                if (this.currentVideoFile) {
                    this.setVideoSrc(this.currentVideoFile);
                }
                if ((environment_7.Environment.isMobile) && (this.videoMetadata.ccFiles)) {
                    this.videoWrapper.addNativeClosedCaption(this.videoMetadata.ccFiles, player_data_interfaces_8.ClosedCaptionTypes.VTT, this.localizationHelper);
                }
                this.setupPlayerMenus();
                this.showControlsBasedOnState();
            };
            CorePlayer.prototype.displayPreRollAndPlayContent = function () {
                var _this = this;
                if (this.playerState === exports.PlayerStates.Ended) {
                    this.reportEvent(player_constants_10.PlayerEvents.Replay);
                    this.updateState('ready');
                }
                if (!this.hasInteractivity) {
                    this.play();
                    return;
                }
                if (!this.interactiveTriggersHelper.isInteractivityJSONReady) {
                    setTimeout(function () {
                        _this.displayPreRollAndPlayContent();
                    }, 50);
                    return;
                }
                var wrapper = this.videoWrapper;
                var tech = '';
                if (!!wrapper.ampPlayer && !!wrapper.ampPlayer.techName) {
                    tech = wrapper.ampPlayer.techName.toLowerCase();
                }
                if (tech.indexOf('flash') >= 0) {
                    var videoTag = htmlExtensions_20.selectFirstElementT('.f-video-player', this.playerContainer);
                    if ((this.playerState === 'loading' ||
                        this.playerState === 'init') ||
                        (videoTag.classList.contains('vjs-loading') ||
                            videoTag.classList.contains('vjs-waiting'))) {
                        setTimeout(function () {
                            _this.displayPreRollAndPlayContent();
                        }, 50);
                        return;
                    }
                }
                this.reportContentStart();
                this.interactiveTriggersHelper.displayPreRoll(function () {
                    _this.play();
                });
            };
            CorePlayer.prototype.reportContentStart = function () {
                if (this.isFirstTimePlayed && !this.isContentStartReported) {
                    this.isFirstTimePlayed = false;
                    this.isContentStartReported = true;
                    this.reportEvent(player_constants_10.PlayerEvents.ContentStart);
                }
            };
            CorePlayer.prototype.bindEvents = function () {
                if (!this.areMediaEventsBound) {
                    this.areMediaEventsBound = true;
                    this.videoWrapper.bindVideoEvents(this.onMediaEvent);
                    htmlExtensions_20.addEvents(this.videoComponent, 'mousemove mouseout', this.onMouseEvent);
                    htmlExtensions_20.addEvents(this.videoComponent, 'keydown', this.onKeyboardEvent);
                    htmlExtensions_20.addEvents(window, 'onBeforeUnload', this.onBeforeUnload);
                    this.addFullscreenEvents();
                    htmlExtensions_20.addEvents(this.ccOverlay, htmlExtensions_20.eventTypes[htmlExtensions_20.eventTypes.click], this.onVideoPlayerClicked);
                    this.checkReplacedVideoTag();
                    htmlExtensions_20.addThrottledEvent(window, htmlExtensions_20.eventTypes.resize, this.onWindowResize);
                }
            };
            CorePlayer.prototype.unbindEvents = function () {
                htmlExtensions_20.removeEvents(this.videoComponent, 'mousemove mouseout', this.onMouseEvent);
                htmlExtensions_20.removeEvents(this.videoComponent, 'keydown', this.onKeyboardEvent);
                htmlExtensions_20.removeEvents(this.ccOverlay, htmlExtensions_20.eventTypes[htmlExtensions_20.eventTypes.click], this.onVideoPlayerClicked);
                htmlExtensions_20.removeEvents(window, 'onBeforeUnload', this.onBeforeUnload);
                htmlExtensions_20.removeEvents(window, 'resize', this.onWindowResize);
                this.removeFullscreenEvents();
            };
            CorePlayer.prototype.setVideoSrc = function (videoFile) {
                if (!!videoFile && !!videoFile.url && !!this.videoWrapper) {
                    this.updateState(exports.PlayerStates.Loading);
                    var videoFiles = [videoFile];
                    var fallbackVideo = this.getFallbackVideoFile();
                    if (fallbackVideo) {
                        var isFallbackVideoAlreadyAdded = false;
                        for (var _i = 0, videoFiles_1 = videoFiles; _i < videoFiles_1.length; _i++) {
                            var videoFile_1 = videoFiles_1[_i];
                            if (videoFile_1.url === fallbackVideo.url) {
                                isFallbackVideoAlreadyAdded = true;
                                break;
                            }
                        }
                        if (!isFallbackVideoAlreadyAdded) {
                            videoFiles.push(this.getFallbackVideoFile());
                        }
                    }
                    this.videoWrapper.setSource(videoFiles);
                    if (this.setAutoPlayNeeded) {
                        this.videoWrapper.setAutoPlay();
                    }
                }
            };
            CorePlayer.prototype.reportEvent = function (event, data) {
                var reportData = this.getReport(data);
                this.logMessage('Event reported : ' + player_constants_10.PlayerEvents[event] + ' | data : ' + JSON.stringify(reportData));
                for (var _i = 0, _a = this.reporters; _i < _a.length; _i++) {
                    var reporter = _a[_i];
                    reporter.reportEvent(event, reportData);
                }
                htmlExtensions_20.customEvent(this.videoComponent, player_constants_10.PlayerEvents[event], { detail: reportData });
                for (var _b = 0, _c = this.playerEventCallbacks; _b < _c.length; _b++) {
                    var callback = _c[_b];
                    callback && callback({ name: player_constants_10.PlayerEvents[event], data: reportData });
                }
            };
            CorePlayer.prototype.getVideoWrapper = function () {
                if (this.playerOptions && this.playerOptions.corePlayer === 'nativeplayer') {
                    return new native_video_wrapper_1.NativeVideoWrapper();
                }
                else if (this.playerOptions && this.playerOptions.corePlayer === 'hasplayer') {
                    return new has_video_wrapper_1.HasPlayerVideoWrapper();
                }
                else if (this.playerOptions && this.playerOptions.corePlayer === 'hlsplayer') {
                    return new hls_video_wrapper_1.HlsPlayerVideoWrapper();
                }
                else if ((this.playerOptions && this.playerOptions.corePlayer === 'amp') || this.useAdaptive) {
                    return new amp_wrapper_1.AmpWrapper(this.playerOptions.useAMPVersion2);
                }
                else {
                    return new html5_video_wrapper_1.Html5VideoWrapper(this);
                }
            };
            CorePlayer.prototype.hideControlPanel = function () {
                if (!!this.controlPanelTimer) {
                    window.clearTimeout(this.controlPanelTimer);
                    this.controlPanelTimer = 0;
                }
                if (this.areControlsVisible) {
                    if (environment_7.Environment.useNativeControls) {
                        if (this.videoTag) {
                            this.videoTag.controls = false;
                        }
                    }
                    else if (!!this.videoControlsContainer) {
                        if (!htmlExtensions_20.hasClass(this.videoControlsContainer, CorePlayer.hideControlsClass)) {
                            this.screenManagerHelper.updateElementDisplay(this.controlsScreenManagerObject, false);
                            if (!!this.ccOverlay) {
                                if (this.closedCaptions && this.videoWrapper) {
                                    this.closedCaptions.updateCaptions(this.getPlayPosition().currentTime);
                                }
                            }
                        }
                    }
                    if (!!this.videoControls) {
                        this.videoControls.prepareToHide();
                        this.videoControls.hideControls();
                    }
                    this.areControlsVisible = false;
                }
            };
            CorePlayer.prototype.showControlPanel = function (autoHide) {
                var _this = this;
                if (autoHide === void 0) { autoHide = true; }
                if ((this.playerOptions && !this.playerOptions.controls)
                    || this.isTriggerShown()) {
                    return;
                }
                if (this.playerOptions && !this.playerOptions.showControlOnLoad && this.showcontrolFirstTime) {
                    return;
                }
                if (!!this.controlPanelTimer) {
                    window.clearTimeout(this.controlPanelTimer);
                    this.controlPanelTimer = 0;
                }
                if (!this.areControlsVisible) {
                    if (environment_7.Environment.useNativeControls) {
                        if (this.videoTag) {
                            this.videoTag.controls = true;
                        }
                    }
                    else if (!!this.videoControlsContainer && !htmlExtensions_20.hasClass(this.videoControlsContainer, CorePlayer.showControlsClass)) {
                        this.screenManagerHelper.updateElementDisplay(this.controlsScreenManagerObject, true);
                        if (!!this.ccOverlay) {
                            if (this.closedCaptions && this.videoWrapper) {
                                this.closedCaptions.updateCaptions(this.getPlayPosition().currentTime);
                            }
                        }
                        this.videoControls.resetSlidersWorkaround();
                    }
                    this.areControlsVisible = true;
                }
                var controlPanelTimeout = null;
                if (this.playerOptions.controlPanelTimeout !== null) {
                    controlPanelTimeout = this.playerOptions.controlPanelTimeout;
                }
                else {
                    controlPanelTimeout = CorePlayer.controlPanelTimeout;
                }
                if (autoHide) {
                    this.controlPanelTimer = window.setTimeout(function () { _this.hideControlPanel(); }, controlPanelTimeout);
                }
            };
            CorePlayer.prototype.stopMedia = function (msgToDisplay, msgToReport) {
                this.logMessage('StopMedia invoked');
                if (this.firstByteTimer) {
                    window.clearTimeout(this.firstByteTimer);
                    this.firstByteTimer = null;
                }
                this.exitFullScreen();
                if (msgToDisplay) {
                    this.logMessage(msgToReport || msgToDisplay);
                    this.updateState(exports.PlayerStates.Stopped);
                    this.displayErrorMessage({ title: msgToDisplay });
                    this.reportEvent(player_constants_10.PlayerEvents.ContentError, {
                        'errorType': 'content:error', 'errorDesc': msgToReport || msgToDisplay,
                        'errorMessage': msgToDisplay
                    });
                }
            };
            CorePlayer.prototype.setNextCheckpoint = function () {
                var position = this.getPlayPosition();
                if (position.endTime) {
                    for (var _i = 0, _a = player_config_7.PlayerConfig.checkpoints; _i < _a.length; _i++) {
                        var checkpoint = _a[_i];
                        if (Math.round((position.currentTime / position.endTime * 100) * 100 / 100) <= checkpoint) {
                            this.nextCheckpoint = checkpoint;
                            return;
                        }
                    }
                }
                this.nextCheckpoint = null;
            };
            CorePlayer.prototype.getPlayPosition = function () {
                return this.videoWrapper ? this.videoWrapper.getPlayPosition() : { currentTime: 0, startTime: 0, endTime: 0 };
            };
            CorePlayer.prototype.getBufferedDuration = function () {
                var buffered = 0;
                try {
                    buffered = this.videoWrapper && this.videoWrapper.getBufferedDuration();
                }
                catch (e) {
                    this.reportEvent(player_constants_10.PlayerEvents.PlayerError, {
                        errorType: 'getBufferedDuration',
                        errorDesc: 'GetBufferedDuration: ' + e.message
                    });
                    throw e;
                }
                return buffered;
            };
            CorePlayer.prototype.addPlayerEventListener = function (callback) {
                if (this.playerEventCallbacks.indexOf(callback) < 0) {
                    this.playerEventCallbacks.push(callback);
                }
            };
            CorePlayer.prototype.removePlayerEventListener = function (callback) {
                var index = this.playerEventCallbacks.indexOf(callback);
                if (index >= 0) {
                    this.playerEventCallbacks.splice(index, 1);
                }
            };
            CorePlayer.prototype.stop = function () {
                this.seek(0);
                if (!!this.videoControls) {
                    this.pause();
                    var playPosition = this.getPlayPosition();
                    this.videoControls.setPlayPosition({
                        startTime: playPosition && playPosition.startTime,
                        endTime: playPosition && playPosition.endTime,
                        currentTime: playPosition && playPosition.startTime
                    });
                }
                if (this.closedCaptions) {
                    this.closedCaptions.updateCaptions(0);
                }
            };
            CorePlayer.prototype.isPaused = function () {
                return !!this.videoWrapper ? this.videoWrapper.isPaused() : false;
            };
            CorePlayer.prototype.isLive = function () {
                return this.videoWrapper && this.videoWrapper.isLive();
            };
            CorePlayer.prototype.isPlayable = function () {
                return !!this.videoTag ? this.canPlay : false;
            };
            CorePlayer.prototype.play = function () {
                var _this = this;
                if (this.playerState === exports.PlayerStates.Playing || this.playerState === exports.PlayerStates.Error ||
                    this.playerState === exports.PlayerStates.Stopped || this.playerState === exports.PlayerStates.Init) {
                    return;
                }
                this.reportEvent(player_constants_10.PlayerEvents.Play);
                if (this.playerState === exports.PlayerStates.Ended) {
                    if (this.showEndImage && !environment_7.Environment.isIProduct && !!this.endImage) {
                        this.endImage.container.setAttribute('aria-hidden', 'true');
                    }
                    this.displayPreRollAndPlayContent();
                    return;
                }
                if (this.playerOptions.lazyLoad && !this.wrapperLoadCalled) {
                    this.playOnDataLoad = false;
                    this.loadVideoWrapper(true);
                }
                else {
                    if (!!this.videoWrapper) {
                        if (environment_7.Environment.isIProduct || environment_7.Environment.isAndroidModern) {
                            this.videoWrapper.play();
                        }
                        else {
                            setTimeout(function () { _this.videoWrapper.play(); }, 0);
                        }
                    }
                    if (!!this.videoControls) {
                        this.videoControls.updatePlayPauseState();
                    }
                }
                if (this.triggerPlayPauseContainer) {
                    if (!!this.playPauseButton) {
                        htmlExtensions_20.removeClass(this.playPauseButton, 'glyph-play');
                        htmlExtensions_20.addClass(this.playPauseButton, 'glyph-pause');
                        this.playPauseButton.setAttribute('aria-label', this.locPause);
                        htmlExtensions_20.setText(this.playPauseTooltip, this.locPause);
                    }
                }
            };
            CorePlayer.prototype.pause = function (isUserInitiated) {
                if (!!this.videoWrapper) {
                    this.videoWrapper.pause();
                }
                if (this.triggerPlayPauseContainer) {
                    if (!!this.playPauseButton) {
                        htmlExtensions_20.removeClass(this.playPauseButton, 'glyph-pause');
                        htmlExtensions_20.addClass(this.playPauseButton, 'glyph-play');
                        if (environment_7.Environment.isChrome) {
                            this.playPauseButton.setAttribute('aria-label', this.locPlay);
                        }
                        else {
                            this.setAriaLabelForButton(this.playPauseButton);
                        }
                        htmlExtensions_20.setText(this.playPauseTooltip, this.locPlay);
                    }
                }
                if (!!this.videoControls) {
                    this.videoControls.updatePlayPauseState();
                }
                if (isUserInitiated) {
                    this.reportEvent(player_constants_10.PlayerEvents.Pause);
                }
            };
            CorePlayer.prototype.seek = function (time) {
                if (utility_22.isNumber(time) && !!this.videoWrapper) {
                    var position = this.getPlayPosition();
                    time = Math.max(position.startTime, Math.min(time, position.endTime));
                    if (Math.abs(time - position.currentTime) >= CorePlayer.positionUpdateThreshold) {
                        this.setNextCheckpoint();
                        this.seekFrom = position.currentTime;
                        this.videoWrapper.setCurrentTime(time);
                    }
                }
            };
            CorePlayer.prototype.getVolume = function () {
                return (this.videoWrapper && this.videoWrapper.getVolume()) || 0;
            };
            CorePlayer.prototype.setVolume = function (volume, isUserInitiated) {
                if (utility_22.isNumber(volume) && !!this.videoWrapper) {
                    volume = Math.round(Math.max(0, Math.min(volume, 1)) * 100) / 100;
                    var previousVolume = this.videoWrapper.getVolume();
                    if (volume !== previousVolume) {
                        this.lastVolume = previousVolume;
                        this.videoWrapper.setVolume(volume);
                        this.lastVolume = (volume) ? volume : this.lastVolume;
                        if (isUserInitiated) {
                            utility_22.saveToSessionStorage(CorePlayer.volumePrefKey, Math.ceil(volume * 10).toString());
                            this.reportEvent(player_constants_10.PlayerEvents.Volume);
                        }
                        if (this.isMuted() && volume > 0) {
                            this.unmute(isUserInitiated, true);
                        }
                        if (!!this.videoControls) {
                            this.videoControls.updateVolumeState();
                        }
                    }
                }
            };
            CorePlayer.prototype.isMuted = function () {
                return (this.videoWrapper && this.videoWrapper.isMuted()) || this.isVideoMuted;
            };
            CorePlayer.prototype.mute = function (isUserInitiated) {
                this.lastVolume = this.getVolume();
                this.setMuted(true);
                if (isUserInitiated) {
                    utility_22.saveToSessionStorage(CorePlayer.mutePrefKey, '1');
                    this.reportEvent(player_constants_10.PlayerEvents.Mute);
                }
            };
            CorePlayer.prototype.unmute = function (isUserInitiated, preventModifyVolume) {
                preventModifyVolume || this.setVolume(this.lastVolume || player_config_7.PlayerConfig.defaultVolume, false);
                this.setMuted(false);
                if (isUserInitiated) {
                    utility_22.saveToSessionStorage(CorePlayer.mutePrefKey, '0');
                    this.reportEvent(player_constants_10.PlayerEvents.Unmute);
                }
            };
            CorePlayer.prototype.setMuted = function (muted) {
                if (!!this.videoWrapper && (muted !== this.videoWrapper.isMuted())) {
                    muted ? this.videoWrapper.mute() : this.videoWrapper.unmute();
                }
                if (!!this.videoControls) {
                    this.videoControls.updateVolumeState();
                }
            };
            CorePlayer.isNativeFullscreenEnabled = function () {
                var doc = document;
                return doc.fullscreenEnabled || doc.mozFullScreenEnabled || doc.webkitFullscreenEnabled || doc.webkitSupportsFullscreen ||
                    doc.msFullscreenEnabled;
            };
            CorePlayer.getElementInFullScreen = function () {
                var doc = document;
                return doc.fullscreenElement || doc.mozFullScreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement;
            };
            CorePlayer.prototype.getFullscreenContainer = function () {
                return environment_7.Environment.useNativeControls ? this.videoTag : this.playerContainer;
            };
            CorePlayer.prototype.enterFullScreen = function () {
                if (!CorePlayer.isNativeFullscreenEnabled()) {
                    return;
                }
                var fullscreenElement = this.getFullscreenContainer();
                var elementInFullScreen = CorePlayer.getElementInFullScreen();
                if (!!fullscreenElement && !elementInFullScreen) {
                    var enterFullScreen = fullscreenElement.requestFullscreen ||
                        fullscreenElement.msRequestFullscreen ||
                        fullscreenElement.mozRequestFullScreen ||
                        fullscreenElement.webkitRequestFullscreen ||
                        fullscreenElement.webkitEnterFullScreen;
                    enterFullScreen.call(fullscreenElement);
                }
            };
            CorePlayer.prototype.exitFullScreen = function () {
                if (!CorePlayer.isNativeFullscreenEnabled()) {
                    return;
                }
                var fullscreenElement = this.getFullscreenContainer();
                var elementInFullScreen = CorePlayer.getElementInFullScreen();
                if (!!fullscreenElement && fullscreenElement === elementInFullScreen) {
                    var doc = document;
                    var cancelFullScreen = doc.cancelFullScreen ||
                        doc.msExitFullscreen ||
                        doc.mozCancelFullScreen ||
                        doc.webkitCancelFullScreen;
                    cancelFullScreen.call(doc);
                }
            };
            CorePlayer.prototype.toggleFullScreen = function () {
                !this.isInFullscreen ? this.enterFullScreen() : this.exitFullScreen();
            };
            CorePlayer.prototype.isFullScreen = function () {
                return this.isInFullscreen;
            };
            CorePlayer.prototype.addFullscreenEvents = function () {
                htmlExtensions_20.addEvents(document, 'fullscreenchange mozfullscreenchange webkitfullscreenchange MSFullscreenChange', this.onFullscreenChanged, false);
                htmlExtensions_20.addEvents(document, 'fullscreenerror mozfullscreenerror webkitfullscreenerror MSFullscreenError', this.onFullscreenError, false);
                if (this.videoTag) {
                    htmlExtensions_20.addEvents(this.videoTag, 'webkitbeginfullscreen', this.onIOSFullscreenEnter, false);
                    htmlExtensions_20.addEvents(this.videoTag, 'webkitendfullscreen', this.onIOSFullscreenExit, false);
                }
            };
            CorePlayer.prototype.removeFullscreenEvents = function () {
                htmlExtensions_20.removeEvents(document, 'fullscreenchange mozfullscreenchange webkitfullscreenchange MSFullscreenChange', this.onFullscreenChanged, false);
                htmlExtensions_20.removeEvents(document, 'fullscreenerror mozfullscreenerror webkitfullscreenerror MSFullscreenError', this.onFullscreenError, false);
                if (this.videoTag) {
                    htmlExtensions_20.removeEvents(this.videoTag, 'webkitbeginfullscreen', this.onIOSFullscreenEnter, false);
                    htmlExtensions_20.removeEvents(this.videoTag, 'webkitendfullscreen', this.onIOSFullscreenExit, false);
                }
            };
            CorePlayer.prototype.onFullscreenEnter = function () {
                this.isInFullscreen = true;
                if (this.videoControls) {
                    !!this.interactiveTriggersHelper ? this.resetFocusTrap(this.interactiveTriggersHelper.findInteractivityFocusTrapStart()) :
                        this.resetFocusTrap();
                    this.videoControls.updateFullScreenState();
                }
                this.reportEvent(player_constants_10.PlayerEvents.FullScreenEnter);
            };
            CorePlayer.prototype.onFullscreenExit = function () {
                this.isInFullscreen = false;
                if (this.videoControls) {
                    this.videoControls.removeFocusTrap();
                    this.videoControls.updateFullScreenState();
                }
                this.reportEvent(player_constants_10.PlayerEvents.FullScreenExit);
            };
            CorePlayer.prototype.resetFocusTrap = function (trapStart) {
                if (!this.isFullScreen()) {
                    return;
                }
                this.videoControls.removeFocusTrap();
                if (trapStart) {
                    this.videoControls.setFocusTrap(trapStart);
                }
                else {
                    if (!this.hasInteractivity) {
                        this.videoControls.setFocusTrap(null);
                    }
                    else {
                        this.videoControls.setFocusTrap(trapStart);
                    }
                }
            };
            CorePlayer.prototype.initializeClosedCaptions = function () {
                this.ccOverlay = htmlExtensions_20.selectFirstElement('.f-video-cc-overlay', this.videoComponent);
                this.closedCaptions = new video_closed_captions_2.VideoClosedCaptions(this.ccOverlay, this.onErrorCallback);
                this.closedCaptionsSettings = new video_closed_captions_settings_1.VideoClosedCaptionsSettings(this.onErrorCallback);
                this.ccScreenManagerObject = {
                    HtmlObject: this.ccOverlay,
                    Height: 0,
                    Id: null,
                    IsVisible: false,
                    Priority: 0,
                    Transition: null
                };
                this.screenManagerHelper.registerElement(this.ccScreenManagerObject);
            };
            CorePlayer.prototype.onPlayerMenuItemClick = function (notification) {
                if (!notification || !notification.category) {
                    return;
                }
                switch (notification.category) {
                    case MenuCategories.ClosedCaption: {
                        this.setCC(notification.id, true);
                        break;
                    }
                    case MenuCategories.ClosedCaptionSettings: {
                        this.setCCSettings(notification);
                        break;
                    }
                    case MenuCategories.Quality: {
                        this.setQuality(notification.id);
                        break;
                    }
                    case MenuCategories.AudioTracks: {
                        this.setAudio(notification.id);
                        break;
                    }
                    case MenuCategories.Share: {
                        this.shareVideo(notification);
                        break;
                    }
                    case MenuCategories.PlaybackSpeed: {
                        this.setPlaybackRate(notification.id, true);
                        break;
                    }
                    case MenuCategories.Download: {
                        this.downloadMedia(notification);
                        break;
                    }
                }
            };
            CorePlayer.prototype.onPlayerContextMenuItemClick = function (notification) {
                if (!notification || !notification.category) {
                    return;
                }
                switch (notification.category) {
                    case ContextMenuCategories.PlayPause:
                        if (this.isPaused()) {
                            this.play();
                        }
                        else {
                            this.pause(true);
                        }
                        break;
                    case ContextMenuCategories.MuteUnMute:
                        if (this.isMuted()) {
                            this.unmute(true);
                        }
                        else {
                            this.mute(true);
                        }
                        break;
                }
                this.customizedContextMenu.setAttribute('aria-hidden', 'true');
            };
            CorePlayer.prototype.setCC = function (ccLanguageId, isUserInitiated) {
                if (this.closedCaptions) {
                    ccLanguageId = this.removeIdPrefix(ccLanguageId);
                    var selectedOption = null;
                    if (ccLanguageId && this.videoMetadata && this.videoMetadata.ccFiles) {
                        for (var _i = 0, _a = this.videoMetadata.ccFiles; _i < _a.length; _i++) {
                            var ccFile = _a[_i];
                            if ((ccFile.locale === ccLanguageId) && (!ccFile.ccType || ccFile.ccType === player_data_interfaces_8.ClosedCaptionTypes.TTML)) {
                                selectedOption = ccFile;
                                break;
                            }
                        }
                    }
                    var previousCcLanguage = this.closedCaptions.getCurrentCcLanguage();
                    this.closedCaptions.setCcLanguage(ccLanguageId, selectedOption ? selectedOption.url : null);
                    if (isUserInitiated) {
                        utility_22.saveToSessionStorage(CorePlayer.ccLangPrefKey, ccLanguageId);
                    }
                    if (ccLanguageId === 'off') {
                        this.screenManagerHelper.updateElementDisplay(this.ccScreenManagerObject, false);
                    }
                    else {
                        this.screenManagerHelper.updateElementDisplay(this.ccScreenManagerObject, true);
                    }
                    this.reportEvent(player_constants_10.PlayerEvents.ClosedCaptionsChanged, { 'startcaptionselection': previousCcLanguage, 'endCaptionSelection': ccLanguageId });
                }
            };
            CorePlayer.prototype.setCCSettings = function (notification) {
                if (!this.videoControls || !this.closedCaptions || !this.closedCaptionsSettings || !notification || !notification.data) {
                    return;
                }
                if (notification.data === 'reset') {
                    this.closedCaptionsSettings.reset();
                }
                else {
                    var dataSplit = notification.data.split(':');
                    if (!dataSplit && dataSplit.length < 0) {
                        return;
                    }
                    this.closedCaptionsSettings.setSetting(dataSplit[0], dataSplit[1]);
                }
                this.closedCaptions.resetCaptions();
                this.closedCaptions.updateCaptions(this.getPlayPosition().currentTime);
                var currentSettings = this.closedCaptionsSettings.getCurrentSettings();
                if (currentSettings) {
                    for (var setting in currentSettings) {
                        if (currentSettings.hasOwnProperty(setting)) {
                            this.videoControls.updateMenuSelection(this.getCCSettingsMenuId(setting), this.getCCMenuItemId(setting, currentSettings[setting]));
                        }
                    }
                    if (!currentSettings[video_closed_captions_settings_1.VideoClosedCaptionsSettings.presetKey]) {
                        this.videoControls.updateMenuSelection(this.getCCSettingsMenuId(video_closed_captions_settings_1.VideoClosedCaptionsSettings.presetKey));
                    }
                }
                this.reportEvent(player_constants_10.PlayerEvents.ClosedCaptionSettingsChanged, { 'closedCaptionSettings': notification.data });
            };
            CorePlayer.prototype.setPlaybackRate = function (rateId, isUserInitiated) {
                rateId = this.removeIdPrefix(rateId);
                if (!rateId || !this.videoWrapper) {
                    return;
                }
                var prefix = 'rate';
                var rate = (stringExtensions_13.startsWith(rateId, prefix, false)) ? rateId.substring(prefix.length) : rateId;
                if (rate) {
                    this.videoWrapper.setPlaybackRate(+rate);
                    if (isUserInitiated) {
                        utility_22.saveToSessionStorage(CorePlayer.playbackRatePrefKey, rate);
                    }
                    this.reportEvent(player_constants_10.PlayerEvents.PlaybackRateChanged, { 'playbackRate': rate });
                }
            };
            CorePlayer.prototype.setQuality = function (qualityId) {
                qualityId = this.removeIdPrefix(qualityId);
                if (!qualityId) {
                    return;
                }
                var quality = (player_data_interfaces_8.MediaQuality[qualityId]);
                var oldQuality = this.currentMediaQuality;
                var mediaFile = this.getVideoFileToPlay(quality);
                var oldTrack = this.videoWrapper.getCurrentVideoTrack();
                if (mediaFile && mediaFile.url) {
                    this.currentVideoFile = mediaFile;
                    utility_22.saveToSessionStorage(CorePlayer.qualityPrefKey, qualityId);
                    this.playOnDataLoad = !this.isPaused();
                    this.startTimeOnDataLoad = this.getPlayPosition().currentTime;
                    this.setVideoSrc(mediaFile);
                    this.reportEvent(player_constants_10.PlayerEvents.VideoQualityChanged, { 'startRes': oldQuality, 'endRes': quality });
                }
                else {
                    var matchResult = qualityId.match(/video-(\d+)/);
                    if (!matchResult || matchResult.length < 2) {
                        return;
                    }
                    var videoTrackIndex = parseInt(matchResult[1], 10);
                    if (videoTrackIndex !== NaN && videoTrackIndex >= 0) {
                        var oldStreamingQuality = oldTrack.auto ? 'auto' :
                            this.videoWrapper.getVideoTracks()[this.videoWrapper.getCurrentVideoTrack().trackIndex].bitrate;
                        this.videoWrapper.switchToVideoTrack(videoTrackIndex);
                        var newQuality = qualityId === 'auto' ? 'auto' :
                            this.videoWrapper.getVideoTracks()[videoTrackIndex].bitrate;
                        this.reportEvent(player_constants_10.PlayerEvents.VideoQualityChanged, { 'startRes': oldStreamingQuality, 'endRes': newQuality });
                    }
                }
            };
            CorePlayer.prototype.setAudio = function (trackElementId) {
                trackElementId = this.removeIdPrefix(trackElementId);
                if (!trackElementId) {
                    return;
                }
                var matchResult = trackElementId.match(/audio-(\d+)/);
                if (!matchResult || matchResult.length < 2) {
                    return;
                }
                var newTrackIndex = parseInt(matchResult[1], 10);
                if (newTrackIndex !== NaN && newTrackIndex >= 0 && !!this.isAudioTracksDoneSwitching) {
                    var audioTracks = this.videoWrapper.getAudioTracks();
                    var oldTrackIndex = this.videoWrapper.getCurrentAudioTrack();
                    var oldTrack = !!audioTracks[oldTrackIndex] ? audioTracks[oldTrackIndex].title : null;
                    var newTrack = !!audioTracks[newTrackIndex] ? audioTracks[newTrackIndex].title : null;
                    this.isAudioTracksDoneSwitching = false;
                    this.videoWrapper.switchToAudioTrack(newTrackIndex);
                    this.reportEvent(player_constants_10.PlayerEvents.AudioTrackChanged, { 'startTrackSelection': oldTrack, 'endTrackSelection': newTrack });
                }
            };
            CorePlayer.prototype.shareVideo = function (notification) {
                if (!notification || !notification.id) {
                    return;
                }
                var shareId = this.removeIdPrefix(notification.id);
                if (shareId && notification.data) {
                    this.reportEvent(player_constants_10.PlayerEvents.VideoShared, { 'videoShare': shareId });
                    switch (shareId) {
                        case player_constants_11.shareTypes.copy:
                            sharing_helper_1.SharingHelper.tryCopyTextToClipboard(decodeURIComponent(notification.data));
                            break;
                        case player_constants_11.shareTypes.mail:
                            window.location.href = notification.data;
                            break;
                        default:
                            window.open(notification.data, '_blank');
                            break;
                    }
                }
            };
            CorePlayer.prototype.downloadMedia = function (notification) {
                if (notification && notification.data) {
                    window.open(notification.data, '_blank');
                    var downloadType = notification.id.indexOf('transcript') !== -1 ? 'transcript' : 'video';
                    this.reportEvent(player_constants_10.PlayerEvents.MediaDownloaded, { 'downloadType': downloadType, 'downloadMedia': notification.data.toString() });
                }
            };
            CorePlayer.prototype.addIdPrefix = function (childId) {
                var prefix = (this.videoComponent && this.videoComponent.id)
                    ? this.videoComponent.id + '-'
                    : null;
                return (prefix && !stringExtensions_13.startsWith(childId, prefix, false)) ? (prefix + childId) : childId;
            };
            CorePlayer.prototype.removeIdPrefix = function (childId) {
                var prefix = (this.videoComponent && this.videoComponent.id)
                    ? this.videoComponent.id + '-'
                    : null;
                return (prefix && stringExtensions_13.startsWith(childId, prefix, false)) ? childId.substring(prefix.length) : childId;
            };
            CorePlayer.prototype.setFocusOnVideoContainerEdge = function () {
                var _this = this;
                if (environment_7.Environment.isEdgeBrowser && !this.videoElementIsFocus) {
                    this.videoElementIsFocus = true;
                    this.playerContainer.setAttribute('tabindex', '0');
                    setTimeout(function () { return _this.playerContainer.focus(); }, 100);
                }
            };
            CorePlayer.prototype.showTrigger = function () {
                if (!!this.triggerContainer) {
                    this.triggerContainer.setAttribute('aria-hidden', 'false');
                    htmlExtensions_20.addEvents(this.triggerContainer, 'click keyup', this.triggerContainerEventHandler, true);
                    if (environment_7.Environment.isEdgeBrowser) {
                        this.playerContainer.setAttribute('tabindex', '-1');
                    }
                }
                if (this.playerOptions && this.playerOptions.controls && this.videoControlsContainer && (!environment_7.Environment.useNativeControls)) {
                    this.videoControlsContainer.setAttribute('aria-hidden', 'true');
                    this.addHiddenAttr(this.videoControlsTabbableElements);
                }
            };
            CorePlayer.prototype.hideTrigger = function () {
                if (!!this.triggerContainer) {
                    this.triggerContainer.setAttribute('aria-hidden', 'true');
                    this.setFocusOnVideoContainerEdge();
                }
                if (this.playerOptions && this.playerOptions.controls && this.videoControlsContainer && (!environment_7.Environment.useNativeControls)) {
                    this.videoControlsContainer.setAttribute('aria-hidden', 'false');
                    this.removeHiddenAttr(this.videoControlsTabbableElements);
                }
            };
            CorePlayer.prototype.showPlayPauseTrigger = function (show) {
                if (!!this.triggerPlayPauseContainer) {
                    if (show) {
                        htmlExtensions_20.removeClass(this.playPauseButton, 'f-play-pause-hide');
                        htmlExtensions_20.addClass(this.playPauseButton, 'f-play-pause-show');
                    }
                    else {
                        htmlExtensions_20.addClass(this.playPauseButton, 'f-play-pause-hide');
                        htmlExtensions_20.removeClass(this.playPauseButton, 'f-play-pause-show');
                    }
                }
            };
            CorePlayer.prototype.disablePlayPauseTrigger = function () {
                if (!!this.triggerPlayPauseContainer) {
                    htmlExtensions_20.removeClass(this.triggerPlayPauseContainer, 'f-play-pause-trigger');
                }
            };
            CorePlayer.prototype.isTriggerShown = function () {
                return this.triggerContainer && this.triggerContainer.getAttribute('aria-hidden') === 'false';
            };
            CorePlayer.prototype.setTriggerProperties = function () {
                if (this.localizationHelper && this.trigger) {
                    var locPlay = this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.play);
                    var locPlayVideo = this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.play_video);
                    this.setAriaLabelForButton(this.trigger, locPlayVideo);
                    htmlExtensions_20.setText(this.triggerTooltip, locPlay);
                }
            };
            CorePlayer.prototype.displayErrorMessage = function (errorMessage) {
                if (!errorMessage || (!errorMessage.title && !errorMessage.message)) {
                    return;
                }
                this.errorMessageDisplayed = true;
                if (!!this.errorMessage) {
                    htmlExtensions_20.setText(this.errorMessage.title, errorMessage.title || '');
                    htmlExtensions_20.setText(this.errorMessage.message, errorMessage.message || '');
                    this.errorMessage.container.setAttribute('aria-hidden', 'false');
                }
                else {
                    this.errorMessage = {};
                    this.errorMessage.container = document.createElement('div');
                    var contentWrapper = document.createElement('div');
                    this.errorMessage.title = document.createElement('p');
                    this.errorMessage.message = document.createElement('p');
                    this.errorMessage.container.setAttribute('role', 'status');
                    this.errorMessage.container.setAttribute('class', 'f-error-message');
                    this.errorMessage.title.setAttribute('class', 'c-heading');
                    this.errorMessage.message.setAttribute('class', 'c-paragraph');
                    if (!!errorMessage.title) {
                        htmlExtensions_20.setText(this.errorMessage.title, errorMessage.title);
                    }
                    if (!!errorMessage.message) {
                        htmlExtensions_20.setText(this.errorMessage.message, errorMessage.message);
                    }
                    this.errorMessage.container.appendChild(contentWrapper);
                    if (!!errorMessage.title) {
                        contentWrapper.appendChild(this.errorMessage.title);
                    }
                    contentWrapper.appendChild(this.errorMessage.message);
                    this.playerContainer.appendChild(this.errorMessage.container);
                }
                this.updateScreenReaderElement(errorMessage.title, true);
                this.hideTrigger();
            };
            CorePlayer.prototype.displayImage = function (imageUrl) {
                if (!imageUrl) {
                    imageUrl = this.videoMetadata.posterframeUrl;
                }
                if (!!this.endImage) {
                    var imageEle = htmlExtensions_20.selectFirstElement('.f-post-image', this.endImage.container);
                    imageEle.setAttribute('src', imageUrl);
                    this.endImage.container.setAttribute('aria-hidden', 'false');
                }
                else {
                    this.endImage = {};
                    this.endImage.container = document.createElement('div');
                    this.endImage.container.setAttribute('class', 'f-end-poster-image');
                    this.endImage.container.setAttribute('aria-hidden', 'false');
                    this.endImage.container.setAttribute('role', 'none');
                    var imageElement = document.createElement('img');
                    imageElement.setAttribute('src', imageUrl);
                    imageElement.setAttribute('class', 'f-post-image');
                    imageElement.setAttribute('height', 'auto');
                    imageElement.setAttribute('width', '100%');
                    imageElement.setAttribute('role', 'none');
                    this.endImage.container.appendChild(imageElement);
                    this.playerContainer.appendChild(this.endImage.container);
                }
            };
            CorePlayer.prototype.hideImage = function () {
                if (!!this.endImage) {
                    this.endImage.container.setAttribute('aria-hidden', 'true');
                }
            };
            CorePlayer.prototype.hideErrorMessage = function () {
                if (!!this.errorMessage && !!this.errorMessage.container) {
                    this.errorMessage.container.setAttribute('aria-hidden', 'true');
                    this.errorMessageDisplayed = false;
                }
            };
            CorePlayer.prototype.showPosterImage = function (posterImageUrl) {
                if (!this.wrapperLoadCalled) {
                    this.showingPosterImage = true;
                    this.posterImageUrl = posterImageUrl;
                    this.loadVideoWrapper(false);
                }
            };
            CorePlayer.prototype.resize = function () {
                if (!!this.videoControls) {
                    this.videoControls.resetSlidersWorkaround();
                    this.videoControls.updateReactiveControlDisplay();
                    this.onWindowResize();
                }
            };
            CorePlayer.prototype.getDefaultMediaQuality = function () {
                var userQuality = utility_22.getValueFromSessionStorage(CorePlayer.qualityPrefKey);
                var quality = null;
                if (userQuality) {
                    quality = (player_data_interfaces_8.MediaQuality[userQuality]);
                }
                if (!quality) {
                    if (environment_7.Environment.isMobile) {
                        quality = player_config_7.PlayerConfig.defaultQualityMobile;
                    }
                    else if (environment_7.Environment.isTV) {
                        quality = player_config_7.PlayerConfig.defaultQualityTV;
                    }
                    else {
                        quality = player_config_7.PlayerConfig.defaultQualityDesktop;
                    }
                }
                return quality;
            };
            CorePlayer.prototype.getVideoFileforDownload = function () {
                return this.getVideoFileByQuality(player_data_interfaces_8.MediaQuality.HQ) || this.getVideoFileByType(player_data_interfaces_8.MediaTypes.MP4);
            };
            CorePlayer.prototype.getVideoFileByQuality = function (quality) {
                var videoFile = null;
                if (quality && this.videoMetadata && this.videoMetadata.videoFiles) {
                    for (var _i = 0, _a = this.videoMetadata.videoFiles; _i < _a.length; _i++) {
                        var file = _a[_i];
                        if (file.quality === quality) {
                            videoFile = file;
                            break;
                        }
                    }
                }
                return videoFile;
            };
            CorePlayer.prototype.getVideoFileByType = function (mediaType) {
                var videoFile = null;
                if (mediaType && this.videoMetadata && this.videoMetadata.videoFiles) {
                    for (var _i = 0, _a = this.videoMetadata.videoFiles; _i < _a.length; _i++) {
                        var file = _a[_i];
                        if (file.mediaType === mediaType) {
                            videoFile = file;
                            break;
                        }
                    }
                }
                return videoFile;
            };
            CorePlayer.prototype.getVideoFileToPlay = function (mediaQuality) {
                var quality = mediaQuality || this.getDefaultMediaQuality();
                this.currentMediaQuality = quality;
                var videoFileToPlay;
                var found = false;
                if (this.hasHLS && this.playerOptions && this.playerOptions.useHLS
                    && this.playerOptions.corePlayer === 'hlsplayer') {
                    videoFileToPlay = this.getVideoFileByType(player_data_interfaces_8.MediaTypes.HLS);
                    if (videoFileToPlay && videoFileToPlay.url) {
                        found = true;
                    }
                }
                if (!found && this.playerOptions && !this.useAdaptive) {
                    videoFileToPlay = this.getVideoFileByQuality(quality);
                    if (videoFileToPlay && videoFileToPlay.url) {
                        found = true;
                    }
                }
                if (!found && !this.currentVideoFile) {
                    if (this.useAdaptive) {
                        videoFileToPlay = this.getVideoFileByType(player_data_interfaces_8.MediaTypes.DASH) || this.getVideoFileByType(player_data_interfaces_8.MediaTypes.SMOOTH);
                        if (videoFileToPlay && videoFileToPlay.url) {
                            found = true;
                        }
                    }
                    if (!found) {
                        videoFileToPlay = this.getVideoFileByType(player_data_interfaces_8.MediaTypes.MP4);
                    }
                }
                return videoFileToPlay;
            };
            CorePlayer.prototype.getFallbackVideoFile = function () {
                return this.getVideoFileByQuality(player_data_interfaces_8.MediaQuality.HQ) || this.getVideoFileByType(player_data_interfaces_8.MediaTypes.MP4);
            };
            CorePlayer.prototype.updateState = function (newState) {
                if (!newState || newState === this.playerState || this.playerState === exports.PlayerStates.Error) {
                    return;
                }
                this.playerState = newState;
                this.logMessage('Player state updated. New state: ' + newState);
                var newPlaybackStatus = null;
                switch (this.playerState) {
                    case exports.PlayerStates.Loading:
                        newPlaybackStatus = player_constants_10.PlaybackStatus.VideoOpening;
                        this.stopwatchLoading.start();
                        break;
                    case exports.PlayerStates.Playing:
                        newPlaybackStatus = player_constants_10.PlaybackStatus.VideoPlaying;
                        this.stopwatchPlaying.start();
                        this.currentVideoStopwatchPlaying.start();
                        this.stopwatchBuffering.stop();
                        this.stopwatchLoading.stop();
                        if (this.isBuffering && this.stopwatchBuffering.getValue()) {
                            this.isBuffering = false;
                            this.reportEvent(player_constants_10.PlayerEvents.BufferComplete);
                        }
                        break;
                    case exports.PlayerStates.Paused:
                        newPlaybackStatus = player_constants_10.PlaybackStatus.VideoPaused;
                        this.stopwatchPlaying.stop();
                        this.currentVideoStopwatchPlaying.stop();
                        this.stopwatchLoading.stop();
                        break;
                    case exports.PlayerStates.Buffering:
                        newPlaybackStatus = player_constants_10.PlaybackStatus.VideoPlaying;
                        this.stopwatchBuffering.start();
                        this.isBuffering = true;
                        break;
                    case exports.PlayerStates.Seeking:
                        this.stopwatchLoading.stop();
                        break;
                    case exports.PlayerStates.Ended:
                        newPlaybackStatus = player_constants_10.PlaybackStatus.VideoPlayCompleted;
                        this.stopwatchPlaying.stop();
                        this.currentVideoStopwatchPlaying.reset();
                        if (this.showEndImage && !environment_7.Environment.isIProduct) {
                            this.displayImage(this.videoMetadata.posterframeUrl);
                            this.showTrigger();
                        }
                        if (this.triggerPlayPauseContainer) {
                            if (!!this.playPauseButton) {
                                htmlExtensions_20.removeClass(this.playPauseButton, 'glyph-pause');
                                htmlExtensions_20.addClass(this.playPauseButton, 'glyph-play');
                                this.setAriaLabelForButton(this.playPauseButton);
                                htmlExtensions_20.setText(this.playPauseTooltip, this.locPlay);
                            }
                        }
                        break;
                    case exports.PlayerStates.Error:
                        newPlaybackStatus = player_constants_10.PlaybackStatus.VideoPlayFailed;
                        this.stopwatchBuffering.reset();
                        this.stopwatchLoading.stop();
                        this.stopwatchPlaying.reset();
                        this.currentVideoStopwatchPlaying.reset();
                        break;
                }
                if (!!this.videoControls) {
                    this.videoControls.updatePlayPauseState();
                    this.videoControls.updateVolumeState();
                }
                this.setPlaybackStatus(newPlaybackStatus);
                this.showControlsBasedOnState();
                this.showSpinnerBasedOnState();
            };
            CorePlayer.prototype.setPlaybackStatus = function (newStatus) {
                if (newStatus && this.playbackStatus !== newStatus) {
                    this.playbackStatus = newStatus;
                    this.reportEvent(player_constants_10.PlayerEvents.PlaybackStatusChanged, { status: newStatus });
                }
            };
            CorePlayer.prototype.setSpinnerProperties = function () {
                if (this.localizationHelper && this.spinner) {
                    this.spinner.setAttribute('aria-label', this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.loading_aria_label));
                    this.spinner.setAttribute('aria-valuetext', this.localizationHelper.getLocalizedValue(localization_helper_5.playerLocKeys.loading_value_text));
                }
            };
            CorePlayer.prototype.showSpinner = function () {
                if (this.spinner && (!this.isTriggerShown())) {
                    this.spinner.setAttribute('aria-hidden', 'false');
                }
            };
            CorePlayer.prototype.hideSpinner = function () {
                if (this.spinner) {
                    this.spinner.setAttribute('aria-hidden', 'true');
                }
            };
            CorePlayer.prototype.showSpinnerBasedOnState = function () {
                if (!!this.ageGateHelper && !!this.ageGateHelper.ageGateIsDisplayed) {
                    this.hideSpinner();
                    return;
                }
                switch (this.playerState) {
                    case exports.PlayerStates.Ready:
                    case exports.PlayerStates.Playing:
                    case exports.PlayerStates.Paused:
                    case exports.PlayerStates.Ended:
                    case exports.PlayerStates.Stopped:
                    case exports.PlayerStates.Error:
                        this.hideSpinner();
                        break;
                    default:
                        this.showSpinner();
                        break;
                }
            };
            CorePlayer.prototype.showControlsBasedOnState = function () {
                switch (this.playerState) {
                    case exports.PlayerStates.Loading:
                    case exports.PlayerStates.Init:
                    case exports.PlayerStates.Error:
                        this.hideControlPanel();
                        break;
                    case exports.PlayerStates.Ended:
                        if (this.showEndImage && !environment_7.Environment.isIProduct) {
                            this.hideControlPanel();
                        }
                        else {
                            this.showControlPanel(false);
                        }
                        break;
                    case exports.PlayerStates.Ready:
                    case exports.PlayerStates.Paused:
                    case exports.PlayerStates.Stopped:
                        this.showControlPanel(false);
                        break;
                    default:
                        this.showControlPanel(true);
                        break;
                }
            };
            CorePlayer.prototype.updateScreenReaderElement = function (text, isEnabledForChrome) {
                if (isEnabledForChrome === void 0) { isEnabledForChrome = false; }
                if (!!this.screenReaderElement && this.screenReaderElement.innerText !== text && !isEnabledForChrome) {
                    this.screenReaderElement.innerText = text;
                }
            };
            CorePlayer.prototype.setFocusOnPlayButton = function () {
                if (this.videoControls) {
                    this.videoControls.setFocusonPlayButton();
                }
            };
            CorePlayer.prototype.getVideoTitle = function () {
                if (this.videoMetadata) {
                    return this.videoMetadata.title;
                }
                return '';
            };
            CorePlayer.prototype.getReport = function (extraData) {
                var duration = this.getPlayPosition().endTime;
                var report = {
                    playerInstanceId: this.playerId,
                    playerTechnology: this.playerTechnology,
                    playerType: this.videoWrapper && this.videoWrapper.getPlayerTechName(),
                    playbackStatus: player_constants_10.PlaybackStatus[this.playbackStatus],
                    totalBufferWaitTime: this.stopwatchBuffering && this.stopwatchBuffering.getValue(),
                    bufferCount: this.stopwatchBuffering && this.stopwatchBuffering.getIntervals(),
                    errorType: extraData && extraData.errorType,
                    errorDesc: extraData && extraData.errorDesc,
                    loadTime: this.stopwatchLoading && this.stopwatchLoading.getFirstValue(),
                    numPlayed: this.stopwatchLoading && this.stopwatchLoading.getIntervals(),
                    videoDuration: duration,
                    videoElapsedTime: this.getPlayPosition().currentTime,
                    seekFrom: extraData && extraData.seekFrom,
                    seekTo: extraData && extraData.seekTo,
                    videoLength: duration * 1000,
                    videoSize: utility_22.getDimensions(this.playerContainer),
                    totalTimePlaying: this.stopwatchPlaying && this.stopwatchPlaying.getTotalValue(),
                    currentVideoTotalTimePlaying: this.currentVideoStopwatchPlaying && this.currentVideoStopwatchPlaying.getTotalValue(),
                    currentInterval: this.stopwatchPlaying && this.stopwatchPlaying.getValue(),
                    eventCheckpointInterval: player_config_7.PlayerConfig.eventCheckpointInterval,
                    checkpoint: extraData && extraData.checkpoint,
                    checkpointType: extraData && extraData.checkpointType,
                    currentVideoFile: this.currentVideoFile,
                    videoMetadata: this.videoMetadata,
                    playerOptions: this.playerOptions,
                    interactiveTriggerAndOverlay: extraData && extraData.interactiveTriggerAndOverlay,
                    videoShare: extraData && extraData.videoShare,
                    closedCaptions: extraData && extraData.closedCaptions,
                    closedCaptionSettings: extraData && extraData.closedCaptionSettings,
                    playbackRate: extraData && extraData.playbackRate,
                    downloadMedia: extraData && extraData.downloadMedia,
                    downloadType: extraData && extraData.downloadType,
                    audioTrack: extraData && extraData.audioTrack,
                    ageGatePassed: extraData && extraData.ageGatePassed,
                    live: this.isLive(),
                    lastVolume: extraData && extraData.lastVolume,
                    newVolume: extraData && extraData.newVolume,
                    startRes: extraData && extraData.startRes,
                    endRes: extraData && extraData.endRes,
                    startTrackSelection: extraData && extraData.startTrackSelection,
                    endTrackSelection: extraData && extraData.endTrackSelection,
                    startCaptionSelection: extraData && extraData.startCaptionSelection,
                    endCaptionSelection: extraData && extraData.endCaptionSelection
                };
                return report;
            };
            CorePlayer.prototype.logMessage = function (message) {
                if (this.playerOptions && this.playerOptions.debug && message) {
                    player_utility_10.PlayerUtility.logConsoleMessage(message, 'Core-Player : ' + this.videoComponent.id);
                }
            };
            CorePlayer.prototype.showElement = function (element) {
                element && element.setAttribute('aria-hidden', 'false');
            };
            CorePlayer.prototype.hideElement = function (element) {
                element && element.setAttribute('aria-hidden', 'true');
            };
            CorePlayer.prototype.addHiddenAttr = function (elements) {
                elements.forEach(function (element) {
                    htmlExtensions_20.addAttribute(element, [attributes_1.AddHidden]);
                });
            };
            CorePlayer.prototype.removeHiddenAttr = function (elements) {
                elements.forEach(function (element) {
                    element.removeAttribute("hidden");
                });
            };
            CorePlayer.playerContainerSelector = '.f-core-player';
            CorePlayer.showControlsClass = 'f-slidein';
            CorePlayer.hideControlsClass = 'f-slideout';
            CorePlayer.fitControlsClass = 'f-overlay-slidein';
            CorePlayer.volumePrefKey = 'vidvol';
            CorePlayer.mutePrefKey = 'vidmut';
            CorePlayer.qualityPrefKey = 'vidqlt';
            CorePlayer.ccLangPrefKey = 'vidccpref';
            CorePlayer.playbackRatePrefKey = 'vidrate';
            CorePlayer.positionUpdateThreshold = .1;
            CorePlayer.controlPanelTimeout = 6500;
            return CorePlayer;
        }());
        exports.CorePlayer = CorePlayer;
    });
    define("controls/context-menu", ["require", "exports", "mwf/utilities/htmlExtensions", "mwf/utilities/utility"], function (require, exports, htmlExtensions_21, utility_23) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.ContextMenu = void 0;
        var ContextMenu = (function () {
            function ContextMenu(contextMenuContainer, videoPlayer) {
                var _this = this;
                this.contextMenuContainer = contextMenuContainer;
                this.focusedMenuItemIndex = 0;
                this.onContextMenuEvents = function (event, arrivedViaKeyboard) {
                    switch (event.type) {
                        case 'click':
                            _this.onContextMenuItemClick(event, arrivedViaKeyboard);
                            break;
                        case 'keyup':
                            var key = utility_23.getKeyCode(event);
                            if (key === 32) {
                                htmlExtensions_21.preventDefault(event);
                            }
                            break;
                        case 'keydown':
                            _this.onContextMenuKeyPressed(event);
                            break;
                    }
                };
                this.onContextMenuItemClick = function (event, arrivedViaKeyboard) {
                    event = htmlExtensions_21.getEvent(event);
                    var target = htmlExtensions_21.getEventTargetOrSrcElement(event);
                    htmlExtensions_21.preventDefault(event);
                    var targetParent = target.parentElement;
                    var id = targetParent.id || (targetParent.parentElement && targetParent.parentElement.id);
                    var data = target.getAttribute('data-info') || targetParent.getAttribute('data-info');
                    if (!!_this.videoPlayer) {
                        _this.videoPlayer.onPlayerContextMenuItemClick({
                            category: target.getAttribute('data-category'),
                            id: id,
                            data: data
                        });
                    }
                };
                this.videoPlayer = videoPlayer;
            }
            ContextMenu.prototype.initializeCustomPlayerMenus = function () {
                if (this.contextMenuContainer) {
                    this.menuItems = htmlExtensions_21.selectElements(ContextMenu.contextMenuSelector + ' ul li', this.contextMenuContainer);
                    if (this.menuItems && this.menuItems.length) {
                        htmlExtensions_21.addEvents(this.menuItems, 'click keydown keyup', this.onContextMenuEvents);
                    }
                }
            };
            ContextMenu.prototype.calcHeightWidthOfContextMenu = function () {
                if (this.contextMenuContainer) {
                    var contextMenu = htmlExtensions_21.selectFirstElement(ContextMenu.contextMenuSelector, this.contextMenuContainer);
                    if (contextMenu) {
                        contextMenu.setAttribute('aria-hidden', 'false');
                        this.menuHeight = htmlExtensions_21.getClientRect(contextMenu).height;
                        this.menuWidth = htmlExtensions_21.getClientRect(contextMenu).width;
                        contextMenu.setAttribute('aria-hidden', 'true');
                    }
                }
            };
            ContextMenu.prototype.showMenu = function (event, playerContainer) {
                var left = event.offsetX;
                var top = event.offsetY;
                this.calcHeightWidthOfContextMenu();
                var maxHeight = playerContainer.offsetHeight + playerContainer.offsetTop;
                var maxWidth = playerContainer.offsetWidth + playerContainer.offsetLeft;
                var newHeight = top + this.menuHeight + 2;
                var newWidth = left + this.menuWidth + 2;
                var contextMenu = htmlExtensions_21.selectFirstElement(ContextMenu.contextMenuSelector, this.contextMenuContainer);
                if (contextMenu) {
                    if (newHeight > maxHeight) {
                        top = top - this.menuHeight;
                    }
                    if (newWidth > maxWidth) {
                        left = left - this.menuWidth;
                    }
                    htmlExtensions_21.css(contextMenu, 'left', left + 'px');
                    htmlExtensions_21.css(contextMenu, 'top', top + 'px');
                    contextMenu.setAttribute('aria-hidden', 'false');
                }
            };
            ContextMenu.prototype.checkContextMenuIsVisible = function () {
                if (this.contextMenuContainer) {
                    var contextMenu = htmlExtensions_21.selectFirstElement(ContextMenu.contextMenuSelector, this.contextMenuContainer);
                    if (contextMenu) {
                        return contextMenu.getAttribute('aria-hidden') === 'false';
                    }
                    else {
                        return false;
                    }
                }
                return false;
            };
            ContextMenu.prototype.setFocusOnFirstElement = function () {
                if (this.contextMenuContainer) {
                    this.menuItems = htmlExtensions_21.selectElements(ContextMenu.contextMenuSelector + ' ul li', this.contextMenuContainer);
                    if (this.menuItems && this.menuItems.length) {
                        this.setFocus(htmlExtensions_21.selectFirstElement('button', this.menuItems[0]));
                    }
                }
            };
            ContextMenu.prototype.onContextMenuKeyPressed = function (event) {
                var key = utility_23.getKeyCode(event);
                var target = htmlExtensions_21.getEventTargetOrSrcElement(event);
                target && target.parentElement;
                switch (key) {
                    case 37:
                    case 39:
                        htmlExtensions_21.stopPropagation(event);
                        htmlExtensions_21.preventDefault(event);
                        break;
                    case 13:
                    case 32:
                        htmlExtensions_21.preventDefault(event);
                        this.onContextMenuItemClick(event, true);
                        break;
                    case 38:
                    case 40:
                        htmlExtensions_21.stopPropagation(event);
                        htmlExtensions_21.preventDefault(event);
                        if (this.menuItems && this.menuItems.length) {
                            if (key === 38) {
                                this.focusedMenuItemIndex -= 1;
                                if (this.focusedMenuItemIndex < 0) {
                                    this.focusedMenuItemIndex = this.menuItems.length - 1;
                                }
                            }
                            else {
                                this.focusedMenuItemIndex = ((this.focusedMenuItemIndex + 1) % this.menuItems.length);
                            }
                            this.setFocus(htmlExtensions_21.selectFirstElement('button', this.menuItems[this.focusedMenuItemIndex]));
                        }
                        break;
                    case 33:
                    case 36:
                        htmlExtensions_21.stopPropagation(event);
                        htmlExtensions_21.preventDefault(event);
                        if (this.menuItems && this.menuItems.length > 0) {
                            this.setFocus(htmlExtensions_21.selectFirstElement('button', this.menuItems[0]));
                        }
                        break;
                    case 35:
                    case 34:
                        htmlExtensions_21.stopPropagation(event);
                        htmlExtensions_21.preventDefault(event);
                        if (this.menuItems && this.menuItems.length > 0) {
                            this.setFocus(htmlExtensions_21.selectFirstElement('button', this.menuItems[this.menuItems.length - 1]));
                        }
                        break;
                    case 27:
                        var contextMenu = htmlExtensions_21.selectFirstElement(ContextMenu.contextMenuSelector, this.contextMenuContainer);
                        if (contextMenu) {
                            contextMenu.setAttribute('aria-hidden', 'true');
                        }
                        this.videoPlayer.setFocusOnPlayButton();
                        break;
                }
            };
            ContextMenu.prototype.setupCustomizeContextMenu = function (menuCollection) {
                var contextMenu = htmlExtensions_21.selectFirstElement(ContextMenu.contextMenuSelector, this.contextMenuContainer);
                if (contextMenu) {
                    this.contextMenuContainer.removeChild(contextMenu);
                }
                var menuItemsHtml = '';
                var itemIndex = 1;
                menuItemsHtml = "<ul role='menu' class='c-list f-bare'>";
                for (var _i = 0, menuCollection_2 = menuCollection; _i < menuCollection_2.length; _i++) {
                    var item = menuCollection_2[_i];
                    var menuItemClass = 'c-action-trigger active';
                    menuItemClass += item.glyph ? ' ' + item.glyph : '';
                    menuItemsHtml +=
                        "<li id='" + item.id + "' role='presentation'>\n                    <button class='" + menuItemClass + "'  role='menuitem'\n                        aria-setsize='" + menuCollection.length + "' \n                        aria-posinset='" + itemIndex++ + "'\n                        aria-label='" + item.label + "'\n                        data-category='" + item.category + "'>\n                        " + item.label + "\n                    </button>\n                </li>";
                }
                menuItemsHtml += "</ul>";
                var menuHtml = "<div class='f-player-context-menu' aria-hidden='true'>\n                    " + menuItemsHtml + "\n                </div>";
                var menuDiv = document.createElement('div');
                menuDiv.innerHTML = menuHtml;
                this.contextMenuContainer.appendChild(menuDiv.firstChild);
                this.initializeCustomPlayerMenus();
            };
            ContextMenu.prototype.setFocus = function (element) {
                if (!!element) {
                    setTimeout(function () { element.focus(); }, 0);
                }
            };
            ContextMenu.contextMenuSelector = '.f-player-context-menu';
            return ContextMenu;
        }());
        exports.ContextMenu = ContextMenu;
    });
    define("mwf/button/button", ["require", "exports", "mwf/utilities/observableComponent", "mwf/utilities/htmlExtensions", "mwf/utilities/utility"], function (require, exports, observableComponent_2, htmlExtensions_22, utility_24) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.Button = void 0;
        var Button = (function (_super) {
            __extends(Button, _super);
            function Button(element) {
                var _this = _super.call(this, element) || this;
                _this.handleKeydown = function (event) {
                    var keyCode = utility_24.getKeyCode(event);
                    switch (keyCode) {
                        case 32:
                            htmlExtensions_22.preventDefault(event);
                            _this.emitClickEvent();
                            break;
                    }
                };
                _this.update();
                return _this;
            }
            Button.prototype.update = function () {
                if (!this.element) {
                    return;
                }
                if (this.element.nodeName === 'A' && (this.element.getAttribute('role') || '').toLowerCase() === 'button') {
                    htmlExtensions_22.addEvent(this.element, htmlExtensions_22.eventTypes.keydown, this.handleKeydown);
                }
            };
            Button.prototype.teardown = function () {
                htmlExtensions_22.removeEvent(this.element, htmlExtensions_22.eventTypes.keydown, this.handleKeydown);
            };
            Button.prototype.emitClickEvent = function () {
                htmlExtensions_22.customEvent(this.element, htmlExtensions_22.eventTypes.click);
            };
            Button.selector = '.c-button';
            Button.typeName = 'Button';
            return Button;
        }(observableComponent_2.ObservableComponent));
        exports.Button = Button;
    });
    require(['mwf/button/button', 'mwf/utilities/componentFactory'], function (buttonModule, factoryModule) {
        if (factoryModule.ComponentFactory && factoryModule.ComponentFactory.create) {
            factoryModule.ComponentFactory.create([{ c: buttonModule.Button }]);
        }
    });
    define("mwf/dialog/dialog", ["require", "exports", "mwf/utilities/publisher", "mwf/utilities/htmlExtensions", "mwf/utilities/utility", "constants/dom-selectors", "constants/dom-selectors"], function (require, exports, publisher_3, htmlExtensions_23, utility_25, dom_selectors_2, dom_selectors_3) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.Dialog = void 0;
        var Dialog = (function (_super) {
            __extends(Dialog, _super);
            function Dialog(element) {
                var _this = _super.call(this, element) || this;
                _this.shouldCloseOnEscape = false;
                _this.isFlowDialog = false;
                _this.isLightboxDialog = false;
                _this.handleTriggerClick = function (event) {
                    _this.activeButton = htmlExtensions_23.getEventTargetOrSrcElement(event);
                    _this.show();
                };
                _this.handleTriggerKeyDown = function (event) {
                    var keyCode = event.keyCode;
                    if (keyCode === 13 || keyCode === 32) {
                        htmlExtensions_23.preventDefault(event);
                        _this.activeButton = htmlExtensions_23.getEventTargetOrSrcElement(event);
                        _this.show();
                    }
                };
                _this.show = function () {
                    var elementsToHideFromScreenReaders = htmlExtensions_23.selectElements(Dialog.pageContentContainerSelector);
                    _this.pageContentContainers = [];
                    _this.element.setAttribute(Dialog.ariaHidden, 'false');
                    _this.dialogWrapper.tabIndex = 0;
                    _this.firstInput.focus();
                    _this.onResized();
                    _this.bodyOverflowX = htmlExtensions_23.css(document.body, 'overflow-x');
                    _this.bodyOverflowY = htmlExtensions_23.css(document.body, 'overflow-y');
                    htmlExtensions_23.css(document.body, 'overflow-x', 'hidden');
                    htmlExtensions_23.css(document.body, 'overflow-y', 'hidden');
                    _this.container.setAttribute(Dialog.ariaHidden, 'true');
                    _this.checkOverflow();
                    for (var _i = 0, elementsToHideFromScreenReaders_1 = elementsToHideFromScreenReaders; _i < elementsToHideFromScreenReaders_1.length; _i++) {
                        var element = elementsToHideFromScreenReaders_1[_i];
                        var isHidden = !!(element.getAttribute(Dialog.ariaHidden) === 'true');
                        _this.pageContentContainers.push({
                            element: element,
                            hidden: isHidden
                        });
                        if (!isHidden) {
                            element.setAttribute(Dialog.ariaHidden, 'true');
                        }
                    }
                    _this.dialogWrapper.scrollTop = 0;
                    _this.initiatePublish({ notification: 1 });
                };
                _this.hide = function () {
                    _this.element.setAttribute(Dialog.ariaHidden, 'true');
                    htmlExtensions_23.css(_this.dialogWrapper, 'height', 'auto');
                    htmlExtensions_23.css(document.body, 'overflow-x', _this.bodyOverflowX);
                    htmlExtensions_23.css(document.body, 'overflow-y', _this.bodyOverflowY);
                    _this.container.setAttribute(Dialog.ariaHidden, 'false');
                    _this.dialogWrapper.setAttribute('tabindex', '-1');
                    for (var _i = 0, _a = _this.pageContentContainers; _i < _a.length; _i++) {
                        var container = _a[_i];
                        if (!container.hidden) {
                            container.element.removeAttribute(Dialog.ariaHidden);
                        }
                    }
                    if (_this.activeButton) {
                        _this.activeButton.focus();
                    }
                    _this.activeButton = null;
                    _this.pageContentContainers = [];
                    _this.initiatePublish({ notification: 2 });
                };
                _this.triggerClickPublish = function (event) {
                    _this.initiatePublish({ notification: 0, button: htmlExtensions_23.getEventTargetOrSrcElement(event) });
                };
                _this.onKeydown = function (event) {
                    var keyCode = utility_25.getKeyCode(event);
                    switch (keyCode) {
                        case 13:
                        case 32:
                            if (_this.closeButtons.indexOf(htmlExtensions_23.getEventTargetOrSrcElement(event)) !== -1) {
                                htmlExtensions_23.preventDefault(event);
                                _this.hide();
                            }
                            else if (_this.customButtons.indexOf(htmlExtensions_23.getEventTargetOrSrcElement(event)) !== -1) {
                                _this.initiatePublish({ notification: 0, button: htmlExtensions_23.getEventTargetOrSrcElement(event) });
                            }
                            break;
                        case 27:
                            htmlExtensions_23.preventDefault(event);
                            if (_this.shouldCloseOnEscape) {
                                _this.hide();
                            }
                            break;
                        case 9:
                            var target = htmlExtensions_23.getEventTargetOrSrcElement(event);
                            var lastFocusableInput = _this.getLastFocusableInput();
                            if (target === lastFocusableInput && !event.shiftKey) {
                                htmlExtensions_23.preventDefault(event);
                                _this.firstInput.focus();
                            }
                            else if (target === _this.firstInput && event.shiftKey) {
                                htmlExtensions_23.preventDefault(event);
                                lastFocusableInput.focus();
                            }
                            break;
                    }
                };
                _this.onResized = function () {
                    _this.checkOverflow();
                    _this.handleResponsive();
                };
                _this.checkOverflow = function () {
                    var dialogRect = htmlExtensions_23.getClientRect(_this.dialogWrapper);
                    if (dialogRect.height < _this.dialogWrapper.scrollHeight) {
                        if (!_this.isScroll) {
                            htmlExtensions_23.css(_this.dialogWrapper, 'overflow-y', 'auto');
                        }
                    }
                    else {
                        htmlExtensions_23.css(_this.dialogWrapper, 'overflow-y', 'hidden');
                    }
                };
                _this.handleResponsive = function () {
                    if (_this.element.getAttribute(Dialog.ariaHidden) === 'false') {
                        var dialogRect = htmlExtensions_23.getClientRect(_this.dialogWrapper);
                        if (_this.isFlowDialog && !_this.isScroll) {
                            if (dialogRect.height < _this.dialogWrapper.scrollHeight) {
                                htmlExtensions_23.css(_this.dialogWrapper, 'max-height', Dialog.heightCalculationString);
                                htmlExtensions_23.css(_this.dialogWrapper, 'height', '100%');
                            }
                            else {
                                htmlExtensions_23.css(_this.dialogWrapper, 'max-height', '100%');
                            }
                        }
                        else if (_this.isScroll) {
                            if (((dialogRect.height + Dialog.heightCalculationValue) > window.innerHeight) &&
                                (htmlExtensions_23.css(_this.dialogInnerContent, 'height') !== 'inherit')) {
                                htmlExtensions_23.css(_this.dialogWrapper, 'height', Dialog.heightCalculationString);
                                htmlExtensions_23.css(_this.dialogInnerContent, 'height', 'inherit');
                            }
                            else if (htmlExtensions_23.css(_this.dialogInnerContent, 'height') !== 'auto') {
                                htmlExtensions_23.css(_this.dialogWrapper, 'height', 'auto');
                                dialogRect = htmlExtensions_23.getClientRect(_this.dialogWrapper);
                                if ((dialogRect.height + Dialog.heightCalculationValue) < window.innerHeight) {
                                    htmlExtensions_23.css(_this.dialogInnerContent, 'height', 'auto');
                                    _this.element.setAttribute(Dialog.ariaHidden, 'true');
                                    _this.element.setAttribute(Dialog.ariaHidden, 'false');
                                    _this.checkOverflow();
                                }
                                else {
                                    htmlExtensions_23.css(_this.dialogWrapper, 'height', Dialog.heightCalculationString);
                                }
                            }
                        }
                    }
                };
                _this.appendDialog = function () {
                    _this.ignoreNextDOMChange = true;
                    if (_this.element && _this.element.parentElement !== document.body) {
                        document.body.appendChild(_this.element);
                    }
                };
                _this.getLastFocusableInput = function () {
                    for (var i = _this.dialogInputs.length - 1; i >= 0; i--) {
                        if (!_this.dialogInputs[i].hidden && _this.dialogInputs[i].getAttribute('disabled') !== 'disabled') {
                            return _this.dialogInputs[i];
                        }
                    }
                    return _this.dialogWrapper;
                };
                _this.update();
                return _this;
            }
            Dialog.prototype.update = function () {
                if (!this.element || !this.element.id) {
                    return;
                }
                this.dialogId = this.element.id;
                this.dialogWrapper = htmlExtensions_23.selectFirstElement('div[role=dialog]', this.element);
                this.dialogInnerContent = htmlExtensions_23.selectFirstElement('[role="document"]', this.element);
                this.openButtons = htmlExtensions_23.selectElements('[data-js-dialog-show=' + this.dialogId + ']');
                this.closeButtons = htmlExtensions_23.selectElements(Dialog.closeSelector, this.element);
                this.dialogInputs = htmlExtensions_23.selectElements(dom_selectors_3.DialogTabbableSelectors, this.element);
                this.customButtons = htmlExtensions_23.selectElements(Dialog.customButtonSelector, this.element);
                this.appendDialog();
                this.container = htmlExtensions_23.selectFirstElement('[data-grid*="container"]');
                this.overlay = htmlExtensions_23.selectFirstElement('[role="presentation"]', this.element);
                this.isScroll = htmlExtensions_23.selectFirstElement(Dialog.scrollSelector, this.element);
                if (htmlExtensions_23.hasClass(this.element, 'f-flow')) {
                    this.isFlowDialog = true;
                }
                if (htmlExtensions_23.hasClass(this.element, 'f-lightbox')) {
                    this.isLightboxDialog = true;
                }
                if (!this.dialogWrapper ||
                    !this.dialogInputs || !this.dialogInputs.length ||
                    !this.container || !this.overlay) {
                    return;
                }
                if (this.isLightboxDialog) {
                    if (this.closeButtons.indexOf(this.overlay) === -1) {
                        this.closeButtons.push(this.overlay);
                    }
                    this.dialogWrapper.removeAttribute('tabIndex');
                    this.dialogInputs.splice(1, 0, this.dialogWrapper);
                    this.shouldCloseOnEscape = true;
                }
                else if (this.isFlowDialog) {
                    for (var index = 0; index < this.closeButtons.length; index++) {
                        var closeButton = this.closeButtons[index];
                        if (htmlExtensions_23.hasClass(closeButton, 'c-glyph') && htmlExtensions_23.hasClass(closeButton, 'glyph-cancel')) {
                            this.closeButtons.push(this.overlay);
                            this.shouldCloseOnEscape = true;
                            break;
                        }
                    }
                    this.dialogInputs.splice(0, 0, this.dialogWrapper);
                }
                this.firstInput = this.dialogInputs[0];
                htmlExtensions_23.addEvent(this.openButtons, htmlExtensions_23.eventTypes.click, this.handleTriggerClick);
                htmlExtensions_23.addEvent(this.openButtons, htmlExtensions_23.eventTypes.keydown, this.handleTriggerKeyDown);
                htmlExtensions_23.addEvent(this.closeButtons, htmlExtensions_23.eventTypes.click, this.hide);
                htmlExtensions_23.addEvent(this.customButtons, htmlExtensions_23.eventTypes.click, this.triggerClickPublish);
                htmlExtensions_23.addEvent(this.element, htmlExtensions_23.eventTypes.keydown, this.onKeydown);
                this.resizeThrottledEventHandler = htmlExtensions_23.addThrottledEvent(window, htmlExtensions_23.eventTypes.resize, this.onResized);
                if (this.element.getAttribute(Dialog.ariaHidden) === 'false') {
                    this.onResized();
                }
            };
            Dialog.prototype.teardown = function () {
                htmlExtensions_23.removeEvent(this.openButtons, htmlExtensions_23.eventTypes.click, this.handleTriggerClick);
                htmlExtensions_23.removeEvent(this.openButtons, htmlExtensions_23.eventTypes.keydown, this.handleTriggerKeyDown);
                htmlExtensions_23.removeEvent(this.closeButtons, htmlExtensions_23.eventTypes.click, this.hide);
                htmlExtensions_23.removeEvent(this.customButtons, htmlExtensions_23.eventTypes.click, this.triggerClickPublish);
                htmlExtensions_23.removeEvent(this.element, htmlExtensions_23.eventTypes.keydown, this.onKeydown);
                htmlExtensions_23.removeEvent(window, htmlExtensions_23.eventTypes.resize, this.resizeThrottledEventHandler);
            };
            Dialog.prototype.publish = function (subscriber, context) {
                switch (context.notification) {
                    case 0:
                        if (subscriber && subscriber.onButtonClicked) {
                            subscriber.onButtonClicked(context);
                        }
                        break;
                    case 1:
                        if (subscriber && subscriber.onShown) {
                            subscriber.onShown();
                        }
                        break;
                    case 2:
                        if (subscriber && subscriber.onHidden) {
                            subscriber.onHidden();
                        }
                        break;
                }
            };
            Dialog.selector = dom_selectors_2.VideoDialogSelectors.DIALOG;
            Dialog.typeName = 'Dialog';
            Dialog.closeSelector = '[data-js-dialog-hide]';
            Dialog.customButtonSelector = 'button[type="button"]';
            Dialog.ariaHidden = 'aria-hidden';
            Dialog.scrollSelector = '.f-dialog-scroll';
            Dialog.heightCalculationValue = 24;
            Dialog.heightCalculationString = 'calc(100% - ' + Dialog.heightCalculationValue.toString() + 'px)';
            Dialog.pageContentContainerSelector = '[data-js-controlledby="dialog"]';
            return Dialog;
        }(publisher_3.Publisher));
        exports.Dialog = Dialog;
    });
    require(['mwf/selectMenu/selectMenu', 'mwf/utilities/componentFactory'], function (selectMenuModule, factoryModule) {
        if (factoryModule.ComponentFactory && factoryModule.ComponentFactory.create) {
            factoryModule.ComponentFactory.create([{ 'component': selectMenuModule.SelectMenu }]);
        }
    });
    require(['mwf/slider/slider', 'mwf/utilities/componentFactory'], function (sliderModule, factoryModule) {
        if (factoryModule.ComponentFactory && factoryModule.ComponentFactory.create) {
            factoryModule.ComponentFactory.create([{ 'component': sliderModule.Slider }]);
        }
    });
    define("standalone-apis/oneplayer-css-loader", ["require", "exports"], function (require, exports) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.OnePlayerCssLoader = void 0;
        var OnePlayerCssLoader = (function () {
            function OnePlayerCssLoader() {
            }
            OnePlayerCssLoader.loadCss = function (market, onLoaded) {
                if (onLoaded && typeof onLoaded === 'function') {
                    if (OnePlayerCssLoader.cssLoaded) {
                        onLoaded();
                    }
                    else {
                        OnePlayerCssLoader.onLoadedCallbacks.push(onLoaded);
                    }
                }
                if (OnePlayerCssLoader.cssLoadTriggered) {
                    return;
                }
                OnePlayerCssLoader.cssLoadTriggered = true;
                market = market || 'en-us';
                if (OnePlayerCssLoader.playerCssHost[0] === '%') {
                    OnePlayerCssLoader.playerCssHost = OnePlayerCssLoader.defaultPlayerCssHost;
                }
                var playerCss = document.createElement('link');
                playerCss.setAttribute('rel', 'stylesheet');
                playerCss.setAttribute('type', 'text/css');
                if (OnePlayerCssLoader.url.indexOf('cached') >= 0) {
                    playerCss.setAttribute('href', OnePlayerCssLoader.playerCssHost + '/'
                        + market + OnePlayerCssLoader.playerCachedCssRoute);
                }
                else if (OnePlayerCssLoader.url.indexOf('cache') >= 0) {
                    var query = OnePlayerCssLoader.url.split('?');
                    if (query.length > 0) {
                        var versionNumber = '0';
                        var vars = query[1].split('&');
                        for (var i = 0; i < vars.length; i++) {
                            var pair = vars[i].split('=');
                            if (pair[0] === 'v') {
                                versionNumber = pair[1];
                            }
                        }
                    }
                    if (versionNumber !== '0') {
                        playerCss.setAttribute('href', OnePlayerCssLoader.playerCssHost + '/' +
                            market + OnePlayerCssLoader.playerCacheCssRoute + '?v=' + versionNumber);
                    }
                    else {
                        playerCss.setAttribute('href', OnePlayerCssLoader.playerCssHost + '/'
                            + market + OnePlayerCssLoader.playerCachedCssRoute);
                    }
                }
                else {
                    playerCss.setAttribute('href', OnePlayerCssLoader.playerCssHost + '/'
                        + market + OnePlayerCssLoader.playerCssRoute);
                }
                playerCss.onload = function () {
                    OnePlayerCssLoader.cssLoaded = true;
                    for (var _i = 0, _a = OnePlayerCssLoader.onLoadedCallbacks; _i < _a.length; _i++) {
                        var callback = _a[_i];
                        callback && callback();
                    }
                };
                playerCss.onerror = function () {
                    OnePlayerCssLoader.cssLoadTriggered = false;
                };
                document.getElementsByTagName('head')[0].appendChild(playerCss);
            };
            OnePlayerCssLoader.playerCssHost = '%playerCssHost%';
            OnePlayerCssLoader.url = '%url%';
            OnePlayerCssLoader.defaultPlayerCssHost = 'https://www.microsoft.com';
            OnePlayerCssLoader.playerCssRoute = '/videoplayer/css/oneplayer.css';
            OnePlayerCssLoader.playerCachedCssRoute = '/videoplayer/css/cached/oneplayer.css';
            OnePlayerCssLoader.playerCacheCssRoute = '/videoplayer/css/cache/oneplayer.css';
            OnePlayerCssLoader.cssLoadTriggered = false;
            OnePlayerCssLoader.cssLoaded = false;
            OnePlayerCssLoader.onLoadedCallbacks = [];
            return OnePlayerCssLoader;
        }());
        exports.OnePlayerCssLoader = OnePlayerCssLoader;
    });
    define("standalone-apis/oneplayer-initialize", ["require", "exports", "constants/enums"], function (require, exports, enums_2) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.VideoPlayerModule = void 0;
        var VideoPlayerModule = (function () {
            function VideoPlayerModule(videoPlayerElement) {
                var _this = this;
                this.bindVideoPlayerEvents = function () {
                    _this.currentVideoPlayerById.addEventListener('play', function (event) {
                        var playBehavior = window.awa && window.awa.behavior && window.awa.behavior.VIDEOSTART || enums_2.awaBehaviorTypes.VIDEOSTART;
                        _this.triggerPageActionOnVideoPlayPauseEvent(event, playBehavior);
                    });
                    _this.currentVideoPlayerById.addEventListener('pause', function (event) {
                        var pauseBehavior = window.awa && window.awa.behavior && window.awa.behavior.VIDEOPAUSE || enums_2.awaBehaviorTypes.VIDEOPAUSE;
                        _this.triggerPageActionOnVideoPlayPauseEvent(event, pauseBehavior);
                    });
                    _this.currentVideoPlayerById.addEventListener('timeupdate', function (event) {
                        var checkpointBehavior = window.awa && window.awa.behavior && window.awa.behavior.VIDEOCHECKPOINT || enums_2.awaBehaviorTypes.VIDEOCHECKPOINT;
                        var currentTime = Math.floor(event.target.currentTime);
                        if (currentTime % enums_2.videoCheckpoint.TIME === 0 && _this.previousTime !== currentTime) {
                            _this.triggerPageActionOnVideoProgressEvent(event, checkpointBehavior);
                            _this.previousTime = currentTime;
                        }
                    });
                    _this.currentVideoPlayerById.addEventListener('ended', function (event) {
                        var endBehavior = window.awa && window.awa.behavior && window.awa.behavior.VIDEOCOMPLETE || enums_2.awaBehaviorTypes.VIDEOCOMPLETE;
                        _this.triggerPageActionOnVideoEndEvent(event, endBehavior);
                    });
                };
                if (videoPlayerElement && videoPlayerElement.dataset && videoPlayerElement.dataset.video) {
                    this.playerContainerElementId = videoPlayerElement.getAttribute("id");
                    this.playerData = JSON.parse(videoPlayerElement.dataset.video);
                    this.originalTelemetryDataObject = null;
                    if (videoPlayerElement && videoPlayerElement.dataset && videoPlayerElement.dataset.m) {
                        this.originalTelemetryDataObject = JSON.parse(videoPlayerElement.dataset.m);
                    }
                    this.videoEventsNotBound = true;
                    this.previousTime = 0;
                    this.previousWatchTimePercentage = 0;
                    this.playerAPI = function (player) {
                        _this.videoPlayer = player;
                        player.addPlayerEventListener(function (e) {
                            if (_this.originalTelemetryDataObject) {
                                if (_this.videoEventsNotBound) {
                                    var currentVideoPlayerByClass = void 0;
                                    if (_this.playerData.options.autoplay) {
                                        currentVideoPlayerByClass = videoPlayerElement.getElementsByClassName("f-video-player");
                                        _this.currentVideoPlayerById = (currentVideoPlayerByClass && currentVideoPlayerByClass.length)
                                            ? currentVideoPlayerByClass[0] instanceof HTMLVideoElement
                                                ? currentVideoPlayerByClass[0] : currentVideoPlayerByClass[0].querySelector(".vjs-tech")
                                            : null;
                                    }
                                    else {
                                        currentVideoPlayerByClass = videoPlayerElement.getElementsByClassName("vjs-tech");
                                        _this.currentVideoPlayerById = (currentVideoPlayerByClass && currentVideoPlayerByClass.length)
                                            ? currentVideoPlayerByClass[0] instanceof HTMLVideoElement
                                                ? currentVideoPlayerByClass[0] : null
                                            : null;
                                    }
                                    if (_this.currentVideoPlayerById instanceof HTMLVideoElement) {
                                        _this.bindVideoPlayerEvents();
                                        _this.videoEventsNotBound = false;
                                    }
                                    else {
                                        _this.videoEventsNotBound = true;
                                    }
                                }
                            }
                        });
                    };
                    this.renderOnePlayer();
                }
            }
            VideoPlayerModule.prototype.renderOnePlayer = function () {
                var _this = this;
                window.MsOnePlayer.render(this.playerContainerElementId, this.playerData, function (player) {
                    _this.playerAPI(player);
                });
            };
            VideoPlayerModule.prototype.createVideoOverrideValues = function (actionTypeValue, behavior) {
                var videoDuration = Math.round(this.currentVideoPlayerById.duration);
                var currentWatchTime = Math.round(this.currentVideoPlayerById.currentTime);
                var currentWatchTimePercentage = Math.round((currentWatchTime * 100) / videoDuration);
                var originalTelemetryDataObject = this.originalTelemetryDataObject;
                var overrideValues = {
                    behavior: behavior,
                    actionType: actionTypeValue,
                    contentTags: {
                        containerName: 'oneplayer',
                        bhvr: behavior,
                        vidnm: originalTelemetryDataObject.vidnm,
                        vidid: originalTelemetryDataObject.vidid,
                        viddur: originalTelemetryDataObject.viddur,
                        vidwt: currentWatchTime,
                        vidpct: currentWatchTimePercentage,
                        id: originalTelemetryDataObject.id,
                        cN: originalTelemetryDataObject.cN,
                        tags: {
                            BiLinkName: originalTelemetryDataObject.tags.BiLinkName
                        }
                    }
                };
                return overrideValues;
            };
            VideoPlayerModule.prototype.triggerPageActionOnVideoPlayPauseEvent = function (event, behavior) {
                var currentWatchTime = Math.round(this.currentVideoPlayerById.currentTime);
                var replayBehavior = window.awa && window.awa.behavior && window.awa.behavior.VIDEOREPLAY || enums_2.awaBehaviorTypes.VIDEOREPLAY;
                var startBehavior = window.awa && window.awa.behavior && window.awa.behavior.VIDEOSTART || enums_2.awaBehaviorTypes.VIDEOSTART;
                var resumeBehavior = window.awa && window.awa.behavior && window.awa.behavior.VIDEOCONTINUE || enums_2.awaBehaviorTypes.VIDEOCONTINUE;
                behavior = currentWatchTime === 0 && this.hasVideoEnded ? replayBehavior : currentWatchTime > 0 && behavior === startBehavior ? resumeBehavior : behavior;
                var overrideValues = this.createVideoOverrideValues("O", behavior);
                this.callPageActionEvent(overrideValues);
            };
            VideoPlayerModule.prototype.triggerPageActionOnVideoProgressEvent = function (event, behavior) {
                var videoDuration = Math.round(this.currentVideoPlayerById.duration);
                var currentWatchTime = Math.round(this.currentVideoPlayerById.currentTime);
                var currentWatchTimePercentage = Math.round((currentWatchTime * 100) / videoDuration);
                var actionType = "AT";
                if (currentWatchTimePercentage !== this.previousWatchTimePercentage) {
                    if (currentWatchTimePercentage > 0 && currentWatchTimePercentage < 100 && currentWatchTimePercentage % enums_2.videoCheckpoint.PERCENTAGE === 0) {
                        var overrideValues = this.createVideoOverrideValues(actionType, behavior);
                        this.callPageActionEvent(overrideValues);
                    }
                    this.previousWatchTimePercentage = currentWatchTimePercentage;
                }
            };
            VideoPlayerModule.prototype.triggerPageActionOnVideoEndEvent = function (event, behavior) {
                this.hasVideoEnded = true;
                var overrideValues = this.createVideoOverrideValues("AT", behavior);
                this.callPageActionEvent(overrideValues);
            };
            VideoPlayerModule.prototype.callPageActionEvent = function (overrideValues) {
                if (overrideValues && window.awa && window.awa.ct && typeof window.awa.ct.captureContentPageAction === 'function') {
                    window.awa.ct.captureContentPageAction(overrideValues);
                }
            };
            VideoPlayerModule.prototype.disposeVideoPlayer = function () {
                if (this.videoPlayer && this.videoPlayer.dispose) {
                    this.videoPlayer.dispose();
                }
            };
            return VideoPlayerModule;
        }());
        exports.VideoPlayerModule = VideoPlayerModule;
    });
    (function (MsOnePlayer) {
        function instantiatePlayerObject(callback) {
            require(['standalone-apis/oneplayer-inline'], function (onePlayerInlineModule) {
                if (onePlayerInlineModule && onePlayerInlineModule.OnePlayerInline) {
                    if (!MsOnePlayer.player) {
                        MsOnePlayer.player = new onePlayerInlineModule.OnePlayerInline();
                    }
                    if (!MsOnePlayer.updatePlayerSource) {
                        MsOnePlayer.updatePlayerSource = updatePlayerSource;
                    }
                    callback();
                }
            });
        }
        function render(playerDivId, playerData, onPlayerReady) {
            require(['standalone-apis/oneplayer-inline'], function (onePlayerInlineModule) {
                if (onePlayerInlineModule && onePlayerInlineModule.OnePlayerInline) {
                    instantiatePlayerObject(function () {
                        MsOnePlayer.player.render(playerDivId, playerData, onPlayerReady);
                    });
                }
            });
        }
        function updatePlayerSource(data) {
            require(['standalone-apis/oneplayer-inline'], function (onePlayerInlineModule) {
                if (onePlayerInlineModule && onePlayerInlineModule.OnePlayerInline) {
                    MsOnePlayer.player.updatePlayerSource(data);
                }
            });
        }
        if (!MsOnePlayer.render) {
            MsOnePlayer.render = render;
        }
    })(window.MsOnePlayer || (window.MsOnePlayer = {}));
    define("standalone-apis/oneplayer-inline", ["require", "exports", "video-player/video-player", "mwf/utilities/htmlExtensions", "mwf/utilities/componentFactory"], function (require, exports, video_player_1, htmlExtensions_24, componentFactory_3) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.OnePlayerInline = void 0;
        var OnePlayerInline = (function () {
            function OnePlayerInline() {
            }
            OnePlayerInline.prototype.render = function (playerDivId, playerData, onPlayerLoaded) {
                var _this = this;
                var playerElement = document.getElementById(playerDivId);
                if (!playerElement) {
                    return;
                }
                this.playerData = playerData;
                var disableAutoLoadData = {
                    options: {
                        autoload: false,
                        adsEnabled: false
                    }
                };
                var oneplayerDiv = document.createElement('div');
                htmlExtensions_24.addClass(oneplayerDiv, 'c-video-player');
                oneplayerDiv.setAttribute('data-player-data', JSON.stringify(disableAutoLoadData));
                playerElement.appendChild(oneplayerDiv);
                componentFactory_3.ComponentFactory.create([{
                        component: video_player_1.VideoPlayer,
                        elements: [oneplayerDiv],
                        callback: function (results) {
                            if (!!results && !!results.length && (results.length === 1)) {
                                _this.playerObject = results[0];
                                _this.playerObject.load(playerData);
                                _this.onPlayerCreated(_this.playerObject, onPlayerLoaded);
                            }
                        }
                    }]);
            };
            OnePlayerInline.prototype.onPlayerCreated = function (playerInstance, onPlayerLoaded) {
                var _this = this;
                if (!playerInstance.currentPlayer) {
                    setTimeout(function () { _this.onPlayerCreated(playerInstance, onPlayerLoaded); }, 50);
                    return;
                }
                onPlayerLoaded && onPlayerLoaded(playerInstance);
            };
            OnePlayerInline.prototype.updatePlayerSource = function (data) {
                this.playerData = data;
                this.playerObject.updatePlayerSource(this.playerData);
            };
            return OnePlayerInline;
        }());
        exports.OnePlayerInline = OnePlayerInline;
    });
    define("utilities/generate-id", ["require", "exports"], function (require, exports) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.uid = void 0;
        function uid() {
            var a = new Uint32Array(3);
            window.crypto.getRandomValues(a);
            return (performance.now().toString(36) + Array.from(a).map(function (A) { return A.toString(36); }).join("")).replace(/\./g, "");
        }
        exports.uid = uid;
    });
    define("video-dialog/video-dialog-initialize", ["require", "exports", "mwf/utilities/componentFactory", "mwf/dialog/dialog", "constants/events", "constants/enums", "constants/class-names", "constants/attributes", "standalone-apis/oneplayer-initialize", "constants/dom-selectors", "utilities/generate-id", "mwf/utilities/htmlExtensions"], function (require, exports, componentFactory_4, dialog_1, events_1, enums_3, class_names_1, attributes_2, oneplayer_initialize_1, dom_selectors_4, generate_id_1, htmlExtensions_25) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.videoDialogInitialize = void 0;
        function videoDialogInitialize(videoDialogContainers) {
            var dialogContainers = new Array();
            if (videoDialogContainers && videoDialogContainers.length) {
                videoDialogContainers.forEach(function (videoDialogContainer) {
                    var videoDialog = videoDialogContainer.querySelector(dom_selectors_4.VideoDialogSelectors.DIALOG);
                    if (videoDialog) {
                        var videoDialogId = "" + enums_3.VideoPlayerIdPrefix.DIALOG + generate_id_1.uid();
                        videoDialog.id = videoDialogId;
                        var dialogButton = videoDialogContainer.querySelector(dom_selectors_4.VideoDialogSelectors.DIALOG_BUTTON);
                        dialogButton.setAttribute('data-js-dialog-show', videoDialogId);
                        dialogContainers.push(videoDialog);
                    }
                });
                componentFactory_4.ComponentFactory.create([{
                        c: dialog_1.Dialog,
                        elements: dialogContainers,
                        callback: function (dialogComponents) {
                            var videoPlayerInstance;
                            var videoDialogTrigger;
                            if (dialogComponents && dialogComponents.length) {
                                Array.prototype.forEach.call(dialogComponents, function (dialogComponent) {
                                    var dialogComponentVideoPlayerCtn = dialogComponent.element.querySelector(dom_selectors_4.VideoSelectors.VIDEO_PLAYER_CTN);
                                    dialogComponent.subscribe({
                                        onShown: function () {
                                            if (dialogComponentVideoPlayerCtn) {
                                                if (window && window.MsOnePlayer) {
                                                    var isInitialized = dialogComponentVideoPlayerCtn.dataset.isInitialized === 'true';
                                                    if (!isInitialized) {
                                                        videoPlayerInstance = new oneplayer_initialize_1.VideoPlayerModule(dialogComponentVideoPlayerCtn);
                                                        if (videoPlayerInstance) {
                                                            dialogComponentVideoPlayerCtn.dataset.isInitialized = 'true';
                                                        }
                                                        videoDialogTrigger = new VideoDialogTrigger(dialogComponent.element);
                                                        videoDialogTrigger.hideSiblingsFromScreenReader();
                                                    }
                                                }
                                            }
                                            dialogComponent.update();
                                        },
                                        onHidden: function () {
                                            if (videoPlayerInstance.videoPlayer && videoPlayerInstance.videoPlayer.dispose) {
                                                videoPlayerInstance.videoPlayer.dispose();
                                            }
                                            if (dialogComponentVideoPlayerCtn) {
                                                dialogComponentVideoPlayerCtn.dataset.isInitialized = false;
                                                while (dialogComponentVideoPlayerCtn.firstChild) {
                                                    dialogComponentVideoPlayerCtn.removeChild(dialogComponentVideoPlayerCtn.lastChild);
                                                }
                                                videoDialogTrigger.removeMWFDialogAttributeFromSiblings();
                                            }
                                        }
                                    });
                                });
                            }
                        },
                        eventToBind: events_1.Events.DOM_CONTENT_LOADED
                    }]);
            }
        }
        exports.videoDialogInitialize = videoDialogInitialize;
        var VideoDialogTrigger = (function () {
            function VideoDialogTrigger(videoDialog) {
                this.hideSiblingsFromScreenReader = this.hideSiblingsFromScreenReader.bind(this);
                this.getSiblings = this.getSiblings.bind(this);
                if (videoDialog) {
                    this.videoDialog = videoDialog;
                    this.dialogSiblings = this.getSiblings(this.videoDialog);
                }
            }
            VideoDialogTrigger.prototype.hideSiblingsFromScreenReader = function () {
                if (this.dialogSiblings) {
                    this.dialogSiblingsHiddenFromSR = this.dialogSiblings.filter(function (siblingElem) {
                        console.log(siblingElem);
                        var ariaHiddenAttr = siblingElem.getAttribute(enums_3.Attributes.ARIA_HIDDEN);
                        if (ariaHiddenAttr !== 'true') {
                            htmlExtensions_25.addAttribute(siblingElem, [attributes_2.MWFJsControlledBy, attributes_2.AriaHiddenTrue]);
                            return siblingElem;
                        }
                    });
                }
            };
            VideoDialogTrigger.prototype.removeMWFDialogAttributeFromSiblings = function () {
                if (this.dialogSiblingsHiddenFromSR) {
                    this.dialogSiblingsHiddenFromSR.forEach(function (element) {
                        element.removeAttribute('data-js-controlledby');
                        if (!element.classList.contains(class_names_1.VideoClassNames.VIDEO_DIALOG) && !element.classList.contains(class_names_1.VideoClassNames.VIDEO_DIALOG_MWF)) {
                            element.removeAttribute(enums_3.Attributes.ARIA_HIDDEN);
                        }
                    });
                }
            };
            VideoDialogTrigger.prototype.getSiblings = function (elem) {
                var siblings = [];
                var sibling = elem.parentNode.firstChild;
                for (; sibling; sibling = sibling.nextSibling) {
                    if (sibling.nodeType === 1 && sibling !== elem && sibling.nodeName !== 'SCRIPT' && sibling.nodeName !== 'NOSCRIPT' && sibling.nodeName !== 'STYLE') {
                        siblings.push(sibling);
                    }
                }
                return siblings;
            };
            return VideoDialogTrigger;
        }());
    });
    define("video-inline/video-inline-initialize", ["require", "exports", "constants/dom-selectors", "constants/class-names", "standalone-apis/oneplayer-initialize", "constants/enums", "utilities/generate-id", "mwf/utilities/htmlExtensions"], function (require, exports, dom_selectors_5, class_names_2, oneplayer_initialize_2, enums_4, generate_id_2, htmlExtensions_26) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.videoInlineInitializeRT = exports.videoInlineInitialize = void 0;
        function videoInlineInitialize(videoInlineContainers) {
            if (videoInlineContainers && videoInlineContainers.length) {
                videoInlineContainers.forEach(function (videoInlineContainer) {
                    var videoPlayerContainer = videoInlineContainer.querySelector(dom_selectors_5.VideoSelectors.VIDEO_PLAYER_CTN);
                    if (videoPlayerContainer) {
                        var videoPlayerContainerId = "" + enums_4.VideoPlayerIdPrefix.INLINE + generate_id_2.uid();
                        videoPlayerContainer.id = videoPlayerContainerId;
                        if (window && window.MsOnePlayer) {
                            var isInitialized = videoPlayerContainer.dataset.isInitialized === 'true';
                            if (!isInitialized) {
                                var videoPlayerInstance = new oneplayer_initialize_2.VideoPlayerModule(videoPlayerContainer);
                                if (videoPlayerInstance) {
                                    videoPlayerContainer.dataset.isInitialized = 'true';
                                }
                            }
                        }
                    }
                });
            }
        }
        exports.videoInlineInitialize = videoInlineInitialize;
        function videoInlineInitializeRT(videoInlineContainers) {
            if (videoInlineContainers && videoInlineContainers.length) {
                var videoPlayerContainer;
                videoInlineContainers.forEach(function (videoInlineContainer) {
                    if (htmlExtensions_26.hasClass(videoInlineContainer, class_names_2.VideoClassNames.VIDEO_PLAYER_CTN)) {
                        videoPlayerContainer = videoInlineContainer;
                    }
                    if (videoPlayerContainer) {
                        var videoPlayerContainerId = "" + enums_4.VideoPlayerIdPrefix.INLINE + generate_id_2.uid();
                        videoPlayerContainer.id = videoPlayerContainerId;
                        if (window && window.MsOnePlayer) {
                            var isInitialized = videoPlayerContainer.dataset.isInitialized === 'true';
                            if (!isInitialized) {
                                var videoPlayerInstance = new oneplayer_initialize_2.VideoPlayerModule(videoPlayerContainer);
                                if (videoPlayerInstance) {
                                    videoPlayerContainer.dataset.isInitialized = 'true';
                                }
                            }
                        }
                    }
                });
            }
        }
        exports.videoInlineInitializeRT = videoInlineInitializeRT;
    });
    define("video-initialize/video-initialize", ["require", "exports", "constants/dom-selectors", "constants/class-names", "constants/enums", "mwf/utilities/htmlExtensions", "video-inline/video-inline-initialize", "video-dialog/video-dialog-initialize"], function (require, exports, dom_selectors_6, class_names_3, enums_5, htmlExtensions_27, video_inline_initialize_1, video_dialog_initialize_1) {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.VideoInitialize = void 0;
        var VideoInitialize = (function () {
            function VideoInitialize() {
                var _this = this;
                this.getVideoContainersByType = function (videoContainers) {
                    var videoContainersToArray = htmlExtensions_27.htmlCollectionToArray(videoContainers);
                    videoContainersToArray.forEach(function (videoContainer) {
                        var type = videoContainer.dataset.videoType;
                        if (type) {
                            switch (type.toLowerCase()) {
                                case enums_5.VideoType.INLINE:
                                    _this.videoInlineContainers.push(videoContainer);
                                    break;
                                case enums_5.VideoType.DIALOG:
                                    _this.videoDialogContainers.push(videoContainer);
                                    break;
                            }
                        }
                        else {
                            var dialogElem = videoContainer.querySelector(dom_selectors_6.VideoDialogSelectors.DIALOG);
                            if (dialogElem) {
                                _this.videoDialogContainers.push(videoContainer);
                            }
                            else if (videoContainer.dataset.video) {
                                var roleAttribute = videoContainer.parentElement.getAttribute('role');
                                if (htmlExtensions_27.hasClass(videoContainer, class_names_3.VideoClassNames.VIDEO_PLAYER_CTN) && roleAttribute !== 'dialog') {
                                    _this.videoInlineContainersRT.push(videoContainer);
                                }
                            }
                        }
                    });
                };
                var videoContainers = document.querySelectorAll(dom_selectors_6.VideoSelectors.VIDEO_CTN);
                var videoContainersRT = document.querySelectorAll(dom_selectors_6.VideoSelectors.VIDEO_CTN_RT);
                var inlineVideoContainersRT = document.querySelectorAll(dom_selectors_6.VideoSelectors.VIDEO_PLAYER_CTN_RT);
                if (videoContainers || videoContainersRT) {
                    this.videoInlineContainers = new Array();
                    this.videoDialogContainers = new Array();
                    this.getVideoContainersByType(videoContainers);
                    this.getVideoContainersByType(videoContainersRT);
                    if (this.videoInlineContainers.length) {
                        video_inline_initialize_1.videoInlineInitialize(this.videoInlineContainers);
                    }
                    if (this.videoDialogContainers.length) {
                        video_dialog_initialize_1.videoDialogInitialize(this.videoDialogContainers);
                    }
                }
                if (inlineVideoContainersRT) {
                    this.videoInlineContainersRT = new Array();
                    this.getVideoContainersByType(inlineVideoContainersRT);
                    if (this.videoInlineContainersRT.length) {
                        video_inline_initialize_1.videoInlineInitializeRT(this.videoInlineContainersRT);
                    }
                }
            }
            return VideoInitialize;
        }());
        exports.VideoInitialize = VideoInitialize;
    });
    require(['video-initialize/video-initialize'], function (videoInit) {
        if (videoInit && videoInit.VideoInitialize) {
            if (document.readyState === "complete" || document.readyState === "interactive") {
                new (videoInit.VideoInitialize);
            }
            else {
                document.addEventListener("DOMContentLoaded", new (videoInit.VideoInitialize), false);
            }
        }
    });
    require(['video-player/video-player', 'mwf/utilities/componentFactory'], function (videoPlayer, factoryModule) {
        if (factoryModule.ComponentFactory && factoryModule.ComponentFactory.create) {
            factoryModule.ComponentFactory.create([{ component: videoPlayer.VideoPlayer }]);
        }
    });

}());
