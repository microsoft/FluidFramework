var gulp = require("gulp");
var browserify = require("browserify");
var source = require("vinyl-source-stream");
var tsify = require("tsify");
var plumber = require('gulp-plumber');
var ts = require("gulp-typescript");
var tsProject = ts.createProject("tsconfig.json");
var clean = require("gulp-clean");
var sourcemaps = require('gulp-sourcemaps');
var path = require('path');

// Cleans up generated files
gulp.task("clean", function() {
    return gulp.src(['dist', 'public/dist'], { read: false })        
        .pipe(clean());
})

// Builds the server side JavaScript
gulp.task("build", function () {
    var errors = false;

    return gulp.src(['src/**/*.ts', 'typings/index.d.ts'])
        .pipe(plumber(function() { errors = true; } ))      
        .pipe(sourcemaps.init())
        .pipe(ts(tsProject))
        .js
        .pipe(sourcemaps.write('.', { includeContent: false, sourceRoot: function(file) {                         
            return path.join(file.cwd, './src'); 
        } }))    
        .pipe(gulp.dest("dist"))
        .on('end', function() {
            if (errors) {
                console.error("Build failed");
                process.exit(1);
            } 
        })
});

// Creates client side JavaScript files
gulp.task("browserify", function() {
    return browserify({
            basedir: '.',
            debug: true,
            entries: ['src/host.ts'],
            cache: {},
            packageCache: {}
        })
        .plugin(tsify)
        .bundle()
        .pipe(source('host.js'))
        .pipe(gulp.dest("public/dist"))
});

gulp.task("default", ["build", "browserify"]);