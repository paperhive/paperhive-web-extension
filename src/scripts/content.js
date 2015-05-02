'use strict';

(function() {

  chrome.runtime.onMessage.addListener(
    function(request) {
      console.log(request.discussions);
      if (request.discussions) {
        var elemDiv = document.createElement('div');
        elemDiv.className = 'ph-notification-box';
        document.body.appendChild(elemDiv);
      }
    });

})();
