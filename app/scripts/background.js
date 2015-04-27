'use strict';

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
    ////window.alert('Tutti completti');
    console.info('URL: ' + details.url);
    if (details.tabId !== -1) {
      var header = getHeaderFromHeaders(
        details.responseHeaders,
        'content-type'
      );
      // If the header is set, use its value. Otherwise, use undefined.
      tabToMimeType[details.tabId] = header && header.value.split(';', 1)[0];
    }
    //window.alert(details.responseHeaders);
    if (tabToMimeType[details.tabId] === 'application/pdf') {
      //window.alert(details.url);
      // fetch the PDF again (hopefully from cache)
      var xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function() {
        //window.alert('change <' + xhr.readyState + ' ' +  xhr.status + '>');
        //if (xhr.readyState === 4 && xhr.status === 200) {
        if (xhr.readyState === 4) {
          //window.alert('hit me baby one more time <' + xhr.responseText + '>');
          //callback(xhr.responseText);
        }
      };
      xhr.open(
        'GET',
        details.url,
        true
      );
      xhr.send();
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
