// needed for assignment to $scope:
/* eslint no-param-reassign: 0 */
'use strict';

// for webpack
require('../popup.html');
require('../styles/popup.less');

const angular = require('angular');
require('angular-moment');
const _ = require('lodash');

const paperhive = angular
.module('paperHive', [
  'angularMoment',
])
.constant('config', require('../../config.json'));

paperhive.controller('PopupCtrl', [
  'config', '$http', '$scope', '$filter',
  (config, $http, $scope, $filter) => {
    function documentToString(doc) {
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
      if (doc.volume) components.push(`volume ${doc.volume}`);
      if (doc.issue) components.push(`issue ${doc.issue}`);
      if (doc.publishedAt) {
        components.push(`published at ${$filter('date')(doc.publishedAt, '')}`);
      }
      return components.join(', ');
    }

    $scope.frontendUrl = config.frontendUrl;

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
    delete $scope.documentData;

    // fetch data from the background script
    chrome.tabs.query(
      { active: true, currentWindow: true },
      tabs => {
        // expose tab url to popup.html
        $scope.$apply(() => { $scope.tabUrl = tabs[0].url; });
        // get document data
        chrome.runtime.sendMessage(
          { command: 'getDocumentData', tabId: tabs[0].id },
          response => $scope.$apply(() => { $scope.documentData = response; })
        );
      }
    );

    // update latestRevision and hasOpenAccessRevision
    $scope.$watch('documentData', documentData => {
      console.log(documentData);
      if (!documentData || !documentData.revisions) {
        $scope.latestRevision = undefined;
        return;
      }
      $scope.latestRevision =
        _.orderBy(documentData.revisions, 'publishedAt', 'desc')[0];
      $scope.latestOpenAccessRevision =
        _.find(documentData.revisions, { isOpenAccess: true });
    });
  },
]);
