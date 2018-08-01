var fs = require('fs');
var browserify = require('browserify');

var gulp = require('gulp');
var gutil = require('gulp-util');
var uglify = require('gulp-uglify');
var header = require('gulp-header');
var rename = require('gulp-rename');
var transform = require('vinyl-transform');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');

var pkg = require('./package.json');

gulp.task('default', [ 'web', 'cordova' ]);
gulp.task('web', dist([ './platform/web' ], 'web'));
gulp.task('cordova', dist([ './platform/cordova' ], 'cordova'));

function dist(files, name) {
  return function() {
    var task = browserify({
      entries : files,
      standalone : 'Stage'
    });
    task = task.transform({
      fromString : true,
      compress : false,
      mangle : false,
      output : {
        beautify : true,
        comments : /^((?!@license)[\s\S])*$/i
      }
    }, 'uglifyify');
    task = task.bundle();
    task.on('error', function(err) {
      console.log(gutil.colors.red(err.message));
      this.emit('end');
    });
    task = task.pipe(source('stage.' + name + '.js')).pipe(buffer()); // vinylify
    task = task.pipe(header(fs.readFileSync('lib/license.js'), {
      pkg : pkg
    }));
    task = task.pipe(gulp.dest('dist'));
    task = task.pipe(rename('stage.' + name + '.min.js'));
    task = task.pipe(uglify({
      output : {
        comments : /(license|copyright)/i
      }
    }));
    task = task.pipe(gulp.dest('dist'));
    return task;
  };
}