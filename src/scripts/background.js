'use strict';

var crypto = require('crypto');

//chrome.runtime.onInstalled.addListener(function(details) {
//  console.log('previousVersion', details.previousVersion);
//});
//
//chrome.tabs.onUpdated.addListener(function(tabId) {
//  chrome.pageAction.show(tabId);
//});
//
//console.log('\'Allo \'Allo! Event Page for Page Action');

// -------------------------------------------------------------------------
// from <http://stackoverflow.com/a/21042958/353337>
function getHeaderFromHeaders(headers, headerName) {
  for (var i = 0; i < headers.length; ++i) {
    var header = headers[i];
    if (header.name.toLowerCase() === headerName) {
      return header;
    }
  }
}

var tabToMimeType = {};
chrome.webRequest.onHeadersReceived.addListener(
  function(details) {
    if (details.tabId !== -1) {
      var header = getHeaderFromHeaders(
        details.responseHeaders,
        'content-type'
      );
      // If the header is set, use its value. Otherwise, use undefined.
      tabToMimeType[details.tabId] = header && header.value.split(';', 1)[0];
    }
  },
  {
    urls: ['*://*/*'],
    types: ['main_frame']
  },
  ['responseHeaders']
);

chrome.webRequest.onCompleted.addListener(
  function(details) {
    if (details.tabId !== -1) {
      var header = getHeaderFromHeaders(
        details.responseHeaders,
        'content-type'
      );
      // If the header is set, use its value. Otherwise, use undefined.
      tabToMimeType[details.tabId] = header && header.value.split(';', 1)[0];
    }

    if (tabToMimeType[details.tabId] === 'application/pdf') {
      // fetch the PDF again (hopefully from cache)
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
            var hashValue = hash.digest('hex');
            console.log(hashValue);
            // check if the paper is on paperhive
            var xhr2 = new XMLHttpRequest();
            var paperHive = 'https://paperhive.org/dev/backend/branches/master';
            xhr2.open('GET', paperHive + '/articles/bySha/' + hashValue, true);
            xhr2.responseType = 'json';
            xhr2.onload = function() {
              if (this.status === 200) {
                console.log('found the paper!');
                console.log(xhr2.response);
              } else if (this.status === 404) {
                console.log('didn\'t find the paper!');
              }
            };
            xhr2.send(null);
          };
        }
      };
      xhr.send(null);
    }
  },
  {
    urls: ['*://*/*'],
    types: ['main_frame']
  },
  ['responseHeaders']
);

//chrome.browserAction.onClicked.addListener(
//  function(tab) {
//    window.alert(
//      'Tab with URL ' + tab.url + ' has MIME-type ' + tabToMimeType[tab.id]
//    );
//  }
//);
// -------------------------------------------------------------------------
