/**
 * @license PaperHive Chrome Extension v0.0.3
 * (c) 2015 Nico Schlömer <nico@paperhive.org>
 * License: GPL-3
 */
'use strict';

(function() {
  var angular = require('angular');

  var paperhive = angular
  .module('paperHive', [])
  .constant('config', require('../../config.json'));

  paperhive.controller('PopupCtrl', [
    'config', '$http', '$scope',
    function(config, $http, $scope) {
      $scope.frontendUrl = config.frontendUrl;
      $scope.article = {};

      $scope.submitApproved = function(url) {
        if (url) {
          $scope.submitting = true;
          $http.post(config.apiUrl + '/articles/sources', undefined, {
            params: {handle: url},
          })
          .success(function(article) {
            $scope.submitting = false;
            chrome.tabs.create({
              url: config.frontendUrl + '/articles/' + article._id
            });
          })
          .error(function(data) {
            $scope.submitting = false;
            var message;
            if (data && data.message) {
              message = data.message;
            } else {
              message = 'could not add article (unknown reason)';
            }
            //notificationService.notifications.push({
            //  type: 'error',
            //  message: message
            //});
          });
        }
      };

      // fetch data from the background script
      chrome.tabs.query(
        {
          active: true,
          currentWindow: true
        },
        function(tabs) {
          // expose tab url to popup.html
          // We need $apply here, see, e.g.,
          // <http://jimhoskins.com/2012/12/17/angularjs-and-apply.html>.
          $scope.$apply(function() {
            $scope.tabUrl = tabs[0].url;
          });
          // get article data
          chrome.runtime.sendMessage(
            {getArticleData: true, activeTabId: tabs[0].id},
            function(response) {
              // same as above
              $scope.$apply(function() {
                $scope.article.meta = response.article;
                $scope.article.discussions = response.discussions;
              });
            }
          );
        }
      );
    }]);
})();
