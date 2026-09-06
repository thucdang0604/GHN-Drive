/**
 * js/qr-sync.js - Module tương thích ngược (Deprecated - Thay thế hoàn toàn bởi js/p2p-sync.js)
 * Toàn bộ cơ chế quét QR phân đoạn cũ đã được thay thế bằng WebRTC P2P & Mã PIN 6 số.
 */
(function(root) {
  'use strict';

  var p2p = root.P2PSync || (typeof window !== 'undefined' ? window.P2PSync : null);

  var QRSyncShim = {
    renderQR: function(container, text, options) {
      if (root.P2PSync && root.P2PSync.renderP2PQR) {
        return root.P2PSync.renderP2PQR(container, text, options);
      }
      return false;
    },
    applyPatch: function(payload, orders, groups) {
      if (root.P2PSync && root.P2PSync.applyPatch) {
        return root.P2PSync.applyPatch(payload, orders, groups);
      }
      return { orders: orders, groups: groups, matchedCount: 0 };
    },
    applyFull: function(payload, orders, groups, isAppend) {
      if (root.P2PSync && root.P2PSync.applyFull) {
        return root.P2PSync.applyFull(payload, orders, groups, isAppend);
      }
      return { orders: orders, groups: groups, importedCount: 0 };
    },
    exportToFileData: function(orders, groups, verifiedGeocache) {
      if (root.P2PSync && root.P2PSync.exportToFileData) {
        return root.P2PSync.exportToFileData(orders, groups, verifiedGeocache);
      }
      return JSON.stringify({ orders: orders, groups: groups });
    },
    isSyncQR: function() { return false; },
    parseQR: function() { return null; }
  };

  root.QRSync = QRSyncShim;
  if (typeof module === 'object' && module.exports) {
    module.exports = QRSyncShim;
  }
})(typeof self !== 'undefined' ? self : this);
