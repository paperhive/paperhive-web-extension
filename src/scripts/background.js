/**
 * @license PaperHive Chrome Extension v0.0.3
 * (c) 2015 Nico Schlömer <nico@paperhive.org>
 * License: GPL-3
 */
'use strict';
(function() {
  var crypto = require('crypto');
  var async = require('async');
  var config = require('../../config.json');

  var sources = require('paperhive-sources');
  // https://developer.chrome.com/extensions/events#filtered
  var urlFilter = [];
  sources.hostnames.forEach(function(hostname) {
    urlFilter.push({hostSuffix: hostname});
  });

  var articleData = {};
  var pageUrls = {};
  var responseSender = {};

  var checkArticle = function(url, tabId) {
    return function(callback) {
      fetch(url).then(function(response) {
        if (response.ok) {
          setColorIcon(tabId);
          response.json().then(function(json) {
            // set tab data for communication with the popup script
            if (!(tabId in articleData)) {
              articleData[tabId] = {};
            }
            articleData[tabId].article = json;
            return callback(null, json);
          });
        } else {
          return callback(null, null);
        }
      }).catch(function(err) {
        console.error(err.message);
        return callback('Unexpected error when fetching ' + url);
      });
    };
  };

  var checkDiscussions = function(tabId) {
    return function(article, callback) {
      if (article && article._id) {
        // fetch discussions
        var url = config.apiUrl + '/articles/' + article._id + '/discussions/';
        fetch(url).then(function(response) {
          response.json().then(function(discussions) {
            // set icon
            if (discussions && discussions.length > 0) {
              //chrome.browserAction.setBadgeBackgroundColor([255, 0, 0, 255]);
              var badge;
              if (discussions.length < 1000) {
                badge = discussions.length.toString();
              } else {
                badge = '999+';
              }
              chrome.browserAction.setBadgeText({
                text: badge,
                tabId: tabId
              });
            }
            // set data
            articleData[tabId].discussions = discussions;
            return callback(null, discussions);
          });
        }).catch(function(err) {
          console.error(err.message);
          return callback('Unexpected error when fetching ' + url);
        });
      } else {
        return callback(null);
      }
    };
  };

  var responseData = function(tabId) {
    return function(err) {
      if (err) {
        console.error(err);
      }
      // If the user clicks on the extension icon before the data is loaded,
      // the data communication request is delayed until the data is available.
      // Namely here! :)
      // Fulfill the promise and remove the sender afterwards.
      if (responseSender[tabId]) {
        // send the data
        responseSender[tabId](articleData[tabId]);
        // remove the dangling request
        responseSender[tabId] = null;
      }
    };
  };

  var setColorIcon = function(tabId) {
    chrome.browserAction.setIcon({
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

  //// create data item
  //chrome.tabs.onCreated.addListener(
  //  function(tab) {
  //    console.log('tabs.onCreated ' + tab.id);
  //    articleData[tab.id] = {};
  //  }
  //);

  // clean up after tab close
  chrome.tabs.onRemoved.addListener(
    function(tabId) {
      console.log('tabs.onRemoved ' + tabId);
      articleData[tabId] = undefined;
      pageUrls[tabId] = [];
    }
  );

  // We could actually handle all this already at onBeforeNavigate, but Chrome
  // appartently redraws the extension icons at that time, too. This way, the
  // setColorIcon would sometimes have no effect. As a workaround, just draw a
  // little bit later, namely at onCommitted.
  chrome.webNavigation.onCommitted.addListener(
    function(details) {
      var url = config.apiUrl + '/articles/sources?handle=' + details.url;
      async.waterfall(
        [
          checkArticle(url, details.tabId),
          checkDiscussions(details.tabId)
        ],
        responseData(details.tabId)
      );
    },
    {
      url: urlFilter,
      types: ['main_frame']
    }
  );

  var computeHash = function(url, hashType) {
    return function(callback) {
      fetch(url).then(function(response) {
        return response.blob();
      }).then(function(data) {
        // read the blob data, cf.
        // <https://developer.mozilla.org/en/docs/Web/API/FileReader>
        var a = new FileReader();
        a.readAsBinaryString(data);
        a.onloadend = function() {
          var hash = crypto.createHash(hashType);
          hash.update(a.result, 'binary');
          return callback(null, hash.digest('hex'));
        };
      }).catch(function(err) {
        console.error(err.message);
        return callback(
          'Unexpected error when fetching ' + url
        );
      });
    };
  };

  // TODO
  // Check <http://stackoverflow.com/a/27771671/353337> for a complete rundown
  // of how to detect if a page serves PDF content.
  //
  // Unfortnately, Chrome 42 doesn't properly fire
  // chrome.webRequest.onCompleted/main_frame when loading a PDF page. When
  // it's served from cache, it does. See
  // <https://code.google.com/p/chromium/issues/detail?id=481411>.
  chrome.webRequest.onCompleted.addListener(
    function(details) {
      var header = extractHeader(details.responseHeaders, 'content-type');
      var mimetype = header && header.value.split(';', 1)[0];
      if (mimetype === 'application/pdf') {
        async.waterfall(
          [
            // Since we have no access to the PDF data, we have to fetch it
            // again and hope it gets served from cache.
            // TODO come up with something smarter here
            computeHash(details.url, 'sha1'),
            function checkArticleBySha(hash, callback) {
              var url = config.apiUrl + '/articles/bySha/' + hash;
              return checkArticle(url, details.tabId)(callback);
            },
            checkDiscussions(details.tabId)
          ],
          responseData(details.tabId)
        );
      } else if (mimetype === 'text/html') {
        // check content for hrefs that match the whitelist
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
      // The tab ID is either in the sender (if a content script sent the
      // request) or in the request.activeTabId (if popup.js sent the request).
      var tabId = request.activeTabId || sender.tab.id;
      if (tabId) {
        if (request.getArticleData) {
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

        //if (request.askAboutPageUrls) {
        //  sendResponse({needPageUrls: !articleData[tabId]});
        //}

        //if (request.pageUrls) {
        //  console.log(request.pageUrls);
        //  pageUrls[tabId] = request.pageUrls;
        //  for (var i = 0; i < pageUrls[tabId].length; i++) {
        //    console.log(pageUrls[tabId][i]);
        //  }
        //}
      } else {
        console.error('Invalid tab ID.');
      }
    }
  );

  // A function creator for callbacks
  function searchTitleOnPaperhive(meta) {
    var key = 'citation_title';
    console.log(meta[key]);
    //var url = config.apiUrl + '/articles/?q=' + meta[key];
    var url = config.apiUrl + '/articles/?q=Creating';

    // curl https://paperhive.org/dev/backend/branches/master/articles/?q=Creating
    //
    fetch(url)
    .then(function(response) {
      if (response.ok) {
        response.json().then(function(json) {
          // TODO do something with the result
        });
      } else {
        console.error(
          'Query unsuccessful (\'' + response.status + ', ' +
            response.statusText + '\').'
        );
      }
    })
    .catch(function(err) {
      console.error(err.message);
      //return callback('Unexpected error when fetching ' + url);
    });
  }

  chrome.webNavigation.onCompleted.addListener(
    function(details) {
      chrome.tabs.sendMessage(
        details.tabId,
        {keys: ['citation_title']},
        searchTitleOnPaperhive
      );
    },
    {
      types: ['main_frame']
    }
  );

})();
