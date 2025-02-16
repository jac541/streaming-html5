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
  var audioPublisher;

  var updateStatusFromEvent = window.red5proHandlePublisherEvent; // defined in src/template/partial/status-field-publisher.hbs
  var streamTitle = document.getElementById('stream-title');
  var statisticsField = document.getElementById('statistics-field');
  var addressField = document.getElementById('address-field');
  var bitrateField = document.getElementById('bitrate-field');
  var packetsField = document.getElementById('packets-field');
  var resolutionField = document.getElementById('resolution-field');
  var captureButton = document.getElementById('capture-button');
  //  var audioButton = document.getElementById('audio-button');

  var bandwidthAudioField = document.getElementById('audio-bitrate-field');
  var bandwidthVideoField = document.getElementById('video-bitrate-field');
  var keyFramerateField = document.getElementById('key-framerate-field');
  var cameraWidthField = document.getElementById('camera-width-field');
  var cameraHeightField = document.getElementById('camera-height-field');
  var framerateField =document.getElementById('framerate-field');

  bandwidthAudioField.value = configuration.bandwidth.audio;
  bandwidthVideoField.value = configuration.bandwidth.video;
  keyFramerateField.value = configuration.keyFramerate || 3000;
  cameraWidthField.value = configuration.mediaConstraints.video !== true ? configuration.mediaConstraints.video.width.max : 640;
  cameraHeightField.value = configuration.mediaConstraints.video !== true ? configuration.mediaConstraints.video.height.max : 480;
  framerateField.value = configuration.mediaConstraints.video !== true ? configuration.mediaConstraints.video.frameRate.max : 24;

  captureButton.addEventListener('click', function() {
    startup();
  });

  /*
  audioButton.addEventListener('click', function() {
    setupAudio();
  })
  */

  streamTitle.innerText = configuration.stream1;
  var protocol = serverSettings.protocol;
  var isSecure = protocol == 'https';
  function getSocketLocationFromProtocol () {
    return !isSecure
      ? {protocol: 'ws', port: serverSettings.wsport}
      : {protocol: 'wss', port: serverSettings.wssport};
  }

  function displayServerAddress (serverAddress, proxyAddress) 
  {
  proxyAddress = (typeof proxyAddress === 'undefined') ? 'N/A' : proxyAddress;
    addressField.innerText = ' Proxy Address: ' + proxyAddress + ' | ' + ' Origin Address: ' + serverAddress;
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

  function onPublisherEvent (event) {
    console.log('[Red5ProPublisher] ' + event.type + '.');
    updateStatusFromEvent(event);
  }

  function onPublisherAudioEvent (event) {
    console.log('[Red5ProPublisher:AUDIO] ' + event.type + '.');
  }

  function onPublishFail (message) {
    console.error('[Red5ProPublisher] Publish Error :: ' + message);
  }

  function onPublishSuccess (publisher) {
    console.log('[Red5ProPublisher] Publish Complete.');
    try {
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

  var retryCount = 0;
  var retryLimit = 3;
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
            if (res.headers.get("content-type") &&
              res.headers.get("content-type").toLowerCase().indexOf("application/json") >= 0) {
                return res.json();
            }
            else {
              throw new TypeError('Could not properly parse response.');
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

  function respondToOrigin (jsonResponse) {
    capture(function (stream) {
      setupPublisher(jsonResponse, stream);
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

  function capture (cb) {
    captureButton.disabled = true;
    var vw = parseInt(cameraWidthField.value);
    var vh = parseInt(cameraHeightField.value);
    var fr = parseInt(framerateField.value);
    var config = {
        audio: false,
        video: {
          width: vw, //{ maxWidth: vw },
          height: vh, //{ maxHeight: vh },
          frameRate: fr//{ maxFrameRate: fr }
        }
    };
    console.log('Using Capture Configuration:\r\n' + JSON.stringify(config, null, 2));
    // Edge has getDisplayMedia on navigator and not media devices?
    var p = undefined
    if (navigator.getDisplayMedia) {
      p = navigator.getDisplayMedia(config)
    } else {
      p = navigator.mediaDevices.getDisplayMedia(config)
    }
    p.then(cb).catch(function (error) {
      captureButton.disabled = false;
      console.error(error);
      updateStatusFromEvent({
        type: 'ERROR',
        data: error.message
      });
    });
  }

  function unpublish (publisher) {
    return new Promise(function (resolve, reject) {
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

  function setupAudio (originData) {
    var host = originData.serverAddress;
    var app = originData.scope;
    var name = originData.name;
    var audioConfig = Object.assign({},
      configuration, 
      {
        mediaElementId: 'red5pro-audio',
        protocol: getSocketLocationFromProtocol().protocol,
        port: getSocketLocationFromProtocol().port,
        streamName: name + '_audio',
        streamMode: configuration.recordBroadcast ? 'record' : 'live',
        app: configuration.proxy,
        connectionParams: {
          host: host,
          app: app
        },
        mediaConstraints: {
          audio: true,
          video: false
        }
      },
    {
      bandwidth: {
        audio: parseInt(bandwidthAudioField.value)
      }
    });

    audioConfig.connectionParams = Object.assign({}, 
      getAuthenticationParams().connectionParams,
      audioConfig.connectionParams);

    new red5prosdk.RTCPublisher()
      .init(audioConfig)
      .then(function (publisherImpl) {
        audioPublisher = publisherImpl;
        audioPublisher.on('*', onPublisherAudioEvent);
        return audioPublisher.publish();
      })
      .then(function () {
      })
      .catch(function (error) {
        var jsonError = typeof error === 'string' ? error : JSON.stringify(error, null, 2);
        console.error('[Red5ProPublisher:AUDIO] :: Error in publishing audio - ' + jsonError);
      });
  }

  function setupPublisher (originData, mediaStream) {

    var host = originData.serverAddress;
    var app = originData.scope;
    var name = originData.name;

    var rtcConfig = Object.assign({}, configuration, {
                        protocol: getSocketLocationFromProtocol().protocol,
                        port: getSocketLocationFromProtocol().port,
                        streamName: name,
                        streamMode: configuration.recordBroadcast ? 'record' : 'live',
                        app: configuration.proxy,
                        connectionParams: {
                          host: host,
                          app: app
                        },
                        bandwidth: {
                          video: parseInt(bandwidthVideoField.value)
                        },
                        keyFramerate: parseInt(keyFramerateField.value)
                    });

    rtcConfig.connectionParams = Object.assign({}, 
      getAuthenticationParams().connectionParams,
      rtcConfig.connectionParams);

    new red5prosdk.RTCPublisher()
      .initWithStream(rtcConfig, mediaStream)
      .then(function (publisherImpl) {
        streamTitle.innerText = configuration.stream1;
        targetPublisher = publisherImpl;
        targetPublisher.on('*', onPublisherEvent);
        showAddress(targetPublisher);
        return targetPublisher.publish();
      })
      .then(function () {
        onPublishSuccess(targetPublisher);
        setupAudio(originData);
      })
      .catch(function (error) {
        var jsonError = typeof error === 'string' ? error : JSON.stringify(error, null, 2);
        console.error('[Red5ProPublisher] :: Error in publishing - ' + jsonError);
        onPublishFail(jsonError);
      });

  }

  function startup () {
    // Kick off.
    requestOrigin(configuration)
      .then(respondToOrigin)
      .catch(respondToOriginFailure);
  }

  var shuttingDown = false;
  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    function clearRefs () {
      if (targetPublisher) {
        targetPublisher.off('*', onPublisherEvent);
      }
      if (audioPublisher) {
        audioPublisher.off('*', onPublisherAudioEvent);
      }
      targetPublisher = undefined;
      audioPublisher = undefined;
    }
    unpublish(targetPublisher)
      .then(function () {
        if (audioPublisher) {
          return unpublish(audioPublisher);
        }
        return true;
      })
      .then(clearRefs).catch(clearRefs);
    window.untrackBitrate();
  }
  window.addEventListener('pagehide', shutdown);
  window.addEventListener('beforeunload', shutdown);

})(this, document, window.red5prosdk);

