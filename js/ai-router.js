/**
 * js/ai-router.js - Module Tích Hợp 9Router AI & Tối Ưu Hóa Lộ Trình Giao Hàng GHN
 * Hỗ trợ:
 * 1. Kết nối OpenAI-compatible AI Gateway (9Router localhost hoặc custom URL)
 * 2. Tối ưu lộ trình Kịch bản 1: Tôn trọng cấu hình nhóm (K1, K2...) & số nhà chẵn/lẻ
 * 3. Tối ưu lộ trình Kịch bản 2: AI tự gom cụm tòa nhà/địa chỉ và sắp xếp toàn tuyến
 * 4. Thuật toán Offline Fallback an toàn 100% khi mất mạng hoặc không bật 9Router
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AIRouteOptimizer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  var STORAGE_KEY_ENDPOINT = 'GHN_AI_9ROUTER_ENDPOINT';
  var STORAGE_KEY_MODEL = 'GHN_AI_9ROUTER_MODEL';
  var STORAGE_KEY_API_KEY = 'GHN_AI_9ROUTER_API_KEY';

  var DEFAULT_ENDPOINT = 'http://localhost:20128/v1/chat/completions';
  var DEFAULT_MODEL = 'gemini-2.5-flash';

  var _inMemoryEndpoint = DEFAULT_ENDPOINT;
  var _inMemoryModel = DEFAULT_MODEL;
  var _inMemoryApiKey = '';

  /**
   * Chuẩn hóa URL endpoint OpenAI-compatible
   * Tự động bổ sung /v1/chat/completions nếu người dùng chỉ nhập domain hoặc /v1
   */
  function normalizeEndpointUrl(url) {
    if (!url) return DEFAULT_ENDPOINT;
    var clean = url.trim().replace(/\/+$/, '');
    if (!clean) return DEFAULT_ENDPOINT;
    if (/\/chat\/completions$/i.test(clean)) {
      return clean;
    }
    if (/\/v1$/i.test(clean)) {
      return clean + '/chat/completions';
    }
    return clean + '/v1/chat/completions';
  }

  function getEndpoint() {
    try {
      if (typeof localStorage !== 'undefined') {
        var saved = localStorage.getItem(STORAGE_KEY_ENDPOINT);
        if (saved) return normalizeEndpointUrl(saved);
      }
      return normalizeEndpointUrl(_inMemoryEndpoint);
    } catch(e) {
      return normalizeEndpointUrl(_inMemoryEndpoint);
    }
  }

  function setEndpoint(url) {
    var norm = normalizeEndpointUrl(url);
    _inMemoryEndpoint = norm;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_ENDPOINT, norm);
      }
    } catch(e) {}
    return norm;
  }

  function getModel() {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(STORAGE_KEY_MODEL) || _inMemoryModel;
      }
      return _inMemoryModel;
    } catch(e) {
      return _inMemoryModel;
    }
  }

  function setModel(m) {
    _inMemoryModel = (m || '').trim();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_MODEL, _inMemoryModel);
      }
    } catch(e) {}
    return _inMemoryModel;
  }

  function getApiKey() {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(STORAGE_KEY_API_KEY) || _inMemoryApiKey;
      }
      return _inMemoryApiKey;
    } catch(e) {
      return _inMemoryApiKey;
    }
  }

  function setApiKey(k) {
    _inMemoryApiKey = (k || '').trim();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_API_KEY, _inMemoryApiKey);
      }
    } catch(e) {}
    return _inMemoryApiKey;
  }

  /**
   * Tính khoảng cách Haversine giữa 2 tọa độ (mét)
   */
  function calculateDistance(lat1, lon1, lat2, lon2) {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 999999;
    var R = 6371e3;
    var phi1 = lat1 * Math.PI / 180;
    var phi2 = lat2 * Math.PI / 180;
    var deltaPhi = (lat2 - lat1) * Math.PI / 180;
    var deltaLambda = (lon2 - lon1) * Math.PI / 180;

    var a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Kiểm tra kết nối tới 9Router
   */
  function testConnection() {
    var endpoint = getEndpoint();
    var model = getModel();
    var apiKey = getApiKey();

    var headers = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers['Authorization'] = 'Bearer ' + apiKey;
    }

    var body = {
      model: model,
      messages: [
        { role: 'user', content: 'Ping. Trả lời "PONG" nếu bạn nhận được.' }
      ],
      max_tokens: 10,
      stream: false
    };

    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function() { controller.abort(); }, 8000) : null;

    return fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined
    }).then(function(res) {
      if (timeoutId) clearTimeout(timeoutId);
      if (!res.ok) {
        return res.text().then(function(errText) {
          var detail = '';
          try {
            var parsed = JSON.parse(errText);
            if (parsed && parsed.error) {
              detail = typeof parsed.error === 'string' ? parsed.error : (parsed.error.message || JSON.stringify(parsed.error));
            }
          } catch(e) {
            detail = '';
          }

          if (!detail && /<html/i.test(errText)) {
            if (res.status === 530) {
              detail = 'Đường truyền Cloudflare Tunnel của 9Router đang tạm ngắt kết nối hoặc đang khởi động lại. Hãy đợi 5-10 giây rồi thử lại.';
            } else if (res.status === 502 || res.status === 504) {
              detail = 'Cổng kết nối 9Router Gateway bị nghẽn hoặc hết thời gian chờ.';
            } else {
              detail = 'Máy chủ trả về trang lỗi HTML (' + res.status + ')';
            }
          } else if (!detail && errText) {
            detail = errText.slice(0, 150);
          }

          var msg = 'Mã phản hồi HTTP: ' + res.status;
          if (res.status === 405) {
            msg += ' (Method Not Allowed) - Đường dẫn endpoint cần có đuôi /v1/chat/completions';
          } else if (res.status === 401) {
            msg += ' (Unauthorized) - Cần có API Key hợp lệ cho 9Router';
          } else if (res.status === 404) {
            msg += ' (Not Found) - Không tìm thấy route hoặc model AI';
          } else if (res.status === 530) {
            msg += ' (Cloudflare Tunnel) - Tunnel đang tạm ngắt kết nối';
          }
          if (detail) {
            msg += ' [' + detail + ']';
          }
          throw new Error(msg);
        });
      }

      return res.text().then(function(rawText) {
        var data = null;
        try {
          data = JSON.parse(rawText);
        } catch(e) {
          if (rawText.indexOf('data:') !== -1) {
            var combinedText = '';
            var lines = rawText.split('\n');
            for (var l = 0; l < lines.length; l++) {
              var line = lines[l].trim();
              if (line.indexOf('data:') === 0) {
                var jsonPart = line.slice(5).trim();
                if (jsonPart && jsonPart !== '[DONE]') {
                  try {
                    var parsedChunk = JSON.parse(jsonPart);
                    var delta = parsedChunk.choices && parsedChunk.choices[0] && (parsedChunk.choices[0].delta || parsedChunk.choices[0].message);
                    if (delta && delta.content) {
                      combinedText += delta.content;
                    }
                  } catch(e2) {}
                }
              }
            }
            if (combinedText) {
              data = { choices: [{ message: { content: combinedText } }] };
            }
          }
        }
        if (!data) throw new Error('Không thể đọc dữ liệu phản hồi từ 9Router');
        return data;
      });
    }).then(function(data) {
      var text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      return {
        success: true,
        endpoint: endpoint,
        model: model,
        message: 'Kết nối 9Router thành công! (' + model + ')',
        reply: text
      };
    }).catch(function(err) {
      if (timeoutId) clearTimeout(timeoutId);
      var errMsg = err.name === 'AbortError' ? 'Hết thời gian chờ (Timeout 6s). Hãy kiểm tra 9Router có đang chạy trên PC không.' : err.message;
      return {
        success: false,
        endpoint: endpoint,
        model: model,
        error: errMsg
      };
    });
  }

  function getConfig() {
    return {
      endpoint: getEndpoint(),
      model: getModel(),
      apiKey: getApiKey()
    };
  }

  function saveConfig(cfg) {
    if (!cfg) return;
    if (cfg.endpoint !== undefined) setEndpoint(cfg.endpoint);
    if (cfg.model !== undefined) setModel(cfg.model);
    if (cfg.apiKey !== undefined) setApiKey(cfg.apiKey);
  }

  /**
   * Tính tổng quãng đường di chuyển giữa các điểm có GPS
   */
  function computeTotalDistance(orders) {
    if (!orders || orders.length < 2) return 0;
    var total = 0;
    var prev = null;
    for (var i = 0; i < orders.length; i++) {
      var curr = orders[i];
      if (curr && curr.lat != null && curr.lng != null && !isNaN(curr.lat) && !isNaN(curr.lng)) {
        if (prev && prev.lat != null && prev.lng != null) {
          total += calculateDistance(prev.lat, prev.lng, curr.lat, curr.lng);
        }
        prev = curr;
      }
    }
    return Math.round(total);
  }

  /**
   * Đồng bộ hóa và hoàn thiện các trường dữ liệu trả về cho UI
   */
  function finalizeResult(res) {
    if (!res) return res;
    res.totalDistance = computeTotalDistance(res.orderedOrders || []);
    res.isAIEngine = (res.source === '9router_ai');
    res.explanation = res.summary || 'Đã tối ưu hóa thứ tự lộ trình giao hàng.';
    return res;
  }

  var STORAGE_KEY_ONE_WAY = 'GHN_AI_9ROUTER_ONE_WAY_STREETS';
  var STORAGE_KEY_MAP_ONE_WAY = 'GHN_AI_MAP_ONE_WAY_CACHE_V2';

  // Thư viện dự phòng tối thiểu khi hoàn toàn mất mạng (offline 100%) và chưa từng quét bản đồ
  var BUILTIN_ONE_WAY_STREETS = [
    { street: 'Võ Văn Tần', direction: 'asc', note: 'Từ Hồ Con Rùa về Cao Thắng (số nhỏ ➜ lớn)' },
    { street: 'Nguyễn Thị Minh Khai', direction: 'asc', note: 'Từ ngã 6 Cộng Hòa về Cầu Thị Nghè (số nhỏ ➜ lớn)' },
    { street: 'Nguyễn Đình Chiểu', direction: 'asc', note: 'Từ Cầu Thị Nghè về Lý Thái Tổ (số nhỏ ➜ lớn)' },
    { street: 'Điện Biên Phủ', direction: 'asc', note: 'Từ Đinh Tiên Hoàng về Vòng xoay Lý Thái Tổ (số nhỏ ➜ lớn)' },
    { street: 'Pasteur', direction: 'asc', note: 'Từ Hàm Nghi về Võ Thị Sáu (số nhỏ ➜ lớn)' },
    { street: 'Nam Kỳ Khởi Nghĩa', direction: 'desc', note: 'Từ Cầu Công Lý về Bến Bạch Đằng (số lớn ➜ nhỏ)' },
    { street: 'Lý Tự Trọng', direction: 'asc', note: 'Từ Tôn Đức Thắng về Ngã 6 Phù Đổng (số nhỏ ➜ lớn)' },
    { street: 'Lê Thánh Tôn', direction: 'asc', note: 'Từ Ngã 6 Phù Đổng về Tôn Đức Thắng (số nhỏ ➜ lớn)' },
    { street: 'Trương Định', direction: 'asc', note: 'Từ Tao Đàn về Kỳ Đồng/Hoàng Sa (số nhỏ ➜ lớn)' },
    { street: 'Bà Huyện Thanh Quan', direction: 'desc', note: 'Từ Hoàng Sa về Nguyễn Thị Minh Khai (số lớn ➜ nhỏ)' },
    { street: 'Bùi Thị Xuân', direction: 'asc', note: 'Từ CMT8 về Lương Hữu Khánh (số nhỏ ➜ lớn)' },
    { street: 'Sương Nguyệt Ánh', direction: 'desc', note: 'Từ Tôn Thất Tùng về CMT8 (số lớn ➜ nhỏ)' },
    { street: 'Xô Viết Nghệ Tĩnh', direction: 'desc', note: 'Đoạn Hàng Xanh về Cầu Thị Nghè (số lớn ➜ nhỏ)' },
    { street: 'Đinh Bộ Lĩnh', direction: 'desc', note: 'Từ Cầu Bình Triệu về Điện Biên Phủ (số lớn ➜ nhỏ)' },
    { street: 'Đinh Tiên Hoàng', direction: 'desc', note: 'Đoạn Cầu Bông về Nguyễn Thị Minh Khai (số lớn ➜ nhỏ)' }
  ];

  function removeVietnameseTones(str) {
    if (!str) return '';
    str = String(str);
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
    str = str.replace(/đ/g, 'd');
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, 'A');
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, 'E');
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, 'I');
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, 'O');
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, 'U');
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, 'Y');
    str = str.replace(/Đ/g, 'D');
    return str.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // === TOÁN HỌC HÌNH HỌC KHÔNG GIAN BẢN ĐỒ (Map Geometry Projections) ===

  /**
   * Tính khoảng cách giữa 2 điểm GPS (mét)
   */
  function getDistanceMeters(lat1, lon1, lat2, lon2) {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 999999;
    var R = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Chiếu điểm (lat, lon) lên đoạn thẳng đường (A -> B), trả về khoảng cách dọc tuyến & khoảng cách lệch tâm
   */
  function projectPointOnSegment(lat, lon, aLat, aLon, bLat, bLon) {
    var segLen = getDistanceMeters(aLat, aLon, bLat, bLon);
    if (segLen === 0) return { along: 0, dist: getDistanceMeters(lat, lon, aLat, aLon) };
    var cosLat = Math.cos(((aLat + bLat) / 2) * Math.PI / 180);
    var dx = (bLon - aLon) * cosLat;
    var dy = bLat - aLat;
    var px = (lon - aLon) * cosLat;
    var py = lat - aLat;
    var u = (px * dx + py * dy) / (dx * dx + dy * dy);
    u = Math.max(0, Math.min(1, u));
    var projLat = aLat + u * dy;
    var projLon = aLon + (u * dx) / cosLat;
    return {
      along: u * segLen,
      dist: getDistanceMeters(lat, lon, projLat, projLon)
    };
  }

  /**
   * Chiếu điểm (lat, lon) lên đường gấp khúc polyline [P0, P1, ..., Pn] của OpenStreetMap
   * Trả về khoảng cách mét tính từ ĐẦU ĐƯỜNG 1 CHIỀU (alongDistance) và khoảng cách lệch khỏi mặt đường (dist)
   */
  function projectPointOnPolyline(lat, lon, geom) {
    if (!geom || geom.length < 2) return { along: 0, dist: 999999, totalLen: 0 };
    var minPerpDist = Infinity;
    var bestAlong = 0;
    var accumulated = 0;
    for (var i = 0; i < geom.length - 1; i++) {
      var a = geom[i];
      var b = geom[i + 1];
      var aLat = a.lat != null ? a.lat : a[0];
      var aLon = a.lon != null ? a.lon : (a.lng != null ? a.lng : a[1]);
      var bLat = b.lat != null ? b.lat : b[0];
      var bLon = b.lon != null ? b.lon : (b.lng != null ? b.lng : b[1]);

      var segLen = getDistanceMeters(aLat, aLon, bLat, bLon);
      var p = projectPointOnSegment(lat, lon, aLat, aLon, bLat, bLon);
      if (p.dist < minPerpDist) {
        minPerpDist = p.dist;
        bestAlong = accumulated + p.along;
      }
      accumulated += segLen;
    }
    return { along: bestAlong, dist: minPerpDist, totalLen: accumulated };
  }

  /**
   * Tính bounding box [south, west, north, east] từ danh sách đơn hàng
   */
  function getOrdersBoundingBox(orders, fallbackBounds) {
    var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    var count = 0;
    (orders || []).forEach(function(o) {
      var lat = Number(o.lat);
      var lng = Number(o.lng);
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        count++;
      }
    });
    if (count > 0) {
      return { s: minLat, w: minLng, n: maxLat, e: maxLng, count: count };
    }
    if (fallbackBounds && fallbackBounds.s != null) {
      return fallbackBounds;
    }
    return null;
  }

  // === QUẢN LÝ CACHE DỮ LIỆU ĐƯỜNG 1 CHIỀU BẢN ĐỒ ===

  function getMapOneWayCache() {
    try {
      if (typeof localStorage !== 'undefined') {
        var raw = localStorage.getItem(STORAGE_KEY_MAP_ONE_WAY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.timestamp && parsed.streets) {
            // Cache có hiệu lực trong 7 ngày
            if (Date.now() - parsed.timestamp < 7 * 24 * 3600 * 1000) {
              return parsed;
            }
          }
        }
      }
    } catch(e) {}
    return null;
  }

  function saveMapOneWayCache(bbox, streets) {
    try {
      if (typeof localStorage !== 'undefined') {
        var data = {
          timestamp: Date.now(),
          bbox: bbox,
          streets: streets
        };
        localStorage.setItem(STORAGE_KEY_MAP_ONE_WAY, JSON.stringify(data));
      }
    } catch(e) {}
  }

  function clearMapOneWayCache() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY_MAP_ONE_WAY);
      }
    } catch(e) {}
  }

  /**
   * Truy vấn thông tin các tuyến đường 1 chiều trực tiếp từ bản đồ OpenStreetMap (Overpass API)
   * Phục vụ cho mọi tỉnh thành (Hồ Chí Minh, Hà Nội, Đà Nẵng, Cần Thơ, Hải Phòng,...)
   */
  function fetchOneWayStreetsFromMap(bbox, options) {
    options = options || {};
    if (!bbox || bbox.s == null || bbox.w == null || bbox.n == null || bbox.e == null) {
      var cached = getMapOneWayCache();
      return Promise.resolve(cached ? cached.streets : []);
    }

    // Mở rộng viền bbox khoảng 400m
    var pad = 0.0035;
    var s = (bbox.s - pad).toFixed(4);
    var w = (bbox.w - pad).toFixed(4);
    var n = (bbox.n + pad).toFixed(4);
    var e = (bbox.e + pad).toFixed(4);

    var q = '[out:json][timeout:14];(' +
      'way["highway"]["oneway"="yes"](' + s + ',' + w + ',' + n + ',' + e + ');' +
      'way["highway"]["oneway"="1"](' + s + ',' + w + ',' + n + ',' + e + ');' +
      'way["highway"]["oneway"="-1"](' + s + ',' + w + ',' + n + ',' + e + ');' +
      'way["junction"="roundabout"](' + s + ',' + w + ',' + n + ',' + e + ');' +
    ');out tags geom;';

    var endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter'
    ];

    function tryFetch(epIndex) {
      if (epIndex >= endpoints.length) {
        var cachedFallback = getMapOneWayCache();
        if (cachedFallback && cachedFallback.streets && cachedFallback.streets.length > 0) {
          return Promise.resolve(cachedFallback.streets);
        }
        return Promise.resolve([]);
      }

      var ep = endpoints[epIndex];
      var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timeoutMs = options.timeoutMs || 8000;
      var timeoutId = controller ? setTimeout(function() { controller.abort(); }, timeoutMs) : null;

      return fetch(ep, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'GHN-Delivery-App/1.0 (contact: admin@ghn.vn)'
        },
        body: 'data=' + encodeURIComponent(q),
        signal: controller ? controller.signal : undefined
      }).then(function(res) {
        if (timeoutId) clearTimeout(timeoutId);
        if (!res.ok) throw new Error('OSM HTTP error ' + res.status);
        return res.json();
      }).then(function(json) {
        var elements = (json && json.elements) ? json.elements : [];
        var streetMap = {};

        elements.forEach(function(el) {
          var tags = el.tags || {};
          var name = tags.name || tags['name:vi'] || tags['name:en'];
          if (!name) return;

          var clean = name.replace(/^(Đường|Phố|Hem|Hẻm)\s+/i, '').trim();
          var key = removeVietnameseTones(clean);
          if (!key) return;

          if (!streetMap[key]) {
            streetMap[key] = {
              street: clean,
              fullName: name,
              oneway: tags.oneway || 'yes',
              isRoundabout: tags.junction === 'roundabout',
              ways: [],
              isMapDerived: true
            };
          }

          if (el.geometry && el.geometry.length >= 2) {
            // Nếu oneway == "-1", đảo ngược geometry để đầu mút 0 luôn là hướng xe bắt đầu đi vào
            var geom = (tags.oneway === '-1') ? el.geometry.slice().reverse() : el.geometry;
            streetMap[key].ways.push(geom);
          }
        });

        var resultList = [];
        for (var k in streetMap) {
          resultList.push(streetMap[k]);
        }

        if (resultList.length > 0) {
          saveMapOneWayCache(bbox, resultList);
        }
        return resultList;
      }).catch(function(err) {
        if (timeoutId) clearTimeout(timeoutId);
        return tryFetch(epIndex + 1);
      });
    }

    return tryFetch(0);
  }

  /**
   * Quét toàn bộ đường 1 chiều trong khu vực giao của đơn hàng từ bản đồ OSM
   */
  function scanAreaOneWayFromMap(orders, fallbackBounds, onProgress) {
    var bbox = getOrdersBoundingBox(orders, fallbackBounds);
    if (onProgress) {
      onProgress({ percent: 15, text: 'Đang kết nối OpenStreetMap lọc dữ liệu đường 1 chiều...', step: 'map_scan' });
    }
    return fetchOneWayStreetsFromMap(bbox).then(function(mapStreets) {
      if (onProgress) {
        onProgress({
          percent: 30,
          text: '✓ Đã lọc thành công ' + mapStreets.length + ' tuyến đường 1 chiều từ bản đồ.',
          step: 'map_scan_done',
          count: mapStreets.length
        });
      }
      return mapStreets;
    });
  }

  function getCustomOneWayStreets() {
    try {
      if (typeof localStorage !== 'undefined') {
        var saved = localStorage.getItem(STORAGE_KEY_ONE_WAY);
        if (saved) {
          var parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        }
      }
    } catch(e) {}
    return [];
  }

  function saveCustomOneWayStreets(list) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_ONE_WAY, JSON.stringify(list || []));
      }
    } catch(e) {}
  }

  /**
   * Lấy toàn bộ danh sách đường 1 chiều:
   * ƯU TIÊN 1: Dữ liệu động quét từ Bản đồ OpenStreetMap trong khu vực (mapList)
   * ƯU TIÊN 2: Cấu hình tùy chỉnh bổ sung của Shipper (customList)
   * DỰ PHÒNG: Thư viện tích hợp nếu hoàn toàn chưa có bản đồ
   */
  function getAllOneWayStreets(customList, mapList) {
    var custom = customList || getCustomOneWayStreets();
    var mapCache = mapList || (getMapOneWayCache() ? getMapOneWayCache().streets : []);
    var map = {};

    // 1. Nếu có dữ liệu bản đồ động OSM: Nạp toàn bộ
    if (mapCache && mapCache.length > 0) {
      mapCache.forEach(function(item) {
        var key = removeVietnameseTones(item.street);
        map[key] = {
          street: item.street,
          fullName: item.fullName || ('Đường ' + item.street),
          direction: item.direction || 'asc',
          ways: item.ways || [],
          note: 'Trích xuất từ Bản đồ OSM (' + (item.ways ? item.ways.length : 1) + ' đoạn)',
          isMapDerived: true,
          isBuiltin: false
        };
      });
    } else {
      // Chỉ dùng danh mục dự phòng khi chưa từng quét bản đồ
      BUILTIN_ONE_WAY_STREETS.forEach(function(item) {
        map[removeVietnameseTones(item.street)] = {
          street: item.street,
          direction: item.direction || 'asc',
          note: item.note || '',
          isBuiltin: true,
          isMapDerived: false
        };
      });
    }

    // 2. Ghi đè/Bổ sung tùy chỉnh riêng của shipper
    (custom || []).forEach(function(item) {
      if (!item || !item.street) return;
      var key = removeVietnameseTones(item.street);
      map[key] = {
        street: item.street.trim(),
        direction: item.direction || 'asc',
        note: item.note || 'Tùy chỉnh shipper',
        isBuiltin: false,
        isCustom: true
      };
    });

    var res = [];
    for (var k in map) res.push(map[k]);
    return res;
  }

  /**
   * Trích xuất số nhà đầu tiên trong địa chỉ
   */
  function extractHouseNumberNum(addr) {
    if (!addr) return 0;
    var m = String(addr).match(/^\s*(\d+)/);
    if (m) return parseInt(m[1], 10);
    var m2 = String(addr).match(/\b(?:số|nhà|hẻm|ngõ)?\s*(\d+)/i);
    return m2 ? parseInt(m2[1], 10) : 0;
  }

  /**
   * Tách tên đường và số nhà từ địa chỉ
   */
  function extractStreetAndNum(addr) {
    if (!addr) return { street: '', num: 0 };
    var clean = String(addr).trim();
    var num = extractHouseNumberNum(clean);
    var street = '';
    var mStreet = clean.match(/(?:đường|đ\.|phố)\s+([^,]+)/i);
    if (mStreet) {
      street = mStreet[1].trim();
    } else {
      var parts = clean.split(',');
      if (parts.length > 0) {
        var firstPart = parts[0].trim();
        var withoutNum = firstPart.replace(/^[\d/a-zA-Z\s-]+/, '').trim();
        if (withoutNum.length > 2) {
          street = withoutNum;
        } else if (parts.length > 1) {
          street = parts[1].trim();
        }
      }
    }
    street = street.replace(/^(?:phường|p\.|quận|q\.)\s*.*$/i, '').trim();
    return { street: street, num: num };
  }

  /**
   * So khớp xem địa chỉ/tên đường có thuộc danh sách đường 1 chiều không
   */
  function matchOneWayStreet(streetName, addr, allOneWays) {
    if (!allOneWays || allOneWays.length === 0) return null;
    var normStreet = removeVietnameseTones(streetName || '');
    var normAddr = removeVietnameseTones(addr || '');

    for (var i = 0; i < allOneWays.length; i++) {
      var ow = allOneWays[i];
      var normOw = removeVietnameseTones(ow.street);
      if (!normOw) continue;
      if (normStreet && (normStreet.indexOf(normOw) !== -1 || normOw.indexOf(normStreet) !== -1)) {
        return ow;
      }
      if (normAddr && normAddr.indexOf(normOw) !== -1) {
        return ow;
      }
    }
    return null;
  }

  /**
   * Bắt buộc thứ tự các đơn trên cùng một đường 1 chiều phải tuân thủ đúng chiều lưu thông BẢN ĐỒ
   * Kết hợp chiếu hình học GPS (alongDistance từ đầu đường OSM) và Gradient số nhà
   * Tuyệt đối không để AI gợi ý đi ngược chiều xe chạy!
   */
  function enforceOneWayTrafficCompliance(orderedIndices, orders, allOneWays) {
    if (!orderedIndices || !Array.isArray(orderedIndices) || orderedIndices.length <= 1) return orderedIndices;
    if (!allOneWays || allOneWays.length === 0) return orderedIndices;

    var resultRoute = orderedIndices.slice();
    var streetMap = {};

    resultRoute.forEach(function(origIdx, slot) {
      var ord = orders[origIdx];
      if (!ord) return;
      var info = extractStreetAndNum(ord.address);
      var matchedOw = matchOneWayStreet(info.street, ord.address, allOneWays);

      // Nếu không khớp tên đường, kiểm tra xem vị trí GPS có nằm sát trục đường 1 chiều nào từ bản đồ không
      if (!matchedOw && ord.lat != null && ord.lng != null) {
        for (var w = 0; w < allOneWays.length; w++) {
          var candOw = allOneWays[w];
          if (candOw.ways && candOw.ways.length > 0) {
            for (var g = 0; g < candOw.ways.length; g++) {
              var pTest = projectPointOnPolyline(ord.lat, ord.lng, candOw.ways[g]);
              if (pTest.dist <= 25) { // Cách tim đường <= 25m
                matchedOw = candOw;
                break;
              }
            }
            if (matchedOw) break;
          }
        }
      }

      if (matchedOw) {
        var key = removeVietnameseTones(matchedOw.street);
        if (!streetMap[key]) {
          streetMap[key] = {
            ow: matchedOw,
            slots: [],
            items: []
          };
        }

        // Tính khoảng cách dọc theo tim đường 1 chiều từ đầu đường OSM
        var alongDist = null;
        var minDistToRoad = 999999;
        if (ord.lat != null && ord.lng != null && matchedOw.ways && matchedOw.ways.length > 0) {
          matchedOw.ways.forEach(function(geom) {
            var proj = projectPointOnPolyline(ord.lat, ord.lng, geom);
            if (proj.dist < minDistToRoad) {
              minDistToRoad = proj.dist;
              alongDist = proj.along;
            }
          });
        }

        streetMap[key].slots.push(slot);
        streetMap[key].items.push({
          origIdx: origIdx,
          order: ord,
          num: info.num,
          alongDistance: alongDist,
          distToRoad: minDistToRoad
        });
      }
    });

    for (var key in streetMap) {
      var entry = streetMap[key];
      if (entry.slots.length > 1) {
        // Xác định chiều lưu thông dựa trên dữ liệu bản đồ hoặc số nhà
        var flowDirection = entry.ow.direction || 'asc';

        // Nếu có các đơn có cả GPS dọc tuyến và số nhà, kiểm tra mối quan hệ để phát hiện chiều tăng/giảm số nhà thực tế
        var itemsWithGpsAndNum = entry.items.filter(function(it) {
          return it.alongDistance != null && it.num > 0;
        });

        if (itemsWithGpsAndNum.length >= 2) {
          itemsWithGpsAndNum.sort(function(a, b) { return a.alongDistance - b.alongDistance; });
          var isAscendingNum = (itemsWithGpsAndNum[itemsWithGpsAndNum.length - 1].num >= itemsWithGpsAndNum[0].num);
          flowDirection = isAscendingNum ? 'asc' : 'desc';
        }

        // Sắp xếp các đơn trên đường 1 chiều:
        // Nếu đa số có số nhà, sắp xếp theo số nhà theo đúng flowDirection
        var hasHouseNumCount = entry.items.filter(function(it) { return it.num > 0; }).length;
        if (hasHouseNumCount >= entry.items.length * 0.7) {
          entry.items.sort(function(a, b) {
            if (flowDirection === 'desc') {
              return (b.num || 0) - (a.num || 0); // Giảm dần
            } else {
              return (a.num || 0) - (b.num || 0); // Tăng dần
            }
          });
        } else {
          // Ngược lại, sắp xếp theo khoảng cách hình học dọc theo tim đường 1 chiều từ bản đồ OSM
          entry.items.sort(function(a, b) {
            return (a.alongDistance || 0) - (b.alongDistance || 0);
          });
        }

        entry.slots.forEach(function(slotIdx, s) {
          resultRoute[slotIdx] = entry.items[s].origIdx;
        });
      }
    }

    return resultRoute;
  }

  /**
   * Thuật toán Offline Heuristic sắp xếp lộ trình khi không có 9Router
   */
  function fallbackOfflineOptimization(orders, groups, groupRules, options) {
    options = options || {};
    var scenario = options.scenario || 'respect_groups';
    var startOrigin = options.startOrigin; // { lat, lng }

    var list = orders.slice();
    if (list.length <= 1) {
      return finalizeResult({
        success: true,
        source: 'offline_heuristic',
        summary: 'Đã tối ưu thứ tự đơn hàng (Offline Heuristic)',
        orderedIndices: list.map(function(_, i) { return i; }),
        orderedOrders: list,
        stops: []
      });
    }

    // Nếu là Kịch bản 1: Có cấu hình nhóm hoặc giữ nguyên nhóm
    if (scenario === 'respect_groups' && groups && groups.length > 0) {
      var groupMap = {};
      groups.forEach(function(g, idx) {
        groupMap[g.id] = { group: g, index: idx, items: [] };
      });
      groupMap['group_ungrouped'] = { group: { id: 'group_ungrouped', name: 'Chưa phân nhóm' }, index: 999, items: [] };

      list.forEach(function(ord, origIdx) {
        var gId = ord.groupId || 'group_ungrouped';
        if (!groupMap[gId]) {
          groupMap[gId] = { group: { id: gId, name: 'Khác' }, index: 998, items: [] };
        }
        groupMap[gId].items.push({ order: ord, origIdx: origIdx });
      });

      // Sắp xếp các đơn bên trong mỗi nhóm theo số nhà (số chẵn trước, số lẻ sau hoặc tăng dần)
      var sortedResult = [];
      groups.concat([{ id: 'group_ungrouped' }]).forEach(function(g) {
        var pack = groupMap[g.id];
        if (!pack || pack.items.length === 0) return;

        var items = pack.items;
        // Phân tách chẵn / lẻ
        var evens = [];
        var odds = [];
        items.forEach(function(it) {
          var num = extractHouseNumberNum(it.order.address);
          if (num > 0) {
            if (num % 2 === 0) evens.push({ it: it, num: num });
            else odds.push({ it: it, num: num });
          } else {
            odds.push({ it: it, num: 99999 });
          }
        });

        evens.sort(function(a, b) { return a.num - b.num; });
        odds.sort(function(a, b) { return a.num - b.num; });

        var groupSorted = evens.concat(odds).map(function(wrapper) { return wrapper.it; });
        sortedResult = sortedResult.concat(groupSorted);
      });

      var orderedIndices = sortedResult.map(function(it) { return it.origIdx; });
      if (options.strictOneWay !== false) {
        var allOneWays = getAllOneWayStreets(options.customOneWayStreets, options.mapOneWays);
        orderedIndices = enforceOneWayTrafficCompliance(orderedIndices, orders, allOneWays);
      }
      var orderedOrders = orderedIndices.map(function(idx) { return orders[idx]; });

      return finalizeResult({
        success: true,
        source: 'offline_heuristic',
        summary: 'Đã tối ưu thứ tự theo từng nhóm (Ưu tiên chẵn / lẻ, tuân thủ đường 1 chiều bản đồ)',
        orderedIndices: orderedIndices,
        orderedOrders: orderedOrders,
        stops: []
      });
    }

    // Kịch bản 2 hoặc tự do: TSP Nearest Neighbor theo tọa độ GPS
    var remaining = list.map(function(ord, i) { return { order: ord, origIdx: i }; });
    var route = [];

    var currentLat = startOrigin && startOrigin.lat != null ? startOrigin.lat : (remaining[0].order.lat || 10.7769);
    var currentLng = startOrigin && startOrigin.lng != null ? startOrigin.lng : (remaining[0].order.lng || 106.7009);

    while (remaining.length > 0) {
      var nearestIdx = 0;
      var minDist = Infinity;

      for (var i = 0; i < remaining.length; i++) {
        var cand = remaining[i].order;
        var dist;
        if (cand.lat != null && cand.lng != null) {
          dist = calculateDistance(currentLat, currentLng, cand.lat, cand.lng);
        } else {
          dist = 50000 + i; // đơn không có GPS xếp sau
        }
        if (dist < minDist) {
          minDist = dist;
          nearestIdx = i;
        }
      }

      var chosen = remaining.splice(nearestIdx, 1)[0];
      route.push(chosen);
      if (chosen.order.lat != null && chosen.order.lng != null) {
        currentLat = chosen.order.lat;
        currentLng = chosen.order.lng;
      }
    }

    var orderedIndices2 = route.map(function(it) { return it.origIdx; });
    if (options.strictOneWay !== false) {
      var allOneWays2 = getAllOneWayStreets(options.customOneWayStreets, options.mapOneWays);
      orderedIndices2 = enforceOneWayTrafficCompliance(orderedIndices2, orders, allOneWays2);
    }
    var orderedOrders2 = orderedIndices2.map(function(idx) { return orders[idx]; });

    return finalizeResult({
      success: true,
      source: 'offline_heuristic',
      summary: 'Đã tối ưu lộ trình liên tục từ vị trí xuất phát qua các điểm lân cận ngắn nhất (Tuân thủ đường 1 chiều bản đồ)',
      orderedIndices: orderedIndices2,
      orderedOrders: orderedOrders2,
      stops: []
    });
  }

  /**
   * Tối ưu hóa lộ trình bằng AI 9Router
   * @param {Array} orders - Danh sách đơn hàng cần tối ưu
   * @param {Array} groups - Danh sách nhóm hiện tại
   * @param {Array} groupRules - Danh sách quy tắc phân nhóm
   * @param {Object} options - { scenario: 'respect_groups' | 'auto_cluster', startOrigin: {lat, lng} }
   */
  /**
   * Tối ưu hóa lộ trình bằng AI 9Router
   * @param {Array} orders - Danh sách đơn hàng cần tối ưu
   * @param {Array} groups - Danh sách nhóm hiện tại
   * @param {Array} groupRules - Danh sách quy tắc phân nhóm
   * @param {Object} options - { scenario: 'respect_groups' | 'auto_cluster', startOrigin: {lat, lng}, onProgress: fn, timeoutMs: number }
   */
  function optimizeRoute(orders, groups, groupRules, options) {
    options = options || {};
    var scenario = options.scenario || (groupRules && groupRules.length > 0 ? 'respect_groups' : 'auto_cluster');
    var startOrigin = options.startOrigin;
    var onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

    if (!orders || orders.length <= 1) {
      if (onProgress) onProgress({ percent: 100, step: 'done', text: 'Hoàn tất tối ưu đơn hàng' });
      return Promise.resolve(fallbackOfflineOptimization(orders, groups, groupRules, options));
    }

    var endpoint = getEndpoint();
    var model = getModel();
    var apiKey = getApiKey();
    var timeoutMs = options.timeoutMs || Math.min(60000, Math.max(30000, orders.length * 350));
    var timeoutId = null;

    if (onProgress) {
      onProgress({
        percent: 20,
        step: 'prepare',
        text: 'Đang trích xuất dữ liệu & lọc đường 1 chiều từ bản đồ cho ' + orders.length + ' đơn hàng...',
        log: '✓ Bắt đầu xử lý dữ liệu ' + orders.length + ' điểm giao hàng'
      });
    }

    // Nạp hoặc quét dữ liệu đường 1 chiều từ OpenStreetMap cho khu vực giao hàng
    var mapPromise;
    if (options.mapOneWays && Array.isArray(options.mapOneWays) && options.mapOneWays.length > 0) {
      mapPromise = Promise.resolve(options.mapOneWays);
    } else {
      var cachedMap = getMapOneWayCache();
      if (cachedMap && cachedMap.streets && cachedMap.streets.length > 0) {
        mapPromise = Promise.resolve(cachedMap.streets);
      } else {
        var bbox = getOrdersBoundingBox(orders, options.bounds);
        if (bbox && options.skipMapScan !== true) {
          if (onProgress) {
            onProgress({
              percent: 24,
              step: 'map_scan',
              text: 'Đang kết nối OpenStreetMap lọc dữ liệu các tuyến đường 1 chiều trong khu vực...'
            });
          }
          mapPromise = fetchOneWayStreetsFromMap(bbox, { timeoutMs: 5000 });
        } else {
          mapPromise = Promise.resolve([]);
        }
      }
    }

    return mapPromise.then(function(dynamicMapStreets) {
      var allOneWays = getAllOneWayStreets(options.customOneWayStreets, dynamicMapStreets);

      // Chuẩn bị dữ liệu gửi tới AI siêu gọn nhẹ (tiết kiệm token tối đa) và bổ sung tên đường & chiều 1 chiều từ bản đồ
      var compactList = orders.map(function(o, idx) {
        var addrStr = o.address || '';
        var info = extractStreetAndNum(addrStr);
        var matchedOw = matchOneWayStreet(info.street, addrStr, allOneWays);
        return {
          i: idx,
          code: o.trackingCode || '',
          name: o.customerName || '',
          addr: addrStr,
          street: info.street || '',
          num: info.num || null,
          oneWay: matchedOw ? matchedOw.direction : null,
          grp: o.groupId || '',
          lat: o.lat != null ? Number(Number(o.lat).toFixed(4)) : null,
          lng: o.lng != null ? Number(Number(o.lng).toFixed(4)) : null
        };
      });

      var groupsInfo = (groups || []).map(function(g) {
        return { id: g.id, name: g.name };
      });

      var rulesInfo = (groupRules || []).filter(function(r) { return r.enabled; }).map(function(r) {
        return {
          street: r.streetName || r.streetPattern || '',
          min: r.minNum,
          max: r.maxNum,
          parity: r.parity,
          direction: r.flowDirection || r.direction || 'two_way',
          grpId: r.groupId
        };
      });

      var systemPrompt = [
        'Bạn là chuyên gia điều phối và tối ưu lộ trình giao hàng GHN Express tại Việt Nam.',
        'Nhiệm vụ của bạn là sắp xếp thứ tự giao hàng tối ưu nhất để shipper giao nhanh nhất, tốn ít xăng nhất và không phải quay đầu xe nhiều lần.',
        '',
        'KỊCH BẢN YÊU CẦU: ' + (scenario === 'respect_groups' ? 'KỊCH BẢN 1 (TÔN TRỌNG PHÂN NHÓM HIỆN TẠI)' : 'KỊCH BẢN 2 (NHÂN VIÊN MỚI - AI TỰ GOM CỤM TOÀN TUYẾN)'),
        scenario === 'respect_groups'
          ? '- Tôn trọng các nhóm (K1, K2, K3...): Giao hết các đơn của một nhóm khu vực rồi mới chuyển sang nhóm kế tiếp theo hướng di chuyển hợp lý.\n- Trong từng nhóm: Sắp xếp theo trục đường và số nhà (ví dụ giao một bên số chẵn rồi sang số lẻ, hoặc đi từ số nhỏ đến số lớn) để tránh lượn qua lượn lại.'
          : '- AI tự phân tích địa chỉ, nhận diện các tòa nhà, chung cư, ngõ ngách.\n- Tự động gom các đơn cùng một địa chỉ hoặc cùng tòa nhà lại gần nhau.\n- Sắp xếp thứ tự tuần tự từ điểm bắt đầu qua các cụm địa lý gần nhau nhất.',
        '',
        '=== 🚦 NGUYÊN TẮC BẮT BUỘC: TUÂN THỦ DỮ LIỆU ĐƯỜNG 1 CHIỀU BẢN ĐỒ (OPENSTREETMAP) ===',
        '1. ĐẶC BIỆT LƯU Ý ĐƯỜNG 1 CHIỀU ĐƯỢC LỌC TỪ BẢN ĐỒ (TUYỆT ĐỐI KHÔNG GỢI Ý ĐI NGƯỢC CHIỀU):',
        '- Tuyệt đối KHÔNG ĐƯỢC gợi ý lộ trình đi ngược chiều xe chạy trên bất kỳ tuyến đường 1 chiều nào (vi phạm nghiêm trọng luật giao thông).',
        '- Khi giao các đơn trên cùng một đường 1 chiều (có trường oneWay: "asc" hoặc "desc", hoặc trong danh sách oneWayStreets):',
        '  + Với đường có hướng "asc" (Tăng dần số nhà / lưu thông xuôi dòng): Giao tuần tự từ số nhà nhỏ đến số nhà lớn (ví dụ: 14 -> 45 -> 78 -> 120). Tuyệt đối không giao số lớn trước rồi quay lại số nhỏ (ngược chiều).',
        '  + Với đường có hướng "desc" (Giảm dần số nhà / lưu thông ngược số nhà): Giao tuần tự từ số nhà lớn xuống số nhà nhỏ (ví dụ: 150 -> 98 -> 32 -> 10). Tuyệt đối không giao số nhỏ trước rồi đi lùi về số lớn.',
        '- Khi đã vào một đường 1 chiều, hãy gom và giao hết các đơn trên đường đó theo đúng chiều xe chạy trước khi rẽ sang đường khác.',
        '',
        '2. ĐƯỜNG CÓ DẢI PHÂN CÁCH CỨNG (TRÁNH QUAY ĐẦU NGUY HIỂM):',
        '- Trên các trục đường lớn có dải phân cách: giao hết một bên dãy số Chẵn theo chiều đi, sau đó quay đầu tại giao lộ hợp lệ để giao dãy số Lẻ theo chiều về (hoặc ngược lại).',
        '',
        'BẮT BUỘC TRẢ VỀ ĐỊNH DẠNG JSON DUY NHẤT (không markdown, không giải thích ngoài JSON):',
        '{',
        '  "summary": "Tóm tắt lộ trình (ngắn gọn 1-2 câu, ghi rõ tuân thủ đường 1 chiều bản đồ)",',
        '  "orderedIndices": [chỉ số ban đầu i của các đơn theo thứ tự giao từ đầu đến cuối],',
        '  "stops": [',
        '    { "name": "Tên điểm/tòa nhà/đường", "indices": [chỉ số đơn], "tip": "Lưu ý nếu có" }',
        '  ]',
        '}',
        'Chú ý: Mảng orderedIndices PHẢI CHỨA ĐẦY ĐỦ VÀ CHÍNH XÁC tất cả các chỉ số ban đầu (từ 0 đến ' + (orders.length - 1) + '), không được thiếu hay lặp lại bất kỳ đơn nào!'
      ].join('\n');

      var userContent = JSON.stringify({
        scenario: scenario,
        startOrigin: startOrigin,
        trafficRules: {
          strictOneWay: options.strictOneWay !== false,
          dataSource: 'OpenStreetMap Live Map Filter',
          oneWayStreets: allOneWays.slice(0, 40).map(function(ow) {
            return {
              street: ow.street,
              direction: ow.direction,
              source: ow.isMapDerived ? 'Bản đồ OpenStreetMap' : 'Shipper custom',
              note: ow.note
            };
          })
        },
        groups: groupsInfo,
        groupRules: rulesInfo,
        orders: compactList
      });

      var headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;

      // Timeout thích ứng theo số lượng đơn (tối thiểu 30s, tối đa 60s)
      var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      timeoutId = controller ? setTimeout(function() { controller.abort(); }, timeoutMs) : null;

      if (onProgress) {
        onProgress({
          percent: 45,
          step: 'sending',
          text: 'Đang kết nối & gửi yêu cầu tới 9Router AI (' + model + ')...',
          log: '✓ Gửi yêu cầu tối ưu tới 9Router AI Gateway (' + model + ')'
        });
      }

      return fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        }),
        signal: controller ? controller.signal : undefined
      }).then(function(res) {
        if (timeoutId) clearTimeout(timeoutId);
        if (!res.ok) {
          return res.text().then(function(errText) {
            throw new Error('9Router HTTP ' + res.status + ': ' + (errText.slice(0, 150) || 'Lỗi xử lý'));
          });
        }
        return res.json();
      }).then(function(data) {
        var rawContent = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
        var parsed = null;
        try {
          parsed = JSON.parse(rawContent);
        } catch(pe) {
          var m = rawContent.match(/\{[\s\S]*\}/);
          if (m) {
            try { parsed = JSON.parse(m[0]); } catch(pe2) {}
          }
        }

        if (!parsed || !Array.isArray(parsed.orderedIndices)) {
          throw new Error('Không thể phân tích dữ liệu JSON lộ trình từ AI');
        }

        var validIndices = [];
        var seen = {};
        parsed.orderedIndices.forEach(function(idx) {
          var numIdx = parseInt(idx, 10);
          if (!isNaN(numIdx) && numIdx >= 0 && numIdx < orders.length && !seen[numIdx]) {
            validIndices.push(numIdx);
            seen[numIdx] = true;
          }
        });

        // Bổ sung các đơn bị AI bỏ sót (nếu có)
        for (var i = 0; i < orders.length; i++) {
          if (!seen[i]) {
            validIndices.push(i);
            seen[i] = true;
          }
        }

        if (validIndices.length !== orders.length) {
          throw new Error('Không thể phân tích danh sách chỉ số đơn hợp lệ từ AI');
        }

        // Bắt buộc tuân thủ 100% hướng lưu thông các tuyến đường 1 chiều từ bản đồ
        if (options.strictOneWay !== false && allOneWays.length > 0) {
          validIndices = enforceOneWayTrafficCompliance(validIndices, orders, allOneWays);
        }

        var orderedOrders = validIndices.map(function(idx) {
          return orders[idx];
        });

        // Gắn thông tin tip đường 1 chiều vào stops nếu có
        var stops = parsed.stops || [];
        stops.forEach(function(s) {
          var matchedOw = matchOneWayStreet(s.name, s.name, allOneWays);
          if (matchedOw) {
            var dirLabel = matchedOw.direction === 'desc' ? 'Số lớn ➜ nhỏ' : 'Số nhỏ ➜ lớn';
            var srcLabel = matchedOw.isMapDerived ? 'Bản đồ OSM' : 'Shipper';
            s.tip = (s.tip ? s.tip + ' | ' : '') + '🚦 1 Chiều (' + dirLabel + ' - ' + srcLabel + ')';
          }
        });

        if (onProgress) {
          onProgress({
            percent: 100,
            step: 'done',
            text: 'Hoàn tất! Đã tối ưu ' + orders.length + ' đơn hàng theo dữ liệu bản đồ.',
            log: '✓ Hoàn thành tối ưu ' + orders.length + ' điểm giao với 9Router AI'
          });
        }

        return finalizeResult({
          success: true,
          source: '9router_ai',
          model: model,
          summary: parsed.summary || 'Đã tối ưu lộ trình thành công bằng AI (Tuân thủ dữ liệu đường 1 chiều từ bản đồ)',
          orderedIndices: validIndices,
          orderedOrders: orderedOrders,
          stops: stops,
          mapOneWaysCount: allOneWays.length
        });
      });
    }).catch(function(err) {
      if (timeoutId) clearTimeout(timeoutId);
      var reason = (err && err.name === 'AbortError') ? ('Hết thời gian chờ AI (' + Math.round(timeoutMs / 1000) + 's)') : (err ? err.message : 'Không rõ');
      console.warn('9Router AI không phản hồi hoặc lỗi (' + reason + '), kích hoạt thuật toán dự phòng Offline:', err);

      if (onProgress) {
        onProgress({
          percent: 95,
          step: 'fallback',
          text: 'Chuyển sang thuật toán nội suy Offline do: ' + reason,
          log: '⚠️ 9Router (' + reason + ') -> Đang kích hoạt thuật toán dự phòng Offline'
        });
      }

      var fallbackRes = fallbackOfflineOptimization(orders, groups, groupRules, options);
      fallbackRes.warning = 'Không thể gọi 9Router (' + reason + '). Đã tự động dùng thuật toán nội suy Offline!';
      return finalizeResult(fallbackRes);
    });
  }

  return {
    DEFAULT_ENDPOINT: DEFAULT_ENDPOINT,
    DEFAULT_MODEL: DEFAULT_MODEL,
    BUILTIN_ONE_WAY_STREETS: BUILTIN_ONE_WAY_STREETS,
    getEndpoint: getEndpoint,
    setEndpoint: setEndpoint,
    getModel: getModel,
    setModel: setModel,
    getApiKey: getApiKey,
    setApiKey: setApiKey,
    getConfig: getConfig,
    saveConfig: saveConfig,
    testConnection: testConnection,
    optimizeRoute: optimizeRoute,
    fallbackOfflineOptimization: fallbackOfflineOptimization,
    calculateDistance: calculateDistance,
    computeTotalDistance: computeTotalDistance,
    getAllOneWayStreets: getAllOneWayStreets,
    getCustomOneWayStreets: getCustomOneWayStreets,
    saveCustomOneWayStreets: saveCustomOneWayStreets,
    matchOneWayStreet: matchOneWayStreet,
    enforceOneWayTrafficCompliance: enforceOneWayTrafficCompliance,
    fetchOneWayStreetsFromMap: fetchOneWayStreetsFromMap,
    scanAreaOneWayFromMap: scanAreaOneWayFromMap,
    getOrdersBoundingBox: getOrdersBoundingBox,
    getMapOneWayCache: getMapOneWayCache,
    clearMapOneWayCache: clearMapOneWayCache,
    projectPointOnPolyline: projectPointOnPolyline
  };
});
