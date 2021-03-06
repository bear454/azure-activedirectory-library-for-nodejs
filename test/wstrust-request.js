/*
 * @copyright
 * Copyright © Microsoft Open Technologies, Inc.
 *
 * All Rights Reserved
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http: *www.apache.org/licenses/LICENSE-2.0
 *
 * THIS CODE IS PROVIDED *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS
 * OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION
 * ANY IMPLIED WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A
 * PARTICULAR PURPOSE, MERCHANTABILITY OR NON-INFRINGEMENT.
 *
 * See the Apache License, Version 2.0 for the specific language
 * governing permissions and limitations under the License.
 */

'use strict';
/* Directive tells jshint that suite and test are globals defined by mocha */
/* global suite */
/* global test */

var assert = require('assert');
var fs = require('fs');
var nock = require('nock');

var util = require('./util/util');
var cp = util.commonParameters;
var testRequire = util.testRequire;

var WSTrustRequest = testRequire('wstrust-request');

/**
 * Tests the WSTrustRequest class that creates and sends a ws-trust RST request.
 */
suite('WSTrustRequest', function() {
  var wstrustEndpoint = 'https://test.wstrust.endpoint/';

  function getMessageIdFromRSTR(body) {
    var urnPrefix = 'urn:uuid:';
    var pos = body.indexOf(urnPrefix);
    if (-1 === pos) {
      return;
    }
    var exampleGuid = '00000000-0000-0000-0000-000000000000';
    var messageIdLength = urnPrefix.length + exampleGuid.length;

    var messageId = body.substr(pos, messageIdLength);
    return messageId;
  }

  function getDateFromRST(body, elementName) {
    var searchString = elementName + '>';
    var pos = body.indexOf(searchString);
    if (-1 === pos) {
      return;
    }
    var exampleDate = '2013-11-21T00:23:48.406Z';
    return body.substr(pos + searchString.length, exampleDate.length);
  }

  function replaceDateInTemplate(body, rst, elementName, replaceKey) {
    var date = getDateFromRST(body, elementName);
    if (!date) {
      return;
    }
    return rst.replace(replaceKey, date);
  }

  function compareRSTDocs(rst1, rst2) {
    var left = rst1.replace(/\s/g, '').replace(/"/g, '\'');
    var right = rst2.replace(/\s/g, '').replace(/"/g, '\'');

    return left === right;
  }

  function setupUpOutgoingRSTCompare(rst) {
    var rstRequest = nock(wstrustEndpoint)
     .matchHeader('client-request-id', util.testCorrelationId)
     .filteringRequestBody(function(body) {
      var messageId = getMessageIdFromRSTR(body);
      assert(messageId, 'Could not find message id in return RST');
      rst = rst.replace('%MESSAGE_ID%', messageId);

      rst = replaceDateInTemplate(body, rst, 'Created', '%CREATED%');
      assert(rst, 'Could not find Created date');

      rst = replaceDateInTemplate(body, rst, 'Expires', '%EXPIRES%');
      assert(rst, 'Could not find Expires date');

      assert(compareRSTDocs(rst, body), 'RST returned does not match expected RST:\n' + body);
      return 'OK';
    })
    .post('/', 'OK').reply(200, 'OK');

    return rstRequest;
  }

  test('happy-path', function(done) {
    var username = 'test_username';
    var password = 'test_password';
    var appliesTo = 'test_appliesTo';
    var templateRST = fs.readFileSync(__dirname + '/wstrust/RST.xml', 'utf8');
    var rst = templateRST.replace('%USERNAME%', username).replace('%PASSWORD%', password).replace('%APPLIES_TO%', appliesTo).replace('%WSTRUST_ENDPOINT%', wstrustEndpoint);

    var rstRequest = setupUpOutgoingRSTCompare(rst);
    var request = new WSTrustRequest(cp.callContext, wstrustEndpoint, appliesTo);

    // Take over handling the response to short circuit without having WSTrustRequest attmpt
    // to proceed with response parsing.
    request._handleRSTR = function(body, callback) {
      callback();
    };

    request.acquireToken(username, password, function(err) {
      rstRequest.done();
      done(err);
    });
  });

  test('fail-to-parse-rstr', function(done) {
    var username = 'test_username';
    var password = 'test_password';
    var appliesTo = 'test_appliesTo';
    var templateRST = fs.readFileSync(__dirname + '/wstrust/RST.xml', 'utf8');
    var rst = templateRST.replace('%USERNAME%', username).replace('%PASSWORD%', password).replace('%APPLIES_TO%', appliesTo).replace('%WSTRUST_ENDPOINT%', wstrustEndpoint);

    var rstRequest = setupUpOutgoingRSTCompare(rst);
    var request = new WSTrustRequest(cp.callContext, wstrustEndpoint, appliesTo);

    request.acquireToken(username, password, function(err) {
      rstRequest.done();
      assert(err, 'Did not recieve expected error.');
      done();
    });
  });
});

