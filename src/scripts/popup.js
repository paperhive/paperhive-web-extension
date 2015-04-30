'use strict';

var angular = require('angular');

var paperhive = angular
.module('paperHive', [])
.constant('config', require('../../config.json'));

paperhive.controller('PopupCtrl', [
  'config', '$http', '$scope',
  function(config, $http, $scope) {
  var bg = chrome.extension.getBackgroundPage();
  $scope.frontendUrl = config.frontendUrl;
  $scope.article = {};
  chrome.tabs.query(
    {
      active: true,
      currentWindow: true
    },
    function(tabs) {
      // for some reason, we need $apply here
      $scope.$apply(function() {
        $scope.article.meta = bg.tabToArticle[tabs[0].id];
        $scope.article.discussions = bg.tabToDiscussions[tabs[0].id];
        $scope.isPdf = (bg.tabToMimeType[tabs[0].id] === 'application/pdf');
        // URL parsing in JS: <https://gist.github.com/jlong/2428561>
        var parser = document.createElement('a');
        parser.href = tabs[0].url;
        $scope.isWhitelistedHost = (parser.hostname === 'arxiv.org');

        // Needs authorization.
        // TODO figure out what we can do here
        $scope.submitApproved = function() {
          console.log('submitting...');
          $scope.submitting = true;
          $http.post(config.apiUrl + '/articles/sources', undefined, {
            params: {handle: tabs[0].url},
          })
          .success(function(article) {
            $scope.submitting = false;
            console.log('success');
            //$location.path('/articles/' + article._id);
          })
          .error(function(data) {
            $scope.submitting = false;
            console.log('error');
            //notificationService.notifications.push({
            //  type: 'error',
            //  message: data.message || 'could not add article (unknown reason)'
            //});
          });
        };
      });
    });

  }]);
