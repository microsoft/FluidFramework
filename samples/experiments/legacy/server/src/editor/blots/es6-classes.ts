// TODO - Quill assumes es6 and a webpack environment. I"m assuming TypeScript + Browserify. I"m not sure
// yet how to extend an es6 class, defined as a variable (the Quill.import above), inside of TypeScript. So
// cheating a bit for now and just using the babel output.
export function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
        throw new TypeError("Cannot call a class as a function");
    }
}

export function _possibleConstructorReturn(self, call) {
    if (!self) {
        throw new ReferenceError("this hasn\"t been initialised - super() hasn\"t been called");
    }
    return call && (typeof call === "object" || typeof call === "function") ? call : self;
}

export function _inherits(subClass, superClass) {
    if (typeof superClass !== "function" && superClass !== null) {
        throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
    }
    subClass.prototype = Object.create(superClass && superClass.prototype, {
        constructor: {
            configurable: true,
            enumerable: false,
            value: subClass,
            writable: true,
        },
    });
    if (superClass) {
        Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass;
    }
}
