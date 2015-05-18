/**
 * @license PaperHive Chrome Extension v0.0.3
 * (c) 2015 Nico Schlömer <nico@paperhive.org>
 * License: GPL-3
 */
'use strict';

(function() {

  var _ = require('lodash');
  var sources = require('paperhive-sources');
  //var config = require('../../config.json');

  // check if we need the URLs
  chrome.runtime.sendMessage(
    {askAboutPageUrls: true},
    function(response) {
      console.log(response);
      if (response.needPageUrls) {
        var links = document.getElementsByTagName('a');
        var matchingUrls = [];
        for (var i = 0; i < links.length; ++i) {
          if (sources.parseUrconfig.whitelistedHostnam) {
            matchingUrls.push(links[i].href);
          }
        }
        // send the URLs to the background script
        chrome.runtime.sendMessage({pageUrls: _.uniq(matchingUrls)});
      }
    }
  );

})();
