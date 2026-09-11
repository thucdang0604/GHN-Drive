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
      var orderedOrders = sortedResult.map(function(it) { return it.order; });

      return finalizeResult({
        success: true,
        source: 'offline_heuristic',
        summary: 'Đã tối ưu thứ tự theo từng nhóm (Ưu tiên chẵn / lẻ & tăng dần số nhà để tránh quay đầu xe)',
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

    return finalizeResult({
      success: true,
      source: 'offline_heuristic',
      summary: 'Đã tối ưu lộ trình liên tục từ vị trí xuất phát qua các điểm lân cận ngắn nhất (Nearest-Neighbor TSP)',
      orderedIndices: route.map(function(it) { return it.origIdx; }),
      orderedOrders: route.map(function(it) { return it.order; }),
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

    if (onProgress) {
      onProgress({
        percent: 25,
        step: 'prepare',
        text: 'Đang trích xuất & nén ' + orders.length + ' địa chỉ đơn hàng...',
        log: '✓ Đã cấu trúc ' + orders.length + ' đơn thành định dạng nén tối ưu token'
      });
    }

    // Chuẩn bị dữ liệu gửi tới AI siêu gọn nhẹ (tiết kiệm token tối đa)
    var compactList = orders.map(function(o, idx) {
      return {
        i: idx,
        code: o.trackingCode || '',
        name: o.customerName || '',
        addr: o.address || '',
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
        street: r.streetName,
        min: r.minNum,
        max: r.maxNum,
        parity: r.parity,
        grpId: r.groupId
      };
    });

    var systemPrompt = [
      'Bạn là chuyên gia điều phối và tối ưu lộ trình giao hàng GHN Express tại TP.HCM/Việt Nam.',
      'Nhiệm vụ của bạn là sắp xếp thứ tự giao hàng tối ưu nhất để shipper giao nhanh nhất, tốn ít xăng nhất và không phải quay đầu xe nhiều lần.',
      '',
      'KỊCH BẢN YÊU CẦU: ' + (scenario === 'respect_groups' ? 'KỊCH BẢN 1 (TÔN TRỌNG PHÂN NHÓM HIỆN TẠI)' : 'KỊCH BẢN 2 (NHÂN VIÊN MỚI - AI TỰ GOM CỤM TOÀN TUYẾN)'),
      scenario === 'respect_groups'
        ? '- Tôn trọng các nhóm (K1, K2, K3...): Giao hết các đơn của một nhóm khu vực rồi mới chuyển sang nhóm kế tiếp theo hướng di chuyển hợp lý.\n- Trong từng nhóm: Sắp xếp theo trục đường và số nhà (ví dụ giao một bên số chẵn rồi sang số lẻ, hoặc đi từ số nhỏ đến số lớn) để tránh lượn qua lượn lại.'
        : '- AI tự phân tích địa chỉ, nhận diện các tòa nhà, chung cư, ngõ ngách.\n- Tự động gom các đơn cùng một địa chỉ hoặc cùng tòa nhà lại gần nhau.\n- Sắp xếp thứ tự tuần tự từ điểm bắt đầu qua các cụm địa lý gần nhau nhất.',
      '',
      'BẮT BUỘC TRẢ VỀ ĐỊNH DẠNG JSON DUY NHẤT (không markdown, không giải thích ngoài JSON):',
      '{',
      '  "summary": "Tóm tắt lộ trình (ngắn gọn 1-2 câu)",',
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
      groups: groupsInfo,
      groupRules: rulesInfo,
      orders: compactList
    });

    var headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;

    // Timeout thích ứng theo số lượng đơn (tối thiểu 30s, tối đa 60s)
    var timeoutMs = options.timeoutMs || Math.min(60000, Math.max(30000, orders.length * 350));
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function() { controller.abort(); }, timeoutMs) : null;

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
        temperature: 0.2,
        stream: false
      }),
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

          var msg = 'HTTP ' + res.status + (detail ? ': ' + detail : (res.statusText ? ': ' + res.statusText : ''));
          throw new Error(msg);
        });
      }

      if (onProgress) {
        onProgress({
          percent: 85,
          step: 'receiving',
          text: '9Router đã phản hồi! Đang giải mã dữ liệu...',
          log: '✓ Đã nhận phản hồi từ 9Router AI Gateway'
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
      var content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!content) throw new Error('AI không trả về nội dung');

      if (onProgress) {
        onProgress({
          percent: 92,
          step: 'parsing',
          text: 'Đang kiểm tra và xác thực thứ tự lộ trình...',
          log: '✓ Bóc tách JSON lộ trình từ nội dung AI'
        });
      }

      // Bóc tách JSON an toàn từ nội dung phản hồi (tìm cặp dấu ngoặc {} ngoài cùng)
      var cleanJson = content.replace(/```json/gi, '').replace(/```/g, '').trim();
      var firstBrace = cleanJson.indexOf('{');
      var lastBrace = cleanJson.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
      }

      var parsed = JSON.parse(cleanJson);

      // Tự động sửa chữa và bù đắp chỉ số nếu AI vô tình bỏ sót hoặc trùng lặp
      var validIndices = [];
      var seen = {};
      if (parsed && Array.isArray(parsed.orderedIndices)) {
        parsed.orderedIndices.forEach(function(idx) {
          var num = Number(idx);
          if (!isNaN(num) && num >= 0 && num < orders.length && !seen[num]) {
            seen[num] = true;
            validIndices.push(num);
          }
        });
      }

      // Bổ sung các đơn còn thiếu nếu có để đảm bảo không mất đơn nào của shipper
      if (validIndices.length < orders.length) {
        for (var missingIdx = 0; missingIdx < orders.length; missingIdx++) {
          if (!seen[missingIdx]) {
            seen[missingIdx] = true;
            validIndices.push(missingIdx);
          }
        }
      }

      if (validIndices.length !== orders.length || validIndices.length === 0) {
        throw new Error('Không thể phân tích danh sách chỉ số đơn hợp lệ từ AI');
      }

      var orderedOrders = validIndices.map(function(idx) {
        return orders[idx];
      });

      if (onProgress) {
        onProgress({
          percent: 100,
          step: 'done',
          text: 'Hoàn tất! Đã tối ưu ' + orders.length + ' đơn hàng.',
          log: '✓ Hoàn thành tối ưu ' + orders.length + ' điểm giao với 9Router AI'
        });
      }

      return finalizeResult({
        success: true,
        source: '9router_ai',
        model: model,
        summary: parsed.summary || 'Đã tối ưu lộ trình thành công bằng AI',
        orderedIndices: validIndices,
        orderedOrders: orderedOrders,
        stops: parsed.stops || []
      });
    }).catch(function(err) {
      if (timeoutId) clearTimeout(timeoutId);
      var reason = (err.name === 'AbortError') ? ('Hết thời gian chờ AI (' + Math.round(timeoutMs / 1000) + 's)') : err.message;
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
    computeTotalDistance: computeTotalDistance
  };
});
