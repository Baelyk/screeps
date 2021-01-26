'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */

var intToCharMap = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('');

/**
 * Encode an integer in the range of 0 to 63 to a single base 64 digit.
 */
var encode = function (number) {
  if (0 <= number && number < intToCharMap.length) {
    return intToCharMap[number];
  }
  throw new TypeError("Must be between 0 and 63: " + number);
};

/**
 * Decode a single base 64 character code digit to an integer. Returns -1 on
 * failure.
 */
var decode = function (charCode) {
  var bigA = 65;     // 'A'
  var bigZ = 90;     // 'Z'

  var littleA = 97;  // 'a'
  var littleZ = 122; // 'z'

  var zero = 48;     // '0'
  var nine = 57;     // '9'

  var plus = 43;     // '+'
  var slash = 47;    // '/'

  var littleOffset = 26;
  var numberOffset = 52;

  // 0 - 25: ABCDEFGHIJKLMNOPQRSTUVWXYZ
  if (bigA <= charCode && charCode <= bigZ) {
    return (charCode - bigA);
  }

  // 26 - 51: abcdefghijklmnopqrstuvwxyz
  if (littleA <= charCode && charCode <= littleZ) {
    return (charCode - littleA + littleOffset);
  }

  // 52 - 61: 0123456789
  if (zero <= charCode && charCode <= nine) {
    return (charCode - zero + numberOffset);
  }

  // 62: +
  if (charCode == plus) {
    return 62;
  }

  // 63: /
  if (charCode == slash) {
    return 63;
  }

  // Invalid base64 digit.
  return -1;
};

var base64 = {
	encode: encode,
	decode: decode
};

/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 *
 * Based on the Base 64 VLQ implementation in Closure Compiler:
 * https://code.google.com/p/closure-compiler/source/browse/trunk/src/com/google/debugging/sourcemap/Base64VLQ.java
 *
 * Copyright 2011 The Closure Compiler Authors. All rights reserved.
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *  * Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above
 *    copyright notice, this list of conditions and the following
 *    disclaimer in the documentation and/or other materials provided
 *    with the distribution.
 *  * Neither the name of Google Inc. nor the names of its
 *    contributors may be used to endorse or promote products derived
 *    from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */



// A single base 64 digit can contain 6 bits of data. For the base 64 variable
// length quantities we use in the source map spec, the first bit is the sign,
// the next four bits are the actual value, and the 6th bit is the
// continuation bit. The continuation bit tells us whether there are more
// digits in this value following this digit.
//
//   Continuation
//   |    Sign
//   |    |
//   V    V
//   101011

var VLQ_BASE_SHIFT = 5;

// binary: 100000
var VLQ_BASE = 1 << VLQ_BASE_SHIFT;

// binary: 011111
var VLQ_BASE_MASK = VLQ_BASE - 1;

// binary: 100000
var VLQ_CONTINUATION_BIT = VLQ_BASE;

/**
 * Converts from a two-complement value to a value where the sign bit is
 * placed in the least significant bit.  For example, as decimals:
 *   1 becomes 2 (10 binary), -1 becomes 3 (11 binary)
 *   2 becomes 4 (100 binary), -2 becomes 5 (101 binary)
 */
function toVLQSigned(aValue) {
  return aValue < 0
    ? ((-aValue) << 1) + 1
    : (aValue << 1) + 0;
}

/**
 * Converts to a two-complement value from a value where the sign bit is
 * placed in the least significant bit.  For example, as decimals:
 *   2 (10 binary) becomes 1, 3 (11 binary) becomes -1
 *   4 (100 binary) becomes 2, 5 (101 binary) becomes -2
 */
function fromVLQSigned(aValue) {
  var isNegative = (aValue & 1) === 1;
  var shifted = aValue >> 1;
  return isNegative
    ? -shifted
    : shifted;
}

/**
 * Returns the base 64 VLQ encoded value.
 */
var encode$1 = function base64VLQ_encode(aValue) {
  var encoded = "";
  var digit;

  var vlq = toVLQSigned(aValue);

  do {
    digit = vlq & VLQ_BASE_MASK;
    vlq >>>= VLQ_BASE_SHIFT;
    if (vlq > 0) {
      // There are still more digits in this value, so we must make sure the
      // continuation bit is marked.
      digit |= VLQ_CONTINUATION_BIT;
    }
    encoded += base64.encode(digit);
  } while (vlq > 0);

  return encoded;
};

/**
 * Decodes the next base 64 VLQ value from the given string and returns the
 * value and the rest of the string via the out parameter.
 */
var decode$1 = function base64VLQ_decode(aStr, aIndex, aOutParam) {
  var strLen = aStr.length;
  var result = 0;
  var shift = 0;
  var continuation, digit;

  do {
    if (aIndex >= strLen) {
      throw new Error("Expected more digits in base 64 VLQ value.");
    }

    digit = base64.decode(aStr.charCodeAt(aIndex++));
    if (digit === -1) {
      throw new Error("Invalid base64 digit: " + aStr.charAt(aIndex - 1));
    }

    continuation = !!(digit & VLQ_CONTINUATION_BIT);
    digit &= VLQ_BASE_MASK;
    result = result + (digit << shift);
    shift += VLQ_BASE_SHIFT;
  } while (continuation);

  aOutParam.value = fromVLQSigned(result);
  aOutParam.rest = aIndex;
};

var base64Vlq = {
	encode: encode$1,
	decode: decode$1
};

function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var util = createCommonjsModule(function (module, exports) {
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */

/**
 * This is a helper function for getting values from parameter/options
 * objects.
 *
 * @param args The object we are extracting values from
 * @param name The name of the property we are getting.
 * @param defaultValue An optional value to return if the property is missing
 * from the object. If this is not specified and the property is missing, an
 * error will be thrown.
 */
function getArg(aArgs, aName, aDefaultValue) {
  if (aName in aArgs) {
    return aArgs[aName];
  } else if (arguments.length === 3) {
    return aDefaultValue;
  } else {
    throw new Error('"' + aName + '" is a required argument.');
  }
}
exports.getArg = getArg;

var urlRegexp = /^(?:([\w+\-.]+):)?\/\/(?:(\w+:\w+)@)?([\w.-]*)(?::(\d+))?(.*)$/;
var dataUrlRegexp = /^data:.+\,.+$/;

function urlParse(aUrl) {
  var match = aUrl.match(urlRegexp);
  if (!match) {
    return null;
  }
  return {
    scheme: match[1],
    auth: match[2],
    host: match[3],
    port: match[4],
    path: match[5]
  };
}
exports.urlParse = urlParse;

function urlGenerate(aParsedUrl) {
  var url = '';
  if (aParsedUrl.scheme) {
    url += aParsedUrl.scheme + ':';
  }
  url += '//';
  if (aParsedUrl.auth) {
    url += aParsedUrl.auth + '@';
  }
  if (aParsedUrl.host) {
    url += aParsedUrl.host;
  }
  if (aParsedUrl.port) {
    url += ":" + aParsedUrl.port;
  }
  if (aParsedUrl.path) {
    url += aParsedUrl.path;
  }
  return url;
}
exports.urlGenerate = urlGenerate;

/**
 * Normalizes a path, or the path portion of a URL:
 *
 * - Replaces consecutive slashes with one slash.
 * - Removes unnecessary '.' parts.
 * - Removes unnecessary '<dir>/..' parts.
 *
 * Based on code in the Node.js 'path' core module.
 *
 * @param aPath The path or url to normalize.
 */
function normalize(aPath) {
  var path = aPath;
  var url = urlParse(aPath);
  if (url) {
    if (!url.path) {
      return aPath;
    }
    path = url.path;
  }
  var isAbsolute = exports.isAbsolute(path);

  var parts = path.split(/\/+/);
  for (var part, up = 0, i = parts.length - 1; i >= 0; i--) {
    part = parts[i];
    if (part === '.') {
      parts.splice(i, 1);
    } else if (part === '..') {
      up++;
    } else if (up > 0) {
      if (part === '') {
        // The first part is blank if the path is absolute. Trying to go
        // above the root is a no-op. Therefore we can remove all '..' parts
        // directly after the root.
        parts.splice(i + 1, up);
        up = 0;
      } else {
        parts.splice(i, 2);
        up--;
      }
    }
  }
  path = parts.join('/');

  if (path === '') {
    path = isAbsolute ? '/' : '.';
  }

  if (url) {
    url.path = path;
    return urlGenerate(url);
  }
  return path;
}
exports.normalize = normalize;

/**
 * Joins two paths/URLs.
 *
 * @param aRoot The root path or URL.
 * @param aPath The path or URL to be joined with the root.
 *
 * - If aPath is a URL or a data URI, aPath is returned, unless aPath is a
 *   scheme-relative URL: Then the scheme of aRoot, if any, is prepended
 *   first.
 * - Otherwise aPath is a path. If aRoot is a URL, then its path portion
 *   is updated with the result and aRoot is returned. Otherwise the result
 *   is returned.
 *   - If aPath is absolute, the result is aPath.
 *   - Otherwise the two paths are joined with a slash.
 * - Joining for example 'http://' and 'www.example.com' is also supported.
 */
function join(aRoot, aPath) {
  if (aRoot === "") {
    aRoot = ".";
  }
  if (aPath === "") {
    aPath = ".";
  }
  var aPathUrl = urlParse(aPath);
  var aRootUrl = urlParse(aRoot);
  if (aRootUrl) {
    aRoot = aRootUrl.path || '/';
  }

  // `join(foo, '//www.example.org')`
  if (aPathUrl && !aPathUrl.scheme) {
    if (aRootUrl) {
      aPathUrl.scheme = aRootUrl.scheme;
    }
    return urlGenerate(aPathUrl);
  }

  if (aPathUrl || aPath.match(dataUrlRegexp)) {
    return aPath;
  }

  // `join('http://', 'www.example.com')`
  if (aRootUrl && !aRootUrl.host && !aRootUrl.path) {
    aRootUrl.host = aPath;
    return urlGenerate(aRootUrl);
  }

  var joined = aPath.charAt(0) === '/'
    ? aPath
    : normalize(aRoot.replace(/\/+$/, '') + '/' + aPath);

  if (aRootUrl) {
    aRootUrl.path = joined;
    return urlGenerate(aRootUrl);
  }
  return joined;
}
exports.join = join;

exports.isAbsolute = function (aPath) {
  return aPath.charAt(0) === '/' || urlRegexp.test(aPath);
};

/**
 * Make a path relative to a URL or another path.
 *
 * @param aRoot The root path or URL.
 * @param aPath The path or URL to be made relative to aRoot.
 */
function relative(aRoot, aPath) {
  if (aRoot === "") {
    aRoot = ".";
  }

  aRoot = aRoot.replace(/\/$/, '');

  // It is possible for the path to be above the root. In this case, simply
  // checking whether the root is a prefix of the path won't work. Instead, we
  // need to remove components from the root one by one, until either we find
  // a prefix that fits, or we run out of components to remove.
  var level = 0;
  while (aPath.indexOf(aRoot + '/') !== 0) {
    var index = aRoot.lastIndexOf("/");
    if (index < 0) {
      return aPath;
    }

    // If the only part of the root that is left is the scheme (i.e. http://,
    // file:///, etc.), one or more slashes (/), or simply nothing at all, we
    // have exhausted all components, so the path is not relative to the root.
    aRoot = aRoot.slice(0, index);
    if (aRoot.match(/^([^\/]+:\/)?\/*$/)) {
      return aPath;
    }

    ++level;
  }

  // Make sure we add a "../" for each component we removed from the root.
  return Array(level + 1).join("../") + aPath.substr(aRoot.length + 1);
}
exports.relative = relative;

var supportsNullProto = (function () {
  var obj = Object.create(null);
  return !('__proto__' in obj);
}());

function identity (s) {
  return s;
}

/**
 * Because behavior goes wacky when you set `__proto__` on objects, we
 * have to prefix all the strings in our set with an arbitrary character.
 *
 * See https://github.com/mozilla/source-map/pull/31 and
 * https://github.com/mozilla/source-map/issues/30
 *
 * @param String aStr
 */
function toSetString(aStr) {
  if (isProtoString(aStr)) {
    return '$' + aStr;
  }

  return aStr;
}
exports.toSetString = supportsNullProto ? identity : toSetString;

function fromSetString(aStr) {
  if (isProtoString(aStr)) {
    return aStr.slice(1);
  }

  return aStr;
}
exports.fromSetString = supportsNullProto ? identity : fromSetString;

function isProtoString(s) {
  if (!s) {
    return false;
  }

  var length = s.length;

  if (length < 9 /* "__proto__".length */) {
    return false;
  }

  if (s.charCodeAt(length - 1) !== 95  /* '_' */ ||
      s.charCodeAt(length - 2) !== 95  /* '_' */ ||
      s.charCodeAt(length - 3) !== 111 /* 'o' */ ||
      s.charCodeAt(length - 4) !== 116 /* 't' */ ||
      s.charCodeAt(length - 5) !== 111 /* 'o' */ ||
      s.charCodeAt(length - 6) !== 114 /* 'r' */ ||
      s.charCodeAt(length - 7) !== 112 /* 'p' */ ||
      s.charCodeAt(length - 8) !== 95  /* '_' */ ||
      s.charCodeAt(length - 9) !== 95  /* '_' */) {
    return false;
  }

  for (var i = length - 10; i >= 0; i--) {
    if (s.charCodeAt(i) !== 36 /* '$' */) {
      return false;
    }
  }

  return true;
}

/**
 * Comparator between two mappings where the original positions are compared.
 *
 * Optionally pass in `true` as `onlyCompareGenerated` to consider two
 * mappings with the same original source/line/column, but different generated
 * line and column the same. Useful when searching for a mapping with a
 * stubbed out mapping.
 */
function compareByOriginalPositions(mappingA, mappingB, onlyCompareOriginal) {
  var cmp = strcmp(mappingA.source, mappingB.source);
  if (cmp !== 0) {
    return cmp;
  }

  cmp = mappingA.originalLine - mappingB.originalLine;
  if (cmp !== 0) {
    return cmp;
  }

  cmp = mappingA.originalColumn - mappingB.originalColumn;
  if (cmp !== 0 || onlyCompareOriginal) {
    return cmp;
  }

  cmp = mappingA.generatedColumn - mappingB.generatedColumn;
  if (cmp !== 0) {
    return cmp;
  }

  cmp = mappingA.generatedLine - mappingB.generatedLine;
  if (cmp !== 0) {
    return cmp;
  }

  return strcmp(mappingA.name, mappingB.name);
}
exports.compareByOriginalPositions = compareByOriginalPositions;

/**
 * Comparator between two mappings with deflated source and name indices where
 * the generated positions are compared.
 *
 * Optionally pass in `true` as `onlyCompareGenerated` to consider two
 * mappings with the same generated line and column, but different
 * source/name/original line and column the same. Useful when searching for a
 * mapping with a stubbed out mapping.
 */
function compareByGeneratedPositionsDeflated(mappingA, mappingB, onlyCompareGenerated) {
  var cmp = mappingA.generatedLine - mappingB.generatedLine;
  if (cmp !== 0) {
    return cmp;
  }

  cmp = mappingA.generatedColumn - mappingB.generatedColumn;
  if (cmp !== 0 || onlyCompareGenerated) {
    return cmp;
  }

  cmp = strcmp(mappingA.source, mappingB.source);
  if (cmp !== 0) {
    return cmp;
  }

  cmp = mappingA.originalLine - mappingB.originalLine;
  if (cmp !== 0) {
    return cmp;
  }

  cmp = mappingA.originalColumn - mappingB.originalColumn;
  if (cmp !== 0) {
    return cmp;
  }

  return strcmp(mappingA.name, mappingB.name);
}
exports.compareByGeneratedPositionsDeflated = compareByGeneratedPositionsDeflated;

function strcmp(aStr1, aStr2) {
  if (aStr1 === aStr2) {
    return 0;
  }

  if (aStr1 === null) {
    return 1; // aStr2 !== null
  }

  if (aStr2 === null) {
    return -1; // aStr1 !== null
  }

  if (aStr1 > aStr2) {
    return 1;
  }

  return -1;
}

/**
 * Comparator between two mappings with inflated source and name strings where
 * the generated positions are compared.
 */
function compareByGeneratedPositionsInflated(mappingA, mappingB) {
  var cmp = mappingA.generatedLine - mappingB.generatedLine;
  if (cmp !== 0) {
    return cmp;
  }

  cmp = mappingA.generatedColumn - mappingB.generatedColumn;
  if (cmp !== 0) {
    return cmp;
  }

  cmp = strcmp(mappingA.source, mappingB.source);
  if (cmp !== 0) {
    return cmp;
  }

  cmp = mappingA.originalLine - mappingB.originalLine;
  if (cmp !== 0) {
    return cmp;
  }

  cmp = mappingA.originalColumn - mappingB.originalColumn;
  if (cmp !== 0) {
    return cmp;
  }

  return strcmp(mappingA.name, mappingB.name);
}
exports.compareByGeneratedPositionsInflated = compareByGeneratedPositionsInflated;

/**
 * Strip any JSON XSSI avoidance prefix from the string (as documented
 * in the source maps specification), and then parse the string as
 * JSON.
 */
function parseSourceMapInput(str) {
  return JSON.parse(str.replace(/^\)]}'[^\n]*\n/, ''));
}
exports.parseSourceMapInput = parseSourceMapInput;

/**
 * Compute the URL of a source given the the source root, the source's
 * URL, and the source map's URL.
 */
function computeSourceURL(sourceRoot, sourceURL, sourceMapURL) {
  sourceURL = sourceURL || '';

  if (sourceRoot) {
    // This follows what Chrome does.
    if (sourceRoot[sourceRoot.length - 1] !== '/' && sourceURL[0] !== '/') {
      sourceRoot += '/';
    }
    // The spec says:
    //   Line 4: An optional source root, useful for relocating source
    //   files on a server or removing repeated values in the
    //   “sources” entry.  This value is prepended to the individual
    //   entries in the “source” field.
    sourceURL = sourceRoot + sourceURL;
  }

  // Historically, SourceMapConsumer did not take the sourceMapURL as
  // a parameter.  This mode is still somewhat supported, which is why
  // this code block is conditional.  However, it's preferable to pass
  // the source map URL to SourceMapConsumer, so that this function
  // can implement the source URL resolution algorithm as outlined in
  // the spec.  This block is basically the equivalent of:
  //    new URL(sourceURL, sourceMapURL).toString()
  // ... except it avoids using URL, which wasn't available in the
  // older releases of node still supported by this library.
  //
  // The spec says:
  //   If the sources are not absolute URLs after prepending of the
  //   “sourceRoot”, the sources are resolved relative to the
  //   SourceMap (like resolving script src in a html document).
  if (sourceMapURL) {
    var parsed = urlParse(sourceMapURL);
    if (!parsed) {
      throw new Error("sourceMapURL could not be parsed");
    }
    if (parsed.path) {
      // Strip the last path component, but keep the "/".
      var index = parsed.path.lastIndexOf('/');
      if (index >= 0) {
        parsed.path = parsed.path.substring(0, index + 1);
      }
    }
    sourceURL = join(urlGenerate(parsed), sourceURL);
  }

  return normalize(sourceURL);
}
exports.computeSourceURL = computeSourceURL;
});
util.getArg;
util.urlParse;
util.urlGenerate;
util.normalize;
util.join;
util.isAbsolute;
util.relative;
util.toSetString;
util.fromSetString;
util.compareByOriginalPositions;
util.compareByGeneratedPositionsDeflated;
util.compareByGeneratedPositionsInflated;
util.parseSourceMapInput;
util.computeSourceURL;

/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */


var has = Object.prototype.hasOwnProperty;
var hasNativeMap = typeof Map !== "undefined";

/**
 * A data structure which is a combination of an array and a set. Adding a new
 * member is O(1), testing for membership is O(1), and finding the index of an
 * element is O(1). Removing elements from the set is not supported. Only
 * strings are supported for membership.
 */
function ArraySet() {
  this._array = [];
  this._set = hasNativeMap ? new Map() : Object.create(null);
}

/**
 * Static method for creating ArraySet instances from an existing array.
 */
ArraySet.fromArray = function ArraySet_fromArray(aArray, aAllowDuplicates) {
  var set = new ArraySet();
  for (var i = 0, len = aArray.length; i < len; i++) {
    set.add(aArray[i], aAllowDuplicates);
  }
  return set;
};

/**
 * Return how many unique items are in this ArraySet. If duplicates have been
 * added, than those do not count towards the size.
 *
 * @returns Number
 */
ArraySet.prototype.size = function ArraySet_size() {
  return hasNativeMap ? this._set.size : Object.getOwnPropertyNames(this._set).length;
};

/**
 * Add the given string to this set.
 *
 * @param String aStr
 */
ArraySet.prototype.add = function ArraySet_add(aStr, aAllowDuplicates) {
  var sStr = hasNativeMap ? aStr : util.toSetString(aStr);
  var isDuplicate = hasNativeMap ? this.has(aStr) : has.call(this._set, sStr);
  var idx = this._array.length;
  if (!isDuplicate || aAllowDuplicates) {
    this._array.push(aStr);
  }
  if (!isDuplicate) {
    if (hasNativeMap) {
      this._set.set(aStr, idx);
    } else {
      this._set[sStr] = idx;
    }
  }
};

/**
 * Is the given string a member of this set?
 *
 * @param String aStr
 */
ArraySet.prototype.has = function ArraySet_has(aStr) {
  if (hasNativeMap) {
    return this._set.has(aStr);
  } else {
    var sStr = util.toSetString(aStr);
    return has.call(this._set, sStr);
  }
};

/**
 * What is the index of the given string in the array?
 *
 * @param String aStr
 */
ArraySet.prototype.indexOf = function ArraySet_indexOf(aStr) {
  if (hasNativeMap) {
    var idx = this._set.get(aStr);
    if (idx >= 0) {
        return idx;
    }
  } else {
    var sStr = util.toSetString(aStr);
    if (has.call(this._set, sStr)) {
      return this._set[sStr];
    }
  }

  throw new Error('"' + aStr + '" is not in the set.');
};

/**
 * What is the element at the given index?
 *
 * @param Number aIdx
 */
ArraySet.prototype.at = function ArraySet_at(aIdx) {
  if (aIdx >= 0 && aIdx < this._array.length) {
    return this._array[aIdx];
  }
  throw new Error('No element indexed by ' + aIdx);
};

/**
 * Returns the array representation of this set (which has the proper indices
 * indicated by indexOf). Note that this is a copy of the internal array used
 * for storing the members so that no one can mess with internal state.
 */
ArraySet.prototype.toArray = function ArraySet_toArray() {
  return this._array.slice();
};

var ArraySet_1 = ArraySet;

var arraySet = {
	ArraySet: ArraySet_1
};

var binarySearch = createCommonjsModule(function (module, exports) {
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */

exports.GREATEST_LOWER_BOUND = 1;
exports.LEAST_UPPER_BOUND = 2;

/**
 * Recursive implementation of binary search.
 *
 * @param aLow Indices here and lower do not contain the needle.
 * @param aHigh Indices here and higher do not contain the needle.
 * @param aNeedle The element being searched for.
 * @param aHaystack The non-empty array being searched.
 * @param aCompare Function which takes two elements and returns -1, 0, or 1.
 * @param aBias Either 'binarySearch.GREATEST_LOWER_BOUND' or
 *     'binarySearch.LEAST_UPPER_BOUND'. Specifies whether to return the
 *     closest element that is smaller than or greater than the one we are
 *     searching for, respectively, if the exact element cannot be found.
 */
function recursiveSearch(aLow, aHigh, aNeedle, aHaystack, aCompare, aBias) {
  // This function terminates when one of the following is true:
  //
  //   1. We find the exact element we are looking for.
  //
  //   2. We did not find the exact element, but we can return the index of
  //      the next-closest element.
  //
  //   3. We did not find the exact element, and there is no next-closest
  //      element than the one we are searching for, so we return -1.
  var mid = Math.floor((aHigh - aLow) / 2) + aLow;
  var cmp = aCompare(aNeedle, aHaystack[mid], true);
  if (cmp === 0) {
    // Found the element we are looking for.
    return mid;
  }
  else if (cmp > 0) {
    // Our needle is greater than aHaystack[mid].
    if (aHigh - mid > 1) {
      // The element is in the upper half.
      return recursiveSearch(mid, aHigh, aNeedle, aHaystack, aCompare, aBias);
    }

    // The exact needle element was not found in this haystack. Determine if
    // we are in termination case (3) or (2) and return the appropriate thing.
    if (aBias == exports.LEAST_UPPER_BOUND) {
      return aHigh < aHaystack.length ? aHigh : -1;
    } else {
      return mid;
    }
  }
  else {
    // Our needle is less than aHaystack[mid].
    if (mid - aLow > 1) {
      // The element is in the lower half.
      return recursiveSearch(aLow, mid, aNeedle, aHaystack, aCompare, aBias);
    }

    // we are in termination case (3) or (2) and return the appropriate thing.
    if (aBias == exports.LEAST_UPPER_BOUND) {
      return mid;
    } else {
      return aLow < 0 ? -1 : aLow;
    }
  }
}

/**
 * This is an implementation of binary search which will always try and return
 * the index of the closest element if there is no exact hit. This is because
 * mappings between original and generated line/col pairs are single points,
 * and there is an implicit region between each of them, so a miss just means
 * that you aren't on the very start of a region.
 *
 * @param aNeedle The element you are looking for.
 * @param aHaystack The array that is being searched.
 * @param aCompare A function which takes the needle and an element in the
 *     array and returns -1, 0, or 1 depending on whether the needle is less
 *     than, equal to, or greater than the element, respectively.
 * @param aBias Either 'binarySearch.GREATEST_LOWER_BOUND' or
 *     'binarySearch.LEAST_UPPER_BOUND'. Specifies whether to return the
 *     closest element that is smaller than or greater than the one we are
 *     searching for, respectively, if the exact element cannot be found.
 *     Defaults to 'binarySearch.GREATEST_LOWER_BOUND'.
 */
exports.search = function search(aNeedle, aHaystack, aCompare, aBias) {
  if (aHaystack.length === 0) {
    return -1;
  }

  var index = recursiveSearch(-1, aHaystack.length, aNeedle, aHaystack,
                              aCompare, aBias || exports.GREATEST_LOWER_BOUND);
  if (index < 0) {
    return -1;
  }

  // We have found either the exact element, or the next-closest element than
  // the one we are searching for. However, there may be more than one such
  // element. Make sure we always return the smallest of these.
  while (index - 1 >= 0) {
    if (aCompare(aHaystack[index], aHaystack[index - 1], true) !== 0) {
      break;
    }
    --index;
  }

  return index;
};
});
binarySearch.GREATEST_LOWER_BOUND;
binarySearch.LEAST_UPPER_BOUND;
binarySearch.search;

/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */

// It turns out that some (most?) JavaScript engines don't self-host
// `Array.prototype.sort`. This makes sense because C++ will likely remain
// faster than JS when doing raw CPU-intensive sorting. However, when using a
// custom comparator function, calling back and forth between the VM's C++ and
// JIT'd JS is rather slow *and* loses JIT type information, resulting in
// worse generated code for the comparator function than would be optimal. In
// fact, when sorting with a comparator, these costs outweigh the benefits of
// sorting in C++. By using our own JS-implemented Quick Sort (below), we get
// a ~3500ms mean speed-up in `bench/bench.html`.

/**
 * Swap the elements indexed by `x` and `y` in the array `ary`.
 *
 * @param {Array} ary
 *        The array.
 * @param {Number} x
 *        The index of the first item.
 * @param {Number} y
 *        The index of the second item.
 */
function swap(ary, x, y) {
  var temp = ary[x];
  ary[x] = ary[y];
  ary[y] = temp;
}

/**
 * Returns a random integer within the range `low .. high` inclusive.
 *
 * @param {Number} low
 *        The lower bound on the range.
 * @param {Number} high
 *        The upper bound on the range.
 */
function randomIntInRange(low, high) {
  return Math.round(low + (Math.random() * (high - low)));
}

/**
 * The Quick Sort algorithm.
 *
 * @param {Array} ary
 *        An array to sort.
 * @param {function} comparator
 *        Function to use to compare two items.
 * @param {Number} p
 *        Start index of the array
 * @param {Number} r
 *        End index of the array
 */
function doQuickSort(ary, comparator, p, r) {
  // If our lower bound is less than our upper bound, we (1) partition the
  // array into two pieces and (2) recurse on each half. If it is not, this is
  // the empty array and our base case.

  if (p < r) {
    // (1) Partitioning.
    //
    // The partitioning chooses a pivot between `p` and `r` and moves all
    // elements that are less than or equal to the pivot to the before it, and
    // all the elements that are greater than it after it. The effect is that
    // once partition is done, the pivot is in the exact place it will be when
    // the array is put in sorted order, and it will not need to be moved
    // again. This runs in O(n) time.

    // Always choose a random pivot so that an input array which is reverse
    // sorted does not cause O(n^2) running time.
    var pivotIndex = randomIntInRange(p, r);
    var i = p - 1;

    swap(ary, pivotIndex, r);
    var pivot = ary[r];

    // Immediately after `j` is incremented in this loop, the following hold
    // true:
    //
    //   * Every element in `ary[p .. i]` is less than or equal to the pivot.
    //
    //   * Every element in `ary[i+1 .. j-1]` is greater than the pivot.
    for (var j = p; j < r; j++) {
      if (comparator(ary[j], pivot) <= 0) {
        i += 1;
        swap(ary, i, j);
      }
    }

    swap(ary, i + 1, j);
    var q = i + 1;

    // (2) Recurse on each half.

    doQuickSort(ary, comparator, p, q - 1);
    doQuickSort(ary, comparator, q + 1, r);
  }
}

/**
 * Sort the given array in-place with the given comparator function.
 *
 * @param {Array} ary
 *        An array to sort.
 * @param {function} comparator
 *        Function to use to compare two items.
 */
var quickSort_1 = function (ary, comparator) {
  doQuickSort(ary, comparator, 0, ary.length - 1);
};

var quickSort = {
	quickSort: quickSort_1
};

/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */



var ArraySet$1 = arraySet.ArraySet;

var quickSort$1 = quickSort.quickSort;

function SourceMapConsumer(aSourceMap, aSourceMapURL) {
  var sourceMap = aSourceMap;
  if (typeof aSourceMap === 'string') {
    sourceMap = util.parseSourceMapInput(aSourceMap);
  }

  return sourceMap.sections != null
    ? new IndexedSourceMapConsumer(sourceMap, aSourceMapURL)
    : new BasicSourceMapConsumer(sourceMap, aSourceMapURL);
}

SourceMapConsumer.fromSourceMap = function(aSourceMap, aSourceMapURL) {
  return BasicSourceMapConsumer.fromSourceMap(aSourceMap, aSourceMapURL);
};

/**
 * The version of the source mapping spec that we are consuming.
 */
SourceMapConsumer.prototype._version = 3;

// `__generatedMappings` and `__originalMappings` are arrays that hold the
// parsed mapping coordinates from the source map's "mappings" attribute. They
// are lazily instantiated, accessed via the `_generatedMappings` and
// `_originalMappings` getters respectively, and we only parse the mappings
// and create these arrays once queried for a source location. We jump through
// these hoops because there can be many thousands of mappings, and parsing
// them is expensive, so we only want to do it if we must.
//
// Each object in the arrays is of the form:
//
//     {
//       generatedLine: The line number in the generated code,
//       generatedColumn: The column number in the generated code,
//       source: The path to the original source file that generated this
//               chunk of code,
//       originalLine: The line number in the original source that
//                     corresponds to this chunk of generated code,
//       originalColumn: The column number in the original source that
//                       corresponds to this chunk of generated code,
//       name: The name of the original symbol which generated this chunk of
//             code.
//     }
//
// All properties except for `generatedLine` and `generatedColumn` can be
// `null`.
//
// `_generatedMappings` is ordered by the generated positions.
//
// `_originalMappings` is ordered by the original positions.

SourceMapConsumer.prototype.__generatedMappings = null;
Object.defineProperty(SourceMapConsumer.prototype, '_generatedMappings', {
  configurable: true,
  enumerable: true,
  get: function () {
    if (!this.__generatedMappings) {
      this._parseMappings(this._mappings, this.sourceRoot);
    }

    return this.__generatedMappings;
  }
});

SourceMapConsumer.prototype.__originalMappings = null;
Object.defineProperty(SourceMapConsumer.prototype, '_originalMappings', {
  configurable: true,
  enumerable: true,
  get: function () {
    if (!this.__originalMappings) {
      this._parseMappings(this._mappings, this.sourceRoot);
    }

    return this.__originalMappings;
  }
});

SourceMapConsumer.prototype._charIsMappingSeparator =
  function SourceMapConsumer_charIsMappingSeparator(aStr, index) {
    var c = aStr.charAt(index);
    return c === ";" || c === ",";
  };

/**
 * Parse the mappings in a string in to a data structure which we can easily
 * query (the ordered arrays in the `this.__generatedMappings` and
 * `this.__originalMappings` properties).
 */
SourceMapConsumer.prototype._parseMappings =
  function SourceMapConsumer_parseMappings(aStr, aSourceRoot) {
    throw new Error("Subclasses must implement _parseMappings");
  };

SourceMapConsumer.GENERATED_ORDER = 1;
SourceMapConsumer.ORIGINAL_ORDER = 2;

SourceMapConsumer.GREATEST_LOWER_BOUND = 1;
SourceMapConsumer.LEAST_UPPER_BOUND = 2;

/**
 * Iterate over each mapping between an original source/line/column and a
 * generated line/column in this source map.
 *
 * @param Function aCallback
 *        The function that is called with each mapping.
 * @param Object aContext
 *        Optional. If specified, this object will be the value of `this` every
 *        time that `aCallback` is called.
 * @param aOrder
 *        Either `SourceMapConsumer.GENERATED_ORDER` or
 *        `SourceMapConsumer.ORIGINAL_ORDER`. Specifies whether you want to
 *        iterate over the mappings sorted by the generated file's line/column
 *        order or the original's source/line/column order, respectively. Defaults to
 *        `SourceMapConsumer.GENERATED_ORDER`.
 */
SourceMapConsumer.prototype.eachMapping =
  function SourceMapConsumer_eachMapping(aCallback, aContext, aOrder) {
    var context = aContext || null;
    var order = aOrder || SourceMapConsumer.GENERATED_ORDER;

    var mappings;
    switch (order) {
    case SourceMapConsumer.GENERATED_ORDER:
      mappings = this._generatedMappings;
      break;
    case SourceMapConsumer.ORIGINAL_ORDER:
      mappings = this._originalMappings;
      break;
    default:
      throw new Error("Unknown order of iteration.");
    }

    var sourceRoot = this.sourceRoot;
    mappings.map(function (mapping) {
      var source = mapping.source === null ? null : this._sources.at(mapping.source);
      source = util.computeSourceURL(sourceRoot, source, this._sourceMapURL);
      return {
        source: source,
        generatedLine: mapping.generatedLine,
        generatedColumn: mapping.generatedColumn,
        originalLine: mapping.originalLine,
        originalColumn: mapping.originalColumn,
        name: mapping.name === null ? null : this._names.at(mapping.name)
      };
    }, this).forEach(aCallback, context);
  };

/**
 * Returns all generated line and column information for the original source,
 * line, and column provided. If no column is provided, returns all mappings
 * corresponding to a either the line we are searching for or the next
 * closest line that has any mappings. Otherwise, returns all mappings
 * corresponding to the given line and either the column we are searching for
 * or the next closest column that has any offsets.
 *
 * The only argument is an object with the following properties:
 *
 *   - source: The filename of the original source.
 *   - line: The line number in the original source.  The line number is 1-based.
 *   - column: Optional. the column number in the original source.
 *    The column number is 0-based.
 *
 * and an array of objects is returned, each with the following properties:
 *
 *   - line: The line number in the generated source, or null.  The
 *    line number is 1-based.
 *   - column: The column number in the generated source, or null.
 *    The column number is 0-based.
 */
SourceMapConsumer.prototype.allGeneratedPositionsFor =
  function SourceMapConsumer_allGeneratedPositionsFor(aArgs) {
    var line = util.getArg(aArgs, 'line');

    // When there is no exact match, BasicSourceMapConsumer.prototype._findMapping
    // returns the index of the closest mapping less than the needle. By
    // setting needle.originalColumn to 0, we thus find the last mapping for
    // the given line, provided such a mapping exists.
    var needle = {
      source: util.getArg(aArgs, 'source'),
      originalLine: line,
      originalColumn: util.getArg(aArgs, 'column', 0)
    };

    needle.source = this._findSourceIndex(needle.source);
    if (needle.source < 0) {
      return [];
    }

    var mappings = [];

    var index = this._findMapping(needle,
                                  this._originalMappings,
                                  "originalLine",
                                  "originalColumn",
                                  util.compareByOriginalPositions,
                                  binarySearch.LEAST_UPPER_BOUND);
    if (index >= 0) {
      var mapping = this._originalMappings[index];

      if (aArgs.column === undefined) {
        var originalLine = mapping.originalLine;

        // Iterate until either we run out of mappings, or we run into
        // a mapping for a different line than the one we found. Since
        // mappings are sorted, this is guaranteed to find all mappings for
        // the line we found.
        while (mapping && mapping.originalLine === originalLine) {
          mappings.push({
            line: util.getArg(mapping, 'generatedLine', null),
            column: util.getArg(mapping, 'generatedColumn', null),
            lastColumn: util.getArg(mapping, 'lastGeneratedColumn', null)
          });

          mapping = this._originalMappings[++index];
        }
      } else {
        var originalColumn = mapping.originalColumn;

        // Iterate until either we run out of mappings, or we run into
        // a mapping for a different line than the one we were searching for.
        // Since mappings are sorted, this is guaranteed to find all mappings for
        // the line we are searching for.
        while (mapping &&
               mapping.originalLine === line &&
               mapping.originalColumn == originalColumn) {
          mappings.push({
            line: util.getArg(mapping, 'generatedLine', null),
            column: util.getArg(mapping, 'generatedColumn', null),
            lastColumn: util.getArg(mapping, 'lastGeneratedColumn', null)
          });

          mapping = this._originalMappings[++index];
        }
      }
    }

    return mappings;
  };

var SourceMapConsumer_1 = SourceMapConsumer;

/**
 * A BasicSourceMapConsumer instance represents a parsed source map which we can
 * query for information about the original file positions by giving it a file
 * position in the generated source.
 *
 * The first parameter is the raw source map (either as a JSON string, or
 * already parsed to an object). According to the spec, source maps have the
 * following attributes:
 *
 *   - version: Which version of the source map spec this map is following.
 *   - sources: An array of URLs to the original source files.
 *   - names: An array of identifiers which can be referrenced by individual mappings.
 *   - sourceRoot: Optional. The URL root from which all sources are relative.
 *   - sourcesContent: Optional. An array of contents of the original source files.
 *   - mappings: A string of base64 VLQs which contain the actual mappings.
 *   - file: Optional. The generated file this source map is associated with.
 *
 * Here is an example source map, taken from the source map spec[0]:
 *
 *     {
 *       version : 3,
 *       file: "out.js",
 *       sourceRoot : "",
 *       sources: ["foo.js", "bar.js"],
 *       names: ["src", "maps", "are", "fun"],
 *       mappings: "AA,AB;;ABCDE;"
 *     }
 *
 * The second parameter, if given, is a string whose value is the URL
 * at which the source map was found.  This URL is used to compute the
 * sources array.
 *
 * [0]: https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit?pli=1#
 */
function BasicSourceMapConsumer(aSourceMap, aSourceMapURL) {
  var sourceMap = aSourceMap;
  if (typeof aSourceMap === 'string') {
    sourceMap = util.parseSourceMapInput(aSourceMap);
  }

  var version = util.getArg(sourceMap, 'version');
  var sources = util.getArg(sourceMap, 'sources');
  // Sass 3.3 leaves out the 'names' array, so we deviate from the spec (which
  // requires the array) to play nice here.
  var names = util.getArg(sourceMap, 'names', []);
  var sourceRoot = util.getArg(sourceMap, 'sourceRoot', null);
  var sourcesContent = util.getArg(sourceMap, 'sourcesContent', null);
  var mappings = util.getArg(sourceMap, 'mappings');
  var file = util.getArg(sourceMap, 'file', null);

  // Once again, Sass deviates from the spec and supplies the version as a
  // string rather than a number, so we use loose equality checking here.
  if (version != this._version) {
    throw new Error('Unsupported version: ' + version);
  }

  if (sourceRoot) {
    sourceRoot = util.normalize(sourceRoot);
  }

  sources = sources
    .map(String)
    // Some source maps produce relative source paths like "./foo.js" instead of
    // "foo.js".  Normalize these first so that future comparisons will succeed.
    // See bugzil.la/1090768.
    .map(util.normalize)
    // Always ensure that absolute sources are internally stored relative to
    // the source root, if the source root is absolute. Not doing this would
    // be particularly problematic when the source root is a prefix of the
    // source (valid, but why??). See github issue #199 and bugzil.la/1188982.
    .map(function (source) {
      return sourceRoot && util.isAbsolute(sourceRoot) && util.isAbsolute(source)
        ? util.relative(sourceRoot, source)
        : source;
    });

  // Pass `true` below to allow duplicate names and sources. While source maps
  // are intended to be compressed and deduplicated, the TypeScript compiler
  // sometimes generates source maps with duplicates in them. See Github issue
  // #72 and bugzil.la/889492.
  this._names = ArraySet$1.fromArray(names.map(String), true);
  this._sources = ArraySet$1.fromArray(sources, true);

  this._absoluteSources = this._sources.toArray().map(function (s) {
    return util.computeSourceURL(sourceRoot, s, aSourceMapURL);
  });

  this.sourceRoot = sourceRoot;
  this.sourcesContent = sourcesContent;
  this._mappings = mappings;
  this._sourceMapURL = aSourceMapURL;
  this.file = file;
}

BasicSourceMapConsumer.prototype = Object.create(SourceMapConsumer.prototype);
BasicSourceMapConsumer.prototype.consumer = SourceMapConsumer;

/**
 * Utility function to find the index of a source.  Returns -1 if not
 * found.
 */
BasicSourceMapConsumer.prototype._findSourceIndex = function(aSource) {
  var relativeSource = aSource;
  if (this.sourceRoot != null) {
    relativeSource = util.relative(this.sourceRoot, relativeSource);
  }

  if (this._sources.has(relativeSource)) {
    return this._sources.indexOf(relativeSource);
  }

  // Maybe aSource is an absolute URL as returned by |sources|.  In
  // this case we can't simply undo the transform.
  var i;
  for (i = 0; i < this._absoluteSources.length; ++i) {
    if (this._absoluteSources[i] == aSource) {
      return i;
    }
  }

  return -1;
};

/**
 * Create a BasicSourceMapConsumer from a SourceMapGenerator.
 *
 * @param SourceMapGenerator aSourceMap
 *        The source map that will be consumed.
 * @param String aSourceMapURL
 *        The URL at which the source map can be found (optional)
 * @returns BasicSourceMapConsumer
 */
BasicSourceMapConsumer.fromSourceMap =
  function SourceMapConsumer_fromSourceMap(aSourceMap, aSourceMapURL) {
    var smc = Object.create(BasicSourceMapConsumer.prototype);

    var names = smc._names = ArraySet$1.fromArray(aSourceMap._names.toArray(), true);
    var sources = smc._sources = ArraySet$1.fromArray(aSourceMap._sources.toArray(), true);
    smc.sourceRoot = aSourceMap._sourceRoot;
    smc.sourcesContent = aSourceMap._generateSourcesContent(smc._sources.toArray(),
                                                            smc.sourceRoot);
    smc.file = aSourceMap._file;
    smc._sourceMapURL = aSourceMapURL;
    smc._absoluteSources = smc._sources.toArray().map(function (s) {
      return util.computeSourceURL(smc.sourceRoot, s, aSourceMapURL);
    });

    // Because we are modifying the entries (by converting string sources and
    // names to indices into the sources and names ArraySets), we have to make
    // a copy of the entry or else bad things happen. Shared mutable state
    // strikes again! See github issue #191.

    var generatedMappings = aSourceMap._mappings.toArray().slice();
    var destGeneratedMappings = smc.__generatedMappings = [];
    var destOriginalMappings = smc.__originalMappings = [];

    for (var i = 0, length = generatedMappings.length; i < length; i++) {
      var srcMapping = generatedMappings[i];
      var destMapping = new Mapping;
      destMapping.generatedLine = srcMapping.generatedLine;
      destMapping.generatedColumn = srcMapping.generatedColumn;

      if (srcMapping.source) {
        destMapping.source = sources.indexOf(srcMapping.source);
        destMapping.originalLine = srcMapping.originalLine;
        destMapping.originalColumn = srcMapping.originalColumn;

        if (srcMapping.name) {
          destMapping.name = names.indexOf(srcMapping.name);
        }

        destOriginalMappings.push(destMapping);
      }

      destGeneratedMappings.push(destMapping);
    }

    quickSort$1(smc.__originalMappings, util.compareByOriginalPositions);

    return smc;
  };

/**
 * The version of the source mapping spec that we are consuming.
 */
BasicSourceMapConsumer.prototype._version = 3;

/**
 * The list of original sources.
 */
Object.defineProperty(BasicSourceMapConsumer.prototype, 'sources', {
  get: function () {
    return this._absoluteSources.slice();
  }
});

/**
 * Provide the JIT with a nice shape / hidden class.
 */
function Mapping() {
  this.generatedLine = 0;
  this.generatedColumn = 0;
  this.source = null;
  this.originalLine = null;
  this.originalColumn = null;
  this.name = null;
}

/**
 * Parse the mappings in a string in to a data structure which we can easily
 * query (the ordered arrays in the `this.__generatedMappings` and
 * `this.__originalMappings` properties).
 */
BasicSourceMapConsumer.prototype._parseMappings =
  function SourceMapConsumer_parseMappings(aStr, aSourceRoot) {
    var generatedLine = 1;
    var previousGeneratedColumn = 0;
    var previousOriginalLine = 0;
    var previousOriginalColumn = 0;
    var previousSource = 0;
    var previousName = 0;
    var length = aStr.length;
    var index = 0;
    var cachedSegments = {};
    var temp = {};
    var originalMappings = [];
    var generatedMappings = [];
    var mapping, str, segment, end, value;

    while (index < length) {
      if (aStr.charAt(index) === ';') {
        generatedLine++;
        index++;
        previousGeneratedColumn = 0;
      }
      else if (aStr.charAt(index) === ',') {
        index++;
      }
      else {
        mapping = new Mapping();
        mapping.generatedLine = generatedLine;

        // Because each offset is encoded relative to the previous one,
        // many segments often have the same encoding. We can exploit this
        // fact by caching the parsed variable length fields of each segment,
        // allowing us to avoid a second parse if we encounter the same
        // segment again.
        for (end = index; end < length; end++) {
          if (this._charIsMappingSeparator(aStr, end)) {
            break;
          }
        }
        str = aStr.slice(index, end);

        segment = cachedSegments[str];
        if (segment) {
          index += str.length;
        } else {
          segment = [];
          while (index < end) {
            base64Vlq.decode(aStr, index, temp);
            value = temp.value;
            index = temp.rest;
            segment.push(value);
          }

          if (segment.length === 2) {
            throw new Error('Found a source, but no line and column');
          }

          if (segment.length === 3) {
            throw new Error('Found a source and line, but no column');
          }

          cachedSegments[str] = segment;
        }

        // Generated column.
        mapping.generatedColumn = previousGeneratedColumn + segment[0];
        previousGeneratedColumn = mapping.generatedColumn;

        if (segment.length > 1) {
          // Original source.
          mapping.source = previousSource + segment[1];
          previousSource += segment[1];

          // Original line.
          mapping.originalLine = previousOriginalLine + segment[2];
          previousOriginalLine = mapping.originalLine;
          // Lines are stored 0-based
          mapping.originalLine += 1;

          // Original column.
          mapping.originalColumn = previousOriginalColumn + segment[3];
          previousOriginalColumn = mapping.originalColumn;

          if (segment.length > 4) {
            // Original name.
            mapping.name = previousName + segment[4];
            previousName += segment[4];
          }
        }

        generatedMappings.push(mapping);
        if (typeof mapping.originalLine === 'number') {
          originalMappings.push(mapping);
        }
      }
    }

    quickSort$1(generatedMappings, util.compareByGeneratedPositionsDeflated);
    this.__generatedMappings = generatedMappings;

    quickSort$1(originalMappings, util.compareByOriginalPositions);
    this.__originalMappings = originalMappings;
  };

/**
 * Find the mapping that best matches the hypothetical "needle" mapping that
 * we are searching for in the given "haystack" of mappings.
 */
BasicSourceMapConsumer.prototype._findMapping =
  function SourceMapConsumer_findMapping(aNeedle, aMappings, aLineName,
                                         aColumnName, aComparator, aBias) {
    // To return the position we are searching for, we must first find the
    // mapping for the given position and then return the opposite position it
    // points to. Because the mappings are sorted, we can use binary search to
    // find the best mapping.

    if (aNeedle[aLineName] <= 0) {
      throw new TypeError('Line must be greater than or equal to 1, got '
                          + aNeedle[aLineName]);
    }
    if (aNeedle[aColumnName] < 0) {
      throw new TypeError('Column must be greater than or equal to 0, got '
                          + aNeedle[aColumnName]);
    }

    return binarySearch.search(aNeedle, aMappings, aComparator, aBias);
  };

/**
 * Compute the last column for each generated mapping. The last column is
 * inclusive.
 */
BasicSourceMapConsumer.prototype.computeColumnSpans =
  function SourceMapConsumer_computeColumnSpans() {
    for (var index = 0; index < this._generatedMappings.length; ++index) {
      var mapping = this._generatedMappings[index];

      // Mappings do not contain a field for the last generated columnt. We
      // can come up with an optimistic estimate, however, by assuming that
      // mappings are contiguous (i.e. given two consecutive mappings, the
      // first mapping ends where the second one starts).
      if (index + 1 < this._generatedMappings.length) {
        var nextMapping = this._generatedMappings[index + 1];

        if (mapping.generatedLine === nextMapping.generatedLine) {
          mapping.lastGeneratedColumn = nextMapping.generatedColumn - 1;
          continue;
        }
      }

      // The last mapping for each line spans the entire line.
      mapping.lastGeneratedColumn = Infinity;
    }
  };

/**
 * Returns the original source, line, and column information for the generated
 * source's line and column positions provided. The only argument is an object
 * with the following properties:
 *
 *   - line: The line number in the generated source.  The line number
 *     is 1-based.
 *   - column: The column number in the generated source.  The column
 *     number is 0-based.
 *   - bias: Either 'SourceMapConsumer.GREATEST_LOWER_BOUND' or
 *     'SourceMapConsumer.LEAST_UPPER_BOUND'. Specifies whether to return the
 *     closest element that is smaller than or greater than the one we are
 *     searching for, respectively, if the exact element cannot be found.
 *     Defaults to 'SourceMapConsumer.GREATEST_LOWER_BOUND'.
 *
 * and an object is returned with the following properties:
 *
 *   - source: The original source file, or null.
 *   - line: The line number in the original source, or null.  The
 *     line number is 1-based.
 *   - column: The column number in the original source, or null.  The
 *     column number is 0-based.
 *   - name: The original identifier, or null.
 */
BasicSourceMapConsumer.prototype.originalPositionFor =
  function SourceMapConsumer_originalPositionFor(aArgs) {
    var needle = {
      generatedLine: util.getArg(aArgs, 'line'),
      generatedColumn: util.getArg(aArgs, 'column')
    };

    var index = this._findMapping(
      needle,
      this._generatedMappings,
      "generatedLine",
      "generatedColumn",
      util.compareByGeneratedPositionsDeflated,
      util.getArg(aArgs, 'bias', SourceMapConsumer.GREATEST_LOWER_BOUND)
    );

    if (index >= 0) {
      var mapping = this._generatedMappings[index];

      if (mapping.generatedLine === needle.generatedLine) {
        var source = util.getArg(mapping, 'source', null);
        if (source !== null) {
          source = this._sources.at(source);
          source = util.computeSourceURL(this.sourceRoot, source, this._sourceMapURL);
        }
        var name = util.getArg(mapping, 'name', null);
        if (name !== null) {
          name = this._names.at(name);
        }
        return {
          source: source,
          line: util.getArg(mapping, 'originalLine', null),
          column: util.getArg(mapping, 'originalColumn', null),
          name: name
        };
      }
    }

    return {
      source: null,
      line: null,
      column: null,
      name: null
    };
  };

/**
 * Return true if we have the source content for every source in the source
 * map, false otherwise.
 */
BasicSourceMapConsumer.prototype.hasContentsOfAllSources =
  function BasicSourceMapConsumer_hasContentsOfAllSources() {
    if (!this.sourcesContent) {
      return false;
    }
    return this.sourcesContent.length >= this._sources.size() &&
      !this.sourcesContent.some(function (sc) { return sc == null; });
  };

/**
 * Returns the original source content. The only argument is the url of the
 * original source file. Returns null if no original source content is
 * available.
 */
BasicSourceMapConsumer.prototype.sourceContentFor =
  function SourceMapConsumer_sourceContentFor(aSource, nullOnMissing) {
    if (!this.sourcesContent) {
      return null;
    }

    var index = this._findSourceIndex(aSource);
    if (index >= 0) {
      return this.sourcesContent[index];
    }

    var relativeSource = aSource;
    if (this.sourceRoot != null) {
      relativeSource = util.relative(this.sourceRoot, relativeSource);
    }

    var url;
    if (this.sourceRoot != null
        && (url = util.urlParse(this.sourceRoot))) {
      // XXX: file:// URIs and absolute paths lead to unexpected behavior for
      // many users. We can help them out when they expect file:// URIs to
      // behave like it would if they were running a local HTTP server. See
      // https://bugzilla.mozilla.org/show_bug.cgi?id=885597.
      var fileUriAbsPath = relativeSource.replace(/^file:\/\//, "");
      if (url.scheme == "file"
          && this._sources.has(fileUriAbsPath)) {
        return this.sourcesContent[this._sources.indexOf(fileUriAbsPath)]
      }

      if ((!url.path || url.path == "/")
          && this._sources.has("/" + relativeSource)) {
        return this.sourcesContent[this._sources.indexOf("/" + relativeSource)];
      }
    }

    // This function is used recursively from
    // IndexedSourceMapConsumer.prototype.sourceContentFor. In that case, we
    // don't want to throw if we can't find the source - we just want to
    // return null, so we provide a flag to exit gracefully.
    if (nullOnMissing) {
      return null;
    }
    else {
      throw new Error('"' + relativeSource + '" is not in the SourceMap.');
    }
  };

/**
 * Returns the generated line and column information for the original source,
 * line, and column positions provided. The only argument is an object with
 * the following properties:
 *
 *   - source: The filename of the original source.
 *   - line: The line number in the original source.  The line number
 *     is 1-based.
 *   - column: The column number in the original source.  The column
 *     number is 0-based.
 *   - bias: Either 'SourceMapConsumer.GREATEST_LOWER_BOUND' or
 *     'SourceMapConsumer.LEAST_UPPER_BOUND'. Specifies whether to return the
 *     closest element that is smaller than or greater than the one we are
 *     searching for, respectively, if the exact element cannot be found.
 *     Defaults to 'SourceMapConsumer.GREATEST_LOWER_BOUND'.
 *
 * and an object is returned with the following properties:
 *
 *   - line: The line number in the generated source, or null.  The
 *     line number is 1-based.
 *   - column: The column number in the generated source, or null.
 *     The column number is 0-based.
 */
BasicSourceMapConsumer.prototype.generatedPositionFor =
  function SourceMapConsumer_generatedPositionFor(aArgs) {
    var source = util.getArg(aArgs, 'source');
    source = this._findSourceIndex(source);
    if (source < 0) {
      return {
        line: null,
        column: null,
        lastColumn: null
      };
    }

    var needle = {
      source: source,
      originalLine: util.getArg(aArgs, 'line'),
      originalColumn: util.getArg(aArgs, 'column')
    };

    var index = this._findMapping(
      needle,
      this._originalMappings,
      "originalLine",
      "originalColumn",
      util.compareByOriginalPositions,
      util.getArg(aArgs, 'bias', SourceMapConsumer.GREATEST_LOWER_BOUND)
    );

    if (index >= 0) {
      var mapping = this._originalMappings[index];

      if (mapping.source === needle.source) {
        return {
          line: util.getArg(mapping, 'generatedLine', null),
          column: util.getArg(mapping, 'generatedColumn', null),
          lastColumn: util.getArg(mapping, 'lastGeneratedColumn', null)
        };
      }
    }

    return {
      line: null,
      column: null,
      lastColumn: null
    };
  };

var BasicSourceMapConsumer_1 = BasicSourceMapConsumer;

/**
 * An IndexedSourceMapConsumer instance represents a parsed source map which
 * we can query for information. It differs from BasicSourceMapConsumer in
 * that it takes "indexed" source maps (i.e. ones with a "sections" field) as
 * input.
 *
 * The first parameter is a raw source map (either as a JSON string, or already
 * parsed to an object). According to the spec for indexed source maps, they
 * have the following attributes:
 *
 *   - version: Which version of the source map spec this map is following.
 *   - file: Optional. The generated file this source map is associated with.
 *   - sections: A list of section definitions.
 *
 * Each value under the "sections" field has two fields:
 *   - offset: The offset into the original specified at which this section
 *       begins to apply, defined as an object with a "line" and "column"
 *       field.
 *   - map: A source map definition. This source map could also be indexed,
 *       but doesn't have to be.
 *
 * Instead of the "map" field, it's also possible to have a "url" field
 * specifying a URL to retrieve a source map from, but that's currently
 * unsupported.
 *
 * Here's an example source map, taken from the source map spec[0], but
 * modified to omit a section which uses the "url" field.
 *
 *  {
 *    version : 3,
 *    file: "app.js",
 *    sections: [{
 *      offset: {line:100, column:10},
 *      map: {
 *        version : 3,
 *        file: "section.js",
 *        sources: ["foo.js", "bar.js"],
 *        names: ["src", "maps", "are", "fun"],
 *        mappings: "AAAA,E;;ABCDE;"
 *      }
 *    }],
 *  }
 *
 * The second parameter, if given, is a string whose value is the URL
 * at which the source map was found.  This URL is used to compute the
 * sources array.
 *
 * [0]: https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit#heading=h.535es3xeprgt
 */
function IndexedSourceMapConsumer(aSourceMap, aSourceMapURL) {
  var sourceMap = aSourceMap;
  if (typeof aSourceMap === 'string') {
    sourceMap = util.parseSourceMapInput(aSourceMap);
  }

  var version = util.getArg(sourceMap, 'version');
  var sections = util.getArg(sourceMap, 'sections');

  if (version != this._version) {
    throw new Error('Unsupported version: ' + version);
  }

  this._sources = new ArraySet$1();
  this._names = new ArraySet$1();

  var lastOffset = {
    line: -1,
    column: 0
  };
  this._sections = sections.map(function (s) {
    if (s.url) {
      // The url field will require support for asynchronicity.
      // See https://github.com/mozilla/source-map/issues/16
      throw new Error('Support for url field in sections not implemented.');
    }
    var offset = util.getArg(s, 'offset');
    var offsetLine = util.getArg(offset, 'line');
    var offsetColumn = util.getArg(offset, 'column');

    if (offsetLine < lastOffset.line ||
        (offsetLine === lastOffset.line && offsetColumn < lastOffset.column)) {
      throw new Error('Section offsets must be ordered and non-overlapping.');
    }
    lastOffset = offset;

    return {
      generatedOffset: {
        // The offset fields are 0-based, but we use 1-based indices when
        // encoding/decoding from VLQ.
        generatedLine: offsetLine + 1,
        generatedColumn: offsetColumn + 1
      },
      consumer: new SourceMapConsumer(util.getArg(s, 'map'), aSourceMapURL)
    }
  });
}

IndexedSourceMapConsumer.prototype = Object.create(SourceMapConsumer.prototype);
IndexedSourceMapConsumer.prototype.constructor = SourceMapConsumer;

/**
 * The version of the source mapping spec that we are consuming.
 */
IndexedSourceMapConsumer.prototype._version = 3;

/**
 * The list of original sources.
 */
Object.defineProperty(IndexedSourceMapConsumer.prototype, 'sources', {
  get: function () {
    var sources = [];
    for (var i = 0; i < this._sections.length; i++) {
      for (var j = 0; j < this._sections[i].consumer.sources.length; j++) {
        sources.push(this._sections[i].consumer.sources[j]);
      }
    }
    return sources;
  }
});

/**
 * Returns the original source, line, and column information for the generated
 * source's line and column positions provided. The only argument is an object
 * with the following properties:
 *
 *   - line: The line number in the generated source.  The line number
 *     is 1-based.
 *   - column: The column number in the generated source.  The column
 *     number is 0-based.
 *
 * and an object is returned with the following properties:
 *
 *   - source: The original source file, or null.
 *   - line: The line number in the original source, or null.  The
 *     line number is 1-based.
 *   - column: The column number in the original source, or null.  The
 *     column number is 0-based.
 *   - name: The original identifier, or null.
 */
IndexedSourceMapConsumer.prototype.originalPositionFor =
  function IndexedSourceMapConsumer_originalPositionFor(aArgs) {
    var needle = {
      generatedLine: util.getArg(aArgs, 'line'),
      generatedColumn: util.getArg(aArgs, 'column')
    };

    // Find the section containing the generated position we're trying to map
    // to an original position.
    var sectionIndex = binarySearch.search(needle, this._sections,
      function(needle, section) {
        var cmp = needle.generatedLine - section.generatedOffset.generatedLine;
        if (cmp) {
          return cmp;
        }

        return (needle.generatedColumn -
                section.generatedOffset.generatedColumn);
      });
    var section = this._sections[sectionIndex];

    if (!section) {
      return {
        source: null,
        line: null,
        column: null,
        name: null
      };
    }

    return section.consumer.originalPositionFor({
      line: needle.generatedLine -
        (section.generatedOffset.generatedLine - 1),
      column: needle.generatedColumn -
        (section.generatedOffset.generatedLine === needle.generatedLine
         ? section.generatedOffset.generatedColumn - 1
         : 0),
      bias: aArgs.bias
    });
  };

/**
 * Return true if we have the source content for every source in the source
 * map, false otherwise.
 */
IndexedSourceMapConsumer.prototype.hasContentsOfAllSources =
  function IndexedSourceMapConsumer_hasContentsOfAllSources() {
    return this._sections.every(function (s) {
      return s.consumer.hasContentsOfAllSources();
    });
  };

/**
 * Returns the original source content. The only argument is the url of the
 * original source file. Returns null if no original source content is
 * available.
 */
IndexedSourceMapConsumer.prototype.sourceContentFor =
  function IndexedSourceMapConsumer_sourceContentFor(aSource, nullOnMissing) {
    for (var i = 0; i < this._sections.length; i++) {
      var section = this._sections[i];

      var content = section.consumer.sourceContentFor(aSource, true);
      if (content) {
        return content;
      }
    }
    if (nullOnMissing) {
      return null;
    }
    else {
      throw new Error('"' + aSource + '" is not in the SourceMap.');
    }
  };

/**
 * Returns the generated line and column information for the original source,
 * line, and column positions provided. The only argument is an object with
 * the following properties:
 *
 *   - source: The filename of the original source.
 *   - line: The line number in the original source.  The line number
 *     is 1-based.
 *   - column: The column number in the original source.  The column
 *     number is 0-based.
 *
 * and an object is returned with the following properties:
 *
 *   - line: The line number in the generated source, or null.  The
 *     line number is 1-based. 
 *   - column: The column number in the generated source, or null.
 *     The column number is 0-based.
 */
IndexedSourceMapConsumer.prototype.generatedPositionFor =
  function IndexedSourceMapConsumer_generatedPositionFor(aArgs) {
    for (var i = 0; i < this._sections.length; i++) {
      var section = this._sections[i];

      // Only consider this section if the requested source is in the list of
      // sources of the consumer.
      if (section.consumer._findSourceIndex(util.getArg(aArgs, 'source')) === -1) {
        continue;
      }
      var generatedPosition = section.consumer.generatedPositionFor(aArgs);
      if (generatedPosition) {
        var ret = {
          line: generatedPosition.line +
            (section.generatedOffset.generatedLine - 1),
          column: generatedPosition.column +
            (section.generatedOffset.generatedLine === generatedPosition.line
             ? section.generatedOffset.generatedColumn - 1
             : 0)
        };
        return ret;
      }
    }

    return {
      line: null,
      column: null
    };
  };

/**
 * Parse the mappings in a string in to a data structure which we can easily
 * query (the ordered arrays in the `this.__generatedMappings` and
 * `this.__originalMappings` properties).
 */
IndexedSourceMapConsumer.prototype._parseMappings =
  function IndexedSourceMapConsumer_parseMappings(aStr, aSourceRoot) {
    this.__generatedMappings = [];
    this.__originalMappings = [];
    for (var i = 0; i < this._sections.length; i++) {
      var section = this._sections[i];
      var sectionMappings = section.consumer._generatedMappings;
      for (var j = 0; j < sectionMappings.length; j++) {
        var mapping = sectionMappings[j];

        var source = section.consumer._sources.at(mapping.source);
        source = util.computeSourceURL(section.consumer.sourceRoot, source, this._sourceMapURL);
        this._sources.add(source);
        source = this._sources.indexOf(source);

        var name = null;
        if (mapping.name) {
          name = section.consumer._names.at(mapping.name);
          this._names.add(name);
          name = this._names.indexOf(name);
        }

        // The mappings coming from the consumer for the section have
        // generated positions relative to the start of the section, so we
        // need to offset them to be relative to the start of the concatenated
        // generated file.
        var adjustedMapping = {
          source: source,
          generatedLine: mapping.generatedLine +
            (section.generatedOffset.generatedLine - 1),
          generatedColumn: mapping.generatedColumn +
            (section.generatedOffset.generatedLine === mapping.generatedLine
            ? section.generatedOffset.generatedColumn - 1
            : 0),
          originalLine: mapping.originalLine,
          originalColumn: mapping.originalColumn,
          name: name
        };

        this.__generatedMappings.push(adjustedMapping);
        if (typeof adjustedMapping.originalLine === 'number') {
          this.__originalMappings.push(adjustedMapping);
        }
      }
    }

    quickSort$1(this.__generatedMappings, util.compareByGeneratedPositionsDeflated);
    quickSort$1(this.__originalMappings, util.compareByOriginalPositions);
  };

var IndexedSourceMapConsumer_1 = IndexedSourceMapConsumer;

var sourceMapConsumer = {
	SourceMapConsumer: SourceMapConsumer_1,
	BasicSourceMapConsumer: BasicSourceMapConsumer_1,
	IndexedSourceMapConsumer: IndexedSourceMapConsumer_1
};

var SourceMapConsumer$1 = sourceMapConsumer.SourceMapConsumer;

// tslint:disable:no-conditional-assignment
class ErrorMapper {
    static get consumer() {
        if (this._consumer == null) {
            this._consumer = new SourceMapConsumer$1(require("main.js.map"));
        }
        return this._consumer;
    }
    /**
     * Generates a stack trace using a source map generate original symbol names.
     *
     * WARNING - EXTREMELY high CPU cost for first call after reset - >30 CPU! Use sparingly!
     * (Consecutive calls after a reset are more reasonable, ~0.1 CPU/ea)
     *
     * @param {Error | string} error The error or original stack trace
     * @returns {string} The source-mapped stack trace
     */
    static sourceMappedStackTrace(error) {
        const stack = error instanceof Error ? error.stack : error;
        if (Object.prototype.hasOwnProperty.call(this.cache, stack)) {
            return this.cache[stack];
        }
        // eslint-disable-next-line no-useless-escape
        const re = /^\s+at\s+(.+?\s+)?\(?([0-z._\-\\\/]+):(\d+):(\d+)\)?$/gm;
        let match;
        let outStack = error.toString();
        while ((match = re.exec(stack))) {
            if (match[2] === "main") {
                const pos = this.consumer.originalPositionFor({
                    column: parseInt(match[4], 10),
                    line: parseInt(match[3], 10)
                });
                if (pos.line != null) {
                    if (pos.name) {
                        outStack += `\n    at ${pos.name} (${pos.source}:${pos.line}:${pos.column})`;
                    }
                    else {
                        if (match[1]) {
                            // no original source file name known - use file name from given trace
                            outStack += `\n    at ${match[1]} (${pos.source}:${pos.line}:${pos.column})`;
                        }
                        else {
                            // no original source file name known or in given trace - omit name
                            outStack += `\n    at ${pos.source}:${pos.line}:${pos.column}`;
                        }
                    }
                }
                else {
                    // no known position
                    break;
                }
            }
            else {
                // no more parseable lines
                break;
            }
        }
        this.cache[stack] = outStack;
        return outStack;
    }
    static wrapLoop(loop) {
        return () => {
            try {
                loop();
            }
            catch (e) {
                if (e instanceof Error) {
                    if ("sim" in Game.rooms) {
                        const message = `Source maps don't work in the simulator - displaying original error`;
                        let stack = e.stack;
                        if (stack === undefined)
                            stack = "";
                        console.log(`<span style='color:red'>${message}<br>${decodeURI(stack)}</span>`);
                    }
                    else {
                        console.log(`<span style='color:red'>${decodeURI(this.sourceMappedStackTrace(e))}</span>`);
                    }
                }
                else {
                    // can't handle it
                    throw e;
                }
            }
        };
    }
}
// Cache previously mapped traces to improve performance
ErrorMapper.cache = {};

function watcher() {
    if (typeof Memory.watch !== "object") {
        Memory.watch = {};
    }
    if (typeof Memory.watch.expressions !== "object") {
        Memory.watch.expressions = {};
    }
    if (typeof Memory.watch.values !== "object") {
        Memory.watch.values = {};
    }
    for (const [expr, name] of Object.entries(Memory.watch.expressions)) {
        if (Memory.watch.values == undefined || name == undefined)
            return;
        if (typeof expr !== "string")
            return;
        let result;
        try {
            result = eval(expr);
        }
        catch (ex) {
            result = "Error: " + ex.message;
        }
        if (name == "console") {
            if (typeof result !== "undefined")
                console.log(result);
        }
        else {
            Memory.watch.values[name] =
                typeof result !== "undefined" ? result.toString() : result;
        }
    }
}

// Useful functions for producing user-readable output to the console
/**
 * Return the name of the error code, i.e. it's constant name
 *
 * @param error The error code
 * @returns The constant name of the error code, or an empty string if the
 *   error code does not exist
 */
function errorConstant(error) {
    switch (error) {
        case OK:
            return "OK";
        case ERR_NOT_OWNER:
            return "ERR_NOT_OWNER";
        case ERR_NO_PATH:
            return "ERR_NO_PATH";
        case ERR_NAME_EXISTS:
            return "ERR_NAME_EXISTS";
        case ERR_BUSY:
            return "ERR_BUSY";
        case ERR_NOT_FOUND:
            return "ERR_NOT_FOUND ";
        case ERR_NOT_ENOUGH_RESOURCES:
            return "ERR_NOT_ENOUGH_RESOURCES";
        case ERR_NOT_ENOUGH_ENERGY:
            return "ERR_NOT_ENOUGH_ENERGY";
        case ERR_INVALID_TARGET:
            return "ERR_INVALID_TARGET";
        case ERR_FULL:
            return "ERR_FULL";
        case ERR_NOT_IN_RANGE:
            return "ERR_NOT_IN_RANGE";
        case ERR_INVALID_ARGS:
            return "ERR_INVALID_ARGS";
        case ERR_TIRED:
            return "ERR_TIRED";
        case ERR_NO_BODYPART:
            return "ERR_NO_BODYPART";
        case ERR_NOT_ENOUGH_EXTENSIONS:
            return "ERR_NOT_ENOUGH_EXTENSIONS";
        case ERR_RCL_NOT_ENOUGH:
            return "ERR_RCL_NOT_ENOUGH";
        case ERR_GCL_NOT_ENOUGH:
            return "ERR_GCL_NOT_ENOUGH";
        default:
            return "";
    }
}
/**
 * Logs a message in blue
 *
 * @param msg The message
 */
function info(msg, type = "general" /* general */) {
    if (Memory.debug.log.infoSettings[type])
        console.log(`{cyan-fg}Info: ${msg}{/cyan-fg}`);
}
/**
 * Logs a message in red
 *
 * @param msg The message
 */
function error(msg) {
    console.log(`{red-fg}Error: ${msg}{/red-fg}`);
}
/**
 * Logs a message in yellow
 *
 * @param msg The message
 */
function warn(msg) {
    console.log(`{yellow-fg}Warn: ${msg}{/yellow-fg}`);
}
/**
 * Creates a string from a provided BodyPartConstant array
 *
 * @param body The BodyPartConstant[]
 * @returns A string representing the body
 */
function stringifyBody(body) {
    let string = "";
    body.forEach((part) => {
        switch (part) {
            case WORK:
                string += "W";
                break;
            case CARRY:
                string += "C";
                break;
            case MOVE:
                string += "M";
                break;
            default:
                error(`stringifyBody unexpected body part ${part}`);
        }
    });
    return string;
}
/** Log the current tick */
function tick(format) {
    if (format == undefined) {
        format = `{bold}{yellow-bg}`;
    }
    console.log(`${format}tick: ${Game.time}`);
}

// Manages construction
// ISSUE: When a creep dies before it can completely construct something, the site is lost from the
// queue
/**
 * Initialize construction
 *
 * @param spawn The initial spawn
 */
function initConstruction(spawn) {
    // Initialize an empty construction queue
    Memory.constructionQueue = [];
    /*
    // Construct containers near the sources for miners
    const containers = constructMinerContainers(spawn.room, 1);
  
    // Construct a road from the spawn to the mining containers
    containers.forEach((pos) => {
      const path = PathFinder.search(spawn.pos, { pos: pos, range: 1 }).path;
      info(
        `Source road from ${spawn.pos} to ${pos}: ${JSON.stringify(path)}`,
        InfoType.build
      );
      buildRoad(path);
    });
    */
    // Construct a road from the spawn to the controller
    const controller = spawn.room.controller;
    if (controller != null) {
        const path = PathFinder.search(spawn.pos, { pos: controller.pos, range: 1 })
            .path;
        info(`Controller road from ${spawn.pos} to ${controller.pos}: ${JSON.stringify(path)}`, "build" /* build */);
        buildRoad(path);
    }
}
/**
 * Create road construction sites along a path
 *
 * @param path An array of `RoomPosition`s
 */
function buildRoad(path) {
    if (!Array.isArray(path) || path.length === 0)
        return;
    path.forEach((position) => {
        buildWithoutChecks(position, STRUCTURE_ROAD);
    });
}
function buildWithoutChecks(position, structureType) {
    if (position.createConstructionSite &&
        position.createConstructionSite(structureType) === OK) {
        addToQueue(position);
    }
    else {
        warn(JSON.stringify(position));
    }
}
/**
 * Build a construction site at a position
 *
 * @param position The room position at which to create the construction site
 * @param structureType The type of structure to create a construction site for
 * @returns Returns true if the construction site was successfully created
 */
function build(position, structureType) {
    // Attempt to create the construction site
    const response = position.createConstructionSite(structureType);
    // Handle the response
    if (response === ERR_INVALID_TARGET || response === ERR_INVALID_ARGS) {
        const structures = position.lookFor(LOOK_STRUCTURES).filter((structure) => {
            return structure.structureType === structureType;
        });
        const sites = position.lookFor(LOOK_CONSTRUCTION_SITES).filter((site) => {
            return site.structureType === structureType;
        });
        if (structures.length > 0 || sites.length > 0) {
            warn(`build attempted to build ${structureType} over site/structure of same type at ${position}`);
        }
        else {
            error(`build attempted to build ${structureType} over invalid terrain at ` +
                `(${response}) ${position}`);
        }
    }
    else if (response === ERR_FULL) {
        error(`build exceded construction capacity`);
    }
    else if (response === ERR_RCL_NOT_ENOUGH) {
        error(`build attempted to build ${structureType} with insufficient RCL: ` +
            `${Game.rooms[position.roomName].controller
                .level}`);
    }
    else if (response === OK) {
        // Construction site successfullly created
        addToQueue(position);
        return true;
    }
    return false;
}
/**
 * Add construction sites at a position to the construction queue
 *
 * @param position The position at which there are construction sites to add to
 *   the construction queue
 */
function addToQueue(position) {
    Memory.constructionQueue.push(position);
}
/**
 * Gets and removes the first construction site from the queue
 *
 * @returns The id of the construction site if the queue is not empty
 */
function fromQueue() {
    const queueItem = Memory.constructionQueue.shift();
    if (queueItem == undefined)
        return;
    const position = Game.rooms[queueItem.roomName].getPositionAt(queueItem.x, queueItem.y);
    if (position == undefined)
        return;
    const sites = position.lookFor(LOOK_CONSTRUCTION_SITES).map((site) => {
        return site.id;
    });
    info(`Removed ${position} from queue`);
    // Each construction sites should have it's own entry in the queue even if it has the same
    // position as another site. So for example, if there were two sites at point A, there would be
    // two entries in the queue for point A, so removing one instance will be fine.
    //
    // HOWEVER, if the second instance of point A in the queue is accessed before the first site is
    // finished, there will be an issue
    return sites[0];
}
/**
 * Gets the length of the construction queue
 *
 * @returns The length of the construction queue
 */
function queueLength() {
    return Memory.constructionQueue.length;
}
/**
 * Get a ring of the surrounding coords of radius
 *
 * @param x The x coord of the center
 * @param y The y coord of the center
 * @param radius=0 The radius of the ring, where radius 0 is just the point
 * @returns An array of coordinate pairs forming the ring
 */
function getSurroundingCoords(x, y, radius = 1) {
    if (radius === 0)
        return [{ x, y }];
    const maxX = x + radius;
    const maxY = y + radius;
    const minX = x - radius;
    const minY = y - radius;
    const coords = [];
    for (let xCoord = minX; xCoord <= maxX; xCoord++) {
        coords.push({
            x: xCoord,
            y: maxY,
        });
        coords.push({
            x: xCoord,
            y: minY,
        });
    }
    // Don't include the coordinates at the corners, because they were included in the first for loop
    for (let yCoord = minY + 1; yCoord < maxY; yCoord++) {
        coords.push({
            x: maxX,
            y: yCoord,
        });
        coords.push({
            x: minX,
            y: yCoord,
        });
    }
    return coords;
}
function getSurroundingTiles(position, radius = 0) {
    const coords = getSurroundingCoords(position.x, position.y, radius);
    return coords.map((coord) => {
        return Game.rooms[position.roomName].getPositionAt(coord.x, coord.y);
    });
}
function unassignConstruction(name) {
    const memory = Memory.creeps[name];
    const site = Game.getObjectById(memory.assignedConstruction || "");
    if (site != undefined) {
        Memory.constructionQueue.unshift(site.pos);
        delete memory.assignedConstruction;
    }
    else {
        warn(`Attempted to delete undefined assigned construction for creep ${name}`);
    }
}
function getStructuresNeedingRepair(room) {
    return room
        .find(FIND_STRUCTURES)
        .filter((structure) => {
        switch (structure.structureType) {
            case STRUCTURE_ROAD:
            case STRUCTURE_CONTAINER:
                return true;
            default:
                return false;
        }
    })
        .map((structure) => {
        return structure.id;
    });
}
function sortRepairQueue() {
    Memory.repairQueue = Memory.repairQueue.sort((a, b) => {
        const structureA = Game.getObjectById(a);
        const structureB = Game.getObjectById(b);
        if (structureA.hits < structureB.hits)
            return -1;
        if (structureA.hits < structureB.hits)
            return -1;
        return 0;
    });
}
function resetRepairQueue(room) {
    const oldQueue = Memory.repairQueue;
    info(`Resetting repair queue`);
    const structures = getStructuresNeedingRepair(room);
    Memory.repairQueue = structures;
    sortRepairQueue();
    // Exactly how arrays were meant to be compared
    if (JSON.stringify(oldQueue) === JSON.stringify(Memory.repairQueue)) {
        warn(`Unnecessary repair queue reset`);
    }
}
/**
 * Return a structure id from the repair queue. If there are none in the queue
 * that aren't full hits, returns undefined.
 */
function fromRepairQueue() {
    let repair = Game.getObjectById(Memory.repairQueue.shift() || "");
    if (repair == undefined)
        return;
    while (repair.hits === repair.hitsMax) {
        repair = Game.getObjectById(Memory.repairQueue.shift() || "");
        if (repair == undefined)
            return;
    }
    return repair.id;
}
/**
 * Gets the length of the construction queue
 *
 * @returns The length of the construction queue
 */
function repairQueueLength() {
    return Memory.repairQueue.length;
}
function buildStructure(position, type) {
    if (RoomPosition === undefined) {
        error(`Asked to build ${type} at undefined position`);
        return false;
    }
    return build(position, type);
}
function buildStorage(roomName) {
    const room = Game.rooms[roomName];
    const spawn = Game.getObjectById(room.memory.spawn);
    if (spawn === null) {
        error(`Asked to build storage in room ${roomName} but it doesn't know its spawn`);
        return;
    }
    const position = room.getPositionAt(spawn.pos.x - 2, spawn.pos.y - 1);
    if (position === null) {
        error(`Failed to get RoomPosition at (${spawn.pos.x - 2}, ${spawn.pos.y - 1})`);
        return;
    }
    info(`Building storage at ${JSON.stringify(position)}`);
    buildStructure(position, STRUCTURE_STORAGE);
}
function updateWallRepair(room) {
    if (room.memory.wallRepairQueue == undefined) {
        room.memory.wallRepairQueue = [];
    }
    room.memory.wallRepairQueue = room
        .find(FIND_STRUCTURES)
        .filter(
    // Only walls and ramparts with less than 3 million hits
    (structure) => (structure.structureType === STRUCTURE_WALL ||
        structure.structureType === STRUCTURE_RAMPART) &&
        structure.hits < 1e6)
        .sort((a, b) => a.hits - b.hits)
        .map((wall) => wall.id);
}

function resetLinkMemory(linkId) {
    const link = Game.getObjectById(linkId);
    if (link == null) {
        error(`Link ${linkId} could not be obtained`);
        return;
    }
    let linkMode = "none" /* none */;
    let linkType = "unknown" /* unknown */;
    if (link.room.memory.planner != undefined) {
        const linkPlanner = link.room.memory.planner.plan[STRUCTURE_LINK];
        if (linkPlanner != null) {
            const spawnLinkPos = linkPlanner.pos[0];
            const controllerLinkPos = linkPlanner.pos[1];
            if (link.pos.x == spawnLinkPos.x && link.pos.y == spawnLinkPos.y) {
                linkType = "spawn" /* spawn */;
            }
            if (link.pos.x == controllerLinkPos.x &&
                link.pos.y == controllerLinkPos.y) {
                linkMode = "recieve" /* recieve */;
                linkType = "controller" /* controller */;
            }
        }
    }
    link.room.memory.links.all[linkId] = { mode: linkMode, type: linkType };
}
function linkManager(link) {
    if (getLinkMemory(link) == undefined) {
        warn(`Reseting memory of link ${link.id}`);
        resetLinkMemory(link.id);
    }
    const memory = getLinkMemory(link);
    if (memory == undefined) {
        error(`Memory of link ${link.id} cannot be found on room ${link.room.name}'s memory`);
        return;
    }
    // Link mode is send
    if (memory.mode === "send" /* send */) {
        if (link.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            // No energy to send
            return;
        }
        // Link is not spawn link
        if (memory.type !== "spawn" /* spawn */) {
            // Send to spawn if spawn is recieving
            let spawnLink = undefined;
            for (const linkId in link.room.memory.links.all) {
                if (link.room.memory.links.all[linkId].type === "spawn" /* spawn */) {
                    const otherLink = Game.getObjectById(linkId);
                    if (otherLink == undefined) {
                        warn(`Unable to get other link of id ${linkId}`);
                    }
                    else {
                        spawnLink = otherLink;
                    }
                }
            }
            if (spawnLink == undefined) {
                error(`Unable to get spawn link`);
                return;
            }
            const response = link.transferEnergy(spawnLink);
            if (response !== OK) {
                warn(`Link ${link.id} sending to spawn link with response ${errorConstant(response)}`);
            }
            return;
        }
        return;
    }
    // Link is spawn link and it has energy to send
    if (memory.type === "spawn" /* spawn */ &&
        link.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        // Get other links
        const links = Object.values(getLinksInRoom(link.room));
        const targetLink = links
            .filter((link) => link.room.memory.links.all[link.id].type !== "spawn" /* spawn */ &&
            link.room.memory.links.all[link.id].mode === "recieve" /* recieve */ &&
            link.store.getFreeCapacity(RESOURCE_ENERGY) !== 0)
            .sort((a, b) => a.store.getUsedCapacity(RESOURCE_ENERGY) -
            b.store.getUsedCapacity(RESOURCE_ENERGY))[0];
        if (targetLink != undefined) {
            const energyToSend = Math.min(link.store.getUsedCapacity(RESOURCE_ENERGY), targetLink.store.getFreeCapacity(RESOURCE_ENERGY));
            // Don't bother sending less than 100 energy, also don't try and send
            // while the link is in cooldown.
            if (energyToSend > 100 && link.cooldown === 0) {
                const response = link.transferEnergy(targetLink, energyToSend);
                if (response !== OK) {
                    warn(`Link ${link.id} sending to link ${targetLink.id} with response ${errorConstant(response)}`);
                }
            }
            return;
        }
    }
}
function getLinkMemory(link) {
    const memory = link.room.memory.links.all[link.id];
    if (memory == undefined) {
        error(`Unable to get memory of link ${link.id} in room ${link.room.name}`);
        return;
    }
    return memory;
}
function isControllerLink(link) {
    const surrounding = getSurroundingTiles(link.pos, 1);
    let foundController = false;
    surrounding.find((pos) => {
        const structures = pos.lookFor(LOOK_STRUCTURES);
        structures.forEach((structure) => {
            if (structure != undefined &&
                structure.structureType === STRUCTURE_CONTROLLER) {
                foundController = true;
            }
        });
    });
    return foundController;
}

function initRoom(room) {
    info(`Initializing room ${room.name}`);
    // Initialize the room's memory
    updateRoomMemory(room);
}
function updateRoomMemory(room) {
    info(`Resetting memory for room ${room.name}`);
    // Room level
    const controller = room.controller;
    if (controller !== undefined) {
        room.memory.level = controller.level;
    }
    else {
        warn(`Failed to get controller for room ${room.name}`);
    }
    // Primary spawn
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (spawn !== undefined) {
        room.memory.spawn = spawn.id;
    }
    else {
        warn(`Failed to get spawn for room ${room.name}`);
    }
    // Get towers in the room
    room.memory.towers = getTowersInRoom(room);
    // Get sources in the room
    room.memory.sources = getSourcesInRoom(room);
    // Get tombs in the room
    room.memory.tombs = getTombsInRoom(room);
    // Initialize wall repair queue to empty
    room.memory.wallRepairQueue = [];
    // Reset links memory
    room.memory.links = {
        all: {},
    };
    resetRoomLinksMemory(room);
}
/**
 * Get the ids of the towers in the room.
 *
 * @param room The room to look in
 * @returns A string[] of tower ids, possibly empty if none were found
 */
function getTowersInRoom(room) {
    return room
        .find(FIND_MY_STRUCTURES)
        .filter((structure) => structure.structureType === STRUCTURE_TOWER)
        .map((structure) => structure.id);
}
/**
 * Get the ids of the sources in the room.
 *
 * @param room The room to look in
 * @returns A string[] of source ids, possibly empty if none were found
 */
function getSourcesInRoom(room) {
    return room.find(FIND_SOURCES).map((source) => source.id);
}
function getTombsInRoom(room) {
    return room
        .find(FIND_TOMBSTONES)
        .filter((tomb) => tomb.store.getUsedCapacity(RESOURCE_ENERGY) > 50)
        .map((tomb) => tomb.id);
}
/**
 * Get the next tombstone from the room's list of tombstones.
 *
 * @param room The room
 * @returns The tombstone, or undefined if the no valid tombstone was found
 */
function getNextTombInRoom(room) {
    if (room.memory.tombs == undefined) {
        room.memory.tombs = [];
        return undefined;
    }
    let tomb = undefined;
    while (tomb == undefined && room.memory.tombs.length > 0) {
        // If the tombstone is valid, we don't want to remove it from the list.
        // Otherwise, do remove it and move on the next tombstone.
        tomb = Game.getObjectById(room.memory.tombs[0]);
        if (tomb != undefined) {
            // Ignore tombstones with less than 50 energy
            if (tomb.store.getUsedCapacity(RESOURCE_ENERGY) < 50) {
                tomb = undefined;
                room.memory.tombs.shift();
            }
        }
        else {
            room.memory.tombs.shift();
        }
    }
    if (tomb == undefined)
        return undefined;
    return tomb;
}
function getRoomAvailableEnergy(room) {
    if (room.memory.storage == undefined) {
        return undefined;
    }
    const storage = Game.getObjectById(room.memory.storage);
    if (storage == undefined) {
        error(`Room ${room.name} has primary storage id ${room.memory.storage} but Game was unable to get the structure.`);
        return undefined;
    }
    return storage.store.getUsedCapacity(RESOURCE_ENERGY);
}
function getLinksInRoom(room) {
    const links = {};
    for (const linkId in room.memory.links.all) {
        const link = Game.getObjectById(linkId);
        if (link != undefined) {
            links[linkId] = link;
        }
        else {
            error(`Unable to get link of id ${linkId} in room ${room.name}`);
        }
    }
    return links;
}
/**
 * Get the ids of the links in the room.
 *
 * @param room The room to look in
 * @returns A string[] of link ids, possibly empty if none were found
 */
function resetRoomLinksMemory(room) {
    // Since this is a reset, don't use getLinksInRoom which uses the memory that
    // this function resets. That would be easier, but also would defeat the
    // purpose of a reset in most cases.
    room
        .find(FIND_MY_STRUCTURES)
        .filter((structure) => structure.structureType === STRUCTURE_LINK)
        .map((structure) => structure.id)
        .forEach((id) => {
        // Reset the memory of each link
        resetLinkMemory(id);
        // If the current link is the spawn link, update links.spawn
        if (room.memory.links.all[id].type === "spawn" /* spawn */) {
            room.memory.links.spawn = id;
        }
        const link = Game.getObjectById(id);
        if (link != undefined && isControllerLink(link)) {
            room.memory.links.controller = link.id;
        }
    });
}

/**
 * Harvest energy from a specified Source or find the first Source in the room.
 *
 * @param creep The creep to harvest the energy
 * @param source The Source, or undefined
 */
function harvestEnergy(creep, source) {
    // TODO: This currently permanently assigns a source to creeps that shouldn't have a permanent
    // source. Additionally, this is a LOT of CPU for harvesting. Even worse, this doesn't even solve
    // the problem I wrote it to solve, which was picking a source not blocked by another creep.
    let path;
    if (source == undefined) {
        if (creep.memory.assignedSource == undefined) {
            const sources = [...creep.room.find(FIND_SOURCES)]
                .map((source) => {
                return { source, path: creep.pos.findPathTo(source) };
            })
                .sort((a, b) => {
                if (a.path.length < b.path.length)
                    return -1;
                if (a.path.length > b.path.length)
                    return 1;
                return 0;
            });
            source = sources[0].source;
            path = sources[0].path;
            // If this amount of work is going to be done, we are going to assign this source to the creep
            creep.memory.assignedSource = source.id;
        }
        else {
            source = Game.getObjectById(creep.memory.assignedSource);
        }
    }
    // Try to harvest energy. If we can't because we're not in range, move towards the source
    const response = creep.harvest(source);
    if (response === ERR_NOT_IN_RANGE) {
        if (path) {
            creep.moveByPath(path);
        }
        else {
            creep.moveTo(source);
        }
    }
    else if (response !== OK) {
        warn(`Creep ${creep.name} harvesting ${source.pos} with response ${errorConstant(response)}`);
    }
}
/**
 * Get energy from a structure that can give out energy or harvestEnergy
 *
 * @param creep The creep to get the energy
 */
function getEnergy(creep, target) {
    let response;
    // If target isn't specified, try the room's primary storage
    if (target == undefined) {
        const primaryStorage = Game.getObjectById(creep.room.memory.storage || "");
        // If their is a primary storage, make sure it has energy first
        if (primaryStorage != undefined &&
            primaryStorage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            // If it does have energy, it is the target
            target = primaryStorage;
        }
    }
    // If there is no primary storage, proceed as normal
    if (target == undefined) {
        const structures = [...creep.room.find(FIND_STRUCTURES)]
            .filter((structure) => {
            // Filter for containers and storages
            return ((structure.structureType === STRUCTURE_CONTAINER ||
                structure.structureType === STRUCTURE_STORAGE) &&
                structure.store.getUsedCapacity(RESOURCE_ENERGY) > 0);
        })
            .map((structure) => {
            return { structure, path: creep.pos.findPathTo(structure) };
        })
            .sort((a, b) => {
            if (a.path.length < b.path.length)
                return -1;
            if (a.path.length > b.path.length)
                return 1;
            return 0;
        });
        if (structures[0] == undefined) {
            warn(`Creep ${creep.name} unable to find suitable structure for getEnergy`);
            if (countRole("miner" /* miner */) === 0)
                harvestEnergy(creep);
            return ERR_NOT_FOUND;
        }
        const structure = structures[0].structure;
        const path = structures[0].path;
        // Try to harvest energy. If we can't because we're not in range, move
        // towards the target
        response = creep.withdraw(structure, RESOURCE_ENERGY);
        if (response === ERR_NOT_IN_RANGE) {
            creep.moveByPath(path);
        }
        else if (response !== OK) {
            warn(`Creep ${creep.name} getting energy ${structure.pos} with response ${errorConstant(response)}`);
        }
    }
    else {
        // Try to harvest energy. If we can't because we're not in range, move
        // towards the target
        response = creep.withdraw(target, RESOURCE_ENERGY);
        if (response === ERR_NOT_IN_RANGE) {
            creep.moveTo(target);
        }
        else if (response !== OK && response !== ERR_NOT_ENOUGH_RESOURCES) {
            // Ignore ERR_NOT_ENOUGH_RESOURCES when target is specified (e.g. haulers)
            warn(`Creep ${creep.name} getting energy ${target.pos} with response ${errorConstant(response)}`);
        }
    }
    return response;
}
/**
 * Deposit energy in the room's first spawn/extension/tower
 *
 * @param creep The creep to deposit the energy
 * @param disableUpgrading Whether to disable upgrading if no deposit locations
 * @returns True if depositing, false if not depositing and not upgrading
 */
function depositEnergy(creep, disableUpgrading = false) {
    // Get the first Spawn in the room
    const targets = creep.room.find(FIND_MY_STRUCTURES).filter((structure) => {
        return ((structure.structureType === STRUCTURE_SPAWN ||
            structure.structureType === STRUCTURE_EXTENSION ||
            structure.structureType === STRUCTURE_TOWER ||
            structure.structureType === STRUCTURE_LINK) &&
            structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
    });
    // Prioritize: Spawn -> Extension -> Tower -> Link
    let target = targets.find((structure) => structure.structureType === STRUCTURE_SPAWN);
    if (target == undefined) {
        target = targets.find((structure) => structure.structureType === STRUCTURE_EXTENSION);
    }
    if (target == undefined) {
        // Don't target towers over half capacity
        target = targets.find((structure) => structure.structureType === STRUCTURE_TOWER &&
            structure.store.getUsedCapacity(RESOURCE_ENERGY) < TOWER_CAPACITY / 2);
    }
    if (target == undefined) {
        const spawnLinkId = creep.room.memory.links.spawn;
        if (spawnLinkId != undefined) {
            const spawnLink = Game.getObjectById(spawnLinkId);
            if (spawnLink != undefined) {
                // Only target the spawn link if it is less than half full
                if (spawnLink.store.getUsedCapacity(RESOURCE_ENERGY) <
                    LINK_CAPACITY / 2) {
                    target = spawnLink;
                }
            }
            else {
                error(`Unable to get spawn link of id ${spawnLinkId} in room ${creep.room.name}`);
            }
        }
    }
    // If the target has free energy capacity
    if (target != undefined &&
        target.store.getFreeCapacity(RESOURCE_ENERGY) !== 0) {
        // Try to transfer energy to the target.
        const response = creep.transfer(target, RESOURCE_ENERGY);
        if (response === ERR_NOT_IN_RANGE) {
            // If the spawn is not in range, move towards the spawn
            creep.moveTo(target);
        }
        else if (response !== OK) {
            warn(`Creep ${creep.name} depositing ${target.pos} with response ${errorConstant(response)}`);
        }
        return true;
    }
    else {
        // If the target has no free energy capacity, upgrade the controller
        if (disableUpgrading) {
            return false;
        }
        upgradeController(creep);
        return true;
    }
}
/**
 * Store energy in container or storage within range.
 *
 * @param creep The creep storing energy
 * @param range The range
 */
function storeEnergy(creep, target) {
    let structure = target;
    let path = undefined;
    if (structure === undefined) {
        const structures = [...creep.room.find(FIND_STRUCTURES)]
            .filter((structure) => {
            // Filter for containers and storages
            return ((structure.structureType === STRUCTURE_CONTAINER ||
                structure.structureType === STRUCTURE_STORAGE) &&
                structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
        })
            .map((structure) => {
            return { structure, path: creep.pos.findPathTo(structure) };
        })
            .sort((a, b) => {
            if (a.path.length < b.path.length)
                return -1;
            if (a.path.length > b.path.length)
                return 1;
            return 0;
        })
            .filter((strucPath) => {
            strucPath.path.length > 1;
        });
        if (structures[0] == undefined) {
            warn(`Creep ${creep.name} unable to find suitable structure for storeEnergy, depositing`);
            depositEnergy(creep);
            return;
        }
        structure = structures[0].structure;
        path = structures[0].path;
    }
    // Try to harvest energy. If we can't because we're not in range, move towards the source
    const response = creep.transfer(structure, RESOURCE_ENERGY);
    if (response === ERR_NOT_IN_RANGE) {
        if (path) {
            creep.moveByPath(path);
        }
        else {
            creep.moveTo(structure);
        }
    }
    else if (response !== OK) {
        warn(`Creep ${creep.name} getting energy ${structure.pos} with response ${errorConstant(response)}`);
    }
}
/**
 * Upgrades the controller
 *
 * @param creep The creep to upgrade the controller
 */
function upgradeController(creep) {
    // Get the controller for the room that the creep is in
    const controller = creep.room.controller;
    // Ensure `controller` is a StructureController
    if (controller == undefined) {
        throw new Error("upgradeController: creep.room.controller undefined");
    }
    // Attempt to upgrade the controller, and save the response (OK or error)
    const response = creep.upgradeController(controller);
    if (response === ERR_NOT_IN_RANGE) {
        creep.moveTo(controller);
    }
    else if (response !== OK) {
        warn(`Creep ${creep.name} attempting to upgrade controller with response ${response}`);
    }
}
/**
 * Builds or moves to the creep's assigned construction site
 *
 * @param creep The creep
 */
function build$1(creep, building) {
    if (building == undefined) {
        if (creep.memory.assignedConstruction == undefined) {
            throw new Error("build creep has no assigned construction site");
        }
        else {
            building = Game.getObjectById(creep.memory.assignedConstruction);
        }
    }
    const response = creep.build(building);
    if (response === ERR_NOT_IN_RANGE) {
        creep.moveTo(building);
    }
    else if (response !== OK) {
        warn(`Creep ${creep.name} building ${building.pos} with response ${errorConstant(response)}`);
    }
}
/**
 * Repairs or moves to the creep's assigned repair site
 *
 * @param creep The creep
 * @param repair The structure to repair
 */
function repair(creep, repair) {
    if (repair == undefined) {
        if (creep.memory.assignedRepairs == undefined) {
            const idToRepair = fromRepairQueue();
            repair =
                Game.getObjectById(idToRepair || "") || undefined;
            creep.memory.assignedRepairs = idToRepair;
        }
        else {
            repair =
                Game.getObjectById(creep.memory.assignedRepairs) || undefined;
        }
    }
    // Nothing to repair
    if (repair == undefined) {
        return;
    }
    const response = creep.repair(repair);
    if (response === ERR_NOT_IN_RANGE) {
        creep.moveTo(repair);
    }
    else if (response !== OK) {
        warn(`Creep ${creep.name} repairing ${repair.pos} with response ${errorConstant(response)}`);
    }
}
function idle(creep, position) {
    if (position === undefined) {
        // Idle creeps upgrade the controller
        upgradeController(creep);
    }
    else if (creep.pos != position) {
        creep.moveTo(position);
    }
}
/**
 * Recover energy from tombs or resource piles within range.
 *
 * @param creep The creep to recover
 * @param range The range to look in, default 1
 * @returns The response code to the action take or ERR_NOT_FOUND if no valid
 *   tombs/piles were found
 */
function recoverEnergy(creep, range = 1) {
    if (range === 1) {
        return recoverNearbyEnergy(creep);
    }
    else if (range === -1) {
        // If range is -1, get a tomb from the room's lst of tombs
        const tomb = getNextTombInRoom(creep.room);
        if (tomb != undefined) {
            let response = creep.withdraw(tomb, RESOURCE_ENERGY);
            if (response === ERR_NOT_IN_RANGE) {
                response = creep.moveTo(tomb);
            }
            return response;
        }
        return ERR_NOT_FOUND;
    }
    // If the range is not a special value, try and find a valid tomb within the
    // range
    const tomb = creep.pos
        .findInRange(FIND_TOMBSTONES, range)
        // Most energy first
        .sort((a, b) => b.store.getUsedCapacity(RESOURCE_ENERGY) -
        a.store.getUsedCapacity(RESOURCE_ENERGY))
        .find((tomb) => tomb.store.getUsedCapacity(RESOURCE_ENERGY) > 0);
    if (tomb != undefined) {
        let response = creep.withdraw(tomb, RESOURCE_ENERGY);
        if (response === ERR_NOT_IN_RANGE) {
            response = creep.moveTo(tomb);
        }
        return response;
    }
    const pile = creep.pos
        .findInRange(FIND_DROPPED_RESOURCES, range)
        .filter((pile) => pile.resourceType === RESOURCE_ENERGY)
        // Most energy first
        .sort((a, b) => b.amount - a.amount)
        .find((pile) => pile.amount > 0);
    if (pile != undefined) {
        let response = creep.pickup(pile);
        if (response === ERR_NOT_IN_RANGE) {
            response = creep.moveTo(pile);
        }
        return response;
    }
    // No tombs/piles found
    return ERR_NOT_FOUND;
}
/**
 * Check the surrounding tiles for tombstones then energy piles to pickup.
 *
 * @param creep The creep
 * @returns The actions response code, ERR_NOT_FOUND if a tombstone/resource
 *   pile was not found.
 */
function recoverNearbyEnergy(creep) {
    const surrounding = getSurroundingTiles(creep.pos, 1);
    surrounding.push(creep.pos);
    const tombPos = surrounding.find((tile) => tile.lookFor(LOOK_TOMBSTONES).length > 0);
    if (tombPos == undefined) {
        const pilePos = surrounding.find((tile) => tile.lookFor(LOOK_RESOURCES).length > 0);
        if (pilePos != undefined) {
            const pile = pilePos.lookFor(LOOK_RESOURCES)[0];
            return creep.pickup(pile);
        }
    }
    else {
        const tomb = tombPos.lookFor(LOOK_TOMBSTONES)[0];
        return creep.withdraw(tomb, RESOURCE_ENERGY);
    }
    return ERR_NOT_FOUND;
}

/**
 * Get a new array without duplicates from a supplied array.
 *
 * @param array The array to remove duplicates from
 * @returns A new array without duplicates
 */
function roomPositionArrayRemoveDuplicates(array) {
    const newArray = [];
    array.forEach((element) => {
        const duplicate = newArray.find((newElement) => newElement.isEqualTo(element));
        if (duplicate == undefined)
            newArray.push(element);
    });
    return newArray;
}

function getExitWallsAndRamparts(room) {
    info(`Building walls for room ${room.name}`);
    const walls = [];
    const ramparts = [];
    // Top/Left and Bottom/Right exit max for Top, Right, Bottom, Left
    const seals = [
        [49, 0],
        [0, 0],
        [49, 49],
        [49, 0],
        [0, 49],
        [49, 49],
        [0, 0],
        [0, 49],
    ].map((spot) => room.getPositionAt(spot[0], spot[1]));
    room.find(FIND_EXIT).forEach((exit) => {
        if (exit != undefined) {
            if (exit.y === 0) {
                // Top exit
                if (seals[0] == undefined) {
                    seals[0] = exit;
                }
                if (seals[1] == undefined) {
                    seals[1] = exit;
                }
                if (exit.x < seals[0].x) {
                    seals[0] = exit;
                }
                else if (exit.x > seals[1].x) {
                    seals[1] = exit;
                }
            }
            else if (exit.x === 49) {
                // Right exit
                if (seals[2] == undefined) {
                    seals[2] = exit;
                }
                if (seals[3] == undefined) {
                    seals[3] = exit;
                }
                if (exit.y < seals[2].y) {
                    seals[2] = exit;
                }
                else if (exit.y > seals[3].y) {
                    seals[3] = exit;
                }
            }
            else if (exit.y === 49) {
                // Bottom exit
                if (seals[4] == undefined) {
                    seals[4] = exit;
                }
                if (seals[5] == undefined) {
                    seals[5] = exit;
                }
                if (exit.x < seals[4].x) {
                    seals[4] = exit;
                }
                else if (exit.x > seals[5].x) {
                    seals[5] = exit;
                }
            }
            else if (exit.x === 0) {
                // Left exit
                if (seals[6] == undefined) {
                    seals[6] = exit;
                }
                if (seals[7] == undefined) {
                    seals[7] = exit;
                }
                if (exit.x < seals[6].x) {
                    seals[6] = exit;
                }
                else if (exit.x > seals[7].x) {
                    seals[7] = exit;
                }
            }
            else {
                error(`Unable to get wall position for exit ${JSON.stringify(exit)}`);
            }
        }
    });
    // Generate the walls between seals. Generating [Top, Left, Bottom, Right]
    // according to when i is its index (e.g. i = 0 is top and i = 3 is right).
    for (let i = 0; i < 4; i++) {
        const terrain = room.getTerrain();
        const begin = seals[i * 2];
        const end = seals[i * 2 + 1];
        if (begin == undefined || end == undefined) {
            error(`Failed to find seal for exit ${i}`);
            return [[], []];
        }
        let beginSeal;
        let endSeal;
        let beginIndex;
        let endIndex;
        let middleIndex;
        if (i % 2 === 0) {
            // if i = 0, y = 2; else y = 47
            let y;
            if (i === 0) {
                y = 2;
                beginSeal = room.getPositionAt(begin.x - 2, 1);
                endSeal = room.getPositionAt(end.x + 2, 1);
            }
            else {
                y = 47;
                beginSeal = room.getPositionAt(begin.x - 2, 48);
                endSeal = room.getPositionAt(end.x + 2, 48);
            }
            if (beginSeal != undefined) {
                beginIndex = walls.push(beginSeal);
            }
            else {
                warn(`no wall for exit ${i}`);
                continue;
            }
            for (let x = begin.x - 2; x <= end.x + 2; x++) {
                const wall = room.getPositionAt(x, y);
                if (wall != undefined) {
                    walls.push(wall);
                }
                else {
                    error(`Failed to find wall position at (${x}, ${y}) in room ${room.name} for i ${i}`);
                    return [[], []];
                }
            }
            if (endSeal != undefined) {
                endIndex = walls.push(endSeal);
            }
            else {
                error(`Failed to find end seal for exit ${i}`);
                return [[], []];
            }
            middleIndex = Math.floor((endIndex + beginIndex) / 2);
            let passedChecks = false;
            while (!passedChecks) {
                middleIndex--;
                if (middleIndex === beginIndex) {
                    error(`Unable to find entryway for ${i}`);
                    return [[], []];
                }
                passedChecks = true;
                for (let offset = -1; offset <= 1; offset++) {
                    let exit;
                    let doorstep;
                    if (i === 0) {
                        exit = room.getPositionAt(walls[middleIndex + offset].x, 0);
                        doorstep = room.getPositionAt(walls[middleIndex + offset].x, 1);
                    }
                    else {
                        exit = room.getPositionAt(walls[middleIndex + offset].x, 49);
                        doorstep = room.getPositionAt(walls[middleIndex + offset].x, 48);
                    }
                    if (exit == undefined || doorstep == undefined) {
                        error(`Failed to get exit/doorstep at ${JSON.stringify(walls[middleIndex])}`);
                        return [[], []];
                    }
                    if (terrain.get(exit.x, exit.y) !== 0 ||
                        terrain.get(doorstep.x, doorstep.y) !== 0) {
                        passedChecks = false;
                    }
                }
            }
            if (passedChecks) {
                const removed = walls.splice(middleIndex - 1, 3);
                ramparts.push(...removed);
            }
        }
        else {
            let x;
            if (i === 1) {
                x = 47;
                beginSeal = room.getPositionAt(48, begin.y - 2);
                endSeal = room.getPositionAt(48, end.y + 2);
            }
            else {
                x = 2;
                beginSeal = room.getPositionAt(1, begin.y - 2);
                endSeal = room.getPositionAt(1, end.y + 2);
            }
            if (beginSeal != undefined) {
                beginIndex = walls.push(beginSeal);
            }
            else {
                warn(`no wall for exit ${i}`);
                continue;
            }
            for (let y = begin.y - 2; y <= end.y + 2; y++) {
                const wall = room.getPositionAt(x, y);
                if (wall != undefined) {
                    walls.push(wall);
                }
                else {
                    error(`Failed to find wall position at (${x}, ${y}) in room ${room.name} for i ${i}`);
                    return [[], []];
                }
            }
            if (endSeal != undefined) {
                endIndex = walls.push(endSeal);
            }
            else {
                error(`Failed to find end seal for exit ${i}`);
                return [[], []];
            }
            middleIndex = Math.floor((endIndex + beginIndex) / 2);
            let passedChecks = false;
            while (!passedChecks) {
                middleIndex--;
                if (middleIndex === beginIndex) {
                    error(`Unable to find entryway for ${i}`);
                    return [[], []];
                }
                passedChecks = true;
                for (let offset = -1; offset <= 1; offset++) {
                    let exit;
                    let doorstep;
                    if (i === 1) {
                        exit = room.getPositionAt(49, walls[middleIndex + offset].y);
                        doorstep = room.getPositionAt(48, walls[middleIndex + offset].y);
                    }
                    else {
                        exit = room.getPositionAt(0, walls[middleIndex + offset].y);
                        doorstep = room.getPositionAt(1, walls[middleIndex + offset].y);
                    }
                    if (exit == undefined || doorstep == undefined) {
                        error(`Failed to get exit/doorstep at ${JSON.stringify(walls[middleIndex])}`);
                        return [[], []];
                    }
                    if (terrain.get(exit.x, exit.y) !== 0 ||
                        terrain.get(doorstep.x, doorstep.y) !== 0) {
                        passedChecks = false;
                    }
                }
            }
            if (passedChecks) {
                const removed = walls.splice(middleIndex - 1, 3);
                ramparts.push(...removed);
            }
            else {
                error(`Failed to find entryway for ${i}`);
                return [[], []];
            }
        }
    }
    /* walls.forEach((wall) => {
      buildStructure(wall, STRUCTURE_WALL);
    });
    ramparts.forEach((rampart) => {
      buildStructure(rampart, STRUCTURE_RAMPART);
    }); */
    return [walls, ramparts];
}
function getTowerSpots(room) {
    const spawn = Game.getObjectById(room.memory.spawn);
    if (spawn == undefined) {
        error(`Couldn't find spawn for tower spots in room ${room.name}`);
        return [];
    }
    const offsets = [
        [-5, 0],
        [-6, -1],
        [-7, -1],
        [-7, 0],
        [-7, 1],
        [-6, 1],
    ];
    return offsetToPosition(spawn.pos, offsets);
}
function offsetToPosition(origin, offsets) {
    const room = Game.rooms[origin.roomName];
    const positions = [];
    offsets.forEach((offset) => {
        const position = room.getPositionAt(origin.x + offset[0], origin.y + offset[1]);
        if (position != undefined) {
            positions.push(position);
        }
        else {
            error(`Unable to find position (${origin.x + offset[0]}, ${origin.y + offset[0]}) in room ${room.name}`);
        }
    });
    return positions;
}
function getLinkSpots(room) {
    const spawn = Game.getObjectById(room.memory.spawn);
    if (spawn == undefined) {
        error(`Couldn't find spawn for tower spots in room ${room.name}`);
        return [];
    }
    const positions = [];
    // [-1, -2] is the offset for the spawn-side link
    const offsets = [[-1, -2]];
    positions.push(...offsetToPosition(spawn.pos, offsets));
    // Controller link
    const controllerLink = getControllerSetupSpots(room);
    if (controllerLink == undefined) {
        warn(`Failed to get controller link position in room ${room.name}`);
    }
    else {
        positions.push(controllerLink);
    }
    return positions;
}
/**
 * Gets the RoomPositions for the container and link next to the controller.
 *
 * @param room The Room to find the positions for
 * @returns An array with two RoomPositions. [0] is the container position and
 *   [1] is the link position.
 */
function getControllerSetupSpots(room) {
    const controller = room.controller;
    if (controller == undefined) {
        error(`Couldn't find controller for room ${room.name}`);
        return;
    }
    const terrain = room.getTerrain();
    // let container: RoomPosition | null = null;
    let link = null;
    // Check all the tiles around the controller for a spot to place the link
    getSurroundingTiles(controller.pos, 1).forEach((position) => {
        if (link == undefined) {
            // If the terrain at the position and one above are plain
            if (terrain.get(position.x, position.y) === 0) {
                // container = position;
                link = room.getPositionAt(position.x, position.y);
            }
        }
    });
    // If no suitable location was found
    // if (container == undefined) {
    //  error(
    //    `Failed to find suitable location for controller container in room ${room.name}`
    //  );
    //  return;
    // }
    // If the room failed to find the position above the container
    if (link == undefined) {
        error(`Failed to find suitable location for controller link in room ${room.name}`);
        return;
    }
    return link;
}
function getStorageSpots(room) {
    const spawn = Game.getObjectById(room.memory.spawn);
    if (spawn == undefined) {
        error(`Couldn't find spawn for tower spots in room ${room.name}`);
        return [];
    }
    return offsetToPosition(spawn.pos, [[-2, -1]]);
}
/**
 * Get the extension spots for this spawn. This is just based on design and
 * does not take terrain/already existing structures into account.
 *
 * @param spawn The spawn to get the spots for
 * @returns An array of the RoomPositions
 */
function getExtensionSpots(room) {
    const spawn = Game.getObjectById(room.memory.spawn);
    if (spawn == undefined) {
        error(`Couldn't find spawn for tower spots in room ${room.name}`);
        return [];
    }
    info(`Find extension spots for spawn ${spawn.name}`);
    // We want order to matter, so we want to build each pod first. We also might
    // as well construct each pod group first before moving on to the next.
    // Starting with the top right pod group.
    let positions = [];
    // This is the primary road interesection that forms that heart of the podgroup
    const groupCenter = spawn.room.getPositionAt(spawn.pos.x + 3, spawn.pos.y + 3);
    if (groupCenter === null) {
        error(`Unable to get first group center position (${spawn.pos.x + 3}, ${spawn.pos.y + 3})`);
        return [];
    }
    // These are the three pod centers, the spots the creep will sit to refill
    const firstCenter = spawn.room.getPositionAt(spawn.pos.x + 2, spawn.pos.y + 4);
    if (firstCenter === null) {
        error(`Unable to get first center position (${spawn.pos.x + 2}, ${spawn.pos.y + 4})`);
        return [];
    }
    const secondCenter = spawn.room.getPositionAt(spawn.pos.x + 4, spawn.pos.y + 4);
    if (secondCenter === null) {
        error(`Unable to get second center position (${spawn.pos.x + 4}, ${spawn.pos.y + 4})`);
        return [];
    }
    const thirdCenter = spawn.room.getPositionAt(spawn.pos.x + 4, spawn.pos.y + 2);
    if (thirdCenter === null) {
        error(`Unable to get third center position (${spawn.pos.x + 4}, ${spawn.pos.y + 2})`);
        return [];
    }
    // The two exits, the extra spots lacking extensions off of the first and
    // third pods
    const firstExit = spawn.room.getPositionAt(spawn.pos.x + 1, spawn.pos.y + 5);
    if (firstExit === null) {
        error(`Unable to get first exit position (${spawn.pos.x + 1}, ${spawn.pos.y + 5})`);
        return [];
    }
    const secondExit = spawn.room.getPositionAt(spawn.pos.x + 5, spawn.pos.y + 1);
    if (secondExit === null) {
        error(`Unable to get second exit position (${spawn.pos.x + 5}, ${spawn.pos.y + 1})`);
        return [];
    }
    // Remove the group center
    positions = positions
        .concat(getSurroundingTiles(secondCenter, 1))
        .filter((spot) => {
        return spot.x !== groupCenter.x || spot.y !== groupCenter.y;
    });
    info(`second pod size: ${positions.length}`);
    // Merge the third and first pods then remove all spots that are also in the
    // second pod.
    const firstPod = getSurroundingTiles(firstCenter, 1);
    const thirdPod = getSurroundingTiles(thirdCenter, 1);
    let addition = firstPod.concat(thirdPod);
    // Remove duplicates
    addition = addition.filter((newSpot) => {
        if (newSpot.x === firstExit.x && newSpot.y === firstExit.y) {
            return false;
        }
        if (newSpot.x === secondExit.x && newSpot.y === secondExit.y) {
            return false;
        }
        if (newSpot.x === groupCenter.x && newSpot.y === groupCenter.y) {
            return false;
        }
        for (let i = 0; i < positions.length; i++) {
            if (newSpot.x === positions[i].x && newSpot.y === positions[i].y) {
                // Don't include deplicates
                return false;
            }
        }
        return true;
    });
    positions = positions.concat(addition);
    // Reflect the first pod group across the horizontal to get the second
    const horizontalReflection = [];
    positions.forEach((spot) => {
        // The y-coord is spawn.y minus the y-offset of the spot and spawn
        const reflected = spawn.room.getPositionAt(spot.x, spawn.pos.y - (spot.y - spawn.pos.y));
        if (reflected === null) {
            error(`Unable to get horizontal reflection of ${spot}`);
        }
        else {
            horizontalReflection.push(reflected);
        }
    });
    positions = positions.concat(horizontalReflection);
    // Reflect the first and second pod groups across the vertical to get the
    // third and fourth
    const verticalReflection = [];
    positions.forEach((spot) => {
        // The x-coord is spawn.x minus the x-offset of the spot and spawn
        const reflected = spawn.room.getPositionAt(spawn.pos.x - (spot.x - spawn.pos.x), spot.y);
        if (reflected === null) {
            error(`Unable to get vertical reflection of ${spot}`);
        }
        else {
            verticalReflection.push(reflected);
        }
    });
    positions = positions.concat(verticalReflection);
    return positions;
}
function getExtensionRoadSpots(room) {
    const spawn = Game.getObjectById(room.memory.spawn);
    if (spawn == undefined) {
        error(`Couldn't find spawn for tower spots in room ${room.name}`);
        return [];
    }
    info(`Finding extension road spots for spawn ${spawn.name}`);
    let positions = [];
    // Get the spots for the roads for the first pod group then reflect twice to
    // get the rest
    const offsets = [
        [2, 2],
        [3, 3],
        [4, 4],
        [2, 4],
        [1, 5],
        [4, 2],
        [5, 1],
    ];
    // Turn the offsets into positions and add them
    offsets.forEach((spot) => {
        const position = spawn.room.getPositionAt(spawn.pos.x + spot[0], spawn.pos.y + spot[1]);
        if (position !== null) {
            positions.push(position);
        }
    });
    // Reflect the first pod group across the horizontal to get the second
    const horizontalReflection = [];
    positions.forEach((spot) => {
        // The y-coord is spawn.y minus the y-offset of the spot and spawn
        const reflected = spawn.room.getPositionAt(spot.x, spawn.pos.y - (spot.y - spawn.pos.y));
        if (reflected === null) {
            error(`Unable to get horizontal reflection of ${spot}`);
        }
        else {
            horizontalReflection.push(reflected);
        }
    });
    positions = positions.concat(horizontalReflection);
    // Reflect the first and second pod groups across the vertical to get the
    // third and fourth
    const verticalReflection = [];
    positions.forEach((spot) => {
        // The x-coord is spawn.x minus the x-offset of the spot and spawn
        const reflected = spawn.room.getPositionAt(spawn.pos.x - (spot.x - spawn.pos.x), spot.y);
        if (reflected === null) {
            error(`Unable to get vertical reflection of ${spot}`);
        }
        else {
            verticalReflection.push(reflected);
        }
    });
    positions = positions.concat(verticalReflection);
    return positions;
}
function roadSpots(room) {
    const positions = [];
    const spawn = Game.getObjectById(room.memory.spawn);
    if (spawn == undefined) {
        error(`Couldn't find spawn for tower spots in room ${room.name}`);
        return [];
    }
    // Ring of roads around the spawn
    positions.push(...getSurroundingTiles(spawn.pos, 1));
    // Extension roads
    positions.push(...getExtensionRoadSpots(room));
    // The road at the intersection of the ends of the extension roads
    positions.push(...offsetToPosition(spawn.pos, [
        [0, -6],
        [6, 0],
        [0, 6],
        [-6, 0],
    ]));
    // The above are 40 roads
    return positions;
}
function minerContainers(room) {
    const sources = room.find(FIND_SOURCES);
    const terrain = Game.map.getRoomTerrain(room.name);
    const containers = [];
    sources.forEach((source) => {
        let count = 0;
        getSurroundingTiles(source.pos, 1).forEach((position) => {
            if (count < 1) {
                // If the terrain at the position is plain
                if (terrain.get(position.x, position.y) === 0) {
                    containers.push(position);
                    count++;
                }
            }
        });
        if (count === 0) {
            error(`Unable to find suitable container location for source at (${source.pos.x}, ` +
                `${source.pos.y})`);
        }
    });
    return containers;
}
function roadToController(room, planMatrix) {
    const spawn = Game.getObjectById(room.memory.spawn);
    if (spawn == undefined) {
        error(`Couldn't find spawn for tower spots in room ${room.name}`);
        return [];
    }
    const controller = room.controller;
    if (controller == undefined) {
        error(`Couldn't find controller for room ${room.name}`);
        return [];
    }
    // Turn the path into RoomPositions and add it to the road
    return planPath(room, spawn.pos, controller.pos, planMatrix);
}
function pathToRoomPosition(room, path) {
    const spots = path.map((step) => room.getPositionAt(step.x, step.y));
    const positions = spots.filter((position) => position != undefined);
    return positions;
}
function planPath(room, start, end, matrix) {
    const path = start.findPathTo(end, {
        costCallback: (roomName, pathMatrix) => {
            // If this is the planning room, exchange the previous matrix with the
            // planning cost matrix.
            if (matrix != undefined && room.name === roomName) {
                return matrix;
            }
            // If this is some other room or the planning cost matrix is undefined,
            // continue with the previous matrix.
            return pathMatrix;
        },
    });
    // Turn the path into RoomPositions and add it to the road
    return pathToRoomPosition(room, path);
}
function roomPositionToPlanCoord(positions) {
    return positions.map((position) => {
        return { x: position.x, y: position.y };
    });
}
function planCoordToRoomPosition(room, coords) {
    const positions = [];
    coords.forEach((coord) => {
        const position = room.getPositionAt(coord.x, coord.y);
        if (position != undefined) {
            positions.push(position);
        }
        else {
            warn(`Unable to convert coord (${coord.x}, ${coord.y}) to position in room ${room.name}`);
        }
    });
    return positions;
}
function batchSetMatrix(matrix, positions, cost = 255) {
    positions.forEach((position) => {
        matrix.set(position.x, position.y, cost);
    });
    return matrix;
}
function getPositionsInArea(topLeft, bottomRight) {
    const top = topLeft.y;
    const left = topLeft.x;
    const bottom = bottomRight.y;
    const right = bottomRight.x;
    const room = Game.rooms[topLeft.roomName];
    const positions = [];
    for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
            const pos = room.getPositionAt(x, y);
            if (pos == undefined) {
                error(`Unable to find position for (${x}, ${y}) in room ${room.name}`);
                continue;
            }
            positions.push(pos);
        }
    }
    return positions;
}
function getContainerSpots(room) {
    const containers = [];
    containers.push(...minerContainers(room));
    // const controllerSetup = getControllerSetupSpots(room);
    // if (controllerSetup == undefined || controllerSetup[0] == undefined) {
    //   warn(`No controller container spot for room ${room.name}`);
    // } else {
    //   containers.push(controllerSetup[0]);
    // }
    return containers;
}
function makePlan(room) {
    // 1. Spawn ring road
    // 2. Extensions and extension roads
    // 3. Planned spawn strucutres
    // 4. Roads to sources and controllers
    const spawn = Game.getObjectById(room.memory.spawn);
    if (spawn == undefined) {
        error(`Couldn't find spawn for tower spots in room ${room.name}`);
        return false;
    }
    const plan = {};
    let planMatrix = new PathFinder.CostMatrix();
    const spawnBounds = offsetToPosition(spawn.pos, [
        [-5, -5],
        [5, 5],
    ]);
    const towerBounds = offsetToPosition(spawn.pos, [
        [-7, -1],
        [-6, 1],
    ]);
    const spawnArea = getPositionsInArea(spawnBounds[0], spawnBounds[1]).concat(getPositionsInArea(towerBounds[0], towerBounds[1]));
    // Block off the spawn area
    planMatrix = batchSetMatrix(planMatrix, spawnArea, 255);
    // - - - Structures - - -
    const wallsAndRamparts = getExitWallsAndRamparts(room);
    const extensions = getExtensionSpots(room);
    const containers = getContainerSpots(room);
    const storage = getStorageSpots(room);
    const links = getLinkSpots(room);
    const towers = getTowerSpots(room);
    // - - - Roads - - -
    let roads = roadSpots(room);
    // Allow roads inside the spawn area to be pathed upon
    planMatrix = batchSetMatrix(planMatrix, roads, 0);
    // Roads to the miner containers by sources
    minerContainers(room).forEach((dest) => {
        roads.push(...planPath(room, spawn.pos, dest, planMatrix));
    });
    // Road to the controller
    roads.push(...roadToController(room, planMatrix));
    // Remove duplicates from the roads
    roads = roomPositionArrayRemoveDuplicates(roads);
    // - - - Finish up - - -
    // Build the plan
    plan[STRUCTURE_WALL] = { pos: roomPositionToPlanCoord(wallsAndRamparts[0]) };
    plan[STRUCTURE_RAMPART] = {
        pos: roomPositionToPlanCoord(wallsAndRamparts[1]),
    };
    plan[STRUCTURE_ROAD] = { pos: roomPositionToPlanCoord(roads) };
    plan[STRUCTURE_EXTENSION] = { pos: roomPositionToPlanCoord(extensions) };
    plan[STRUCTURE_CONTAINER] = { pos: roomPositionToPlanCoord(containers) };
    plan[STRUCTURE_STORAGE] = { pos: roomPositionToPlanCoord(storage) };
    plan[STRUCTURE_LINK] = { pos: roomPositionToPlanCoord(links) };
    plan[STRUCTURE_TOWER] = { pos: roomPositionToPlanCoord(towers) };
    // Save the plan and planner CostMatrix to memory
    const plannerMemory = {
        plan: plan,
        costMatrix: planMatrix.serialize(),
    };
    room.memory.planner = plannerMemory;
    // Planner success
    return true;
}
function buildStructurePlan(room, structureType, plan) {
    const positions = planCoordToRoomPosition(room, plan.pos);
    positions.forEach((pos) => buildStructure(pos, structureType));
    return true;
}
/**
 * Get part of a StructurePlan from start to end indices both inclusive.
 *
 * @param plan The plan
 * @param start The first index to be included
 * @param end The last index to be included
 * @returns A plan containing indices start through end inclusive or an empty plan.
 */
function getPartOfPlan(plan, start, end) {
    const slice = plan.pos.slice(start, end + 1);
    if (slice.length != end - start + 1) {
        warn(`Plan has length ${plan.pos.length} but requested slice starts at ${start} and ends at ${end}`);
    }
    return { pos: slice };
}
function executePlan(room, levelOverride = -1) {
    info(`Executing plan for room ${room.name}`);
    if (room.memory.level == undefined) {
        error(`Room ${room.name} has no level`);
        return false;
    }
    if (room.memory.planner == undefined) {
        error(`Room ${room.name} has no plan`);
        return false;
    }
    // The level to execute the plan at
    let level = room.memory.level;
    if (levelOverride !== -1) {
        level = levelOverride;
        info(`Executing plan for room ${room.name} with level override ${level}`);
    }
    switch (level) {
        case 0:
        case 1: {
            // Level 0/1: Initial plan
            // - Place roads
            // - Place miner containers
            const roads = room.memory.planner.plan[STRUCTURE_ROAD];
            if (roads != undefined)
                buildStructurePlan(room, STRUCTURE_ROAD, roads);
            const containers = room.memory.planner.plan[STRUCTURE_CONTAINER];
            if (containers != undefined) {
                // !! TODO: this *will not* work if there are less than two sources !!
                // The miner containrs should be the first two planned contaiers, so
                // get indices 0 through 1 both-inclusive.
                const minerContainers = getPartOfPlan(containers, 0, 1);
                buildStructurePlan(room, STRUCTURE_CONTAINER, minerContainers);
            }
            else {
                warn(`Room ${room.name}'s plan is missing containers`);
            }
            return true;
        }
        case 5: {
            const links = room.memory.planner.plan[STRUCTURE_LINK];
            if (links != undefined) {
                // At RCL 5, only two links can be built.
                buildStructurePlan(room, STRUCTURE_LINK, getPartOfPlan(links, 0, 1));
            }
            else {
                warn(`Room ${room.name}'s plan is missing links`);
            }
            const towers = room.memory.planner.plan[STRUCTURE_TOWER];
            if (towers != undefined) {
                // At RCL 5, only one additional (two total) towers can be built
                buildStructurePlan(room, STRUCTURE_TOWER, getPartOfPlan(towers, 1, 1));
            }
            else {
                warn(`Room ${room.name}'s plan is missing towers`);
            }
            // const containers = room.memory.planner.plan[STRUCTURE_CONTAINER];
            // if (containers != undefined) {
            //   // !! TODO: this *will not* work if there are less than two sources !!
            //   // The link container should be the third container if there are two
            //   // sources.
            //   const controllerContainer = getPartOfPlan(containers, 2, 2);
            //   buildStructurePlan(room, STRUCTURE_CONTAINER, controllerContainer);
            // } else {
            //   warn(`Room ${room.name}'s plan is missing containers`);
            // }
            return true;
        }
        default:
            return false;
    }
}

/**
 * Process spawn behavior
 *
 * @param spawn The spawn to process
 */
function spawnManager(spawn) {
    // Currently no spawn queue, so we can only queue one creep per tick
    let allowSpawn = true;
    // Spawn harvester creeps
    const maxHarvesters = Memory.populationLimit.harvester || 0;
    const harvestersCount = countRole("harvester" /* harvester */);
    // Also, if there are no creeps, emergency spawn a harvester
    if (harvestersCount < maxHarvesters ||
        Object.keys(Game.creeps).length === 0) {
        if (allowSpawn) {
            info(`${spawn.name}     requesting ${"harvester" /* harvester */}`, "spawn" /* spawn */);
            spawnCreep(spawn, "harvester" /* harvester */);
        }
        else {
            info(`${spawn.name} NOT requesting ${"harvester" /* harvester */}`, "spawn" /* spawn */);
        }
        allowSpawn = false;
    }
    // Spawn miner creeps
    const sources = spawn.room.find(FIND_SOURCES);
    const minerCount = countRole("miner" /* miner */);
    const maxMiners = Memory.populationLimit.miner || 0;
    if (minerCount < maxMiners) {
        if (allowSpawn) {
            info(`${spawn.name}     requesting ${"miner" /* miner */}`, "spawn" /* spawn */);
            const memory = generateMemoryByRole("miner" /* miner */, spawn.room);
            // Get the id of the miner, which is the number attached the end of it's name
            const id = Number(nameCreep(memory).replace("miner_", ""));
            const source = sources[id];
            const surrounding = getSurroundingTiles(source.pos, 1);
            const spot = surrounding.find((place) => {
                const structures = place.lookFor(LOOK_STRUCTURES);
                return (structures.find((structure) => structure.structureType === STRUCTURE_CONTAINER) !== undefined);
            });
            if (spot === undefined) {
                warn(`Failed to assign spot to miner ${id}`);
            }
            spawnCreep(spawn, "miner" /* miner */, {
                assignedSource: source.id,
                spot: spot,
                noRenew: true,
            });
        }
        else {
            info(`${spawn.name} NOT requesting ${"miner" /* miner */}`, "spawn" /* spawn */);
        }
        allowSpawn = false;
    }
    // Spawn tender creeps
    const tenderCount = countRole("tender" /* tender */);
    const maxTenders = Memory.populationLimit.tender || 0;
    if (tenderCount < maxTenders) {
        if (allowSpawn) {
            info(`${spawn.name}     requesting ${"tender" /* tender */}`, "spawn" /* spawn */);
            spawnCreep(spawn, "tender" /* tender */);
        }
        else {
            info(`${spawn.name} NOT requesting ${"tender" /* tender */}`, "spawn" /* spawn */);
        }
        allowSpawn = false;
    }
    // Spawn hauler creeps
    const haulerCount = countRole("hauler" /* hauler */);
    const maxHaulers = Memory.populationLimit.hauler || 0;
    if (haulerCount < maxHaulers) {
        if (allowSpawn) {
            info(`${spawn.name}     requesting ${"hauler" /* hauler */}`, "spawn" /* spawn */);
            // Get the id of the hauler to associate it with the miner of the same id
            // by assigned them to the same spot
            const memory = generateMemoryByRole("hauler" /* hauler */, spawn.room);
            const id = Number(nameCreep(memory).replace("hauler_", ""));
            const associated_miner = Game.creeps[`miner_${id}`];
            if (associated_miner === undefined) {
                error(`Spawn ${spawn.name} can't find associated miner for hauler id ${id}`);
                return;
            }
            spawnCreep(spawn, "hauler" /* hauler */, {
                spot: associated_miner.memory.spot,
            });
        }
        else {
            info(`${spawn.name} NOT requesting ${"hauler" /* hauler */}`, "spawn" /* spawn */);
        }
        allowSpawn = false;
    }
    // Spawn upgrader creeps
    const maxUpgraders = Memory.populationLimit.upgrader || 0;
    const upgraderCount = countRole("upgrader" /* upgrader */);
    if (upgraderCount < maxUpgraders) {
        if (allowSpawn) {
            info(`${spawn.name}     requesting ${"upgrader" /* upgrader */}`, "spawn" /* spawn */);
            spawnCreep(spawn, "upgrader" /* upgrader */);
        }
        else {
            info(`${spawn.name} NOT requesting ${"upgrader" /* upgrader */}`, "spawn" /* spawn */);
        }
        allowSpawn = false;
    }
    // Spawn builder creeps
    const builderCount = countRole("builder" /* builder */);
    const maxBuilders = Memory.populationLimit.builder || 0;
    if (builderCount < maxBuilders) {
        if (allowSpawn) {
            info(`${spawn.name}     requesting ${"builder" /* builder */}`, "spawn" /* spawn */);
            spawnCreep(spawn, "builder" /* builder */);
        }
        else {
            info(`${spawn.name} NOT requesting ${"builder" /* builder */}`, "spawn" /* spawn */);
        }
        allowSpawn = false;
    }
    // Build extentions
    const controller = spawn.room.controller.level;
    let extensionCount = 0;
    if (spawn.memory.extensions) {
        extensionCount = spawn.memory.extensions.length;
    }
    const availableEnergy = getRoomAvailableEnergy(spawn.room);
    // If available energy is undefined (i.e. no room primary storage) or there is
    // enough available energy to construct an extension, and there is less than
    // the max number of extensions.
    if ((availableEnergy == undefined ||
        availableEnergy > CONSTRUCTION_COST[STRUCTURE_EXTENSION]) &&
        extensionCount < getMaxExtensions(controller)) {
        requestExtentions(spawn);
    }
}
function spawnCreep(spawn, role, overrides) {
    const memory = generateMemoryByRole(role, spawn.room);
    if (overrides != undefined) {
        for (const key in overrides) {
            memory[key] = overrides[key];
        }
    }
    const name = nameCreep(memory);
    const body = generateBodyByRole(spawn, role);
    const response = spawn.spawnCreep(body, name, {
        memory,
    });
    info(`${spawn.name} spawning creep ${name} (${stringifyBody(body)}): ` +
        `${errorConstant(response)}`, "spawn" /* spawn */);
}
/**
 * Generate a creep body based on its role and the spawn's capacity.
 *
 * @param spawn The spawn the creep will be spawned from to determine available energy
 * @param role The role to generate a body for
 * @returns An array of BodyPartConstants representing the creep's body
 */
function generateBodyByRole(spawn, role) {
    switch (role) {
        case "miner" /* miner */: {
            const body = [MOVE];
            // The capacity minus the carry and move part cost divided by the work part cost
            const workParts = Math.min(5, Math.floor((getSpawnCapacity(spawn) - 100) / 100));
            for (let i = 0; i < workParts; i++) {
                body.push(WORK);
            }
            return body;
        }
        // General body
        case "builder" /* builder */:
        case "upgrader" /* upgrader */: {
            const body = [];
            const bodyUnits = Math.floor(getSpawnCapacity(spawn) / 50);
            // 1/3 each in priority order:
            // MOVE
            // WORK
            // CARRY
            // However, since WORK parts cost twice the normal, it's actually by 1/4s
            // of body units, which will produce the 1/3 body ratio.
            const fourth = bodyUnits / 4;
            const moves = Math.ceil(fourth);
            const works = Math.floor(fourth);
            const carries = Math.ceil(fourth);
            for (let i = 0; i < bodyUnits; i++) {
                if (i < moves) {
                    body.push(MOVE);
                }
                else if (i < moves + works) {
                    body.push(WORK);
                }
                else if (i < moves + works + carries) {
                    body.push(CARRY);
                }
                else {
                    // Done building the body
                    break;
                }
            }
            return body;
        }
        case "tender" /* tender */:
        case "hauler" /* hauler */: {
            const body = [];
            let availableEnergy = getSpawnCapacity(spawn);
            // If the creep is a tender, only count truly available energy so we
            // always have a tender. Although, this may lead to spawning "low-level"
            // tenders.
            if (role === "tender" /* tender */) {
                availableEnergy = getSpawnEnergy(spawn);
            }
            // Haulers/tenders don't really need more thnat 30 body parts, allowing
            // them 1000 carry capacity and 1 move speed on roads empty and full.
            // Energy capacity minus work cost divided by MOVE/CARRY cost
            const bodyUnits = Math.min(30, Math.floor(availableEnergy / 50));
            // 1/3 MOVE, rest CARRY
            for (let i = 0; i < bodyUnits; i++) {
                // Prioritize MOVE parts so that the creep always moves in 1
                if (i < Math.ceil(bodyUnits / 3)) {
                    body.push(MOVE);
                }
                else {
                    body.push(CARRY);
                }
            }
            return body;
        }
        case "claimer" /* claimer */: {
            return [MOVE, MOVE, CLAIM];
        }
        case "harvester" /* harvester */: {
            return [MOVE, CARRY, WORK];
        }
        default:
            error(`getBodyPartsFromRole invalid role ${role}`);
            return [];
    }
}
function generateMemoryByRole(role, room) {
    return {
        role,
        task: "fresh" /* fresh */,
        room: room.name,
    };
}
function requestExtentions(spawn) {
    if (spawn.memory.extensions === undefined) {
        spawn.memory.extensions = [];
    }
    // Only request an extension when there is nothing in the build/repair queues
    if (queueLength() === 0 && repairQueueLength() === 0) {
        if (spawn.memory.extensionSpots === undefined) {
            error(`Spawn ${spawn.name} has no extension spots in its memory`);
            return;
        }
        const spot = spawn.memory.extensionSpots.shift();
        if (spot === undefined) {
            error(`Spawn ${spawn.name} has run out of extension spots`);
            return;
        }
        const position = spawn.room.getPositionAt(spot.x, spot.y);
        if (position === null) {
            error(`Spawn ${spawn.name} can't locate position (${spot.x}, ${spot.y})`);
            return;
        }
        info(`Spawn ${spawn.name} requesting extention at ${JSON.stringify(position)}`, "build" /* build */);
        if (buildStructure(position, STRUCTURE_EXTENSION)) {
            spawn.memory.extensions.push(position);
        }
        else {
            warn(`Spawn ${spawn.name} failed extention request at ${JSON.stringify(position)}`);
        }
    }
}
function getSpawnExtensions(spawn) {
    const extensions = [];
    if (spawn.memory.extensions == undefined)
        return [];
    spawn.memory.extensions.forEach((position) => {
        const pos = spawn.room.getPositionAt(position.x, position.y);
        if (pos == undefined)
            return;
        pos
            .lookFor(LOOK_STRUCTURES)
            .filter((structure) => {
            return structure.structureType === STRUCTURE_EXTENSION;
        })
            .forEach((extension) => {
            extensions.push(extension);
        });
    });
    return extensions;
}
function getSpawnCapacity(spawn) {
    // In theory the length of the spawn extension list should work, but then the
    // extensions gets counted even if it is a construction site, which means that
    // while an extension is under construction, the spawn capacity is over-
    // quoted, leading to ERR_NOT_ENOUGH_RESOURCES for the majority of creep roles
    // (tenders get around this because they are designed to spawn immediately
    // with a body based on available energy so they can always spawn).
    let capacity = SPAWN_ENERGY_CAPACITY;
    getSpawnExtensions(spawn).forEach(() => {
        capacity += EXTENSION_ENERGY_CAPACITY[spawn.room.memory.level];
    });
    return capacity;
}
function getSpawnEnergy(spawn) {
    let energy = spawn.store.getUsedCapacity(RESOURCE_ENERGY);
    getSpawnExtensions(spawn).forEach((extension) => {
        energy += extension.store.getUsedCapacity(RESOURCE_ENERGY);
    });
    return energy;
}
function getMaxExtensions(level) {
    return CONTROLLER_STRUCTURES["extension"][level];
}
function initSpawn(spawn) {
    info(`Initializing spawn ${spawn.name}...`);
    // Construct a ring of roads around the spawn
    const spawn_ring = getSurroundingTiles(spawn.pos, 1);
    info(`Spawn ring road: ${JSON.stringify(spawn_ring)}`, "build" /* build */);
    buildRoad(spawn_ring);
    // Construct the extension roads
    const extensionRoads = getExtensionRoadSpots(spawn.room);
    info(`Spawn extension road: ${JSON.stringify(extensionRoads)}`, "build" /* build */);
    buildRoad(extensionRoads);
    // Add the extension spots to the memory
    const extensionSpots = getExtensionSpots(spawn.room);
    spawn.memory.extensionSpots = extensionSpots;
    info(`Finished initizalizing spawn ${spawn.name}`);
}

/**
 * Behavior for a harvester creep (CreepRole.harvester)
 *
 * @param creep The harvester creep
 */
function harvester(creep) {
    if (creep.memory.task === "fresh" /* fresh */)
        creep.memory.task = "harvest" /* harvest */;
    switch (creep.memory.task) {
        // The creep is harvesting
        case "harvest" /* harvest */: {
            if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                // If the creep has more free energy, keep harvesting
                getEnergy(creep);
            }
            else {
                switchTaskAndDoRoll(creep, "deposit" /* deposit */);
                return;
            }
            break;
        }
        // The creep is depositing
        case "deposit" /* deposit */: {
            if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                // If the creep has energy, keep depositing
                depositEnergy(creep);
            }
            else {
                // If the creep has no energy, begin harvesting
                switchTaskAndDoRoll(creep, "harvest" /* harvest */);
                return;
            }
            break;
        }
        // The creep is neither harvesting nor depositing, i.e. it has an invalid task
        default: {
            throw new Error("harvester creep.memory.task should be harvest or deposit, not " +
                creep.memory.task);
        }
    }
}
/**
 * Behavior function for a miner creep (CreepRole.miner). This creep should
 * stay near a source and harvest until full. Then deposit into a nearby energy
 * store, i.e. a container.
 *
 * @param creep The miner creep
 */
function miner(creep) {
    if (creep.memory.task === "fresh" /* fresh */)
        creep.memory.task = "harvest" /* harvest */;
    // Tasks for this creep:
    // 0. Move to spot, if it has a spot
    // 1. CreepTask.harvest: harvest from assigned energy source
    let spot = null;
    if (creep.memory.spot) {
        spot = Game.rooms[creep.memory.spot.roomName].getPositionAt(creep.memory.spot.x, creep.memory.spot.y);
    }
    if (spot && (creep.pos.x !== spot.x || creep.pos.y !== spot.y)) {
        const response = errorConstant(creep.moveTo(spot));
        info(`Creep ${creep.name} moving to spot ${JSON.stringify(spot)}: ${response}`);
        return;
    }
    const source = Game.getObjectById(creep.memory.assignedSource || "");
    harvestEnergy(creep, source || undefined);
    /* // Old miner
    switch (creep.memory.task) {
      // The creep is harvesting
      case CreepTask.harvest: {
        // Move to this miners spot (if it exists)
        if (creep.memory.spot && creep.pos !== creep.memory.spot) {
          creep.moveTo(creep.memory.spot);
          return;
        }
        // Proceed as normal once at spot (or spot doesn't exist)
        const source = Game.getObjectById(creep.memory.assignedSource) as Source;
        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
          // If the creep has more free energy, keep harvesting
          harvestEnergy(creep, source);
        } else {
          // If the creep has no free energy, begin depositing
          switchTaskAndDoRoll(creep, CreepTask.deposit);
          return;
        }
        break;
      }
      // The creep is depositing
      case CreepTask.deposit: {
        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
          // If the creep has energy, keep depositing
          storeEnergy(creep);
        } else {
          // If the creep has no energy, begin harvesting
          switchTaskAndDoRoll(creep, CreepTask.harvest);
          return;
        }
        break;
      }
      // The creep is neither harvesting nor depositing, i.e. it has an invalid task
      default: {
        throw new Error(
          "miner creep.memory.task should be harvest or deposit, not " +
            creep.memory.task
        );
      }
    }
    */
}
/**
 * Behavior function for builder creeps (CreepRole.builder). These creeps
 * should construct buildings in the build queue.
 *
 * @param creep The builder creep
 */
function builder(creep) {
    if (creep.memory.task === "fresh" /* fresh */)
        creep.memory.task = "get_energy" /* getEnergy */;
    // Tasks for this creep:
    // 1. CreepTask.getEnergy: Get energy to construct buildings
    // 2. CreepTask.build: Move to a construction site and build
    // 3. CreepTask.repair: Move to a repairable structure and repair
    // 4. CreepTask.idle: Move to the idle location and chill
    switch (creep.memory.task) {
        case "get_energy" /* getEnergy */: {
            if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                // If the creep can hold more energy, keep getting energy
                getEnergy(creep);
            }
            else {
                // If the creep has full energy, begin building
                switchTaskAndDoRoll(creep, "build" /* build */);
                return;
            }
            break;
        }
        case "build" /* build */: {
            if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                // If the creep has more energy, continue building
                if (creep.memory.assignedConstruction || queueLength() > 0) {
                    if (creep.memory.assignedConstruction == undefined ||
                        Game.getObjectById(creep.memory.assignedConstruction) == undefined) {
                        creep.memory.assignedConstruction = fromQueue();
                        if (creep.memory.assignedConstruction == undefined) {
                            error(`queueLength was positive but creep ${creep.name} unable to get assignment`);
                            // End the behavior function
                            return;
                        }
                    }
                    // Perform the build action
                    build$1(creep);
                }
                else {
                    // If there is nothing to build, repair
                    info(`No items in the construction queue`, "general" /* general */);
                    switchTaskAndDoRoll(creep, "repair" /* repair */);
                    return;
                }
            }
            else {
                switchTaskAndDoRoll(creep, "get_energy" /* getEnergy */);
                return;
            }
            break;
        }
        case "idle" /* idle */: {
            if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
                // If the creep has no energy, it should get energy
                switchTaskAndDoRoll(creep, "get_energy" /* getEnergy */);
                return;
            }
            else if (creep.memory.assignedConstruction || queueLength() > 0) {
                // Build
                switchTaskAndDoRoll(creep, "build" /* build */);
                return;
            }
            else if (creep.memory.assignedRepairs || repairQueueLength() > 0) {
                // Repair
                switchTaskAndDoRoll(creep, "repair" /* repair */);
                return;
            }
            else {
                // Remain idle
                info(`Creep ${creep.name} is idle`, "idleCreep" /* idleCreep */);
                idle(creep);
            }
            break;
        }
        case "repair" /* repair */: {
            if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                if (creep.memory.assignedRepairs == undefined) {
                    creep.memory.assignedRepairs = fromRepairQueue();
                    if (creep.memory.assignedRepairs == undefined) {
                        // If there is nothing to repair, idle
                        info(`No items in the repair queue`, "general" /* general */);
                        switchTaskAndDoRoll(creep, "idle" /* idle */);
                        return;
                    }
                }
                // Only repair structures that need repairs
                let repairStructure = Game.getObjectById(creep.memory.assignedRepairs);
                while (repairStructure == undefined ||
                    repairStructure.hits === repairStructure.hitsMax) {
                    repairStructure = Game.getObjectById(fromRepairQueue() || "");
                    // If we've reached the end of the repairQueue without a valid repair,
                    if (repairStructure == undefined) {
                        // Delete the creeps assigned repair
                        delete creep.memory.assignedRepairs;
                        // And go idle
                        switchTaskAndDoRoll(creep, "idle" /* idle */);
                        return;
                    }
                }
                creep.memory.assignedRepairs = repairStructure.id;
                repair(creep, Game.getObjectById(creep.memory.assignedRepairs));
            }
            else {
                switchTaskAndDoRoll(creep, "get_energy" /* getEnergy */);
                return;
            }
            break;
        }
        // The creep  has an invalid task
        default: {
            error(`builder creep.memory.task should be ${"get_energy" /* getEnergy */} or ` +
                `${"build" /* build */}, not ${creep.memory.task}`);
        }
    }
}
function upgrader(creep) {
    if (creep.memory.task === "fresh" /* fresh */)
        creep.memory.task = "get_energy" /* getEnergy */;
    // Tasks for this creep:
    // 1. Get energy
    // 2. Deposit energy first in the spawn then upgrade the controller
    switch (creep.memory.task) {
        // The creep is getting energy
        case "get_energy" /* getEnergy */: {
            if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                // If the creep can hold more energy, keep getting energy
                // If there is a controller link
                const controllerLinkId = creep.room.memory.links.controller;
                if (controllerLinkId != undefined) {
                    const controllerLink = Game.getObjectById(controllerLinkId);
                    if (controllerLink != undefined) {
                        // Only target the controller link if it has available energy
                        if (controllerLink.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                            getEnergy(creep, controllerLink);
                            return;
                        }
                        else {
                            // If the controller link has no energy but the creep does have
                            // some energy, deposit for now with what the creep has.
                            if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                                switchTaskAndDoRoll(creep, "deposit" /* deposit */);
                            }
                        }
                    }
                    else {
                        error(`Unable to get controller link of id ${controllerLinkId} in room ${creep.room.name}`);
                    }
                }
                // If there isn't a controller link
                getEnergy(creep);
            }
            else {
                // If the creep has full energy, begin building
                switchTaskAndDoRoll(creep, "deposit" /* deposit */);
                return;
            }
            break;
        }
        // The creep is depositing
        case "deposit" /* deposit */: {
            if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                // If hauler creeps exist, upgraders should exclusively upgrade
                if (countRole("hauler" /* hauler */) > 0) {
                    upgradeController(creep);
                }
                else {
                    depositEnergy(creep);
                }
            }
            else {
                // If the creep has no energy, begin getting energy
                switchTaskAndDoRoll(creep, "get_energy" /* getEnergy */);
                return;
            }
            break;
        }
        // The creep is neither harvesting nor depositing, i.e. it has an invalid task
        default: {
            error(`Creep ${creep} should have tasks ${"get_energy" /* getEnergy */} or ${"deposit" /* deposit */}, ` +
                `not ${creep.memory.task}`);
        }
    }
}
function hauler(creep) {
    if (creep.memory.task === "fresh" /* fresh */)
        creep.memory.task = "get_energy" /* getEnergy */;
    // Tasks for this creep:
    // 1. getEnergy: Get energy from container at assigned spot
    // 2. deposit: Bring energy to spawnside energy storage
    switch (creep.memory.task) {
        // Creep is getting energy
        case "get_energy" /* getEnergy */: {
            if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                if (creep.memory.spot === undefined) {
                    error(`Hauler creep ${creep.name} has no assigned spot`);
                    return;
                }
                const spot = creep.room.getPositionAt(creep.memory.spot.x, creep.memory.spot.y);
                if (spot === null) {
                    error(`Hauler creep ${creep.name} unable to get assigned spot ${JSON.stringify(creep.memory.spot)}`);
                    return;
                }
                const structure = spot
                    .lookFor(LOOK_STRUCTURES)
                    .find((found) => found.structureType === STRUCTURE_CONTAINER);
                if (structure === undefined) {
                    error(`Hauler creep ${creep.name} unable to get container`);
                    return;
                }
                // Every 10 ticks check for nearby energy to recover. Otherwise, get
                // energy like normal.
                let response = OK;
                if (Game.time % 10 === 0) {
                    response = recoverEnergy(creep);
                }
                if (response === OK) {
                    // Get energy from the container
                    getEnergy(creep, structure);
                }
            }
            else {
                // Now deposit
                switchTaskAndDoRoll(creep, "deposit" /* deposit */);
            }
            break;
        }
        case "deposit" /* deposit */: {
            if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                const storage = Game.getObjectById(creep.room.memory.storage || "") || null;
                if (storage == undefined) {
                    warn(`Creep ${creep.name} noticed there is no primary storage for room ${creep.room.name}`);
                    storeEnergy(creep);
                }
                else {
                    storeEnergy(creep, storage);
                }
            }
            else {
                // If the creep has no energy, begin getting energy
                switchTaskAndDoRoll(creep, "get_energy" /* getEnergy */);
                return;
            }
            break;
        }
    }
}
function tender(creep) {
    if (creep.memory.task === "fresh" /* fresh */)
        creep.memory.task = "get_energy" /* getEnergy */;
    // Tasks for this creep:
    // 1. getEnergy: Get energy from fullest container
    // 2. deposit: Deposit into spawn/extension or least full container
    switch (creep.memory.task) {
        // Creep is getting energy
        case "get_energy" /* getEnergy */: {
            if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                getEnergy(creep);
            }
            else {
                // If the creep has full energy, begin building
                switchTaskAndDoRoll(creep, "deposit" /* deposit */);
                return;
            }
            break;
        }
        // The creep is depositing
        case "deposit" /* deposit */: {
            if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                // If the creep has energy, keep depositing
                const deposited = depositEnergy(creep, true);
                // If not depositing, recover energy from tombs
                if (!deposited)
                    recoverEnergy(creep, -1);
            }
            else {
                // If the creep has no energy, begin getting energy
                switchTaskAndDoRoll(creep, "get_energy" /* getEnergy */);
                return;
            }
            break;
        }
    }
}
// function claimer(creep: Creep) {}
/**
 * Switches the creeps task and then calls doRoll on the creep
 *
 * @param creep The creep
 * @param task The new role for the creep
 */
function switchTaskAndDoRoll(creep, task) {
    creep.memory.task = task;
    info(`Creep ${creep.name} switching to ${task} and performing ${creep.memory.role}`, "task" /* task */);
    doRole(creep);
}
/**
 * Count the number of creeps of a certain role
 *
 * @param role The role to count
 * @returns The number of creeps
 */
function countRole(role) {
    let count = 0;
    for (const name in Game.creeps) {
        if (Game.creeps[name].memory.role === role)
            count++;
    }
    return count;
}
/**
 * Generates a name for the creep based on its memory
 *
 * @param memory The memory of the creep-to-be
 * @returns A name
 */
function nameCreep(memory) {
    // Start the name with the creeps role
    const name = memory.role + "_";
    // Since there will be multiple creeps per role, a number will be need since names must be unique
    let number = 0;
    // While there is a creep with the same name, increment number
    while (Game.creeps[name + number] !== undefined) {
        number++;
    }
    return name + number;
}
function renewCreep(creep) {
    info(`Creep ${creep.name} renewing`);
    const spawn = Game.getObjectById(creep.room.memory.spawn);
    if (spawn == undefined) {
        error(`Couldn't find spawn in room ${creep.room.name} to renew creep ${creep.name}`);
        return;
    }
    if (creep.ticksToLive && creep.ticksToLive < 1400) {
        // If the creep is adjacent to the spawn
        if (creep.pos.getRangeTo(spawn) === 1) {
            spawn.renewCreep(creep);
        }
        else {
            creep.moveTo(spawn);
        }
    }
    else {
        switchTaskAndDoRoll(creep, "fresh" /* fresh */);
    }
}
function renewCheck(creep) {
    // If the creep isn't allowed to renew or it is already renewing, do nothing.
    if (creep.memory.noRenew || creep.memory.task === "renew" /* renew */) {
        return;
    }
    // If the creep is spawning (ticksToLive == undefined) or has more than 100
    // ticks to live, don't renew.
    if (creep.ticksToLive == undefined || creep.ticksToLive > 100) {
        return;
    }
    // If the creep's role is above the population limit, let it die.
    const roleLimit = Memory.populationLimit[creep.memory.role];
    if (roleLimit == undefined || roleLimit < countRole(creep.memory.role)) {
        // An option here would be to set the creep to not renew, but the limit may
        // change while the creep still has a chance to renew, like in the case of
        // the builder limit increasing due to a change in the construction queue.
        return;
    }
    const spawn = Game.getObjectById(creep.room.memory.spawn);
    // If the spawn can't be found, log an error and do nothing.
    if (spawn == undefined) {
        error(`Couldn't get spawn in room ${creep.room.name} to set renew task for creep ${creep.name}`);
        return;
    }
    // If the spawn is spawning, don't renew
    if (spawn.spawning != undefined) {
        return;
    }
    // If the spawn doesn't have full capacity, don't renew
    if (getSpawnEnergy(spawn) !== getSpawnCapacity(spawn)) {
        return;
    }
    // If there is a new/better body for the creep, let it die.
    const newBody = generateBodyByRole(spawn, creep.memory.role);
    if (bodyCost(newBody) > bodyCost(creep.body)) {
        // Since there is a better body, don't check is this creep can renew again.
        creep.memory.noRenew = true;
        return;
    }
    // All checks passed, renew.
    switchTaskAndDoRoll(creep, "renew" /* renew */);
}
/**
 * Passes creep to appropriate behavior function based on the creep's role
 * (`creep.memory.role`)
 *
 * @param creep The creep
 */
function doRole(creep) {
    if (creep.spawning)
        return;
    if (Memory.debug.sayTask)
        creep.say(creep.memory.task);
    // The renew task is the same regardless of role
    renewCheck(creep);
    if (creep.memory.task === "renew" /* renew */) {
        renewCreep(creep);
        // Creep is renewing; don't process normal behavior
        return;
    }
    switch (creep.memory.role) {
        case "harvester" /* harvester */:
            harvester(creep);
            break;
        case "builder" /* builder */:
            builder(creep);
            break;
        case "miner" /* miner */:
            miner(creep);
            break;
        case "upgrader" /* upgrader */:
            upgrader(creep);
            break;
        case "hauler" /* hauler */:
            hauler(creep);
            break;
        case "tender" /* tender */:
            tender(creep);
            break;
        default:
            throw new Error("doRole invalid role " + creep.memory.role);
    }
}
/**
 * Performs actions upon the death of a creep based on the creeps roll
 *
 * @param name The name of the dead creep
 */
function handleDead(name) {
    info(`Handling death of creep ${name}`, "general" /* general */);
    const memory = Memory.creeps[name];
    switch (memory.role) {
        case "builder" /* builder */:
            if (memory.assignedConstruction) {
                unassignConstruction(name);
            }
    }
    if (memory.room != undefined) {
        const room = Game.rooms[memory.room];
        if (room != undefined) {
            const tomb = room
                .find(FIND_TOMBSTONES)
                .find((tomb) => tomb.creep.name === name);
            if (tomb != undefined) {
                if (tomb.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                    if (room.memory.tombs == undefined) {
                        room.memory.tombs == [];
                    }
                    info(`Adding dead creep ${name}'s tomb to room ${room.name}'s tombs`);
                    room.memory.tombs.push(tomb.id);
                }
            }
            else {
                warn(`Unable to find tomb for dead creep ${name} in ${room.name}`);
            }
        }
    }
}
function hasBodyPart(creep, partType) {
    const body = creep.body;
    for (let i = 0; i < body.length; i++) {
        if (partType === body[i].type)
            return true;
    }
    return false;
}
function countBodyPart(body, partType) {
    let count = 0;
    if (body.length === 0) {
        return 0;
    }
    if (typeof body[0] === "object" && body[0] !== null) {
        const partList = body;
        partList.forEach((part) => {
            if (part.type === partType)
                count++;
        });
    }
    else {
        const partList = body;
        partList.forEach((part) => {
            if (part === partType)
                count++;
        });
    }
    return count;
}
function bodyCost(body) {
    let cost = 0;
    BODYPARTS_ALL.forEach((partType) => {
        const count = countBodyPart(body, partType);
        cost += count * BODYPART_COST[partType];
    });
    return cost;
}

// For when you need to set up a new colony
function init() {
    warn("[!!] Initializing... [!!]");
    // Initialize room(s)
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        initRoom(room);
    }
    // Initialize spawn
    // If we are initializing, we should only have one spawn anyway, so this is fine
    const spawn = Game.spawns[Memory.initialSpawn];
    initSpawn(spawn);
    // Spawn a creep at the spawn, this will be our energy harvester
    const response = spawn.spawnCreep([WORK, MOVE, CARRY], "InitWorker1", {
        memory: {
            role: "harvester" /* harvester */,
            // The creep should default to harvesting
            task: "harvest" /* harvest */,
            room: spawn.room.name,
        },
    });
    info(`Initial spawn response: ${response}`);
    // Initialize construction
    initConstruction(spawn);
    Memory.uninitialized = false;
    console.log("Initialized!");
}

/**
 * Reasses population limits
 *
 * @param room The room
 */
function census(room) {
    info(`Updating population limits`, "spawn" /* spawn */);
    // Recalculate miners
    const miners = minerLimit(room);
    let harvesters = 0;
    // Pre-miners only harvesters upgrade
    let upgraders = 0;
    let haulers = 0;
    let tenders = 0;
    // One builder per two construction queue items
    let builders = queueLength() > 0 ? 1 : 0;
    // If there isn't a tower, builders must repair too
    if (room.memory.level < 3) {
        builders = Math.max(Math.floor(repairQueueLength() / 2), builders);
    }
    if (miners === 0) {
        // If we have no miners, we need harvesters
        harvesters = 2;
        // If we have no miners, no more than harvesters + 1 builders
        builders = Math.min(harvesters + 1, builders);
    }
    else {
        // if we have miners, no more than 1 builder per miner
        builders = Math.min(miners, builders);
        // If we have miners, we want upgraders
        upgraders = upgraderLimit(room);
        // One hauler per tender upgraders with a minimum of 1 tender
        tenders = Math.floor(upgraders / 4) || 1;
        // One hauler per miner
        haulers = miners;
    }
    Memory.populationLimit.miner = miners;
    Memory.populationLimit.harvester = harvesters;
    Memory.populationLimit.upgrader = upgraders;
    Memory.populationLimit.builder = builders;
    Memory.populationLimit.hauler = haulers;
    Memory.populationLimit.tender = tenders;
}
function minerLimit(room) {
    let miners = 0;
    // One miner per source with a container around it
    room.memory.sources.forEach((sourceId) => {
        const source = Game.getObjectById(sourceId);
        if (source != undefined) {
            let containersAroundSource = 0;
            getSurroundingTiles(source.pos, 1).forEach((position) => {
                containersAroundSource += position
                    .lookFor(LOOK_STRUCTURES)
                    .filter((structure) => {
                    return structure.structureType === STRUCTURE_CONTAINER;
                }).length;
            });
            if (containersAroundSource > 0) {
                miners++;
            }
        }
        else {
            error(`Unable to find source ${sourceId}`);
        }
    });
    return miners;
}
function upgraderLimit(room) {
    const spawn = Game.getObjectById(room.memory.spawn);
    if (spawn == undefined) {
        error(`Failed to get spawn of id ${room.memory.spawn} for room ${room.name}`);
        return 0;
    }
    const energy = getRoomAvailableEnergy(room);
    if (energy == undefined) {
        info(`Room ${room.name} not ready for advance upgrader population limiting`);
        // Default to 1 upgrader
        return 1;
    }
    const body = generateBodyByRole(spawn, "upgrader" /* upgrader */);
    const cost = bodyCost(body);
    const workParts = countBodyPart(body, WORK);
    // Upper limit on the amount of energy an upgrader will use in its lifetime
    const lifetimeCost = cost + workParts * UPGRADE_CONTROLLER_POWER * CREEP_LIFE_TIME;
    // At least 1 upgrader, but up to as many as the storage can afford over
    // the creeps entire lifetime
    return Math.max(1, Math.floor(energy / lifetimeCost));
}

function towerManager(tower) {
    // const tower = Game.getObjectById(towerId) as StructureTower;
    let target = aquireHostileTarget(tower);
    // If there are no hostile creeps, heal/repair instead
    if (target === undefined || target === null) {
        // Heal creeps first
        const creeps = tower.room.find(FIND_MY_CREEPS);
        target = creeps.reduce((lowest, current) => {
            // If the health difference (max - curr) of the current creep is lower than the lowest,
            // the current creep should be the target instead.
            if (current.hitsMax - current.hits < lowest.hitsMax - lowest.hits) {
                return current;
            }
            else {
                return lowest;
            }
        }, creeps[0]);
        // If all creeps are full health, repair instead
        if (target.hitsMax - target.hits === 0) {
            // However, only do so if the tower has more than 200 energy. This allows
            // a reserve to attack/heal in case a tower is no longer being resupplied,
            // like if the tender dies (and is taking a while to spawn, or can't spawn).
            if (tower.store.getUsedCapacity(RESOURCE_ENERGY) > 200) {
                // Intentionally not using fromRepairQueue() as to not remove from the queue
                target = Game.getObjectById(Memory.repairQueue[0]);
                // If the target is full health, take it off the queue
                while (target !== null && target.hits === target.hitsMax) {
                    if (target.hits === target.hitsMax) {
                        Memory.repairQueue.shift();
                    }
                    target = Game.getObjectById(Memory.repairQueue[0]);
                }
                // There are no creeps, structures to target
                if (target === undefined || target === null) {
                    updateWallRepair(tower.room);
                    target = Game.getObjectById(tower.room.memory.wallRepairQueue[0]);
                    if (target != undefined) {
                        target = target;
                        // Target is a wall/rampart in need of repair
                        const response = errorConstant(tower.repair(target));
                        if (response !== "OK") {
                            info(`Tower ${tower.id} is repairing ${target.id}: ${response}`);
                        }
                    }
                    return;
                }
                // Target is a structure in need of repair
                const response = errorConstant(tower.repair(target));
                if (response !== "OK") {
                    info(`Tower ${tower.id} is repairing ${target.id}: ${response}`);
                }
            }
            else {
                info(`Tower ${tower.id} is in energy saver mode`);
            }
        }
        else {
            // Target is an injured friendly creep
            const response = errorConstant(tower.heal(target));
            if (response !== "OK") {
                info(`Tower ${tower.id} is healing creep ${target.name}: ${response}`);
            }
        }
    }
    else {
        // Target is a hostile creep
        const response = errorConstant(tower.attack(target));
        warn(`Tower ${tower.id} is attacking ${target.owner.username}'s creep ${target.name}: ${response}`);
    }
}
function buildTower(roomName) {
    const room = Game.rooms[roomName];
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    const pos = room.getPositionAt(spawn.pos.x - 5, spawn.pos.y);
    if (pos === null) {
        error(`Tower location unavailable`);
        return;
    }
    const response = build(pos, STRUCTURE_TOWER);
    if (response) {
        info(`Successfully queued tower at ${JSON.stringify(pos)}`);
        const roads = getSurroundingTiles(pos, 1);
        buildRoad(roads);
    }
    else {
        warn(`Failed to build tower at ${JSON.stringify(pos)}`);
    }
}
function aquireHostileTarget(tower) {
    const hostiles = tower.room.find(FIND_HOSTILE_CREEPS);
    if (hostiles.length == 0) {
        return null;
    }
    // Create an array of potential hostiles while maintaining a list of all
    // hostiles.
    let potentials = hostiles;
    const invalids = [];
    let target = undefined;
    // Target healers first, but within reason
    const healers = potentials.filter((creep) => hasBodyPart(creep, HEAL));
    target = healers.find((creep) => {
        const healParts = countBodyPart(creep.body, HEAL);
        // For now, save by assuming the minimum damage
        const damage = calculateTowerFalloff(tower, creep, "attack" /* attack */);
        // If the tower deals more damage than the creep can heal, target it. Each
        // HEAL part can do 12 self heal.
        if (damage > healParts * 12) {
            return true;
        }
        else {
            invalids.push(creep);
        }
        return false;
    });
    // Filter out creeps that can self heal away the damage
    potentials = potentials.filter((creep) => invalids.indexOf(creep) === -1);
    while (target == undefined) {
        if (target == undefined) {
            // By default, target the "first" creep
            info(`Tower ${tower.id} targetting default creep`);
            target = potentials.shift();
        }
        if (target != undefined) {
            const surrounding = getSurroundingTiles(target.pos, 1);
            // If a creep was made invalid because it could heal itself, it could
            // out heal the damage to this creep too.
            const healer = invalids.find((creep) => {
                let contained = false;
                surrounding.forEach((pos) => {
                    contained = pos.x === creep.pos.x && pos.y === creep.pos.y;
                });
                return contained;
            });
            // If such a healer was found, target someone else
            if (healer != undefined) {
                target = undefined;
            }
        }
    }
    if (target == undefined) {
        info(`Tower ${tower.id} unable to find worthwhile hostile to target`);
    }
    return target;
}
function calculateTowerFalloff(tower, target, action) {
    const range = tower.pos.getRangeTo(target);
    let amount = 0;
    switch (action) {
        case "attack" /* attack */:
            amount = TOWER_POWER_ATTACK;
            break;
        case "heal" /* heal */:
            amount = TOWER_POWER_HEAL;
            break;
        case "repair" /* repair */:
            amount = TOWER_POWER_REPAIR;
            break;
    }
    return (amount -
        (amount * TOWER_FALLOFF * (range - TOWER_OPTIMAL_RANGE)) /
            (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE));
}

function debugLoop() {
    const spawn = Game.spawns[Memory.initialSpawn];
    if (Memory.debug.resetExtensions) {
        resetExtensionSpots();
        Memory.debug.resetExtensions = false;
    }
    if (Memory.debug.resetRoomMemory) {
        resetRoomMemory();
        Memory.debug.resetRoomMemory = false;
    }
    if (Memory.debug.resetPopLimits) {
        resetPopLimits();
        Memory.debug.resetPopLimits = false;
    }
    if (Memory.debug.testWallPlanner) {
        getExitWallsAndRamparts(spawn.room);
        Memory.debug.testWallPlanner = false;
    }
    if (Memory.debug.resetPlanner) {
        makePlan(spawn.room);
        Memory.debug.resetPlanner = false;
    }
    if (Memory.debug.executePlan) {
        executePlan(spawn.room);
        Memory.debug.executePlan = false;
    }
}
function resetExtensionSpots() {
    warn("Resetting extensions");
    const spawn = Game.spawns[Memory.initialSpawn];
    // Reset spawn extensionSpots memory
    spawn.memory.extensionSpots = getExtensionSpots(spawn.room);
    // Reset list of (built) extensions
    const extensions = spawn.room
        .find(FIND_MY_STRUCTURES)
        .filter((structure) => structure.structureType === STRUCTURE_EXTENSION)
        .map((extension) => extension.pos);
    const extensionSites = spawn.room
        .find(FIND_MY_CONSTRUCTION_SITES)
        .filter((structure) => structure.structureType === STRUCTURE_EXTENSION)
        .map((extension) => extension.pos);
    spawn.memory.extensions = extensions.concat(extensionSites);
}
function resetRoomMemory() {
    warn("Resetting room memory");
    for (const roomName in Game.rooms) {
        updateRoomMemory(Game.rooms[roomName]);
    }
}
function resetPopLimits() {
    warn("Resetting population limits");
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        census(room);
        // Only run once
        break;
    }
}

console.log("- - - - RESTARTING - - - -");
const loop = ErrorMapper.wrapLoop(() => {
    tick();
    if (Memory.uninitialized) {
        init();
    }
    // Debug
    debugLoop();
    // Automatically delete memory of missing creeps
    for (const name in Memory.creeps) {
        if (!(name in Game.creeps)) {
            handleDead(name);
            delete Memory.creeps[name];
        }
    }
    // Process creep behavior
    for (const name in Game.creeps) {
        doRole(Game.creeps[name]);
    }
    // Process spawn behavior
    for (const name in Game.spawns) {
        spawnManager(Game.spawns[name]);
    }
    // Process room behavior
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        if (room.memory.level >= 3) {
            // Process tower behavior
            for (const towerIndex in room.memory.towers) {
                const tower = Game.getObjectById(room.memory.towers[towerIndex]);
                if (tower !== null) {
                    towerManager(tower);
                }
                else {
                    warn(`Unable to get tower of id ${room.memory.towers[towerIndex]} in room ${roomName}`);
                }
            }
        }
        if (room.memory.level >= 4) {
            // Process link behavior
            for (const linkId in room.memory.links.all) {
                const link = Game.getObjectById(linkId);
                if (link != undefined) {
                    linkManager(link);
                }
                else {
                    error(`Unable to get link of id ${linkId} in room ${room}`);
                }
            }
        }
    }
    // Infrequent actions:
    // Update repair queue and pop limits every 100 ticks
    if (Game.time % 100 === 0) {
        for (const name in Game.rooms) {
            const room = Game.rooms[name];
            const controller = room.controller;
            // This will not work with multiple rooms, despite the way I've made it
            resetRepairQueue(room);
            updateWallRepair(room);
            census(room);
            // If we have reached the miner tier, queue as many containers as possible for sources
            if (!Memory.status.builtAllSourceContainers &&
                Memory.populationLimit.miner) {
                const maxExtensions = getMaxExtensions(room.controller.level);
                const extensionsCount = room
                    .find(FIND_MY_STRUCTURES)
                    .filter((structure) => {
                    return structure.structureType === STRUCTURE_EXTENSION;
                }).length;
                if (extensionsCount === maxExtensions) {
                    info(`Requesting containers around sources`, "build" /* build */);
                    // constructMinerContainers(room, -1);
                    Memory.status.builtAllSourceContainers = true;
                }
                else {
                    info(`Waiting for max extensions to request containers around sources`, "build" /* build */);
                }
            }
            if (controller !== undefined) {
                // If the controller has leveled up, level up the room
                if (controller.level !== room.memory.level) {
                    room.memory.level = controller.level;
                    info(`Updating room memory level to ${room.memory.level}`);
                    if (room.memory.level === 3) {
                        // Level 3: Build tower
                        buildTower(room.name);
                    }
                    if (room.memory.level === 4) {
                        // Level 4: Build storage
                        buildStorage(room.name);
                    }
                }
                // Level-based room checks
                if (room.memory.level >= 3) {
                    if (room.memory.towers === undefined ||
                        room.memory.towers.length === 0) {
                        // There should be a tower (or construction site)
                        room.memory.towers = getTowersInRoom(room);
                        if (room.memory.towers.length === 0) {
                            warn(`Room ${room.name} should have a tower but none were found`);
                        }
                    }
                }
                if (room.memory.level >= 4) {
                    // Set primary storage
                    if (room.memory.storage === undefined) {
                        const storage = room
                            .find(FIND_MY_STRUCTURES)
                            .find((structure) => structure.structureType === STRUCTURE_STORAGE);
                        if (storage !== undefined) {
                            info(`Setting storage ${storage.id} as room ${room.name} primary storage`);
                            room.memory.storage = storage.id;
                        }
                        else {
                            info(`No candidate for primary storage for room ${room.name}`);
                        }
                    }
                }
            }
        }
    }
    const cpuUsed = Game.cpu.getUsed();
    if (cpuUsed >= 5) {
        warn(`Used ${cpuUsed} cpu`);
    }
    // screeps-multimeter watcher
    watcher();
});

exports.loop = loop;
//# sourceMappingURL=main.js.map
