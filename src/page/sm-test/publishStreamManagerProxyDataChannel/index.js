/*
Copyright © 2015 Infrared5, Inc. All rights reserved.

The accompanying code comprising examples for use solely in conjunction with Red5 Pro (the "Example Code") 
is  licensed  to  you  by  Infrared5  Inc.  in  consideration  of  your  agreement  to  the  following  
license terms  and  conditions.  Access,  use,  modification,  or  redistribution  of  the  accompanying  
code  constitutes your acceptance of the following license terms and conditions.

Permission is hereby granted, free of charge, to you to use the Example Code and associated documentation 
files (collectively, the "Software") without restriction, including without limitation the rights to use, 
copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit 
persons to whom the Software is furnished to do so, subject to the following conditions:

The Software shall be used solely in conjunction with Red5 Pro. Red5 Pro is licensed under a separate end 
user  license  agreement  (the  "EULA"),  which  must  be  executed  with  Infrared5,  Inc.   
An  example  of  the EULA can be found on our website at: https://account.red5pro.com/assets/LICENSE.txt.

The above copyright notice and this license shall be included in all copies or portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,  INCLUDING  BUT  
NOT  LIMITED  TO  THE  WARRANTIES  OF  MERCHANTABILITY, FITNESS  FOR  A  PARTICULAR  PURPOSE  AND  
NONINFRINGEMENT.   IN  NO  EVENT  SHALL INFRARED5, INC. BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, 
WHETHER IN  AN  ACTION  OF  CONTRACT,  TORT  OR  OTHERWISE,  ARISING  FROM,  OUT  OF  OR  IN CONNECTION 
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
(function(window, document, red5prosdk) {
  'use strict';

  var serverSettings = (function() {
    var settings = sessionStorage.getItem('r5proServerSettings');
    try {
      return JSON.parse(settings);
    }
    catch (e) {
      console.error('Could not read server settings from sessionstorage: ' + e.message);
    }
    return {};
  })();

  var configuration = (function () {
    var conf = sessionStorage.getItem('r5proTestBed');
    try {
      return JSON.parse(conf);
    }
    catch (e) {
      console.error('Could not read testbed configuration from sessionstorage: ' + e.message);
    }
    return {}
  })();
  red5prosdk.setLogLevel(configuration.verboseLogging ? red5prosdk.LOG_LEVELS.TRACE : red5prosdk.LOG_LEVELS.WARN);

  var targetPublisher;

  var updateStatusFromEvent = window.red5proHandlePublisherEvent; // defined in src/template/partial/status-field-publisher.hbs
  var streamTitle = document.getElementById('stream-title');
  var sendRPCButton = document.getElementById('send-rpc-button');
  var sendMessageButton = document.getElementById('send-message-button');
  var sendDataButton = document.getElementById('send-data-button');
  var rpcInput = document.getElementById('rpc-input');
  var messageInput = document.getElementById('message-input');
  var statisticsField = document.getElementById('statistics-field');
  var addressField = document.getElementById('address-field');
  var bitrateField = document.getElementById('bitrate-field');
  var packetsField = document.getElementById('packets-field');
  var resolutionField = document.getElementById('resolution-field');

  var bitrate = 0;
  var packetsSent = 0;
  var frameWidth = 0;
  var frameHeight = 0;

  function updateStatistics (b, p, w, h) {
    statisticsField.classList.remove('hidden');
    bitrateField.innerText = b === 0 ? 'N/A' : Math.floor(b);
    packetsField.innerText = p;
    resolutionField.innerText = (w || 0) + 'x' + (h || 0);
  }

  function onBitrateUpdate (b, p) {
    bitrate = b;
    packetsSent = p;
    updateStatistics(bitrate, packetsSent, frameWidth, frameHeight);
  }

  function onResolutionUpdate (w, h) {
    frameWidth = w;
    frameHeight = h;
    updateStatistics(bitrate, packetsSent, frameWidth, frameHeight);
  }

  function showModal (content) {
    var div = document.createElement('div');
    div.classList.add('modal');
    var container = document.createElement('div');
    var button = document.createElement('a');
    var close = document.createTextNode('close');
    button.href = "#";
    button.appendChild(close);
    button.classList.add('modal-close');
    container.appendChild(button);
    container.appendChild(content);
    div.appendChild(container);
    document.body.appendChild(div);
    button.addEventListener('click', function (event) {
      event.preventDefault();
      document.body.removeChild(div);
      return false;
    });
  }

  function generateAudioRecordContent (duration) {
    var delay = 500
    var amount = duration / delay
    var content = document.createElement('div')
    var header = document.createElement('p')
    var count = 0
    var ellipseCount = 3
    var title = 'Recording audio'
    header.innerText = title
    var t = setInterval(function () {
      count = (count++ % ellipseCount) + 1
      var text = title + (new Array(count).fill('.').join(''))
      header.innerText = text
      if (--amount < 0) {
        clearInterval(t)
        header.innerText = 'Sent!'
      }
    }, delay)
    content.appendChild(header)
    return content
  }

  sendRPCButton.addEventListener('click', function (event) {
    var elem = document.getElementById('red5pro-publisher');
    if (targetPublisher !== undefined) {
      targetPublisher.send("incomingNotification", {
        message: rpcInput.value === '' ? 'What lovely weather today.' : rpcInput.value,
        timestamp: new Date().getTime()
      });
    }
  });

  sendMessageButton.addEventListener('click', () => {
    const message = JSON.stringify({message: messageInput.value, timestamp: new Date()})
    console.log(`Sending along message: ${message}`)
    targetPublisher.getDataChannel().send(message)
  })

  sendDataButton.addEventListener('click', () => {
    console.log('Preparring bytes...')
    showModal(generateAudioRecordContent(5000));

    const stream = new MediaStream()
    stream.addTrack(targetPublisher.getMediaStream().getAudioTracks()[0])

    const recorder = new MediaRecorder(stream)
    let chunks = []
    recorder.ondataavailable = e => {
      chunks.push(e.data)
    }

    recorder.onstop = async () => {
      let blobChunks = [chunks.shift()]
      const max = targetPublisher.getPeerConnection().sctp.maxMessageSize
      // 262144 is max bytes able to send on DC in one message.
      let maxbytes = max - blobChunks[0].size
      while (chunks.length > 0) {
        const chunk = chunks.shift()
        maxbytes -= chunk.size
        if (maxbytes > 0) {
          blobChunks.push(chunk)
        }
      }
      const blob = new Blob(blobChunks)
      const buffer = await new Response(blob).arrayBuffer()
      console.log('Sending bytes...', buffer.byteLength)
      console.log(buffer)
      targetPublisher.getDataChannel().send(buffer)

      var audioUrl = window.URL.createObjectURL( blob )
      var audio = document.querySelector( "#snippet" )
      audio.controls = true
      audio.src = audioUrl
    }

    recorder.start(1000)
    setTimeout(() => {
      recorder.stop()
    }, 5000)
  })

  var protocol = serverSettings.protocol;
  var isSecure = protocol == 'https';
  function getSocketLocationFromProtocol () {
    return !isSecure
      ? {protocol: 'ws', port: serverSettings.wsport}
      : {protocol: 'wss', port: serverSettings.wssport};
  }

  var defaultConfiguration = {
    protocol: getSocketLocationFromProtocol().protocol,
    port: getSocketLocationFromProtocol().port,
    streamMode: configuration.recordBroadcast ? 'record' : 'live'
  };

  function onPublisherEvent (event) {
    console.log('[Red5ProPublisher] ' + event.type + '.');
    updateStatusFromEvent(event);
    if (event.type === 'WebRTC.DataChannel.Available') {
      sendRPCButton.disabled = false
      sendMessageButton.disabled = false
      sendDataButton.disabled = false
    }
  }
  function onPublishFail (message) {
    console.error('[Red5ProPublisher] Publish Error :: ' + message);
  }
  function onPublishSuccess (publisher) {
    console.log('[Red5ProPublisher] Publish Complete.');
    try {
      window.r5_publisher = targetPublisher
      var pc = publisher.getPeerConnection();
      var stream = publisher.getMediaStream();
      window.trackBitrate(pc, onBitrateUpdate, onResolutionUpdate);
      statisticsField.classList.remove('hidden');
      stream.getVideoTracks().forEach(function (track) {
        var settings = track.getSettings();
        onResolutionUpdate(settings.width, settings.height);
      });
    }
    catch (e) {
      // no tracking for you!
    }
  }
  function onUnpublishFail (message) {
    console.error('[Red5ProPublisher] Unpublish Error :: ' + message);
  }
  function onUnpublishSuccess () {
    console.log('[Red5ProPublisher] Unpublish Complete.');
  }

  function getAuthenticationParams () {
    var auth = configuration.authentication;
    return auth && auth.enabled
      ? {
        connectionParams: {
          username: auth.username,
          password: auth.password,
          token: auth.token
        }
      }
      : {};
  }

  function getUserMediaConfiguration () {
    return {
      mediaConstraints: {
        audio: configuration.useAudio ? configuration.mediaConstraints.audio : false,
        video: configuration.useVideo ? configuration.mediaConstraints.video : false
      }
    };
  }

  function getRTMPMediaConfiguration () {
    return {
      mediaConstraints: {
        audio: configuration.useAudio ? configuration.mediaConstraints.audio : false,
        video: configuration.useVideo ? {
                width: configuration.cameraWidth,
                height: configuration.cameraHeight
              } : false
      }
    }
  }

  function getRegionIfDefined () {
    var region = configuration.streamManagerRegion;
    if (typeof region === 'string' && region.length > 0 && region !== 'undefined') {
      return region;
    }
    return undefined
  }

  function requestOrigin (configuration) {
    var host = configuration.host;
    var app = configuration.app;
    var streamName = configuration.stream1;
    var port = serverSettings.httpport;
    var baseUrl = protocol + '://' + host + ':' + port;
    var apiVersion = configuration.streamManagerAPI || '4.0';
    var url = baseUrl + '/streammanager/api/' + apiVersion + '/event/' + app + '/' + streamName + '?action=broadcast';
    var region = getRegionIfDefined();
    if (region) {
      url += '&region=' + region;
    }
    return new Promise(function (resolve, reject) {
      fetch(url)
        .then(function (res) {
          if(res.status == 200){
            if (res.headers.get("content-type") && res.headers.get("content-type").toLowerCase().indexOf("application/json") >= 0) {
              return res.json();
            } else {
              throw new TypeError('Could not properly parse response.');
            }
          } else {
            var msg = "";
            if(res.status == 400) {
              msg = "An invalid request was detected";
            } else if(res.status == 404) {
              msg = "Data for the request could not be located/provided.";
            } else if(res.status == 500) {
              msg = "Improper server state error was detected.";
            } else {
              msg = "Unknown error";
            }
            throw new TypeError(msg);
          }
        })
        .then(function (json) {
          resolve(json);
        })
        .catch(function (error) {
          var jsonError = typeof error === 'string' ? error : JSON.stringify(error, null, 2)
          console.error('[PublisherStreamManagerTest] :: Error - Could not request Origin IP from Stream Manager. ' + jsonError)
            reject(error)
        });
    });
  }

  function displayServerAddress (serverAddress, proxyAddress) {
    proxyAddress = (typeof proxyAddress === 'undefined') ? 'N/A' : proxyAddress;
    addressField.innerText = ' Proxy Address: ' + proxyAddress + ' | ' + ' Origin Address: ' + serverAddress;
  }

  function determinePublisher (jsonResponse) {
    var host = jsonResponse.serverAddress;
    var app = jsonResponse.scope;
    var name = jsonResponse.name;
    var config = Object.assign({},
                    configuration,
                    defaultConfiguration,
                    getUserMediaConfiguration());
    var rtcConfig = Object.assign({}, config, {
                      protocol: getSocketLocationFromProtocol().protocol,
                      port: getSocketLocationFromProtocol().port,
                      streamName: name,
                      app: configuration.proxy,
                      connectionParams: {
                        host: host,
                        app: app
                      }
                   });
    var rtmpConfig = Object.assign({}, config, {
                      host: host,
                      app: app,
                      protocol: 'rtmp',
                      port: serverSettings.rtmpport,
                      streamName: name,
                      backgroundColor: '#000000',
                      swf: '../../lib/red5pro/red5pro-publisher.swf',
                      swfobjectURL: '../../lib/swfobject/swfobject.js',
                      productInstallURL: '../../lib/swfobject/playerProductInstall.swf'
                    },
                    getAuthenticationParams(),
                    getRTMPMediaConfiguration());
    var publishOrder = config.publisherFailoverOrder
                            .split(',')
                            .map(function (item) {
                              return item.trim()
                        });

    // Merge in possible authentication params.
    rtcConfig.connectionParams = Object.assign({},
      getAuthenticationParams().connectionParams,
      rtcConfig.connectionParams);

    if(window.query('view')) {
      publishOrder = [window.query('view')];
    }

    var publisher = new red5prosdk.Red5ProPublisher();
    return publisher.setPublishOrder(publishOrder)
            .init({
                rtc: rtcConfig,
                rtmp: rtmpConfig
              });
  }

  function showAddress (publisher) {
    var config = publisher.getOptions();
    console.log("Host = " + config.host + " | " + "app = " + config.app);
    if (publisher.getType().toLowerCase() === 'rtc') {
      displayServerAddress(config.connectionParams.host, config.host);
      console.log("Using streammanager proxy for rtc");
      console.log("Proxy target = " + config.connectionParams.host + " | " + "Proxy app = " + config.connectionParams.app)
      if(isSecure) {
        console.log("Operating over secure connection | protocol: " + config.protocol + " | port: " +  config.port);
      }
      else {
        console.log("Operating over unsecure connection | protocol: " + config.protocol + " | port: " +  config.port);
      }
    }
    else {
      displayServerAddress(config.host);
    }
  }

  function unpublish () {
    return new Promise(function (resolve, reject) {
      var publisher = targetPublisher;
      publisher.unpublish()
        .then(function () {
          onUnpublishSuccess();
          resolve();
        })
        .catch(function (error) {
          var jsonError = typeof error === 'string' ? error : JSON.stringify(error, 2, null);
          onUnpublishFail('Unmount Error ' + jsonError);
          reject(error);
        });
    });
  }

  var retryCount = 0;
  var retryLimit = 3;
  function respondToOrigin (response) {
    determinePublisher(response)
      .then(function (publisherImpl) {
        streamTitle.innerText = configuration.stream1;
        targetPublisher = publisherImpl;
        targetPublisher.on('*', onPublisherEvent);
        showAddress(targetPublisher);
        return targetPublisher.publish();
      })
      .then(function () {
        onPublishSuccess(targetPublisher);
      })
      .catch(function (error) {
        var jsonError = typeof error === 'string' ? error : JSON.stringify(error, null, 2);
        console.error('[Red5ProPublisher] :: Error in access of Origin IP: ' + jsonError);
        updateStatusFromEvent({
          type: red5prosdk.PublisherEventTypes.CONNECT_FAILURE
        });
        onPublishFail(jsonError);
      });
  }

  function respondToOriginFailure (error) {
    if (retryCount++ < retryLimit) {
      var retryTimer = setTimeout(function () {
        clearTimeout(retryTimer);
        startup();
      }, 1000);
    }
    else {
      var jsonError = typeof error === 'string' ? error : JSON.stringify(error, null, 2);
      updateStatusFromEvent({
        type: red5prosdk.PublisherEventTypes.CONNECT_FAILURE
      });
      console.error('[Red5ProPublisher] :: Retry timeout in publishing - ' + jsonError);
    }
  }

  function startup () {
    // Kick off.
    requestOrigin(configuration)
      .then(respondToOrigin)
      .catch(respondToOriginFailure);
  }
  startup();

  var shuttingDown = false;
  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    function clearRefs () {
      if (targetPublisher) {
        targetPublisher.off('*', onPublisherEvent);
      }
      targetPublisher = undefined;
    }
    unpublish().then(clearRefs).catch(clearRefs);
    window.untrackBitrate();
  }
  window.addEventListener('pagehide', shutdown);
  window.addEventListener('beforeunload', shutdown);

})(this, document, window.red5prosdk);

