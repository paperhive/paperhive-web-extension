/**
 * @license PaperHive Chrome Extension v0.0.1
 * (c) 2015 Nico Schlömer <nico.schloemer@gmail.com>
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
      chrome.tabs.query(
        {
          active: true,
          currentWindow: true
        },
        function(tabs) {
          chrome.runtime.sendMessage(
            {getInfo: true, activeTabId: tabs[0].id},
            function(response) {
              // for some reason, we need $apply here
              $scope.$apply(function() {
                $scope.article.meta = response.article;
                $scope.article.discussions = response.discussions;

                $scope.submitApproved = function() {
                  $scope.submitting = true;
                  $http.post(config.apiUrl + '/articles/sources', undefined, {
                    params: {handle: tabs[0].url},
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
                };
              });
            }
          );
        });
    }]);
})();
