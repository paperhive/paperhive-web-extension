'use strict';

var gulp   = require('gulp');
var eslint = require('gulp-eslint');
var htmlhint = require('gulp-htmlhint');
var gutil = require('gulp-util');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var _ = require('lodash');
var streamify = require('gulp-streamify');
var uglify = require('gulp-uglify');
var htmlmin = require('gulp-htmlmin');
var minifyCSS = require('gulp-minify-css');
var imagemin = require('gulp-imagemin');
var pngquant = require('imagemin-pngquant');
var less = require('gulp-less');
var browserify = require('browserify');
var shim = require('browserify-shim');
var merge = require('merge-stream');
var zip = require('gulp-zip');

var debug = process.env.DEBUG || false;

var paths = {
  js: 'app/scripts/**.js',
  html: 'app/**.html'
};

// error handling, simplified version (without level) from
// http://www.artandlogic.com/blog/2014/05/error-handling-in-gulp/
function handleError(error) {
  gutil.log(error);
  process.exit(1);
}

// bundle js files + dependencies with browserify
// // (and continue to do so on updates)
// // see
// https://github.com/gulpjs/gulp/blob/master/docs/recipes/fast-browserify-builds-with-watchify.md
function js(watch, file) {
  var watchify = require('watchify');

  var browserifyArgs = _.extend(watchify.args, {debug: true});
  var bundler = browserify(
    './src/scripts/' + file,
    browserifyArgs
  );

  // use shims defined in package.json via 'browser' and 'browserify-shim'
  // properties
  bundler.transform(shim);

  // register watchify
  if (watch) {
    bundler = watchify(bundler);
  }

  function rebundle() {
    return bundler.bundle()
      .on('error', handleError)
      .pipe(source(file))
      .pipe(buffer())
      .pipe(debug ? gutil.noop() : streamify(uglify({
        preserveComments: 'some'
      })))
      .pipe(gulp.dest('build/scripts/'));
  }
  bundler.on('update', rebundle);

  return rebundle();
}

gulp.task('scripts', ['eslint'], function() {
  var background = js(false, 'background.js');
  var popup = js(false, 'popup.js');
  var content = js(false, 'content.js');
  merge(background, popup, content);
});

var imageminOpts = {
  interlaced: true,  // gif
  multipass: true,  // svg
  progressive: true,  // jpg
  svgoPlugins: [{removeViewBox: false}],
  use: [pngquant()]
};

// copy static folders to build directory
gulp.task('static', function() {
  var locales = gulp.src('src/_locales/**')
  .pipe(gulp.dest('build/_locales'));

  var manifest = gulp.src('src/manifest.json')
  .pipe(gulp.dest('build'));

  var fontawesome = gulp.src('bower_components/fontawesome/fonts/*.woff2')
  .pipe(gulp.dest('build/fonts'));

  var roboto = gulp.src('bower_components/roboto-fontface/fonts/*.woff2')
    .pipe(gulp.dest('build/assets/roboto/fonts'));

  var images = gulp.src('src/images/*')
  .pipe(debug ? gutil.noop() : imagemin(imageminOpts))
  .pipe(gulp.dest('build/images'));

  return merge(locales, manifest, fontawesome, roboto, images);
});

gulp.task('eslint', function() {
  return gulp.src(['./src/scripts/*.js'])
  .pipe(eslint())
  .pipe(eslint.format())
  .pipe(eslint.failAfterError());
});

var htmlhintOpts = {
  'doctype-first': false
};
gulp.task('htmlhint', function() {
  return gulp.src(paths.html)
  .pipe(htmlhint(htmlhintOpts))
  .pipe(htmlhint.reporter())
  .pipe(htmlhint.failReporter());
});

var htmlminOpts = {
  collapseWhitespace: true,
  removeComments: true
};
// copy and compress HTML files
gulp.task('html', ['htmlhint'], function() {
  return gulp.src('src/*.html')
  .pipe(debug ? gutil.noop() : htmlmin(htmlminOpts))
  .pipe(gulp.dest('build'));
});

// compile less to css
gulp.task('styles', function() {
  var popup = gulp.src('src/styles/popup.less')
  .pipe(less())
  .on('error', handleError)
  .pipe(debug ? gutil.noop() : minifyCSS({
    restructuring: false
  }))
  .pipe(gulp.dest('build'));
  var content = gulp.src('src/styles/content.less')
  .pipe(less())
  .on('error', handleError)
  .pipe(debug ? gutil.noop() : minifyCSS({
    restructuring: false
  }))
  .pipe(gulp.dest('build'));

  return merge(popup, content);
});

gulp.task('clean', function(cb) {
  var del = require('del');
  del(['build/*'], cb);
  //del(['dist/*'], cb);
});

gulp.task(
  'zip',
  ['html', 'styles', 'static', 'scripts'],
  function() {
    // zip it all up
    var files = 'build/**';
    var zipName = 'paperhive.zip';
    gulp.src(files)
    .pipe(zip(zipName))
    .pipe(gulp.dest('.'));
  }
);

gulp.task('default', ['zip']);
