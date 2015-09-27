/**
 * @license PaperHive Chrome Extension v0.0.3
 * (c) 2015 Nico Schlömer <nico@paperhive.org>
 * License: GPL-3
 */
'use strict';
(function() {
  var crypto = require('crypto');
  var async = require('async');
  var sources = require('paperhive-sources');
  var config = require('../../config.json');

  var articleData = {};
  var pageUrls = {};
  var responseSender = {};

  var handleResponse = function(err, tabId, article, discussions) {
    if (err) {
      console.error(err);
    }
    // set data
    articleData[tabId] = {
      article: article,
      discussions: discussions
    };
    // set icon
    if (article) {
      chrome.pageAction.show(tabId);
      setColorIcon(tabId);
    }
    // send a response if so required
    if (responseSender[tabId]) {
      responseSender[tabId](articleData[tabId]);
      responseSender[tabId] = null;
    }
  };

  var fetchDiscussions = function(tabId, article, callback) {
    if (!tabId) {
      return callback('Invalid tabId');
    }
    if (article && article._id) {
      // fetch discussions
      var url = config.apiUrl + '/articles/' + article._id + '/discussions/';
      fetch(url).then(function(response) {
        return response.json();
      }).then(function(data) {
        return callback(null, tabId, article, data);
      }).catch(function(err) {
        console.error(err.message);
        return callback('Unexpected error when fetching ' + url);
      });
    } else {
      return callback(null, tabId, article);
    }
  };

  var setColorIcon = function(tabId) {
    chrome.pageAction.setIcon({
      path: {
        '19': 'images/icon-19.png',
        '38': 'images/icon-38.png'
      },
      tabId: tabId
    });
  };

  // from <http://stackoverflow.com/a/21042958/353337>
  var extractHeader = function(headers, headerName) {
    for (var i = 0; i < headers.length; ++i) {
      var header = headers[i];
      if (header.name.toLowerCase() === headerName) {
        return header;
      }
    }
  };

  // https://developer.chrome.com/extensions/events#filtered
  var whitelistToFilter = function(whitelist) {
    var filterList = [];
    for (var i = 0; i < whitelist.length; i++) {
      filterList.push({hostSuffix: whitelist[i]});
    }
    return filterList;
  };

  var getArticlebyUrl = function(tabId, url) {
    return function(callback) {
      var xhr = new XMLHttpRequest();
      xhr.open(
        'GET',
        config.apiUrl + '/articles/sources?handle=' + url,
        true
      );
      xhr.responseType = 'json';
      xhr.onload = function() {
        if (this.status === 200) {
          return callback(null, tabId, this.response);
        } else {
          return callback(null, tabId, null);
        }
      };
      xhr.send(null);
    };
  };

  // The onUpdated listener is triggered when a tab completed loading. Fetching
  // article sources and such all happens *before* that. Hence, do *not*
  // override the articleData here.
  //chrome.tabs.onUpdated.addListener(
  //  function(tabId) {
  //    articleData[tabId] = undefined;
  //    pageUrls[tabId] = [];
  //  }
  //);

  // Use webNavigation here since we use page actions. To `show` a page action,
  // one needs to be sure that the omnibox isn't updated anymore. This state is
  // not tracked by webRequest, see
  // <http://stackoverflow.com/a/30004730/353337>.
  chrome.webNavigation.onCommitted.addListener(
    function(details) {
      if (!articleData[details.tabId]) {
        async.waterfall(
          [
            getArticlebyUrl(details.tabId, details.url),
            fetchDiscussions
          ],
          handleResponse
        );
      }
    },
    {
      url: whitelistToFilter(sources.hostnames),
      types: ['main_frame']
    }
  );

  // Chrome 42 doesn't properly fire chrome.webRequest.onCompleted/main_frame
  // when loading a PDF page. When it's served from cache, it does.
  // See <https://code.google.com/p/chromium/issues/detail?id=481411>.
  chrome.webRequest.onCompleted.addListener(
    function(details) {
      if (!articleData[details.tabId]) {
        var header = extractHeader(details.responseHeaders, 'content-type');
        var mimetype = header && header.value.split(';', 1)[0];
        if (mimetype === 'application/pdf') {
          async.waterfall(
            [
              function getPdfHash(callback) {
                // Since we have no access to the PDF data, we have to
                // fetch it again and hope it gets served from cache.
                var xhr = new XMLHttpRequest();
                xhr.open('GET', details.url, true);
                xhr.responseType = 'blob';
                xhr.onload = function() {
                  if (this.status === 200) {
                    // read the blob data, cf.
                    // <http://www.html5rocks.com/en/tutorials/file/xhr2/>
                    var a = new FileReader();
                    a.readAsBinaryString(this.response);
                    a.onloadend = function() {
                      var hash = crypto.createHash('sha1');
                      hash.update(a.result, 'binary');
                      return callback(null, hash.digest('hex'));
                    };
                  } else {
                    return callback('Could not fetch PDF.');
                  }
                };
                xhr.send(null);
              },
              function checkBySha(hash, callback) {
                var xhr = new XMLHttpRequest();
                xhr.open(
                  'GET',
                  config.apiUrl + '/articles/bySha/' + hash,
                  true
                );
                xhr.responseType = 'json';
                xhr.onload = function() {
                  if (this.status === 200) {
                    return callback(null, details.tabId, this.response);
                  } else if (this.status === 404) {
                    return callback('PDF not found on PaperHive (404)');
                  } else {
                    return callback('Unexpected return value');
                  }
                };
                xhr.send(null);
              },
              fetchDiscussions
            ],
            handleResponse
          );
        } else if (mimetype === 'text/html') {
          // check content for hrefs that match the whitelist
        }
      }
    },
    {
      urls: ['*://*/*'],
      types: ['main_frame']
    },
    ['responseHeaders']
  );

  // add listener for content script communication
  chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
      var tabId = request.activeTabId || sender.tab.id;
      if (tabId) {
        if (request.getArticleData) {
          // The tab ID is either in the sender (if a content script sent the
          // request) or in the request.activeTabId (if popup.js sent the
          // request).
          if (articleData[tabId]) {
            // send immediately since the tab is fully loaded
            sendResponse(articleData[tabId]);
          } else {
            // send later, cf.
            // <http://stackoverflow.com/a/30020271/353337>
            responseSender[tabId] = sendResponse;
            // returning `true` to indicate that we intend to send later, cf.
            // <https://developer.chrome.com/extensions/runtime#event-onMessage>
            return true;
          }
        }

        if (request.askAboutPageUrls) {
          sendResponse({needPageUrls: !articleData[tabId]});
        }

        if (request.pageUrls) {
          console.log(request.pageUrls);
          pageUrls[tabId] = request.pageUrls;
          for (var i = 0; i < pageUrls[tabId].length; i++) {
            console.log(pageUrls[tabId][i]);
          }
        }
      } else {
        console.error('Could not find tab ID.');
      }
    }
  );
})();
