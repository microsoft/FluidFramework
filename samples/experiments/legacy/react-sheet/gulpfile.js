/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

var browserify = require('browserify');
var del        = require('del');
var gulp       = require('gulp');
var source     = require('vinyl-source-stream');
var header     = require('gulp-header');
var eslint     = require('gulp-eslint');
var rename     = require('gulp-rename');
var plumber    = require('gulp-plumber');
var react      = require('gulp-react');
var streamify  = require('gulp-streamify');
var uglify     = require('gulp-uglify');
var gutil      = require('gulp-util');
var connect    = require('gulp-connect');
var reactify   = require('reactify');

var pkg = require('./package.json');
var devBuild = (process.env.NODE_ENV === 'production') ? '' : ' (dev build at ' + (new Date()).toUTCString() + ')';
var distHeader = '/*!\n\
 * <%= pkg.name %> <%= pkg.version %><%= devBuild %> - <%= pkg.homepage %>\n\
 * <%= pkg.license %> Licensed\n\
 */\n';

var jsSrcPaths = './src/*.js*'
var jsLibPaths = './lib/*.js'

gulp.task('clean-lib', function (cb) {
    del(jsLibPaths).then(function () {
        cb();
    });
});

gulp.task('transpile-js', ['clean-lib'], function () {
    return gulp.src(jsSrcPaths)
        .pipe(plumber())
        .pipe(react({ harmony: true }))
        .pipe(gulp.dest('./lib'));
});

gulp.task('lint-js', ['transpile-js'], function () {
    return gulp.src(jsLibPaths)
        .pipe(eslint('./.eslintrc.json'));
        //.pipe(eslint.reporter('eshint-stylish'));
});

gulp.task('bundle-js', ['lint-js'], function () {
    var b = browserify(pkg.main, {
        debug: !!gutil.env.debug
        , standalone: pkg.standalone
        , detectGlobals: false
    });

    b.transform('browserify-shim')

    var stream = b.bundle()
        .pipe(source('spreadsheet.js'))
        .pipe(streamify(header(distHeader, { pkg: pkg, devBuild: devBuild })))
        .pipe(gulp.dest('./dist'));

    if (process.env.NODE_ENV === 'production') {
        stream = stream
            .pipe(rename('spreadsheet.min.js'))
            .pipe(streamify(uglify()))
            .pipe(streamify(header(distHeader, { pkg: pkg, devBuild: devBuild })))
            .pipe(gulp.dest('./dist'));
    }

    return stream;
});

gulp.task('watch', function () {
    gulp.watch(jsSrcPaths, ['bundle-js']);
});

gulp.task('connect', function () {
    connect.server();

    gutil.log('--------------------------------------------')
    gutil.log(gutil.colors.magenta('To see the example, open up a browser and go'));
    gutil.log(gutil.colors.bold.red('to http://localhost:8080/example'));
    gutil.log('--------------------------------------------');
});

gulp.task('example', ['transpile-js'], function () {
    return browserify('./example.js')
        .transform(reactify)
        .bundle()
        .pipe(source('bundle.js'))
        .pipe(gulp.dest('./example'));
});

gulp.task('default', ['bundle-js', 'connect', 'watch']);
