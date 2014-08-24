/*
 * Copyright 2014, Gregg Tavares.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Gregg Tavares. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF2 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

"use strict";

var debug       = require('debug')('gameinfo');
var fs          = require('fs');
var path        = require('path');
var misc        = require('./misc');
var config      = require('./config');
var readdirtree = require('./readdirtree');
var semver      = require('semver');

var applyDefaultProperties = function(obj, defaults) {
  if (!defaults) {
    return;
  }
  misc.copyProperties(defaults, obj, 1);
};


/**
 * @typedef {Object} GameInfo~Settings
 * @property {string[]} required the happyFunTimes properties in
 *           package.json
 * @property {Object} hftDefaults the default happyFunTimes
 *           properties
 * @property {Object} hftGameTypeDefaults the default
 *           happyFunTimes properties by gameType
 * @property {Object} apiVersionSettings settings by apiVersion.
 */


var GameInfo = function() {
};

/**
 * Test if gameId is valid.
 * @param {string} gameId id to test
 * @throws {Error} if not valid
 */
var validGameId = (function() {
  var idRE = /^[a-zA-Z0-9-_]+$/;
  return function(id) {
    if (!id) {
      throw ("gameId not defined");
    }
    if (!idRE.test(id)) {
      throw ("invalid characters in gameId only A-Z a-z 0-9 _ - allowed");
    }
    if (id.length > 60) {
      throw ("gameId must be less than 60 characters");
    }
    return true;
  };
}());

GameInfo.prototype.readGameInfo = function(filePath) {
  try {
    var stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, "package.json");
    }
    var contents = fs.readFileSync(filePath);
    return this.parseGameInfo(contents, filePath);
  } catch (e) {
    console.error("ERROR: Reading " + filePath);
    throw e;
  }
};

var validSemver = function(v) {
  if (!semver.valid(v)) {
    throw ("not a valid semver");
  }
};

var validString = function(v) {
  if (typeof(v) !== "string") {
    throw ("not a string");
  }
};

var validNumber = function(v) {
  if (typeof(v) !== "number") {
    throw ("not a number");
  }
};

var validGameType = function(v) {
  validString(v);
};

var requiredFields = {
  gameId:     { type: validGameId, },
  apiVersion: { type: validSemver, },
  gameType:   { type: validString, },
  category:   { type: validString, },
  minPlayers: { type: validNumber, },
};

var validateObject = function(obj, validators) {
  Object.keys(validators).forEach(function(fieldName) {
    var info = validators[fieldName];
    try {
      info.type(obj[fieldName]);
    } catch (e) {
      throw (fieldName + ": " + e);
    }
  });
};

GameInfo.prototype.checkRequiredFiles = (function() {
  var baseChecks = [
    { re: /^icon\.(jpg|png|gif|svg)$/i,
      msg: "no icon found. Must have 64x64 or 128x128 pixel icon.png/jpg/gif in root folder",
    },
    { re: /^screenshot(?:-\d\d){0,1}\.(jpg|png|gif|svg)$/i,
      msg: "no screenshots found. Must have 640x480 pixel screenshot.png/jpg/gif or screenshot-00 to screenshot-05 in root folder",
    },
    { re: /^controller.html$/,
      msg: "no controller.html",
    },
    { re: /^css\/controller.css$/,
      msg: "no css\/controller.css",
    },
    { re: /^scripts\/controller.js$/,
      msg: "no scripts\/controller.js",
    },
  ];

  var gameTypeChecks = {
    html: [
      { re: /^game.html$/,
        msg: "no game.html",
      },
      { re: /^game.html$/,
        msg: "no game.html",
      },
      { re: /^css\/game.css$/,
        msg: "no css\/game.css",
      },
      { re: /^scripts\/game.js$/,
        msg: "no scripts\/game.js",
      },
    ],
  };

  return function(info, basePath) {
    var found = [];
    var foundCount = 0;

    var checks = baseChecks.slice();
    var gameChecks = gameTypeChecks[info.happyFunTimes.gameType.toLowerCase()];
    if (gameChecks) {
      checks = checks.concat(gameChecks);
    }

    var fileNames = readdirtree.sync(basePath);
    for (var ii = 0; ii < fileNames.length && foundCount < checks.length; ++ii) {
      var fileName = fileNames[ii].replace(/\\/g, '/');
      checks.forEach(function(check, ndx) {
        if (!found[ndx]) {
          if (check.re.test(fileName)) {
            found[ndx] = true;
            ++foundCount;
          }
        }
      });
    };

    var errors = [];
    checks.forEach(function(check, ndx) {
      if (!found[ndx]) {
        errors.push(check.msg);
      }
    });

    if (errors.length) {
      throw errors.join("\n");
    }
  };

}());

GameInfo.prototype.parseGameInfo = function(contents, filePath) {
  try {
    var packageInfo = JSON.parse(contents);
    var hftInfo = packageInfo.happyFunTimes;
    if (!hftInfo) {
      console.error("error: " + filePath + " is missing happyFunTimes section");
      return;
    }

    var gameBasePath = path.dirname(filePath);
    var settings = config.getSettings();
    applyDefaultProperties(hftInfo, settings.hftDefaults);
    applyDefaultProperties(hftInfo, settings.hftGameTypeDefaults[hftInfo.gameType]);

    try {
      validateObject(hftInfo, requiredFields);
    } catch (e) {
      console.error("error: " + filePath + " happyFunTimes.");
      console.error(e);
      return;
    }

    if (settings.hftGameTypeDefaults[hftInfo.gameType] === undefined) {
      console.error("warning: " + filePath + " unknown gameType " + hftInfo.gameType);
      console.error("valid gameTypes: \n\t" + Object.keys(settings.hftGameTypeDefaults).join("\n\t"));
      return;
    }

    // NOTE(gman): It seems like I shouldn't be patching the info here so
    // that I can write it back if I feel like it. I should probably wrap
    // it some other object as in
    // runtimeInfo = {
    //    gameInfo: <contents of package.json>,
    //    runTimeThing1: ...,
    //    runTimething2: ...,
    //    ...,
    // };

    var availableVersions = Object.keys(settings.apiVersionSettings);
    var need = '^' + hftInfo.apiVersion;
    var bestVersion = semver.maxSatisfying(availableVersions, need);
    if (!bestVersion) {
      console.warn("error: " + filePath + " requires unsupported api version: you probably need to upgrade happyFunTimes");
      bestVersion = "0.0.0-unsupportedApiVersion";
      hftInfo.needNewHFT = true;
    }

    hftInfo.versionSettings = settings.apiVersionSettings[bestVersion];
    if (hftInfo.versionSettings === undefined) {
      console.error("error: " + filePath + " unknown apiVersion " + hftInfo.apiVersion);
      console.error("valid apiVersions: \n\t" + Object.keys(settings.apiVersionSettings).join("\n\t"));
      return;
    }

    var gameType = hftInfo.gameType;
    if (!gameType) {
      return;
    }

//    // Check icon and screenshot
//    try {
//      this.checkRequiredFiles(packageInfo, gameBasePath);
//    } catch (e) {
//      console.error("error: " + filePath);
//      console.error(e);
//      return;
//    }



// REMOVE THIS!!
    // Fix some urls.
    ['gameUrl', 'screenshotUrl'].forEach(function(name) {
      if (hftInfo[name]) {
        hftInfo[name] = "/games/" + hftInfo.gameId + "/" + hftInfo[name];
      };
    }.bind(this));

    if (hftInfo.gameExecutable) {
      var localPath = path.join(gameBasePath, hftInfo.gameExecutable);
      hftInfo.gameExecutable = localPath;

      // make sure the executable is the the game's folder.
      var fullPath = path.normalize(localPath);
      if (gameBasePath != fullPath.substring(0, gameBasePath.length)) {
        throw "bad path for game executable: " + fullPath;
      }
    }

    hftInfo.basePath = gameBasePath;

  } catch (e) {
    console.error("ERROR: Parsing " + filePath);
    throw e;
  }
  return packageInfo;
};

module.exports = new GameInfo();


