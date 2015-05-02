'use strict';

(function() {

  var config = require('../../config.json');

  chrome.runtime.onMessage.addListener(
    function(request) {
      if (request.discussions) {
        var elemDiv = document.createElement('div');
        elemDiv.className = 'ph-notification-box';
        var text;
        if (request.discussions.length === 1) {
          text =
            'There is <strong>1</strong> open discussion for this document.';
        } else if (request.discussions.length > 1) {
          text = 'There are <strong>' + request.discussions.length +
            '</strong> open discussions for this document.';
        }
        //var content = document.createTextNode(text);
        //elemDiv.appendChild(content);
        elemDiv.innerHTML = elemDiv.innerHTML +
          '<a target="_blank" href="' +
          config.frontendUrl + '/#/articles/' + request.article._id +
          '">' +
          text +
          '</a>';

        document.body.appendChild(elemDiv);
      }
    });

})();
