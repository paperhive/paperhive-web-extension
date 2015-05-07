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
                $scope.isWhitelistedHost = response.isWhitelisted;

                // Needs authorization.
                // TODO figure out what we can do here
                $scope.submitApproved = function() {
                  $scope.submitting = true;
                  $http.post(config.apiUrl + '/articles/sources', undefined, {
                    params: {handle: tabs[0].url},
                  })
                  .success(function() {
                    $scope.submitting = false;
                  })
                  .error(function() {
                    $scope.submitting = false;
                  });
                };
              });
            }
          );
        });
    }]);
})();
