// needed for assignment to $scope:
/* eslint no-param-reassign: 0 */
'use strict';

// for webpack
require('../popup.html');
require('../styles/popup.less');

const angular = require('angular');
require('angular-moment');

const paperhive = angular
.module('paperHive', [
  'angularMoment',
])
.constant('config', require('../../config.json'));

paperhive.controller('PopupCtrl', [
  'config', '$http', '$scope', '$filter',
  (config, $http, $scope, $filter) => {
    const documentToString = (doc) => {
      // Translate a document to a nicely formatted string to be used in a
      // sentence.
      const components = [];
      if (doc.publisher) {
        components.push(doc.publisher);
      } else if (doc.remote.type === 'arxiv') {
        components.push('arXiv');
        if (doc.remote.revision) {
          components.push(doc.remote.revision);
        }
      }
      if (doc.journal) {
        if (doc.journal.nameLong) {
          components.push(doc.journal.nameLong);
        } else if (doc.journal.nameShort) {
          components.push(doc.journal.nameShort);
        }
      }
      if (doc.volume) {components.push(`volume ${doc.volume}`);}
      if (doc.issue) {components.push(`issue ${doc.issue}`);}
      if (doc.publishedAt) {
        components.push(`published at ${$filter('date')(doc.publishedAt, '')}`);
      }
      return components.join(', ');
    };

    $scope.frontendUrl = config.frontendUrl;
    $scope.document = {};

    $scope.submitApproved = (url) => {
      if (url) {
        $scope.submitting = true;
        $http.post(`${config.apiUrl}/documents/url/`, undefined, {
          q: { xhandle: url },
        })
        .success((document) => {
          $scope.submitting = false;
          chrome.tabs.create({
            url: `${config.frontendUrl}/documents/${document.id}`,
          });
        })
        .error((data) => {
          $scope.submitting = false;
          let message;
          if (data && data.message) {
            message = data.message;
          } else {
            message = 'could not add document (unknown reason)';
          }
          // notificationService.notifications.push({
          //   type: 'error',
          //   message: message
          // });
        });
      }
    };

    // reset document data
    $scope.document = undefined;
    $scope.latestText = undefined;

    // fetch data from the background script
    chrome.tabs.query(
      {
        active: true,
        currentWindow: true,
      },
      (tabs) => {
        // expose tab url to popup.html
        // We need $apply here, see, e.g.,
        // <http://jimhoskins.com/2012/12/17/angularjs-and-apply.html>.
        $scope.$apply(() => {
          $scope.tabUrl = tabs[0].url;
        });
        // get document data
        chrome.runtime.sendMessage(
          {
            getDocumentData: true,
            activeTabId: tabs[0].id,
          },
          (response) => {
            // same as above
            $scope.$apply(() => {
              $scope.document = response;
              $scope.latestText = documentToString(
                response.revisions[response.revisions.length - 1]
              );
            });
          }
        );
      }
    );
  },
]);
