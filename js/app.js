/**
 * app.js - Điều khiển giao diện và nghiệp vụ chính của ứng dụng Quản lý đơn GHN (Desktop)
 * Hỗ trợ:
 * - Đồng bộ Google Sheet theo Mã Chuyến (tripCode)
 * - Gom nhóm địa chỉ giao hàng theo Tuyến / Tòa nhà, hỗ trợ thu gọn/mở rộng để tiết kiệm diện tích
 * - Sắp xếp kéo thả & nút mũi tên
 * - Chuẩn hóa địa chỉ & nhận diện dữ liệu thông minh
 */

import { StorageService } from './storage.js';
import { 
  parseRawOrderText, 
  formatCurrency, 
  parseCurrency, 
  normalizeAddress, 
  fetchOrdersByTrip, 
  extractClusterName,
  removeVietnameseTones,
  countVietnameseAccents,
  parseAndNormalizeAddress,
  healTripCoordinates,
  isValidCoord
} from './parser.js';

// Trạng thái ứng dụng
let currentOrders = [];
let currentGroups = [];
let activeFilter = 'all'; // 'all' | 'pending' | 'gtc' | 'gtb'
let searchQuery = '';
let draggedOrderId = null;
let allCollapsed = false;

// Trạng thái Bản đồ Lộ trình Desktop
let desktopCurrentView = 'list'; // 'list' | 'map'
let desktopMap = null;
let desktopMapMarkers = {};
let desktopRoutePolyline = null;
let desktopUserMarker = null;
let desktopUserAccuracy = null;
let isDesktopPolylineVisible = true;
let desktopMapTileMode = 'osm';
let desktopActiveTileLayer = null;
let selectedDesktopOrderId = null;

// DOM Elements
const ordersListEl = document.getElementById('ordersList');
const emptyStateEl = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const filterPills = document.querySelectorAll('.filter-pill');

// Stat Elements
const statTotal = document.getElementById('statTotal');
const statPending = document.getElementById('statPending');
const statGtc = document.getElementById('statGtc');
const statGtb = document.getElementById('statGtb');
const statCod = document.getElementById('statCod');

// Form Elements
const manualForm = document.getElementById('manualOrderForm');
const pasteForm = document.getElementById('pasteOrderForm');
const smartPasteInput = document.getElementById('smartPasteInput');
const pastePreviewSummary = document.getElementById('pastePreviewSummary');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

// Clean Modal Elements
const cleanModal = document.getElementById('cleanModal');
const btnOpenCleanModal = document.getElementById('btnOpenCleanModal');
const btnCancelClean = document.getElementById('btnCancelClean');
const btnConfirmClean = document.getElementById('btnConfirmClean');

// Trip Modal Elements
const tripSyncModal = document.getElementById('tripSyncModal');
const btnOpenTripModalDesktop = document.getElementById('btnOpenTripModalDesktop');
const btnCancelTripModal = document.getElementById('btnCancelTripModal');
const btnSubmitTripDesktop = document.getElementById('btnSubmitTripDesktop');
const desktopTripInput = document.getElementById('desktopTripInput');
const desktopTripStatus = document.getElementById('desktopTripStatus');
const desktopTripAutoGroup = document.getElementById('desktopTripAutoGroup');

// Group Toolbar Elements
const btnDesktopAutoGroup = document.getElementById('btnDesktopAutoGroup');
const btnDesktopHealGps = document.getElementById('btnDesktopHealGps');
const btnDesktopNewGroup = document.getElementById('btnDesktopNewGroup');
const btnDesktopCollapseAll = document.getElementById('btnDesktopCollapseAll');

// Khởi chạy ứng dụng
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupEventListeners();
});

function initApp() {
  currentOrders = StorageService.loadSampleIfEmpty();
  currentGroups = StorageService.getGroups();
  ensureGroupIntegrity();
  renderApp();
}

function ensureGroupIntegrity() {
  if (!currentGroups || currentGroups.length === 0) {
    currentGroups = [{ id: 'group_ungrouped', name: 'Chưa phân nhóm', isCollapsed: false }];
  }
  const hasUngrouped = currentGroups.some(g => g.id === 'group_ungrouped');
  if (!hasUngrouped) {
    currentGroups.unshift({ id: 'group_ungrouped', name: 'Chưa phân nhóm', isCollapsed: false });
  }

  const groupIds = new Set(currentGroups.map(g => g.id));
  let modified = false;

  currentOrders.forEach(o => {
    if (!o.groupId || !groupIds.has(o.groupId)) {
      o.groupId = 'group_ungrouped';
      modified = true;
    }
  });

  if (modified) {
    StorageService.saveOrders(currentOrders);
  }
}

/**
 * Lắng nghe các sự kiện
 */
function setupEventListeners() {
  // Chuyển tab nhập liệu (Thủ công / Dán nhanh)
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.style.display = 'none');

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) targetPanel.style.display = 'block';
    });
  });

  // Submit form nhập thủ công
  if (manualForm) {
    manualForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const trackingCode = document.getElementById('inputTracking').value.trim();
      const customerName = document.getElementById('inputCustomer').value.trim();
      const phone = document.getElementById('inputPhone').value.trim();
      const address = document.getElementById('inputAddress').value.trim();
      const codRaw = document.getElementById('inputCod').value.trim();

      const newOrder = {
        trackingCode: trackingCode || 'VNGH' + Math.floor(10000000000 + Math.random() * 90000000000),
        customerName,
        phone,
        address: normalizeAddress(address),
        codAmount: parseCurrency(codRaw),
        status: 'pending',
        groupId: 'group_ungrouped'
      };

      currentOrders = StorageService.addOrders([newOrder]);
      manualForm.reset();
      document.getElementById('inputCod').value = '0 VNĐ';
      renderApp();
      showToast('Đã thêm 1 đơn hàng mới thành công!', 'success');
    });
  }

  // Phân tích xem trước khi gõ/dán vào ô Dán nhanh
  if (smartPasteInput) {
    smartPasteInput.addEventListener('input', () => {
      const text = smartPasteInput.value.trim();
      if (!text) {
        pastePreviewSummary.classList.remove('active');
        return;
      }

      const parsedItems = parseRawOrderText(text);
      if (parsedItems.length > 0) {
        pastePreviewSummary.innerHTML = `
          <strong>Đã phát hiện:</strong> ${parsedItems.length} đơn hàng<br>
          <span style="font-size: 0.75rem; color: #64748b;">
            Đơn đầu tiên: ${escapeHtml(parsedItems[0].customerName || 'Khách')} - ${escapeHtml(parsedItems[0].phone || 'SĐT')} (${escapeHtml(parsedItems[0].address || '')})
          </span>
        `;
        pastePreviewSummary.classList.add('active');
      } else {
        pastePreviewSummary.innerHTML = `<em>Chưa nhận diện được cấu trúc đơn hàng...</em>`;
        pastePreviewSummary.classList.add('active');
      }
    });
  }

  // Submit form Dán nhanh
  if (pasteForm) {
    pasteForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = smartPasteInput.value.trim();
      if (!text) return;

      const newOrders = parseRawOrderText(text);
      if (newOrders.length === 0) {
        showToast('Không nhận diện được đơn hàng nào. Hãy kiểm tra lại nội dung dán!', 'error');
        return;
      }

      currentOrders = StorageService.addOrders(newOrders);
      smartPasteInput.value = '';
      pastePreviewSummary.classList.remove('active');
      renderApp();
      showToast(`Đã thêm thành công ${newOrders.length} đơn hàng!`, 'success');
    });
  }

  // Tìm kiếm đơn hàng
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderOrderList();
    });
  }

  // Lọc theo trạng thái
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeFilter = pill.getAttribute('data-filter');
      renderOrderList();
    });
  });

  // Modal Dọn dẹp đơn cũ
  setupCleanModal();

  // Modal Mã chuyến Google Sheet
  setupTripModal();

  // Nhóm địa chỉ toolbar
  setupGroupToolbar();

  // Quét QR Code trên Desktop
  setupDesktopQrScanner();

  // Chuyển đổi chế độ xem Danh sách / Bản đồ
  setupDesktopViewSwitcher();

  // Modal Đồng bộ QR Offline sang Mobile
  setupDesktopQrSync();
}

/**
 * Xử lý Modal Dọn dẹp đơn cũ
 */
function setupCleanModal() {
  if (!btnOpenCleanModal) return;

  btnOpenCleanModal.addEventListener('click', () => {
    const finishedCount = currentOrders.filter(o => o.status === 'gtc' || o.status === 'gtb').length;
    if (finishedCount === 0) {
      showToast('Không có đơn nào đã xử lý (GTC hoặc GTB) để dọn dẹp!', 'info');
      return;
    }

    const descEl = document.getElementById('cleanModalDesc');
    if (descEl) {
      descEl.textContent = `Bạn có ${finishedCount} đơn hàng đã hoàn tất (GTC hoặc GTB). Bạn có chắc muốn dọn dẹp để bắt đầu ca giao mới không?`;
    }
    cleanModal.classList.add('show');
  });

  if (btnCancelClean) {
    btnCancelClean.addEventListener('click', () => {
      cleanModal.classList.remove('show');
    });
  }

  if (btnConfirmClean) {
    btnConfirmClean.addEventListener('click', () => {
      currentOrders = StorageService.cleanProcessedOrders();
      cleanModal.classList.remove('show');
      renderApp();
      showToast('Đã dọn dẹp sạch các đơn đã hoàn tất!', 'success');
    });
  }

  window.addEventListener('click', (e) => {
    if (e.target === cleanModal) {
      cleanModal.classList.remove('show');
    }
  });
}

/**
 * Xử lý Modal Đồng bộ Mã Chuyến từ Google Sheet
 */
function setupTripModal() {
  if (!btnOpenTripModalDesktop) return;

  btnOpenTripModalDesktop.addEventListener('click', () => {
    desktopTripStatus.style.display = 'none';
    tripSyncModal.style.display = 'flex';
    desktopTripInput.focus();
  });

  if (btnCancelTripModal) {
    btnCancelTripModal.addEventListener('click', () => {
      tripSyncModal.style.display = 'none';
    });
  }

  window.addEventListener('click', (e) => {
    if (e.target === tripSyncModal) {
      tripSyncModal.style.display = 'none';
    }
  });

  if (btnSubmitTripDesktop) {
    btnSubmitTripDesktop.addEventListener('click', () => {
      const rawCode = desktopTripInput.value.trim();
      if (!rawCode) {
        showToast('Vui lòng nhập Mã Chuyến hoặc link chuyến GHN!', 'error');
        return;
      }

      desktopTripStatus.style.display = 'block';
      desktopTripStatus.style.background = '#e0f2fe';
      desktopTripStatus.style.color = '#0369a1';
      desktopTripStatus.innerHTML = `⏳ Đang kết nối Google Sheet lấy đơn chuyến <strong>${escapeHtml(rawCode)}</strong>...`;
      btnSubmitTripDesktop.disabled = true;

      fetchOrdersByTrip(rawCode)
        .then(result => {
          btnSubmitTripDesktop.disabled = false;
          if (result.orders.length === 0) {
            desktopTripStatus.style.background = '#fee2e2';
            desktopTripStatus.style.color = '#b91c1c';
            desktopTripStatus.innerHTML = `⚠️ Không tìm thấy đơn nào cho mã chuyến <strong>${escapeHtml(result.tripCode)}</strong>`;
            return;
          }

          const mode = document.querySelector('input[name="desktopTripMode"]:checked').value;
          if (mode === 'replace') {
            currentOrders = result.orders;
          } else {
            currentOrders = [...currentOrders, ...result.orders];
          }

          StorageService.saveOrders(currentOrders);

          if (desktopTripAutoGroup && desktopTripAutoGroup.checked) {
            autoGroupAllOrders();
          } else {
            ensureGroupIntegrity();
            renderApp();
          }

          tripSyncModal.style.display = 'none';
          const healedMsg = result.healStats && result.healStats.healedCount > 0 
            ? ` (⚡ Đã tự động nắn chuẩn ${result.healStats.healedCount} đơn GPS)` 
            : '';
          showToast(`Đã tải thành công ${result.orders.length} đơn hàng chuyến ${result.tripCode}!${healedMsg}`, 'success');
        })
        .catch(err => {
          btnSubmitTripDesktop.disabled = false;
          desktopTripStatus.style.background = '#fee2e2';
          desktopTripStatus.style.color = '#b91c1c';
          desktopTripStatus.innerHTML = `❌ Lỗi: ${escapeHtml(err.message || 'Không thể kết nối Google Sheet')}`;
        });
    });
  }
}

/**
 * Xử lý Thanh Công Cụ Gom Nhóm
 */
function setupGroupToolbar() {
  if (btnDesktopAutoGroup) {
    btnDesktopAutoGroup.addEventListener('click', autoGroupAllOrders);
  }
  if (btnDesktopHealGps) {
    btnDesktopHealGps.addEventListener('click', healCurrentOrdersGPS);
  }
  if (btnDesktopNewGroup) {
    btnDesktopNewGroup.addEventListener('click', createNewGroup);
  }
  if (btnDesktopCollapseAll) {
    btnDesktopCollapseAll.addEventListener('click', toggleAllCollapse);
  }
}

function healCurrentOrdersGPS() {
  if (currentOrders.length === 0) {
    showToast('Chưa có đơn hàng nào để nắn sửa!', 'info');
    return;
  }
  const result = healTripCoordinates(currentOrders);
  StorageService.saveOrders(currentOrders);
  renderApp();
  if (result.healedCount > 0) {
    showToast(`⚡ Đã tự động nắn chuẩn tọa độ cho ${result.healedCount} đơn hàng!`, 'success');
  } else if (result.outlierCount > 0) {
    showToast(`Đã rà soát: Có ${result.outlierCount} đơn nghi ngờ lệch cần kiểm tra lại.`, 'info');
  } else {
    showToast('✓ Tất cả đơn hàng đều có tọa độ chuẩn xác, không có đơn lệch!', 'success');
  }
}

function autoGroupAllOrders() {
  if (currentOrders.length === 0) {
    showToast('Chưa có đơn hàng nào để gom nhóm!', 'info');
    return;
  }

  const clusterMap = {};
  const newGroups = [
    { id: 'group_ungrouped', name: 'Chưa phân nhóm', isCollapsed: false }
  ];

  currentOrders.forEach(o => {
    const cName = extractClusterName(o.address);
    if (cName === 'Chưa phân nhóm') {
      o.groupId = 'group_ungrouped';
      return;
    }

    const key = removeVietnameseTones(cName);
    if (!clusterMap[key]) {
      const gId = 'grp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
      clusterMap[key] = { id: gId, name: cName, count: 1 };
    } else {
      clusterMap[key].count++;
      if (countVietnameseAccents(cName) > countVietnameseAccents(clusterMap[key].name)) {
        clusterMap[key].name = cName;
      }
    }
    o.groupId = clusterMap[key].id;
  });

  for (const k in clusterMap) {
    newGroups.push({
      id: clusterMap[k].id,
      name: clusterMap[k].name,
      isCollapsed: false
    });
  }

  currentGroups = newGroups;
  StorageService.saveGroups(currentGroups);
  StorageService.saveOrders(currentOrders);
  renderApp();
  showToast(`Đã tự động gom thành ${currentGroups.length - 1} tuyến đường/tòa nhà!`, 'success');
}

function createNewGroup() {
  const name = prompt('Nhập tên nhóm mới (ví dụ: Tòa Centec, Tuyến Võ Văn Tần...):');
  if (!name || !name.trim()) return;

  const newId = 'grp_' + Date.now();
  currentGroups.push({
    id: newId,
    name: name.trim(),
    isCollapsed: false
  });
  StorageService.saveGroups(currentGroups);
  renderApp();
  showToast(`Đã tạo nhóm: ${name.trim()}`, 'success');
}

function renameGroup(gId) {
  const g = currentGroups.find(item => item.id === gId);
  if (!g) return;
  const newName = prompt('Đổi tên nhóm:', g.name);
  if (!newName || !newName.trim()) return;
  g.name = newName.trim();
  StorageService.saveGroups(currentGroups);
  renderApp();
  showToast(`Đã đổi tên thành: ${g.name}`, 'success');
}

function deleteGroup(gId) {
  if (gId === 'group_ungrouped') return;
  const g = currentGroups.find(item => item.id === gId);
  if (!g) return;

  if (confirm(`Xác nhận xóa nhóm "${g.name}"? Các đơn sẽ được chuyển về "Chưa phân nhóm".`)) {
    currentOrders.forEach(o => {
      if (o.groupId === gId) o.groupId = 'group_ungrouped';
    });
    currentGroups = currentGroups.filter(item => item.id !== gId);
    StorageService.saveGroups(currentGroups);
    StorageService.saveOrders(currentOrders);
    renderApp();
    showToast(`Đã xóa nhóm: ${g.name}`, 'info');
  }
}

function toggleGroupCollapse(gId) {
  const g = currentGroups.find(item => item.id === gId);
  if (g) {
    g.isCollapsed = !g.isCollapsed;
    StorageService.saveGroups(currentGroups);
    renderOrderList();
  }
}

function toggleAllCollapse() {
  allCollapsed = !allCollapsed;
  currentGroups.forEach(g => { g.isCollapsed = allCollapsed; });
  StorageService.saveGroups(currentGroups);
  renderOrderList();
  if (btnDesktopCollapseAll) {
    btnDesktopCollapseAll.textContent = allCollapsed ? '🔼 Mở rộng hết' : '🔽 Thu gọn hết';
  }
  showToast(allCollapsed ? 'Đã thu gọn tất cả nhóm!' : 'Đã mở rộng tất cả nhóm!', 'info');
}

function promptChangeOrderGroup(orderId) {
  const o = currentOrders.find(item => item.id === orderId);
  if (!o) return;

  const options = currentGroups.map((g, idx) => `${idx + 1}. ${g.name}`).join('\n');
  const choice = prompt(`Chọn nhóm cho đơn hàng:\n${options}\n\nNhập số thứ tự:`);
  if (!choice) return;
  const num = parseInt(choice, 10);
  if (num >= 1 && num <= currentGroups.length) {
    o.groupId = currentGroups[num - 1].id;
    StorageService.saveOrders(currentOrders);
    renderOrderList();
    showToast(`Đã chuyển đơn vào nhóm: ${currentGroups[num - 1].name}`, 'success');
  }
}

/**
 * Quản lý Modal & Camera Quét QR/Barcode trên Desktop
 */
let desktopHtml5QrCode = null;

function setupDesktopQrScanner() {
  const btnScan = document.getElementById('btnDesktopScanQR');
  const modal = document.getElementById('desktopQrModal');
  const btnClose = document.getElementById('btnCloseDesktopQrModal');
  const statusMsg = document.getElementById('desktopQrStatusMsg');
  const fileInput = document.getElementById('desktopQrFileInput');

  if (!btnScan || !modal) return;

  btnScan.addEventListener('click', () => {
    modal.classList.add('show');
    statusMsg.textContent = 'Đang khởi động camera...';

    if (typeof Html5Qrcode !== 'undefined') {
      if (!desktopHtml5QrCode) {
        desktopHtml5QrCode = new Html5Qrcode("desktopQrReader");
      }

      desktopHtml5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: (w, h) => {
            const minEdge = Math.min(w, h);
            const size = Math.floor(minEdge * 0.85);
            return { width: size, height: size };
          }
        },
        onDesktopScanSuccess,
        () => {}
      ).then(() => {
        statusMsg.textContent = '🟢 Camera sẵn sàng! Hướng vào mã đơn hàng.';
      }).catch(err => {
        statusMsg.innerHTML = '⚠️ Không thể mở camera (' + (err.message || 'Thiếu quyền') + '). Hãy dùng nút <strong>Chọn ảnh từ máy tính</strong>.';
      });
    } else {
      statusMsg.textContent = 'Chưa tải được thư viện quét mã.';
    }
  });

  const closeDesktopScanner = () => {
    modal.classList.remove('show');
    if (desktopHtml5QrCode && desktopHtml5QrCode.isScanning) {
      desktopHtml5QrCode.stop().catch(() => {});
    }
  };

  if (btnClose) btnClose.addEventListener('click', closeDesktopScanner);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeDesktopScanner();
  });

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (!e.target.files || e.target.files.length === 0) return;
      const file = e.target.files[0];
      statusMsg.textContent = '⏳ Đang quét ảnh...';

      if (typeof Html5Qrcode !== 'undefined') {
        const scanner = new Html5Qrcode("desktopQrReader");
        scanner.scanFile(file, true)
          .then(decodedText => {
            onDesktopScanSuccess(decodedText);
          })
          .catch(() => {
            statusMsg.innerHTML = '❌ Không nhận diện được mã từ ảnh. Hãy thử ảnh rõ nét hơn!';
          });
      }
    });
  }

  function onDesktopScanSuccess(decodedText) {
    if (!decodedText) return;

    // Kiểm tra mã đồng bộ QR Offline
    const qrsync = window.QRSync || (typeof QRSync !== 'undefined' ? QRSync : null);
    if (qrsync && qrsync.isSyncQR(decodedText)) {
      const payload = qrsync.parseQR(decodedText);
      if (payload) {
        closeDesktopScanner();
        if (payload.t === 'patch') {
          const res = qrsync.applyPatch(payload, currentOrders, currentGroups);
          currentOrders = res.orders;
          currentGroups = res.groups;
          StorageService.saveOrders(currentOrders);
          StorageService.saveGroups(currentGroups);
          renderApp();
          showToast(`🎉 Đã đồng bộ tọa độ & nhóm cho ${res.matchedCount} đơn!`, 'success');
          return;
        } else if (payload.t === 'full') {
          const res = qrsync.applyFull(payload, currentOrders, currentGroups, false);
          currentOrders = res.orders;
          currentGroups = res.groups;
          ensureGroupIntegrity();
          StorageService.saveOrders(currentOrders);
          StorageService.saveGroups(currentGroups);
          renderApp();
          showToast(`🎉 Đã nạp thành công ${res.importedCount} đơn từ mã QR!`, 'success');
          return;
        }
      }
    }

    const code = extractTrackingCode(decodedText);
    if (!code) return;

    closeDesktopScanner();
    if (searchInput) {
      searchInput.value = code;
      searchQuery = code.toLowerCase().trim();
    }

    // Tự động mở rộng nhóm nếu đang bị thu gọn
    const matched = currentOrders.find(o => 
      (o.trackingCode || '').toLowerCase().includes(searchQuery)
    );
    if (matched && matched.groupId) {
      const g = currentGroups.find(grp => grp.id === matched.groupId);
      if (g && g.isCollapsed) {
        g.isCollapsed = false;
        StorageService.saveGroups(currentGroups);
      }
    }

    renderApp();
    showToast(`🎯 Đã tìm thấy đơn: ${code}`, 'success');
  }

  function extractTrackingCode(text) {
    if (!text) return '';
    const clean = text.trim();
    const mParam = clean.match(/(?:order_code|ordercode|code|tracking|mvd)=([A-Z0-9]{6,25})/i);
    if (mParam) return mParam[1].toUpperCase();
    const mPath = clean.match(/(?:order-detail|trip-detail|tracking|orders|order|don-hang)\/([A-Z0-9]{6,25})/i);
    if (mPath) return mPath[1].toUpperCase();
    const mCarrier = clean.match(/\b(VNGH[0-9]{8,16}|GY[A-Z0-9]{6,10}|SPX[A-Z0-9]{6,16}|[A-Z]{2}[0-9]{6,14})\b/i);
    if (mCarrier) return mCarrier[0].toUpperCase();
    const mAlphanum = clean.match(/^[A-Z0-9_-]{6,25}$/i);
    if (mAlphanum) return mAlphanum[0].toUpperCase();
    return clean;
  }
}

/**
 * Xử lý Modal Xuất Mã QR Đồng Bộ Sang Mobile (100% Offline)
 */
function setupDesktopQrSync() {
  const modal = document.getElementById('desktopQrSyncModal');
  const btnOpen = document.getElementById('btnOpenQrSyncModalDesktop');
  const btnClose = document.getElementById('btnCloseDesktopQrSyncModal');
  const optPatchBox = document.getElementById('desktopOptPatchBox');
  const optFullBox = document.getElementById('desktopOptFullBox');
  const syncModeRadios = document.querySelectorAll('input[name="desktopSyncMode"]');
  const canvasContainer = document.getElementById('desktopQrCanvasContainer');
  const pagingControl = document.getElementById('desktopQrPagingControl');
  const pageIndicator = document.getElementById('desktopQrPageIndicator');
  const btnPrev = document.getElementById('btnDesktopPrevQR');
  const btnNext = document.getElementById('btnDesktopNextQR');
  const guideTip = document.getElementById('desktopQrGuideTip');
  const btnDownloadJson = document.getElementById('btnDesktopDownloadJson');
  const importJsonInput = document.getElementById('desktopImportJsonFile');

  if (!modal || !btnOpen) return;

  let desktopSyncQRPages = [];
  let currentDesktopQRPageIndex = 0;
  let currentDesktopSyncMode = 'patch';

  function renderDesktopQRCanvas(text) {
    if (!canvasContainer) return;
    const qrsync = window.QRSync || (typeof QRSync !== 'undefined' ? QRSync : null);
    if (qrsync && qrsync.renderQR) {
      qrsync.renderQR(canvasContainer, text, { cellSize: 5, margin: 3 });
    } else if (typeof QRCode !== 'undefined') {
      try {
        canvasContainer.innerHTML = '';
        new QRCode(canvasContainer, {
          text: text,
          width: 290,
          height: 290,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: 'L'
        });
      } catch(e) {
        console.error('Lỗi tạo mã QR trên Desktop:', e);
        canvasContainer.innerHTML = `<div style="color:#ef4444; font-size:12px; padding:15px; text-align:center;">⚠️ Lỗi tạo mã: ${e.message || e}</div>`;
      }
    } else {
      canvasContainer.innerHTML = '<div style="color:#ef4444; font-size:12px; padding:20px; text-align:center;">⚠️ Chưa tải được thư viện QRCode (js/qrcode.min.js)!</div>';
    }
  }

  function displayCurrentDesktopQR() {
    if (!desktopSyncQRPages || desktopSyncQRPages.length === 0) {
      if (canvasContainer) {
        canvasContainer.innerHTML = '<div style="color:#64748b; font-size:12px; padding:20px; text-align:center;">Chưa có đơn hàng nào để tạo mã QR!</div>';
      }
      return;
    }
    const text = desktopSyncQRPages[currentDesktopQRPageIndex];
    renderDesktopQRCanvas(text);

    if (desktopSyncQRPages.length > 1) {
      pagingControl.style.display = 'flex';
      pageIndicator.textContent = `Phần ${currentDesktopQRPageIndex + 1} / ${desktopSyncQRPages.length}`;
      btnPrev.disabled = currentDesktopQRPageIndex === 0;
      btnNext.disabled = currentDesktopQRPageIndex === desktopSyncQRPages.length - 1;
      if (guideTip) {
        guideTip.innerHTML = `⚡ Dữ liệu gồm <strong>${desktopSyncQRPages.length} phần</strong>. Dùng điện thoại quét lần lượt từ Phần 1 đến ${desktopSyncQRPages.length}.`;
      }
    } else {
      pagingControl.style.display = 'none';
      if (guideTip) {
        guideTip.innerHTML = `Mở app GHN trên <strong>Điện thoại</strong>, bấm <strong>📷 Quét mã</strong> và hướng camera vào mã QR trên màn hình.`;
      }
    }
  }

  function generateDesktopQR() {
    const qrsync = window.QRSync || (typeof QRSync !== 'undefined' ? QRSync : null);
    if (!qrsync) {
      console.warn('QRSync module chưa sẵn sàng');
      return;
    }

    if (currentDesktopSyncMode === 'patch') {
      desktopSyncQRPages = qrsync.generatePatchQRs(currentOrders, currentGroups, null, 20);
    } else {
      desktopSyncQRPages = qrsync.generateFullQRs(currentOrders, currentGroups, 7);
    }
    currentDesktopQRPageIndex = 0;
    displayCurrentDesktopQR();
  }

  btnOpen.addEventListener('click', () => {
    modal.style.display = 'flex';
    generateDesktopQR();
  });

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });

  syncModeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      currentDesktopSyncMode = e.target.value;
      if (currentDesktopSyncMode === 'patch') {
        optPatchBox.style.borderColor = '#2563eb';
        optPatchBox.style.background = '#eff6ff';
        optFullBox.style.borderColor = 'var(--border-color)';
        optFullBox.style.background = '#f8fafc';
      } else {
        optFullBox.style.borderColor = '#2563eb';
        optFullBox.style.background = '#eff6ff';
        optPatchBox.style.borderColor = 'var(--border-color)';
        optPatchBox.style.background = '#f8fafc';
      }
      generateDesktopQR();
    });
  });

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (currentDesktopQRPageIndex > 0) {
        currentDesktopQRPageIndex--;
        displayCurrentDesktopQR();
      }
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
      if (currentDesktopQRPageIndex < desktopSyncQRPages.length - 1) {
        currentDesktopQRPageIndex++;
        displayCurrentDesktopQR();
      }
    });
  }

  if (btnDownloadJson) {
    btnDownloadJson.addEventListener('click', () => {
      const qrsync = window.QRSync || (typeof QRSync !== 'undefined' ? QRSync : null);
      if (!qrsync) return;
      const jsonStr = qrsync.exportToFileData(currentOrders, currentGroups);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const now = new Date();
      const dateStr = now.getFullYear() + ('0' + (now.getMonth() + 1)).slice(-2) + ('0' + now.getDate()).slice(-2) + '_' + ('0' + now.getHours()).slice(-2) + ('0' + now.getMinutes()).slice(-2);
      const fileName = `GHN_Backup_${dateStr}.json`;

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      showToast(`Đã tải file sao lưu: ${fileName}`, 'success');
    });
  }

  if (importJsonInput) {
    importJsonInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = JSON.parse(evt.target.result);
          if (!data || (!data.orders && !data.groups)) {
            showToast('File không đúng định dạng sao lưu GHN!', 'error');
            return;
          }
          if (Array.isArray(data.orders)) currentOrders = data.orders;
          if (Array.isArray(data.groups)) currentGroups = data.groups;
          ensureGroupIntegrity();
          StorageService.saveOrders(currentOrders);
          StorageService.saveGroups(currentGroups);
          renderApp();
          modal.style.display = 'none';
          showToast(`Đã nạp thành công ${currentOrders.length} đơn và ${currentGroups.length} nhóm!`, 'success');
        } catch(err) {
          showToast(`Lỗi đọc file JSON: ${err.message}`, 'error');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }
}

/**
 * Render toàn bộ giao diện (Thống kê + Danh sách + Bản đồ)
 */
function renderApp() {
  renderStats();
  renderOrderList();
  renderDesktopMap();
}

function renderStats() {
  const total = currentOrders.length;
  const pending = currentOrders.filter(o => o.status === 'pending').length;
  const gtc = currentOrders.filter(o => o.status === 'gtc').length;
  const gtb = currentOrders.filter(o => o.status === 'gtb').length;
  const totalCod = currentOrders.reduce((sum, o) => sum + (o.codAmount || 0), 0);
  const validGps = currentOrders.filter(o => isValidCoordinate(o.lat, o.lng)).length;

  if (statTotal) statTotal.textContent = total;
  if (statPending) statPending.textContent = pending;
  if (statGtc) statGtc.textContent = gtc;
  if (statGtb) statGtb.textContent = gtb;
  if (statCod) statCod.textContent = formatCurrency(totalCod);

  const desktopMapBadge = document.getElementById('desktopMapBadge');
  if (desktopMapBadge) desktopMapBadge.textContent = validGps;
}

// ==========================================================
// HỆ THỐNG BẢN ĐỒ LỘ TRÌNH CHO DESKTOP
// ==========================================================
function isValidCoordinate(lat, lng) {
  if (lat == null || lng == null) return false;
  const nLat = Number(lat);
  const nLng = Number(lng);
  return !isNaN(nLat) && !isNaN(nLng) && nLat > 8.0 && nLat < 24.0 && nLng > 102.0 && nLng < 110.0;
}

function createDesktopMarkerIcon(stt, status, isSelected, clusterCount) {
  const isCluster = clusterCount && clusterCount > 1;
  const badgeHtml = isCluster ? `<span class="ghn-cluster-badge">${clusterCount}</span>` : '';
  return L.divIcon({
    className: 'ghn-div-icon',
    html: `<div class="ghn-map-pin${isCluster ? ' ghn-cluster-pin' : ''} status-${status}${isSelected ? ' active' : ''}">
            <div class="ghn-map-pin-inner">
              <span>#${stt}</span>
            </div>
            ${badgeHtml}
          </div>`,
    iconSize: [32, 38],
    iconAnchor: [16, 38],
    popupAnchor: [0, -36]
  });
}

function setupDesktopViewSwitcher() {
  const btnList = document.getElementById('btnDesktopViewList');
  const btnMap = document.getElementById('btnDesktopViewMap');

  if (btnList) {
    btnList.addEventListener('click', () => switchDesktopView('list'));
  }
  if (btnMap) {
    btnMap.addEventListener('click', () => switchDesktopView('map'));
  }
}

function switchDesktopView(mode) {
  desktopCurrentView = mode;
  const btnList = document.getElementById('btnDesktopViewList');
  const btnMap = document.getElementById('btnDesktopViewMap');
  const ordersListEl = document.getElementById('ordersList');
  const groupBar = document.getElementById('desktopGroupBar');
  const mapContainer = document.getElementById('desktopMapContainer');
  const emptyStateEl = document.getElementById('emptyState');

  if (mode === 'list') {
    if (btnList) btnList.classList.add('active');
    if (btnMap) btnMap.classList.remove('active');
    if (ordersListEl) ordersListEl.style.display = 'flex';
    if (groupBar) groupBar.style.display = 'flex';
    if (mapContainer) mapContainer.style.display = 'none';
    if (currentOrders.length === 0 && emptyStateEl) emptyStateEl.style.display = 'block';
  } else {
    if (btnList) btnList.classList.remove('active');
    if (btnMap) btnMap.classList.add('active');
    if (ordersListEl) ordersListEl.style.display = 'none';
    if (groupBar) groupBar.style.display = 'none';
    if (emptyStateEl) emptyStateEl.style.display = 'none';
    if (mapContainer) mapContainer.style.display = 'flex';

    if (!desktopMap) {
      initDesktopMap();
    }
    setTimeout(() => {
      if (desktopMap) {
        desktopMap.invalidateSize();
        renderDesktopMap();
      }
    }, 150);
  }
}

function initDesktopMap() {
  if (desktopMap) return;
  const mapEl = document.getElementById('desktopDeliveryMap');
  if (!mapEl || typeof L === 'undefined') return;

  desktopMap = L.map('desktopDeliveryMap', {
    center: [10.7769, 106.7009],
    zoom: 14,
    zoomControl: false,
    attributionControl: false
  });

  L.control.zoom({ position: 'bottomright' }).addTo(desktopMap);

  desktopActiveTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    subdomains: ['a', 'b', 'c']
  }).addTo(desktopMap);

  setupDesktopMapControls();
}

function setupDesktopMapControls() {
  const btnLocate = document.getElementById('btnDesktopMapLocate');
  if (btnLocate) {
    btnLocate.addEventListener('click', () => {
      if (!navigator.geolocation) {
        showToast('Trình duyệt không hỗ trợ định vị GPS', 'error');
        return;
      }
      showToast('Đang tìm vị trí GPS của bạn...', 'info');
      navigator.geolocation.getCurrentPosition(pos => {
        const uLat = pos.coords.latitude;
        const uLng = pos.coords.longitude;
        updateDesktopUserMarker(uLat, uLng, pos.coords.accuracy);
        desktopMap.flyTo([uLat, uLng], 16, { duration: 1.2 });
        showToast('Đã định vị vị trí hiện tại của bạn', 'success');
      }, err => {
        showToast('Lỗi GPS: ' + (err.message || 'Không thể xác định vị trí'), 'error');
      }, { enableHighAccuracy: true, timeout: 10000 });
    });
  }

  const btnPoly = document.getElementById('btnDesktopMapPolyline');
  if (btnPoly) {
    btnPoly.addEventListener('click', () => {
      isDesktopPolylineVisible = !isDesktopPolylineVisible;
      btnPoly.classList.toggle('active', isDesktopPolylineVisible);
      renderDesktopMap();
      showToast(isDesktopPolylineVisible ? 'Đã bật đường nối lộ trình' : 'Đã ẩn đường nối lộ trình', 'info');
    });
  }

  const btnFit = document.getElementById('btnDesktopMapFit');
  if (btnFit) {
    btnFit.addEventListener('click', () => {
      const bounds = L.latLngBounds();
      let count = 0;
      currentOrders.forEach(o => {
        if (isValidCoordinate(o.lat, o.lng)) {
          bounds.extend([Number(o.lat), Number(o.lng)]);
          count++;
        }
      });
      if (count > 0 && bounds.isValid() && desktopMap) {
        desktopMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
        showToast(`Đã thu phóng vừa ${count} điểm giao`, 'success');
      } else {
        showToast('Chưa có đơn nào có tọa độ GPS', 'info');
      }
    });
  }

  const btnLayer = document.getElementById('btnDesktopMapLayer');
  if (btnLayer) {
    btnLayer.addEventListener('click', () => {
      if (!desktopMap) return;
      if (desktopMapTileMode === 'osm') {
        desktopMapTileMode = 'satellite';
        desktopMap.removeLayer(desktopActiveTileLayer);
        desktopActiveTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 19
        }).addTo(desktopMap);
        btnLayer.classList.add('active');
        btnLayer.textContent = '🗺️ Đường phố';
        showToast('Đã chuyển sang Bản đồ Vệ tinh', 'info');
      } else {
        desktopMapTileMode = 'osm';
        desktopMap.removeLayer(desktopActiveTileLayer);
        desktopActiveTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          subdomains: ['a', 'b', 'c']
        }).addTo(desktopMap);
        btnLayer.classList.remove('active');
        btnLayer.textContent = '🗺️ Vệ tinh';
        showToast('Đã chuyển sang Bản đồ Đường phố', 'info');
      }
    });
  }
}

function updateDesktopUserMarker(lat, lng, accuracy) {
  if (!desktopMap) return;
  const pos = [lat, lng];
  if (!desktopUserMarker) {
    const icon = L.divIcon({
      className: 'shipper-gps-div-icon',
      html: '<div class="shipper-gps-marker"><div class="shipper-gps-pulse"></div><div class="shipper-gps-dot"></div></div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
    desktopUserMarker = L.marker(pos, { icon, zIndexOffset: 2000 }).addTo(desktopMap);
    desktopUserAccuracy = L.circle(pos, {
      radius: Math.max(accuracy || 20, 15),
      color: '#2563eb',
      fillColor: '#3b82f6',
      fillOpacity: 0.12,
      weight: 1.5
    }).addTo(desktopMap);
  } else {
    desktopUserMarker.setLatLng(pos);
    if (desktopUserAccuracy) {
      desktopUserAccuracy.setLatLng(pos);
      desktopUserAccuracy.setRadius(Math.max(accuracy || 20, 15));
    }
  }
}

function clusterDesktopOrdersByLocation(mappedList) {
  const clusters = [];
  const threshold = 0.00022;

  for (let i = 0; i < mappedList.length; i++) {
    const m = mappedList[i];
    let matched = null;

    // 1. Ưu tiên gom các đơn có cùng locationFingerprint (cùng tòa nhà / cùng địa chỉ)
    const fp = m.item.locationFingerprint;
    if (fp && !fp.startsWith('street_') && !fp.startsWith('raw_')) {
      for (let j = 0; j < clusters.length; j++) {
        if (clusters[j].locationFingerprint === fp) {
          matched = clusters[j];
          break;
        }
      }
    }

    // 2. Nếu chưa gom được theo fingerprint, gom theo khoảng cách tọa độ (< 22m)
    if (!matched) {
      for (let j = 0; j < clusters.length; j++) {
        const c = clusters[j];
        if (Math.hypot(m.lat - c.lat, m.lng - c.lng) <= threshold) {
          matched = c;
          break;
        }
      }
    }

    if (matched) {
      matched.orders.push(m);
    } else {
      clusters.push({
        id: 'd_cluster_' + m.item.id,
        locationFingerprint: fp,
        lat: m.lat,
        lng: m.lng,
        orders: [m]
      });
    }
  }

  clusters.forEach(c => {
    c.count = c.orders.length;
    const allGtc = c.orders.every(o => o.item.status === 'gtc');
    const allGtb = c.orders.every(o => o.item.status === 'gtb');
    c.primaryStatus = allGtc ? 'gtc' : (allGtb ? 'gtb' : 'pending');
    c.primaryStt = c.orders[0].stt;
  });

  return clusters;
}

function renderDesktopMap() {
  if (!desktopMap) {
    if (desktopCurrentView === 'map') initDesktopMap();
    if (!desktopMap) return;
  }

  const mapped = [];
  currentOrders.forEach((item, idx) => {
    if (isValidCoordinate(item.lat, item.lng)) {
      mapped.push({ item, stt: idx + 1, lat: Number(item.lat), lng: Number(item.lng) });
    }
  });

  const dPoints = document.getElementById('dMapPoints');
  const dPending = document.getElementById('dMapPending');
  const dGtc = document.getElementById('dMapGtc');
  if (dPoints) dPoints.textContent = mapped.length;
  if (dPending) dPending.textContent = mapped.filter(m => m.item.status === 'pending').length;
  if (dGtc) dGtc.textContent = mapped.filter(m => m.item.status === 'gtc').length;

  const clusters = clusterDesktopOrdersByLocation(mapped);

  const currentClusterIds = new Set(clusters.map(c => c.id));
  for (const id in desktopMapMarkers) {
    if (!currentClusterIds.has(id)) {
      desktopMap.removeLayer(desktopMapMarkers[id]);
      delete desktopMapMarkers[id];
    }
  }

  const latlngs = [];
  const bounds = L.latLngBounds();

  clusters.forEach(cluster => {
    const pos = [cluster.lat, cluster.lng];
    latlngs.push(pos);
    bounds.extend(pos);

    const isSelected = selectedDesktopOrderId && cluster.orders.some(o => o.item.id === selectedDesktopOrderId);
    const icon = createDesktopMarkerIcon(cluster.primaryStt, cluster.primaryStatus, isSelected, cluster.count);

    let popupContent = '';
    if (cluster.count > 1) {
      popupContent = `
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4; min-width: 260px; max-height: 280px; overflow-y: auto; padding: 2px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 2px solid #f26522; padding-bottom: 4px;">
            <strong style="color: #0f172a;">🏢 ${cluster.count} đơn tại vị trí này</strong>
            <span style="font-size: 11px; background: #eff6ff; color: #1d4ed8; font-weight: 700; padding: 1px 6px; border-radius: 4px;">Cụm</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${cluster.orders.map(o => `
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                  <strong style="color: #001f3f;">#${o.stt} ${escapeHtml(o.item.customerName || 'Khách lẻ')}</strong>
                  <span style="font-size: 10.5px; font-weight: 700; color: ${o.item.status === 'gtc' ? '#15803d' : (o.item.status === 'gtb' ? '#dc2626' : '#d97706')};">
                    ${o.item.status === 'gtc' ? '✓ GTC' : (o.item.status === 'gtb' ? '✕ GTB' : '⏳ Chờ')}
                  </span>
                </div>
                <div style="font-size: 11.5px; color: #475569; margin-bottom: 2px;">${escapeHtml(o.item.address)}</div>
                <div style="font-size: 11.5px; display: flex; justify-content: space-between; align-items: center;">
                  <span>COD: <strong style="color: #f26522;">${formatCurrency(o.item.codAmount)}</strong></span>
                  ${o.item.phone ? `<a href="tel:${o.item.phone}" style="color: #0284c7; text-decoration: none; font-weight: 700;">📞 Gọi</a>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
          <div style="margin-top: 8px; text-align: center;">
            <a href="https://www.google.com/maps/dir/?api=1&destination=${cluster.lat},${cluster.lng}" target="_blank" style="background: #f0fdf4; color: #15803d; padding: 5px 10px; border-radius: 4px; text-decoration: none; font-weight: 700; font-size: 11.5px; display: inline-block;">
              🧭 Chỉ đường đến tòa nhà này
            </a>
          </div>
        </div>
      `;
    } else {
      const o = cluster.orders[0];
      const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`;
      const statusText = o.item.status === 'gtc' ? '✓ Giao thành công (GTC)' : (o.item.status === 'gtb' ? '✕ Giao thất bại (GTB)' : '⏳ Chờ giao hàng');
      popupContent = `
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4; min-width: 220px; padding: 2px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
            <strong style="background: #001f3f; color: #fff; padding: 2px 7px; border-radius: 4px; font-size: 12px;">#${o.stt}</strong>
            <span style="font-size: 11px; font-weight: 700; color: ${o.item.status === 'gtc' ? '#15803d' : (o.item.status === 'gtb' ? '#dc2626' : '#d97706')};">${statusText}</span>
          </div>
          <div style="font-weight: 800; font-size: 14px; color: #0f172a; margin-bottom: 3px;">${escapeHtml(o.item.customerName || 'Khách lẻ')}</div>
          <div style="font-size: 11.5px; color: #64748b; margin-bottom: 4px;">Mã: <code style="color: #2563eb;">${escapeHtml(o.item.trackingCode)}</code></div>
          <div style="font-size: 12px; color: #334155; margin-bottom: 6px;">📍 ${escapeHtml(o.item.address)}</div>
          <div style="background: #f8fafc; padding: 4px 8px; border-radius: 4px; margin-bottom: 8px; font-size: 12px;">
            Thu COD: <strong style="color: #f26522;">${formatCurrency(o.item.codAmount)}</strong>
            ${o.item.gtbThu ? `<br>GTB thu: <strong style="color: #dc2626;">${formatCurrency(o.item.gtbThu)}</strong>` : ''}
          </div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            ${o.item.phone ? `<a href="tel:${o.item.phone}" style="background: #e0f2fe; color: #0369a1; padding: 5px 8px; border-radius: 4px; text-decoration: none; font-weight: 700; font-size: 11px;">📞 Gọi ${o.item.phone}</a>` : ''}
            <a href="${gmapsUrl}" target="_blank" style="background: #f0fdf4; color: #15803d; padding: 5px 8px; border-radius: 4px; text-decoration: none; font-weight: 700; font-size: 11px;">🧭 Dẫn đường</a>
          </div>
        </div>
      `;
    }

    if (desktopMapMarkers[cluster.id]) {
      desktopMapMarkers[cluster.id].setLatLng(pos);
      desktopMapMarkers[cluster.id].setIcon(icon);
      desktopMapMarkers[cluster.id].setPopupContent(popupContent);
    } else {
      const marker = L.marker(pos, { icon });
      marker.bindPopup(popupContent, { maxWidth: 320 });
      marker.addTo(desktopMap);
      desktopMapMarkers[cluster.id] = marker;
    }
  });

  if (desktopRoutePolyline) {
    desktopMap.removeLayer(desktopRoutePolyline);
    desktopRoutePolyline = null;
  }

  if (isDesktopPolylineVisible && latlngs.length >= 2) {
    desktopRoutePolyline = L.polyline(latlngs, {
      color: '#f26522',
      weight: 3.5,
      opacity: 0.82,
      dashArray: '7, 9',
      lineJoin: 'round'
    }).addTo(desktopMap);
  }

  if (mapped.length > 0 && bounds.isValid() && !selectedDesktopOrderId) {
    desktopMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }
}

function jumpToDesktopMapOrder(orderId) {
  switchDesktopView('map');
  setTimeout(() => {
    const item = currentOrders.find(o => o.id === orderId);
    if (!item) return;
    if (isValidCoordinate(item.lat, item.lng)) {
      selectedDesktopOrderId = orderId;
      renderDesktopMap();
      if (desktopMap) {
        desktopMap.flyTo([Number(item.lat), Number(item.lng)], 16, { duration: 0.8 });
        const mapped = [];
        currentOrders.forEach((it, idx) => {
          if (isValidCoordinate(it.lat, it.lng)) {
            mapped.push({ item: it, stt: idx + 1, lat: Number(it.lat), lng: Number(it.lng) });
          }
        });
        const clusters = clusterDesktopOrdersByLocation(mapped);
        const targetCluster = clusters.find(c => c.orders.some(o => o.item.id === orderId));
        if (targetCluster && desktopMapMarkers[targetCluster.id]) {
          desktopMapMarkers[targetCluster.id].openPopup();
        }
      }
    } else {
      showToast('Đơn này chưa có tọa độ GPS để hiển thị trên bản đồ', 'info');
    }
  }, 180);
}

/**
 * Render danh sách đơn hàng gom nhóm theo Tuyến/Tòa nhà
 */
function renderOrderList() {
  ordersListEl.innerHTML = '';

  let filtered = currentOrders.filter(order => {
    if (activeFilter !== 'all' && order.status !== activeFilter) return false;
    if (searchQuery) {
      const g = currentGroups.find(item => item.id === order.groupId);
      const gName = g ? g.name.toLowerCase() : '';
      const matchTracking = (order.trackingCode || '').toLowerCase().includes(searchQuery);
      const matchName = (order.customerName || '').toLowerCase().includes(searchQuery);
      const matchPhone = (order.phone || '').toLowerCase().includes(searchQuery);
      const matchAddress = (order.address || '').toLowerCase().includes(searchQuery);
      const matchNotes = (order.notes || '').toLowerCase().includes(searchQuery);
      return matchTracking || matchName || matchPhone || matchAddress || matchNotes || gName.includes(searchQuery);
    }
    return true;
  });

  if (filtered.length === 0) {
    emptyStateEl.style.display = 'block';
    return;
  }

  emptyStateEl.style.display = 'none';

  // Render từng nhóm
  currentGroups.forEach(group => {
    const ordersInGroup = filtered.filter(o => (o.groupId || 'group_ungrouped') === group.id);
    if (ordersInGroup.length === 0 && group.id === 'group_ungrouped' && currentGroups.length > 1) {
      return;
    }

    const gTotalCod = ordersInGroup.reduce((sum, o) => sum + (o.codAmount || 0), 0);
    const gPending = ordersInGroup.filter(o => o.status === 'pending').length;
    const gGtc = ordersInGroup.filter(o => o.status === 'gtc').length;
    const gGtb = ordersInGroup.filter(o => o.status === 'gtb').length;

    const groupWrapper = document.createElement('div');
    groupWrapper.className = `group-wrapper ${group.isCollapsed ? 'collapsed' : ''}`;

    // Header của Nhóm (Accordion)
    const headerEl = document.createElement('div');
    headerEl.className = 'group-header';
    headerEl.innerHTML = `
      <div class="group-header-info">
        <span class="group-arrow">${group.isCollapsed ? '▶' : '▼'}</span>
        <span>📁 ${escapeHtml(group.name)}</span>
        <span class="group-count-tag">${ordersInGroup.length} đơn</span>
        <span class="group-cod-tag">${formatCurrency(gTotalCod)}</span>
      </div>
      <div class="group-header-stats">
        <span class="group-stat-mini pending">${gPending} chờ</span>
        <span class="group-stat-mini gtc">${gGtc} GTC</span>
        <span class="group-stat-mini gtb">${gGtb} GTB</span>
        ${group.id !== 'group_ungrouped' ? `
          <button class="group-btn-tool btn-rename-grp" title="Đổi tên nhóm">✏️</button>
          <button class="group-btn-tool btn-del-grp" title="Xóa nhóm">🗑</button>
        ` : ''}
      </div>
    `;

    headerEl.addEventListener('click', (e) => {
      if (e.target.closest('.group-btn-tool')) return;
      toggleGroupCollapse(group.id);
    });

    const btnRen = headerEl.querySelector('.btn-rename-grp');
    if (btnRen) {
      btnRen.addEventListener('click', (e) => {
        e.stopPropagation();
        renameGroup(group.id);
      });
    }

    const btnDel = headerEl.querySelector('.btn-del-grp');
    if (btnDel) {
      btnDel.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteGroup(group.id);
      });
    }

    groupWrapper.appendChild(headerEl);

    // Danh sách đơn hàng trong nhóm
    if (!group.isCollapsed) {
      const itemsContainer = document.createElement('div');
      itemsContainer.className = 'group-items-container';

      ordersInGroup.forEach(order => {
        const originalIndex = currentOrders.findIndex(o => o.id === order.id);
        const routeNumber = originalIndex + 1;
        const cardEl = createOrderCard(order, routeNumber, originalIndex, currentOrders.length, group.name);
        itemsContainer.appendChild(cardEl);
      });

      groupWrapper.appendChild(itemsContainer);
    }

    ordersListEl.appendChild(groupWrapper);
  });
}

/**
 * Tạo phần tử Card cho một đơn hàng
 */
function createOrderCard(order, routeNumber, originalIndex, totalOrders, groupName) {
  const card = document.createElement('div');
  card.className = `order-card status-${order.status}`;
  card.setAttribute('data-id', order.id);
  card.draggable = true;

  let statusText = 'Chờ giao';
  let statusClass = 'pending';
  if (order.status === 'gtc') {
    statusText = 'GTC (Thành công)';
    statusClass = 'gtc';
  } else if (order.status === 'gtb') {
    statusText = 'GTB (Thất bại)';
    statusClass = 'gtb';
  }

  const hasGps = isValidCoordinate(order.lat, order.lng);
  const isMissingNum = order.hasHouseNumber === false;
  const isHealed = !!order.isGpsHealed;
  const isOutlier = !!order.isGpsOutlier;
  const secPhone = order.secondaryPhone && order.secondaryPhone !== order.phone ? order.secondaryPhone : null;
  const mapsUrl = hasGps 
    ? `https://www.google.com/maps/dir/?api=1&destination=${order.lat},${order.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address || '')}`;

  card.innerHTML = `
    <!-- Cột sắp xếp & Drag Handle -->
    <div class="order-reorder-col">
      <div class="drag-handle" title="Kéo để đổi thứ tự lộ trình">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="9" cy="5" r="1"></circle>
          <circle cx="9" cy="12" r="1"></circle>
          <circle cx="9" cy="19" r="1"></circle>
          <circle cx="15" cy="5" r="1"></circle>
          <circle cx="15" cy="12" r="1"></circle>
          <circle cx="15" cy="19" r="1"></circle>
        </svg>
      </div>
      <span class="route-badge" title="Thứ tự giao hàng">#${routeNumber}</span>
      <div class="move-buttons">
        <button class="btn-move btn-move-up" title="Di chuyển lên" ${originalIndex === 0 ? 'disabled' : ''}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
        <button class="btn-move btn-move-down" title="Di chuyển xuống" ${originalIndex === totalOrders - 1 ? 'disabled' : ''}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>
    </div>

    <!-- Thông tin chi tiết đơn hàng -->
    <div class="order-info">
      <div class="order-row-header">
        <span class="tracking-code" title="Bấm để sao chép mã vận đơn">
          ${escapeHtml(order.trackingCode || 'CHƯA CÓ MÃ')}
          <svg class="copy-hint-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </span>
        <span class="status-badge ${statusClass}">${statusText}</span>
        ${isMissingNum ? `<span class="badge-geo-alert missing" title="Địa chỉ thiếu số nhà cụ thể (chỉ có tên đường/phường). Hãy gọi khách khi tới gần!">⚠️ Thiếu số</span>` : ''}
        ${isHealed ? `<span class="badge-geo-alert healed" title="Tọa độ đã được hệ thống tự động nắn chuẩn">⚡ Đã nắn GPS</span>` : ''}
        ${isOutlier ? `<span class="badge-geo-alert outlier" title="Tọa độ bị lệch > ${order.gpsOutlierDist || 1000}m so với tuyến đường">⚠️ Lệch GPS</span>` : ''}
        <div class="order-price-group">
          <span class="cod-badge" title="Tiền thu hộ / Phải thu">${formatCurrency(order.codAmount)}</span>
          ${order.gtbThu ? `<span class="gtb-badge" title="Tiền thu khi Giao Thất Bại (GTB)">GTB: ${formatCurrency(order.gtbThu)}</span>` : ''}
        </div>
      </div>

      <div class="order-recipient">
        <span class="customer-name">${escapeHtml(order.customerName || 'Khách hàng')}</span>
        ${order.phone ? `
          <a href="tel:${order.phone}" class="customer-phone" title="Gọi điện cho khách">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
            ${order.phone}
          </a>
        ` : ''}
        ${secPhone ? `
          <a href="tel:${secPhone}" class="customer-phone sec-phone" title="Số điện thoại phụ bóc tách từ địa chỉ">
            📞 Phụ: ${secPhone}
          </a>
        ` : ''}
        <span class="order-group-select-badge" title="Bấm để chuyển nhóm">📁 ${escapeHtml(groupName || 'Chưa phân nhóm')}</span>
      </div>

      <div class="order-address">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
        <span>
          ${escapeHtml(order.address || 'Không có địa chỉ')}
          ${hasGps ? `
            <button type="button" class="btn-desktop-jump-map" data-order-id="${order.id}" title="Xem vị trí trên bản đồ lộ trình">
              🗺️ Bản đồ
            </button>
          ` : ''}
          ${order.address || hasGps ? `
            <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="maps-link" title="Dẫn đường Google Maps">
              🧭 Chỉ đường ↗
            </a>
          ` : ''}
        </span>
      </div>

      ${order.notes ? `
        <div class="order-note-alert">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <span>${escapeHtml(order.notes)}</span>
        </div>
      ` : ''}
    </div>

    <!-- Cột thao tác GTB / GTC và Xóa -->
    <div class="order-actions-col">
      <div class="gtb-gtc-group">
        <button class="btn-status-gtc ${order.status === 'gtc' ? 'active' : ''}" title="Giao thành công">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          GTC
        </button>
        <button class="btn-status-gtb ${order.status === 'gtb' ? 'active' : ''}" title="Giao thất bại">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
          GTB
        </button>
      </div>
      <div class="order-sub-actions">
        <button class="btn-icon-del" title="Xóa đơn này">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>
  `;

  // GTC
  const btnGtc = card.querySelector('.btn-status-gtc');
  btnGtc.addEventListener('click', (e) => {
    e.stopPropagation();
    const newStatus = order.status === 'gtc' ? 'pending' : 'gtc';
    currentOrders = StorageService.updateOrderStatus(order.id, newStatus);
    renderApp();
    showToast(newStatus === 'gtc' ? 'Đã đánh dấu: Giao thành công (GTC)' : 'Đã chuyển về: Chờ giao', 'success');
  });

  // GTB
  const btnGtb = card.querySelector('.btn-status-gtb');
  btnGtb.addEventListener('click', (e) => {
    e.stopPropagation();
    const newStatus = order.status === 'gtb' ? 'pending' : 'gtb';
    currentOrders = StorageService.updateOrderStatus(order.id, newStatus);
    renderApp();
    if (newStatus === 'gtb') {
      const gtbMsg = order.gtbThu ? `Đã đánh dấu: GTB (Cần thu: ${formatCurrency(order.gtbThu)})` : 'Đã đánh dấu: Giao thất bại (GTB)';
      showToast(gtbMsg, 'error');
    } else {
      showToast('Đã chuyển về: Chờ giao', 'info');
    }
  });

  // Xóa đơn
  const btnDel = card.querySelector('.btn-icon-del');
  btnDel.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm(`Bạn có chắc muốn xóa đơn hàng ${order.trackingCode}?`)) {
      currentOrders = StorageService.deleteOrder(order.id);
      renderApp();
      showToast('Đã xóa đơn hàng khỏi danh sách!', 'info');
    }
  });

  // Đổi nhóm
  const grpBadge = card.querySelector('.order-group-select-badge');
  if (grpBadge) {
    grpBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      promptChangeOrderGroup(order.id);
    });
  }

  // Sao chép mã vận đơn
  const trackingEl = card.querySelector('.tracking-code');
  trackingEl.addEventListener('click', () => {
    if (order.trackingCode) {
      navigator.clipboard.writeText(order.trackingCode).then(() => {
        showToast(`Đã sao chép: ${order.trackingCode}`, 'info');
      });
    }
  });

  // Nhảy tới vị trí trên Bản đồ lộ trình
  const btnJump = card.querySelector('.btn-desktop-jump-map');
  if (btnJump) {
    btnJump.addEventListener('click', (e) => {
      e.stopPropagation();
      jumpToDesktopMapOrder(order.id);
    });
  }

  // Nút di chuyển lên/xuống
  const btnUp = card.querySelector('.btn-move-up');
  const btnDown = card.querySelector('.btn-move-down');

  btnUp.addEventListener('click', (e) => {
    e.stopPropagation();
    if (originalIndex > 0) {
      const [movedItem] = currentOrders.splice(originalIndex, 1);
      currentOrders.splice(originalIndex - 1, 0, movedItem);
      StorageService.reorderOrders(currentOrders);
      renderOrderList();
    }
  });

  btnDown.addEventListener('click', (e) => {
    e.stopPropagation();
    if (originalIndex < totalOrders - 1) {
      const [movedItem] = currentOrders.splice(originalIndex, 1);
      currentOrders.splice(originalIndex + 1, 0, movedItem);
      StorageService.reorderOrders(currentOrders);
      renderOrderList();
    }
  });

  // Kéo thả sắp xếp (Drag & Drop)
  setupDragAndDrop(card, order.id);

  return card;
}

function setupDragAndDrop(card, orderId) {
  card.addEventListener('dragstart', (e) => {
    draggedOrderId = orderId;
    e.dataTransfer.setData('text/plain', orderId);
    card.classList.add('dragging');
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedOrderId = null;
    document.querySelectorAll('.order-card').forEach(el => el.classList.remove('drag-over'));
  });

  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (draggedOrderId !== orderId) {
      card.classList.add('drag-over');
    }
  });

  card.addEventListener('dragleave', () => {
    card.classList.remove('drag-over');
  });

  card.addEventListener('drop', (e) => {
    e.preventDefault();
    card.classList.remove('drag-over');

    const sourceId = e.dataTransfer.getData('text/plain') || draggedOrderId;
    const targetId = orderId;

    if (!sourceId || sourceId === targetId) return;

    const fromIndex = currentOrders.findIndex(o => o.id === sourceId);
    const toIndex = currentOrders.findIndex(o => o.id === targetId);

    if (fromIndex !== -1 && toIndex !== -1) {
      const [movedItem] = currentOrders.splice(fromIndex, 1);
      currentOrders.splice(toIndex, 0, movedItem);
      StorageService.reorderOrders(currentOrders);
      renderOrderList();
      showToast('Đã cập nhật thứ tự lộ trình giao hàng!', 'info');
    }
  });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
