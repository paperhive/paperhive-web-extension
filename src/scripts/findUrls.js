/**
 * @license PaperHive Chrome Extension v0.0.3
 * (c) 2015 Nico Schlömer <nico@paperhive.org>
 * License: GPL-3
 */
'use strict';

(function() {

  var _ = require('lodash');
  var config = require('../../config.json');

  // discover whitelisted hrefs
  var links = document.getElementsByTagName('a');
  var matchingUrls = [];
  for (var i = 0; i < links.length; ++i) {
    if (config.whitelistedHostnames.indexOf(links[i].hostname) >= 0) {
      matchingUrls.push(links[i].href);
    }
  }

  // send the URLs to the background script
  chrome.runtime.sendMessage({pageUrls: _.uniq(matchingUrls)});

})();
