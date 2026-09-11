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
  extractStreetAndHouseNumber,
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
let activeTripFilter = 'all'; // Lọc theo mã chuyến
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
let targetUpdateOrder = null;
let currentDesktopSyncTrip = 'all';

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

  // Dọn dẹp các nhóm không còn bất kỳ đơn nào trong currentOrders (ngoại trừ group_ungrouped)
  const usedGroupIds = new Set(currentOrders.map(o => o.groupId).filter(Boolean));
  currentGroups = currentGroups.filter(g => g.id === 'group_ungrouped' || usedGroupIds.has(g.id));

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
  StorageService.saveGroups(currentGroups);
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

  // Bộ lọc theo Mã Chuyến
  setupDesktopTripFilter();

  // Modal Sửa vị trí định vị
  setupDesktopUpdateLocationModal();

  // Modal Danh sách đơn thiếu GPS
  setupDesktopUnmappedModal();

  // Modal AI 9Router Tối Ưu Lộ Trình
  setupDesktopAiRouteModal();
}

/**
 * Xử lý Modal Dọn dẹp & Quản lý đơn hàng (Xóa toàn bộ, xóa theo chuyến, hoặc xóa đơn đã xử lý)
 */
function setupCleanModal() {
  if (!btnOpenCleanModal || !cleanModal) return;

  const cleanTripSelect = document.getElementById('cleanTripSelect');
  const cleanPendingCount = document.getElementById('cleanPendingCount');
  const cleanFinishedCount = document.getElementById('cleanFinishedCount');
  const cleanAllTotalCount = document.getElementById('cleanAllTotalCount');

  btnOpenCleanModal.addEventListener('click', () => {
    if (currentOrders.length === 0) {
      showToast('Danh sách đơn đang trống, không có dữ liệu để dọn dẹp!', 'info');
      return;
    }

    const totalOrders = currentOrders.length;
    const finishedCount = currentOrders.filter(o => o.status === 'gtc' || o.status === 'gtb').length;
    const pendingCount = currentOrders.filter(o => o.status === 'pending').length;

    if (cleanAllTotalCount) cleanAllTotalCount.textContent = totalOrders;
    if (cleanFinishedCount) cleanFinishedCount.textContent = finishedCount;
    if (cleanPendingCount) cleanPendingCount.textContent = pendingCount;

    // Danh sách mã chuyến
    const tripCounts = {};
    currentOrders.forEach(o => {
      const tc = o.tripCode || 'Chưa có mã chuyến';
      tripCounts[tc] = (tripCounts[tc] || 0) + 1;
    });

    const tripKeys = Object.keys(tripCounts).sort();
    if (cleanTripSelect) {
      let tripOptionsHtml = '';
      tripKeys.forEach(k => {
        tripOptionsHtml += `<option value="${escapeHtml(k)}">Chuyến ${escapeHtml(k)} (${tripCounts[k]} đơn)</option>`;
      });
      cleanTripSelect.innerHTML = tripOptionsHtml;

      // Ưu tiên chọn chuyến đang lọc nếu có
      if (activeTripFilter !== 'all' && tripKeys.includes(activeTripFilter)) {
        cleanTripSelect.value = activeTripFilter;
        const rTrip = document.querySelector('input[name="cleanMode"][value="trip"]');
        if (rTrip) rTrip.checked = true;
      } else {
        const rDefault = finishedCount > 0 
          ? document.querySelector('input[name="cleanMode"][value="finished"]')
          : document.querySelector('input[name="cleanMode"][value="all"]');
        if (rDefault) rDefault.checked = true;
      }
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
      const modeRadio = document.querySelector('input[name="cleanMode"]:checked');
      const selectedMode = modeRadio ? modeRadio.value : 'finished';

      if (selectedMode === 'all') {
        const total = currentOrders.length;
        if (confirm(`⚠️ CẢNH BÁO QUAN TRỌNG:\nBạn có chắc chắn muốn XÓA SẠCH TOÀN BỘ ${total} đơn hàng trong hệ thống?\nHành động này không thể hoàn tác!`)) {
          currentOrders = [];
          currentGroups = [{ id: 'group_ungrouped', name: 'Chưa phân nhóm', isCollapsed: false }];
          StorageService.saveOrders(currentOrders);
          StorageService.saveGroups(currentGroups);
          cleanModal.classList.remove('show');
          activeTripFilter = 'all';
          renderApp();
          showToast(`🔥 Đã xóa sạch toàn bộ ${total} đơn hàng trong hệ thống!`, 'success');
        }
      } else if (selectedMode === 'trip') {
        if (!cleanTripSelect || !cleanTripSelect.value) {
          showToast('Vui lòng chọn mã chuyến cần xóa!', 'error');
          return;
        }
        const tripToDelete = cleanTripSelect.value;
        const countToDelete = currentOrders.filter(o => (o.tripCode || 'Chưa có mã chuyến') === tripToDelete).length;
        if (confirm(`Bạn có chắc muốn xóa toàn bộ ${countToDelete} đơn hàng của chuyến "${tripToDelete}" không?\nCác đơn của các chuyến khác sẽ được giữ nguyên.`)) {
          currentOrders = currentOrders.filter(o => (o.tripCode || 'Chưa có mã chuyến') !== tripToDelete);
          StorageService.saveOrders(currentOrders);
          ensureGroupIntegrity();
          cleanModal.classList.remove('show');
          if (activeTripFilter === tripToDelete) {
            activeTripFilter = 'all';
          }
          renderApp();
          showToast(`⚡ Đã xóa toàn bộ ${countToDelete} đơn của chuyến ${tripToDelete}!`, 'success');
        }
      } else if (selectedMode === 'finished') {
        const finishedCount = currentOrders.filter(o => o.status === 'gtc' || o.status === 'gtb').length;
        if (finishedCount === 0) {
          showToast('Không có đơn nào đã xử lý (GTC hoặc GTB) để dọn dẹp!', 'info');
          return;
        }
        const pendingCount = currentOrders.filter(o => o.status === 'pending').length;
        if (confirm(`Dọn dẹp ${finishedCount} đơn hàng đã hoàn tất (GTC/GTB)?\n${pendingCount} đơn chờ giao vẫn sẽ được giữ lại.`)) {
          currentOrders = currentOrders.filter(o => o.status === 'pending');
          StorageService.saveOrders(currentOrders);
          ensureGroupIntegrity();
          cleanModal.classList.remove('show');
          renderApp();
          showToast(`✓ Đã dọn dẹp ${finishedCount} đơn hàng đã giao xong!`, 'success');
        }
      }
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
            activeTripFilter = result.tripCode;
          } else {
            currentOrders = [...currentOrders, ...result.orders];
            activeTripFilter = result.tripCode;
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
  const btnSortStreet = document.getElementById('btnDesktopSortStreet');
  if (btnSortStreet) {
    btnSortStreet.addEventListener('click', sortOrdersByStreetAndHouseNumber);
  }
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

/**
 * Tự động sắp xếp lộ trình theo Tuyến đường & Số nhà liên tục
 */
function sortOrdersByStreetAndHouseNumber() {
  const targetOrders = getActiveTripOrders();
  if (targetOrders.length <= 1) {
    showToast('Chưa có đủ đơn để sắp xếp lộ trình!', 'info');
    return;
  }

  const analyzed = targetOrders.map((o, idx) => {
    const info = extractStreetAndHouseNumber(o.address);
    return {
      order: o,
      origIdx: idx,
      street: info.street,
      clusterGroup: info.clusterGroup,
      houseNumber: info.houseNumber,
      houseNumVal: info.houseNumVal,
      shortStreet: info.shortStreet
    };
  });

  const streetMap = {};
  const streetOrder = [];

  analyzed.forEach(item => {
    const st = item.street;
    if (!streetMap[st]) {
      streetMap[st] = {
        street: st,
        clusterGroup: item.clusterGroup,
        items: [],
        firstIdx: item.origIdx
      };
      streetOrder.push(st);
    }
    streetMap[st].items.push(item);
  });

  streetOrder.sort((a, b) => {
    if (a === 'Chưa rõ đường') return 1;
    if (b === 'Chưa rõ đường') return -1;
    return streetMap[a].firstIdx - streetMap[b].firstIdx;
  });

  const sortedSubOrders = [];

  streetOrder.forEach(stKey => {
    const grpObj = streetMap[stKey];
    grpObj.items.sort((a, b) => {
      if (a.houseNumVal !== b.houseNumVal) {
        return a.houseNumVal - b.houseNumVal;
      }
      return a.origIdx - b.origIdx;
    });

    // Tìm nhóm đã tồn tại trong currentGroups hoặc tạo mới
    let targetGroup = currentGroups.find(g => 
      g.id !== 'group_ungrouped' && 
      g.name.trim().toLowerCase() === grpObj.clusterGroup.trim().toLowerCase()
    );

    if (!targetGroup) {
      const gId = 'grp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
      targetGroup = {
        id: gId,
        name: grpObj.clusterGroup,
        isCollapsed: false
      };
      currentGroups.push(targetGroup);
    }

    grpObj.items.forEach(it => {
      it.order.groupId = targetGroup.id;
      sortedSubOrders.push(it.order);
    });
  });

  if (activeTripFilter === 'all') {
    currentOrders = sortedSubOrders;
  } else {
    const otherOrders = currentOrders.filter(o => (o.tripCode || 'Chưa có mã chuyến') !== activeTripFilter);
    currentOrders = [...otherOrders, ...sortedSubOrders];
  }

  // Dọn dẹp các nhóm không còn bất kỳ đơn hàng nào trong toàn bộ currentOrders
  const usedGroupIds = new Set(currentOrders.map(o => o.groupId).filter(Boolean));
  currentGroups = currentGroups.filter(g => g.id === 'group_ungrouped' || usedGroupIds.has(g.id));

  StorageService.saveOrders(currentOrders);
  StorageService.saveGroups(currentGroups);
  renderApp();
  showToast(`⚡ Đã sắp xếp lộ trình tuần tự theo ${streetOrder.length} tuyến đường & số nhà liên tục!`, 'success');
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
  const targetOrders = getActiveTripOrders();
  if (targetOrders.length === 0) {
    showToast('Chưa có đơn hàng nào để gom nhóm!', 'info');
    return;
  }

  targetOrders.forEach(o => {
    const cName = extractClusterName(o.address);
    if (cName === 'Chưa phân nhóm') {
      o.groupId = 'group_ungrouped';
      return;
    }

    let existing = currentGroups.find(g => g.id !== 'group_ungrouped' && g.name.trim().toLowerCase() === cName.trim().toLowerCase());
    if (!existing) {
      const gId = 'grp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
      existing = { id: gId, name: cName, isCollapsed: false };
      currentGroups.push(existing);
    }
    o.groupId = existing.id;
  });

  // Dọn dẹp nhóm không còn bất kỳ đơn nào trong toàn bộ currentOrders
  const usedGroupIds = new Set(currentOrders.map(o => o.groupId).filter(Boolean));
  currentGroups = currentGroups.filter(g => g.id === 'group_ungrouped' || usedGroupIds.has(g.id));

  StorageService.saveGroups(currentGroups);
  StorageService.saveOrders(currentOrders);
  renderApp();
  showToast(`Đã tự động gom nhóm địa chỉ cho chuyến hiện tại!`, 'success');
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
          fps: 24,
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

  let desktopSyncMultiPartCache = { sid: null, type: null, pTotal: 1, parts: {} };

  const closeDesktopScanner = () => {
    modal.classList.remove('show');
    if (desktopHtml5QrCode && desktopHtml5QrCode.isScanning) {
      desktopHtml5QrCode.stop().catch(() => {});
    }
    desktopSyncMultiPartCache = { sid: null, type: null, pTotal: 1, parts: {} };
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
        // Hỗ trợ chia nhiều phần nếu danh sách dài
        const pIndex = payload.pIndex || payload.part || payload.i || 1;
        const pTotal = payload.pTotal || payload.total || payload.n || 1;
        if (pTotal > 1) {
          const sid = payload.sid || 's';

          if (desktopSyncMultiPartCache.sid !== sid || desktopSyncMultiPartCache.pTotal !== pTotal) {
            desktopSyncMultiPartCache = { sid: sid, type: payload.t, pTotal: pTotal, parts: {} };
          }

          const isNewPart = !desktopSyncMultiPartCache.parts[pIndex];
          desktopSyncMultiPartCache.parts[pIndex] = payload;
          const receivedCount = Object.keys(desktopSyncMultiPartCache.parts).length;

          if (receivedCount < pTotal) {
            if (isNewPart) {
              const missingParts = [];
              for (let mi = 1; mi <= pTotal; mi++) {
                if (!desktopSyncMultiPartCache.parts[mi]) missingParts.push(mi);
              }
              showToast(`🟢 Đã nhận ${receivedCount}/${pTotal} phần! Còn thiếu: ${missingParts.join(', ')}`, 'info');
              statusMsg.innerHTML = `🟢 Đã nhận <strong>${receivedCount}/${pTotal} phần</strong>.<br><span style="color:#f59e0b; font-size:12px; font-weight:700;">👉 Còn thiếu: Phần ${missingParts.join(', ')}</span>`;
            }
            return;
          }

          // Đã đủ các phần
          closeDesktopScanner();
          if (payload.t === 'patch') {
            let allPatches = [];
            let allGroups = [];
            for (let pi = 1; pi <= pTotal; pi++) {
              const part = desktopSyncMultiPartCache.parts[pi];
              if (part) {
                if (part.g && part.g.length) allGroups = allGroups.concat(part.g);
                if (part.p && part.p.length) allPatches = allPatches.concat(part.p);
              }
            }
            const res = qrsync.applyPatch({ v: payload.v || 2, g: allGroups, p: allPatches }, currentOrders, currentGroups);
            currentOrders = res.orders;
            currentGroups = res.groups;
            StorageService.saveOrders(currentOrders);
            StorageService.saveGroups(currentGroups);
            renderApp();
            showToast(`🎉 Đã đồng bộ tọa độ & nhóm cho ${res.matchedCount} đơn!`, 'success');
          } else if (payload.t === 'full') {
            let allOrders = [];
            let allGroups = [];
            for (let pi = 1; pi <= pTotal; pi++) {
              const part = desktopSyncMultiPartCache.parts[pi];
              if (part) {
                if (part.g && part.g.length) allGroups = allGroups.concat(part.g);
                if (part.o && part.o.length) allOrders = allOrders.concat(part.o);
              }
            }
            const res = qrsync.applyFull({ v: payload.v || 2, g: allGroups, o: allOrders }, currentOrders, currentGroups, false);
            currentOrders = res.orders;
            currentGroups = res.groups;
            ensureGroupIntegrity();
            StorageService.saveOrders(currentOrders);
            StorageService.saveGroups(currentGroups);
            renderApp();
            showToast(`🎉 Đã nạp thành công ${res.importedCount} đơn từ mã QR!`, 'success');
          }
          desktopSyncMultiPartCache = { sid: null, type: null, pTotal: 1, parts: {} };
          return;
        }

        // 1 phần duy nhất
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
 * Xử lý Modal Đồng Bộ Sang Mobile (P2P Siêu Tốc & Mã PIN)
 */
function setupDesktopQrSync() {
  const modal = document.getElementById('desktopQrSyncModal');
  const btnOpen = document.getElementById('btnOpenQrSyncModalDesktop');
  const btnClose = document.getElementById('btnCloseDesktopQrSyncModal');
  const optPatchBox = document.getElementById('desktopOptPatchBox');
  const optFullBox = document.getElementById('desktopOptFullBox');
  const syncModeRadios = document.querySelectorAll('input[name="desktopSyncMode"]');
  const btnDownloadJson = document.getElementById('btnDesktopDownloadJson');
  const importJsonInput = document.getElementById('desktopImportJsonFile');

  const desktopP2PCanvasContainer = document.getElementById('desktopP2PCanvasContainer');
  const desktopP2PHostPinValue = document.getElementById('desktopP2PHostPinValue');
  const desktopP2PHostStatusText = document.getElementById('desktopP2PHostStatusText');

  const syncTripSelect = document.getElementById('desktopSyncTripSelect');
  const tabExport = document.getElementById('tabDesktopExportP2P');
  const tabImport = document.getElementById('tabDesktopImportP2P');
  const hostPanel = document.getElementById('desktopP2PHostPanel');
  const clientPanel = document.getElementById('desktopP2PClientPanel');
  const btnConnectPin = document.getElementById('desktopBtnConnectP2PPin');
  const inputPin = document.getElementById('desktopInputP2PPin');
  const clientStatus = document.getElementById('desktopP2PClientStatusMsg');

  if (!modal || !btnOpen) return;

  let desktopP2PHost = null;
  let currentDesktopSyncMode = 'patch';

  function stopDesktopP2PHost() {
    if (desktopP2PHost) {
      try { desktopP2PHost.destroy(); } catch(e) {}
      desktopP2PHost = null;
    }
  }

  function startDesktopP2PHost() {
    stopDesktopP2PHost();
    const p2pSync = window.P2PSync || (typeof P2PSync !== 'undefined' ? P2PSync : null);
    if (!p2pSync) {
      if (desktopP2PHostStatusText) desktopP2PHostStatusText.innerHTML = '⚠️ Module P2P chưa sẵn sàng!';
      return;
    }

    if (desktopP2PHostStatusText) {
      desktopP2PHostStatusText.innerHTML = '<span class="pulse-dot"></span> ⏳ Đang mở phòng chờ Shipper...';
    }

    desktopP2PHost = p2pSync.createHost({
      onReady: (roomInfo) => {
        if (desktopP2PHostPinValue) desktopP2PHostPinValue.textContent = roomInfo.pin;
        if (desktopP2PHostStatusText) {
          desktopP2PHostStatusText.innerHTML = `<span class="pulse-dot"></span> ⏳ Phòng chờ: <strong>PIN ${roomInfo.pin}</strong>. Đang đợi Shipper...`;
        }
        if (desktopP2PCanvasContainer) {
          p2pSync.renderP2PQR(desktopP2PCanvasContainer, roomInfo.qrToken, { cellSize: 5, margin: 2 });
        }
      },
      onConnecting: () => {
        if (desktopP2PHostStatusText) {
          desktopP2PHostStatusText.innerHTML = '<span class="pulse-dot" style="background:#f59e0b;"></span> ⚡ Shipper đang kết nối...';
        }
      },
      onConnected: () => {
        if (desktopP2PHostStatusText) {
          desktopP2PHostStatusText.innerHTML = '<span class="pulse-dot" style="background:#10b981;"></span> 🚀 Đã kết nối! Đang bắn dữ liệu chuyến...';
        }
        // Gửi dữ liệu theo chuyến đã chọn
        let ordersToSend = currentOrders;
        if (currentDesktopSyncTrip !== 'all') {
          ordersToSend = currentOrders.filter(o => (o.tripCode || 'Chưa có mã chuyến') === currentDesktopSyncTrip);
        }
        const groupIds = new Set(ordersToSend.map(o => o.groupId).filter(Boolean));
        const groupsToSend = currentGroups.filter(g => groupIds.has(g.id));

        let payload;
        if (currentDesktopSyncMode === 'patch') {
          payload = p2pSync.buildPatchPayload(ordersToSend, groupsToSend, null);
        } else {
          payload = p2pSync.buildFullPayload(ordersToSend, groupsToSend, null);
        }
        desktopP2PHost.send(payload);
      },
      onSent: () => {
        if (desktopP2PHostStatusText) {
          desktopP2PHostStatusText.innerHTML = '<span style="color:#10b981; font-weight:700;">✅ ĐÃ GỬI XONG DỮ LIỆU CHUYẾN CHO SHIPPER! (0.05s)</span>';
        }
        showToast('⚡ Bắn dữ liệu chuyến sang Điện thoại thành công!', 'success');
      },
      onError: (err) => {
        if (desktopP2PHostStatusText) {
          desktopP2PHostStatusText.innerHTML = `<span style="color:#ef4444; font-weight:700;">⚠️ Lỗi P2P: ${err.message || err}</span>`;
        }
      }
    });
  }

  // Chọn chuyến cần xuất
  if (syncTripSelect) {
    syncTripSelect.addEventListener('change', (e) => {
      currentDesktopSyncTrip = e.target.value;
      updateSyncTripSummary();
      startDesktopP2PHost();
    });
  }

  // Chuyển tab Xuất (Gửi) / Nhận
  if (tabExport && tabImport) {
    tabExport.addEventListener('click', () => {
      tabExport.classList.add('active');
      tabExport.style.background = '#eff6ff';
      tabExport.style.color = '#1d4ed8';
      tabExport.style.borderColor = '#3b82f6';
      tabImport.classList.remove('active');
      tabImport.style.background = '';
      tabImport.style.color = '#64748b';
      tabImport.style.borderColor = '';
      if (hostPanel) hostPanel.style.display = 'flex';
      if (clientPanel) clientPanel.style.display = 'none';
      startDesktopP2PHost();
    });

    tabImport.addEventListener('click', () => {
      tabImport.classList.add('active');
      tabImport.style.background = '#eff6ff';
      tabImport.style.color = '#1d4ed8';
      tabImport.style.borderColor = '#3b82f6';
      tabExport.classList.remove('active');
      tabExport.style.background = '';
      tabExport.style.color = '#64748b';
      tabExport.style.borderColor = '';
      if (hostPanel) hostPanel.style.display = 'none';
      if (clientPanel) clientPanel.style.display = 'flex';
      stopDesktopP2PHost();
      if (inputPin) inputPin.focus();
    });
  }

  // Xử lý Nhận dữ liệu từ điện thoại bằng mã PIN
  if (btnConnectPin && inputPin) {
    btnConnectPin.addEventListener('click', () => {
      const pin = inputPin.value.trim();
      if (!pin || pin.length < 6) {
        showToast('Vui lòng nhập đủ 6 chữ số PIN từ điện thoại!', 'error');
        return;
      }
      const p2pSync = window.P2PSync || (typeof P2PSync !== 'undefined' ? P2PSync : null);
      if (!p2pSync) return;

      if (clientStatus) {
        clientStatus.innerHTML = `<span class="pulse-dot"></span> ⏳ Đang kết nối tới điện thoại qua mã PIN <strong>${pin}</strong>...`;
      }
      btnConnectPin.disabled = true;

      p2pSync.connectToHost(pin, {
        onConnecting: () => {
          if (clientStatus) clientStatus.innerHTML = `<span class="pulse-dot"></span> ⏳ Đang bắt tay kết nối P2P...`;
        },
        onConnected: () => {
          if (clientStatus) clientStatus.innerHTML = `<span class="pulse-dot" style="background:#10b981;"></span> 🚀 Đã kết nối! Đang tải dữ liệu...`;
        },
        onData: (data) => {
          btnConnectPin.disabled = false;
          if (!data || !data.payload) return;
          const p = data.payload;
          if (p.t === 'patch') {
            const res = p2pSync.applyPatch(p, currentOrders, currentGroups);
            currentOrders = res.orders;
            currentGroups = res.groups;
            showToast(`🎉 Đã cập nhật trạng thái/tọa độ cho ${res.matchedCount} đơn!`, 'success');
          } else if (p.t === 'full') {
            const res = p2pSync.applyFull(p, currentOrders, currentGroups, false);
            currentOrders = res.orders;
            currentGroups = res.groups;
            showToast(`🎉 Đã nạp thành công ${res.importedCount} đơn từ điện thoại!`, 'success');
          }
          ensureGroupIntegrity();
          StorageService.saveOrders(currentOrders);
          StorageService.saveGroups(currentGroups);
          renderApp();
          if (clientStatus) clientStatus.innerHTML = `<span style="color:#10b981; font-weight:700;">✅ ĐÃ NHẬN DỮ LIỆU TỪ ĐIỆN THOẠI THÀNH CÔNG!</span>`;
          setTimeout(() => { modal.style.display = 'none'; }, 1500);
        },
        onError: (err) => {
          btnConnectPin.disabled = false;
          if (clientStatus) clientStatus.innerHTML = `<span style="color:#ef4444; font-weight:700;">❌ Lỗi: ${err.message || err}</span>`;
        }
      });
    });
  }

  btnOpen.addEventListener('click', () => {
    modal.style.display = 'flex';
    updateSyncTripSummary();
    if (tabExport) tabExport.click();
  });

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      modal.style.display = 'none';
      stopDesktopP2PHost();
    });
  }

  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
      stopDesktopP2PHost();
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
      startDesktopP2PHost();
    });
  });

  if (btnDownloadJson) {
    btnDownloadJson.addEventListener('click', () => {
      const p2pSync = window.P2PSync || (typeof P2PSync !== 'undefined' ? P2PSync : null);
      if (!p2pSync) return;
      const jsonStr = p2pSync.exportToFileData(currentOrders, currentGroups, null);
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
          stopDesktopP2PHost();
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
 * Quản lý bộ lọc Mã Chuyến trên Desktop
 */
function setupDesktopTripFilter() {
  const tripFilterEl = document.getElementById('desktopTripFilter');
  if (tripFilterEl) {
    tripFilterEl.addEventListener('change', (e) => {
      activeTripFilter = e.target.value;
      renderApp();
      const label = e.target.options[e.target.selectedIndex].text;
      showToast(`Đã lọc: ${label}`, 'info');
    });
  }
}

function updateDesktopTripFilterOptions() {
  const tripFilterEl = document.getElementById('desktopTripFilter');
  const syncTripSelectEl = document.getElementById('desktopSyncTripSelect');
  
  const tripCounts = {};
  currentOrders.forEach(o => {
    const tc = o.tripCode || 'Chưa có mã chuyến';
    tripCounts[tc] = (tripCounts[tc] || 0) + 1;
  });

  const tripKeys = Object.keys(tripCounts).sort();

  if (tripFilterEl) {
    const currentVal = tripFilterEl.value || activeTripFilter;
    let html = `<option value="all">📦 Tất cả chuyến (${currentOrders.length} đơn)</option>`;
    tripKeys.forEach(k => {
      html += `<option value="${escapeHtml(k)}">⚡ Chuyến ${escapeHtml(k)} (${tripCounts[k]} đơn)</option>`;
    });
    tripFilterEl.innerHTML = html;
    if (tripKeys.includes(currentVal) || currentVal === 'all') {
      tripFilterEl.value = currentVal;
      activeTripFilter = currentVal;
    } else {
      tripFilterEl.value = 'all';
      activeTripFilter = 'all';
    }
  }

  if (syncTripSelectEl) {
    const currentSyncVal = syncTripSelectEl.value || currentDesktopSyncTrip;
    let html = `<option value="all">📦 Toàn bộ đơn hàng (${currentOrders.length} đơn)</option>`;
    tripKeys.forEach(k => {
      html += `<option value="${escapeHtml(k)}">⚡ Chuyến ${escapeHtml(k)} (${tripCounts[k]} đơn)</option>`;
    });
    syncTripSelectEl.innerHTML = html;
    if (tripKeys.includes(currentSyncVal) || currentSyncVal === 'all') {
      syncTripSelectEl.value = currentSyncVal;
      currentDesktopSyncTrip = currentSyncVal;
    } else {
      syncTripSelectEl.value = 'all';
      currentDesktopSyncTrip = 'all';
    }
    updateSyncTripSummary();
  }
}

function updateSyncTripSummary() {
  const summaryEl = document.getElementById('desktopSyncTripSummary');
  if (!summaryEl) return;
  if (currentDesktopSyncTrip === 'all') {
    summaryEl.textContent = `Đang chọn xuất: Toàn bộ ${currentOrders.length} đơn hàng`;
  } else {
    const count = currentOrders.filter(o => (o.tripCode || 'Chưa có mã chuyến') === currentDesktopSyncTrip).length;
    summaryEl.textContent = `Đang chọn xuất: ${count} đơn của chuyến ${currentDesktopSyncTrip}`;
  }
}

function getActiveTripOrders() {
  if (activeTripFilter === 'all') {
    return currentOrders;
  }
  return currentOrders.filter(o => (o.tripCode || 'Chưa có mã chuyến') === activeTripFilter);
}

/**
 * Render toàn bộ giao diện (Thống kê + Danh sách + Bản đồ)
 */
function renderApp() {
  updateDesktopTripFilterOptions();
  renderStats();
  renderOrderList();
  renderDesktopMap();
}

function renderStats() {
  const activeOrders = getActiveTripOrders();
  const total = activeOrders.length;
  const pending = activeOrders.filter(o => o.status === 'pending').length;
  const gtc = activeOrders.filter(o => o.status === 'gtc').length;
  const gtb = activeOrders.filter(o => o.status === 'gtb').length;
  const totalCod = activeOrders.reduce((sum, o) => sum + (o.codAmount || 0), 0);
  const validGps = activeOrders.filter(o => isValidCoordinate(o.lat, o.lng)).length;

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

  const activeOrders = getActiveTripOrders();
  const mapped = [];
  activeOrders.forEach((item, idx) => {
    if (isValidCoordinate(item.lat, item.lng)) {
      mapped.push({ item, stt: idx + 1, lat: Number(item.lat), lng: Number(item.lng) });
    }
  });

  const unmapped = activeOrders.filter(item => !isValidCoordinate(item.lat, item.lng));
  const unmappedChip = document.getElementById('dMapUnmappedChip');
  const unmappedCountEl = document.getElementById('dMapUnmappedCount');
  if (unmappedChip && unmappedCountEl) {
    unmappedCountEl.textContent = unmapped.length;
    unmappedChip.style.display = unmapped.length > 0 ? 'inline-flex' : 'none';
  }

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
                  <span style="font-size: 10.5px; font-weight: 700; color: ${o.item.status === 'gtc' ? (o.item.subStatus === 'cho_ck' ? '#d97706' : '#15803d') : (o.item.status === 'gtb' ? '#dc2626' : '#d97706')};">
                    ${o.item.status === 'gtc' ? (o.item.subStatus === 'cho_ck' ? '🟡 Chờ CK' : '✓ GTC') : (o.item.status === 'gtb' ? '✕ GTB' : '⏳ Chờ')}
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
          <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 4px; text-align: center;">
            <button type="button" class="btn-desktop-edit-loc" style="width: 100%; font-size: 11.5px; padding: 5px 8px; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 4px; cursor: pointer; font-weight: 700;" onclick="window.openDesktopUpdateLocModalById('${cluster.orders[0].item.id}', ${cluster.primaryStt})">
              📍 Sửa vị trí cho cụm ${cluster.count} đơn
            </button>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${cluster.lat},${cluster.lng}" target="_blank" style="background: #f0fdf4; color: #15803d; padding: 5px 10px; border-radius: 4px; text-decoration: none; font-weight: 700; font-size: 11.5px; display: inline-block;">
              🧭 Chỉ đường đến tòa nhà này
            </a>
          </div>
        </div>
      `;
    } else {
      const o = cluster.orders[0];
      const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`;
      let statusText = '⏳ Chờ giao hàng';
      let statusColor = '#d97706';
      if (o.item.status === 'gtc') {
        if (o.item.subStatus === 'cho_ck') {
          statusText = '🟡 Chờ CK';
          statusColor = '#d97706';
        } else {
          statusText = '✓ Giao thành công (GTC)';
          statusColor = '#15803d';
        }
      } else if (o.item.status === 'gtb') {
        const reason = o.item.gtbReason || (o.item.subStatus === 'hen_giao_lai' ? 'Hẹn giao lại' : (o.item.subStatus === 'knm' ? 'KNM' : (o.item.subStatus === 'tu_choi' ? 'Từ chối nhận' : '')));
        statusText = reason ? `✕ GTB (${reason})` : '✕ Giao thất bại (GTB)';
        statusColor = '#dc2626';
      }
      popupContent = `
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4; min-width: 220px; padding: 2px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
            <strong style="background: #001f3f; color: #fff; padding: 2px 7px; border-radius: 4px; font-size: 12px;">#${o.stt}</strong>
            <span style="font-size: 11px; font-weight: 700; color: ${statusColor};">${statusText}</span>
          </div>
          <div style="font-weight: 800; font-size: 14px; color: #0f172a; margin-bottom: 3px;">${escapeHtml(o.item.customerName || 'Khách lẻ')}</div>
          <div style="font-size: 11.5px; color: #64748b; margin-bottom: 4px;">Mã: <code style="color: #2563eb;">${escapeHtml(o.item.trackingCode)}</code></div>
          <div style="font-size: 12px; color: #334155; margin-bottom: 6px;">📍 ${escapeHtml(o.item.address)}</div>
          <div style="background: #f8fafc; padding: 4px 8px; border-radius: 4px; margin-bottom: 8px; font-size: 12px;">
            Thu COD: <strong style="color: #f26522;">${formatCurrency(o.item.codAmount)}</strong>
            ${o.item.gtbThu ? `<br>GTB thu: <strong style="color: #dc2626;">${formatCurrency(o.item.gtbThu)}</strong>` : ''}
          </div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px;">
            ${o.item.phone ? `<a href="tel:${o.item.phone}" style="background: #e0f2fe; color: #0369a1; padding: 5px 8px; border-radius: 4px; text-decoration: none; font-weight: 700; font-size: 11px;">📞 Gọi ${o.item.phone}</a>` : ''}
            <a href="${gmapsUrl}" target="_blank" style="background: #f0fdf4; color: #15803d; padding: 5px 8px; border-radius: 4px; text-decoration: none; font-weight: 700; font-size: 11px;">🧭 Dẫn đường</a>
          </div>
          <button type="button" class="btn-desktop-edit-loc" style="width: 100%; font-size: 11.5px; padding: 5px 8px; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 4px; cursor: pointer; font-weight: 700;" onclick="window.openDesktopUpdateLocModalById('${o.item.id}', ${o.stt})">
            📍 Sửa vị trí / Chọn trên bản đồ
          </button>
        </div>
      `;
    }

    if (desktopMapMarkers[cluster.id]) {
      desktopMapMarkers[cluster.id].setLatLng(pos);
      desktopMapMarkers[cluster.id].setIcon(icon);
      desktopMapMarkers[cluster.id].setPopupContent(popupContent);
    } else {
      const marker = L.marker(pos, { icon, draggable: true });
      marker.bindPopup(popupContent, { maxWidth: 320 });

      // Khi điều phối viên kéo ghim trên bản đồ để sửa tọa độ:
      marker.on('dragend', (e) => {
        const newLatLng = e.target.getLatLng();
        const nLat = Number(newLatLng.lat.toFixed(6));
        const nLng = Number(newLatLng.lng.toFixed(6));

        // Cập nhật cho tất cả đơn thuộc cụm này
        cluster.orders.forEach(o => {
          o.item.lat = nLat;
          o.item.lng = nLng;
          o.item.isGpsHealed = true;
          o.item.isGpsOutlier = false;
        });

        StorageService.saveOrders(currentOrders);
        showToast(`📍 Đã dời ${cluster.count > 1 ? cluster.count + ' đơn' : 'đơn #' + cluster.primaryStt} đến [${nLat}, ${nLng}]`, 'success');
        renderApp();
      });

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

  const activeOrders = getActiveTripOrders();

  let filtered = activeOrders.filter(order => {
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
    if (ordersInGroup.length === 0) {
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
        const routeNumber = activeOrders.findIndex(o => o.id === order.id) + 1;
        const cardEl = createOrderCard(order, routeNumber, activeOrders, group.name);
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
function createOrderCard(order, routeNumber, activeOrders, groupName) {
  const card = document.createElement('div');
  card.className = `order-card status-${order.status}${order.subStatus === 'cho_ck' ? ' status-cho-ck' : ''}`;
  card.setAttribute('data-id', order.id);
  card.draggable = true;

  let statusText = 'Chờ giao';
  let statusClass = 'pending';
  if (order.status === 'gtc') {
    if (order.subStatus === 'cho_ck') {
      statusText = 'Chờ CK 🟡';
      statusClass = 'cho-ck';
    } else {
      statusText = 'GTC (Thành công)';
      statusClass = 'gtc';
    }
  } else if (order.status === 'gtb') {
    const reason = order.gtbReason || (order.subStatus === 'hen_giao_lai' ? 'Hẹn giao lại' : (order.subStatus === 'knm' ? 'KNM' : (order.subStatus === 'tu_choi' ? 'Từ chối nhận' : '')));
    statusText = reason ? `GTB (${reason})` : 'GTB (Thất bại)';
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
        <button class="btn-move btn-move-up" title="Di chuyển lên">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
        <button class="btn-move btn-move-down" title="Di chuyển xuống">
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
        ${order.deliveryPhoto ? `<a href="${order.deliveryPhoto}" target="_blank" class="badge-geo-alert" style="background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; text-decoration:none;" title="Xem ảnh chụp khi giao">📸 Có ảnh</a>` : ''}
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
          <button type="button" class="btn-desktop-edit-loc" data-order-id="${order.id}" title="Chỉnh sửa hoặc ghim lại vị trí GPS chính xác">
            📍 Sửa vị trí
          </button>
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

  // Sửa vị trí GPS
  const btnEditLoc = card.querySelector('.btn-desktop-edit-loc');
  if (btnEditLoc) {
    btnEditLoc.addEventListener('click', (e) => {
      e.stopPropagation();
      openDesktopUpdateLocModal(order, routeNumber);
    });
  }

  // Nút di chuyển lên/xuống (đồng bộ theo thứ tự trong chuyến activeOrders)
  const tripIdx = activeOrders.findIndex(o => o.id === order.id);
  const btnUp = card.querySelector('.btn-move-up');
  const btnDown = card.querySelector('.btn-move-down');

  if (btnUp) {
    btnUp.disabled = (tripIdx <= 0);
    btnUp.addEventListener('click', (e) => {
      e.stopPropagation();
      if (tripIdx > 0) {
        const prevOrder = activeOrders[tripIdx - 1];
        const curIdx = currentOrders.findIndex(o => o.id === order.id);
        const prevIdx = currentOrders.findIndex(o => o.id === prevOrder.id);
        if (curIdx !== -1 && prevIdx !== -1) {
          const [movedItem] = currentOrders.splice(curIdx, 1);
          currentOrders.splice(prevIdx, 0, movedItem);
          StorageService.reorderOrders(currentOrders);
          renderApp();
        }
      }
    });
  }

  if (btnDown) {
    btnDown.disabled = (tripIdx >= activeOrders.length - 1);
    btnDown.addEventListener('click', (e) => {
      e.stopPropagation();
      if (tripIdx < activeOrders.length - 1) {
        const nextOrder = activeOrders[tripIdx + 1];
        const curIdx = currentOrders.findIndex(o => o.id === order.id);
        const nextIdx = currentOrders.findIndex(o => o.id === nextOrder.id);
        if (curIdx !== -1 && nextIdx !== -1) {
          const [movedItem] = currentOrders.splice(curIdx, 1);
          currentOrders.splice(nextIdx, 0, movedItem);
          StorageService.reorderOrders(currentOrders);
          renderApp();
        }
      }
    });
  }

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

// ==========================================================
// CẬP NHẬT VỊ TRÍ ĐỊNH VỊ CHO DESKTOP
// ==========================================================

function parseCoordsInput(str) {
  if (!str) return null;
  const m1 = str.match(/(1[0-9]\.\d{3,9})\s*[,;\s]\s*(10[2-9]\.\d{3,9})/);
  if (m1) {
    return { lat: parseFloat(m1[1]), lng: parseFloat(m1[2]) };
  }
  const m2 = str.match(/@([0-9]+\.[0-9]+),([0-9]+\.[0-9]+)/);
  if (m2 && isValidCoordinate(m2[1], m2[2])) {
    return { lat: parseFloat(m2[1]), lng: parseFloat(m2[2]) };
  }
  const m3 = str.match(/q=([0-9]+\.[0-9]+),([0-9]+\.[0-9]+)/);
  if (m3 && isValidCoordinate(m3[1], m3[2])) {
    return { lat: parseFloat(m3[1]), lng: parseFloat(m3[2]) };
  }
  return null;
}

function findSimilarAddressOrders(targetOrder, allOrders) {
  if (!targetOrder || !targetOrder.address) return [];

  function cleanText(str) {
    if (!str) return '';
    return str.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .replace(/[.,\-\/#!$%\^&\*;:{}=\-_`~()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const targetClean = cleanText(targetOrder.address);
  const targetTokens = targetClean.split(' ').filter(w => 
    w.length > 1 && !['tp', 'hcm', 'thanh', 'pho', 'quan', 'phuong', 'duong', 'so', 'nha', 'toa', 'tang', 'phong', 'viet', 'nam'].includes(w)
  );
  const targetNumbers = targetClean.match(/\b\d+\b/g) || [];

  const candidates = [];
  const landmarks = ['centec', 'vincom', 'diamond', 'landmark', 'bitexco', 'saigon', 'times', 'cantavil', 'masteri', 'vinhomes', 'pearl', 'riverpark', 'sunwah', 'lim', 'mplaza', 'me linh'];

  for (let i = 0; i < allOrders.length; i++) {
    const o = allOrders[i];
    if (o.id === targetOrder.id) continue;
    if (!isValidCoordinate(o.lat, o.lng)) continue;
    if (!o.address) continue;

    const otherClean = cleanText(o.address);
    const otherTokens = otherClean.split(' ').filter(w => 
      w.length > 1 && !['tp', 'hcm', 'thanh', 'pho', 'quan', 'phuong', 'duong', 'so', 'nha', 'toa', 'tang', 'phong', 'viet', 'nam'].includes(w)
    );
    const otherNumbers = otherClean.match(/\b\d+\b/g) || [];

    if (otherTokens.length === 0) continue;

    let commonTokens = 0;
    for (let t = 0; t < targetTokens.length; t++) {
      if (otherTokens.includes(targetTokens[t])) commonTokens++;
    }

    const dice = (2 * commonTokens) / (targetTokens.length + otherTokens.length);
    let score = dice * 55;

    let hasSameNumber = false;
    for (let n = 0; n < targetNumbers.length; n++) {
      if (otherNumbers.includes(targetNumbers[n])) {
        hasSameNumber = true;
        break;
      }
    }
    if (hasSameNumber) score += 25;

    for (let l = 0; l < landmarks.length; l++) {
      const lm = landmarks[l];
      if (targetClean.includes(lm) && otherClean.includes(lm)) {
        score += 35;
        break;
      }
    }

    const finalPct = Math.min(Math.round(score), 99);
    if (finalPct >= 35) {
      const origIdx = allOrders.indexOf(o);
      candidates.push({
        order: o,
        stt: origIdx !== -1 ? (origIdx + 1) : '',
        score: finalPct
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 5);
}

function openDesktopUpdateLocModal(order, stt) {
  targetUpdateOrder = order;
  const modal = document.getElementById('updateLocationModal');
  if (!modal) return;

  const activeOrders = getActiveTripOrders();
  const routeNum = stt || (activeOrders.findIndex(o => o.id === order.id) + 1) || 1;

  const sttEl = document.getElementById('updTargetStt');
  const nameEl = document.getElementById('updTargetName');
  const trkEl = document.getElementById('updTargetTrk');
  const addrEl = document.getElementById('updTargetAddr');
  const gpsTextEl = document.getElementById('updTargetGpsText');
  const manualInput = document.getElementById('updManualInput');

  if (sttEl) sttEl.textContent = '#' + routeNum;
  if (nameEl) nameEl.textContent = order.customerName || 'Khách lẻ';
  if (trkEl) trkEl.textContent = order.trackingCode || '';
  if (addrEl) addrEl.textContent = order.address || 'Chưa có địa chỉ';

  const hasGps = isValidCoordinate(order.lat, order.lng);
  if (gpsTextEl) {
    gpsTextEl.textContent = hasGps 
      ? `${Number(order.lat).toFixed(6)}, ${Number(order.lng).toFixed(6)}`
      : 'Chưa có GPS';
  }

  if (manualInput) {
    manualInput.value = hasGps ? `${order.lat}, ${order.lng}` : '';
  }

  // Reset OSM result box
  const osmBox = document.getElementById('updOsmResultBox');
  if (osmBox) osmBox.style.display = 'none';

  // Kiểm tra đơn cùng địa chỉ
  const info = extractStreetAndHouseNumber(order.address);
  const sameAddrOrders = currentOrders.filter(o => {
    if (o.id === order.id || !o.address) return false;
    const sameRaw = o.address.trim().toLowerCase() === (order.address || '').trim().toLowerCase();
    if (sameRaw) return true;
    if (info.street && info.houseNumber && info.street !== 'Chưa rõ đường') {
      const otherInfo = extractStreetAndHouseNumber(o.address);
      return otherInfo.street === info.street && otherInfo.houseNumber === info.houseNumber;
    }
    return false;
  });

  const sameSection = document.getElementById('updSameAddrSection');
  const sameCountEl = document.getElementById('updSameAddrCount');
  const btnSyncSame = document.getElementById('btnUpdSyncSameAddr');

  if (sameSection && sameCountEl) {
    if (sameAddrOrders.length > 0) {
      sameCountEl.textContent = `${sameAddrOrders.length + 1} đơn`;
      sameSection.style.display = 'block';
      if (btnSyncSame) {
        btnSyncSame.onclick = () => {
          if (!isValidCoordinate(order.lat, order.lng)) {
            showToast('Đơn này chưa có tọa độ hợp lệ để đồng bộ!', 'error');
            return;
          }
          sameAddrOrders.forEach(o => {
            o.lat = order.lat;
            o.lng = order.lng;
            o.isGpsHealed = true;
            o.isGpsOutlier = false;
          });
          StorageService.saveOrders(currentOrders);
          renderApp();
          modal.style.display = 'none';
          showToast(`⚡ Đã đồng bộ tọa độ cho tất cả ${sameAddrOrders.length + 1} đơn cùng địa chỉ!`, 'success');
        };
      }
    } else {
      sameSection.style.display = 'none';
    }
  }

  // Gợi ý địa chỉ tương tự
  const suggestions = findSimilarAddressOrders(order, currentOrders);
  const sugList = document.getElementById('updSuggestionsList');
  const sugBadge = document.getElementById('updSuggestCount');

  if (sugBadge) sugBadge.textContent = `${suggestions.length} gợi ý`;
  if (sugList) {
    sugList.innerHTML = '';
    if (suggestions.length === 0) {
      sugList.innerHTML = '<div style="font-size: 11.5px; color: #94a3b8; text-align: center; padding: 12px; background: #f8fafc; border-radius: 6px;">Không tìm thấy đơn nào khác có địa chỉ tương tự</div>';
    } else {
      suggestions.forEach(sug => {
        const card = document.createElement('div');
        card.className = 'upd-suggest-card';
        card.innerHTML = `
          <div class="upd-suggest-info">
            <div class="upd-suggest-title">
              <span>#${sug.stt} ${escapeHtml(sug.order.customerName || 'Khách lẻ')}</span>
              <span class="upd-suggest-score">${sug.score}% khớp</span>
            </div>
            <div class="upd-suggest-addr" title="${escapeHtml(sug.order.address)}">📍 ${escapeHtml(sug.order.address)}</div>
          </div>
          <div class="upd-suggest-actions">
            <button type="button" class="btn-preview-suggest" title="Xem vị trí trên bản đồ">🔍 Xem Map</button>
            <button type="button" class="btn-apply-suggest" title="Áp dụng tọa độ này">✓ Áp dụng</button>
          </div>
        `;

        card.querySelector('.btn-preview-suggest').addEventListener('click', (e) => {
          e.stopPropagation();
          modal.style.display = 'none';
          switchDesktopView('map');
          if (desktopMap) {
            desktopMap.flyTo([Number(sug.order.lat), Number(sug.order.lng)], 17, { duration: 1.2 });
            showToast(`Đang xem vị trí gợi ý từ đơn #${sug.stt}`, 'info');
          }
        });

        card.querySelector('.btn-apply-suggest').addEventListener('click', (e) => {
          e.stopPropagation();
          order.lat = Number(sug.order.lat);
          order.lng = Number(sug.order.lng);
          order.isGpsHealed = true;
          order.isGpsOutlier = false;
          StorageService.saveOrders(currentOrders);
          renderApp();
          modal.style.display = 'none';
          showToast(`✓ Đã áp dụng tọa độ từ đơn #${sug.stt}!`, 'success');
        });

        sugList.appendChild(card);
      });
    }
  }

  modal.style.display = 'flex';
}

window.openDesktopUpdateLocModalById = function(orderId, stt) {
  const order = currentOrders.find(o => o.id === orderId);
  if (order) {
    openDesktopUpdateLocModal(order, stt);
  }
};

function setupDesktopUpdateLocationModal() {
  const modal = document.getElementById('updateLocationModal');
  const btnClose = document.getElementById('btnCloseUpdateLocModal');

  if (btnClose && modal) {
    btnClose.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  if (modal) {
    window.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  }

  // Chấm điểm trên bản đồ
  const btnPickMap = document.getElementById('btnUpdPickMap');
  if (btnPickMap) {
    btnPickMap.addEventListener('click', () => {
      if (!targetUpdateOrder) return;
      const pickingOrder = targetUpdateOrder;
      const stt = getActiveTripOrders().findIndex(o => o.id === pickingOrder.id) + 1;
      if (modal) modal.style.display = 'none';
      switchDesktopView('map');
      showToast(`🎯 Chế độ chấm điểm: Hãy bấm 1 điểm trên bản đồ để ghim vị trí cho đơn #${stt}!`, 'info');

      if (desktopMap) {
        desktopMap.once('click', (e) => {
          const lat = Number(e.latlng.lat.toFixed(6));
          const lng = Number(e.latlng.lng.toFixed(6));
          pickingOrder.lat = lat;
          pickingOrder.lng = lng;
          pickingOrder.isGpsHealed = true;
          pickingOrder.isGpsOutlier = false;
          StorageService.saveOrders(currentOrders);
          renderApp();
          showToast(`✓ Đã ghim thành công tọa độ [${lat}, ${lng}] cho đơn #${stt}!`, 'success');
        });
      }
    });
  }

  // Mượn tọa độ trung vị tuyến đường
  const btnStreetMedian = document.getElementById('btnUpdStreetMedian');
  if (btnStreetMedian) {
    btnStreetMedian.addEventListener('click', () => {
      if (!targetUpdateOrder) return;
      const info = extractStreetAndHouseNumber(targetUpdateOrder.address);
      const streetOrders = currentOrders.filter(o => {
        return o.id !== targetUpdateOrder.id && isValidCoordinate(o.lat, o.lng) && extractStreetAndHouseNumber(o.address).street === info.street;
      });

      if (streetOrders.length === 0) {
        showToast(`Không có đơn nào khác cùng đường "${info.street}" có tọa độ!`, 'info');
        return;
      }

      streetOrders.sort((a, b) => Number(a.lat) - Number(b.lat));
      const mid = Math.floor(streetOrders.length / 2);
      const medLat = Number(streetOrders[mid].lat);
      const medLng = Number(streetOrders[mid].lng);

      targetUpdateOrder.lat = medLat;
      targetUpdateOrder.lng = medLng;
      targetUpdateOrder.isGpsHealed = true;
      targetUpdateOrder.isGpsOutlier = false;
      StorageService.saveOrders(currentOrders);
      renderApp();
      if (modal) modal.style.display = 'none';
      showToast(`✓ Đã áp dụng tọa độ trung vị đường "${info.street}" (${streetOrders.length} đơn)`, 'success');
    });
  }

  // Tra cứu OpenStreetMap
  const btnOsm = document.getElementById('btnUpdOsmSearch');
  const osmBox = document.getElementById('updOsmResultBox');
  const osmStatus = document.getElementById('updOsmStatusText');
  const btnApplyOsm = document.getElementById('btnApplyOsmResult');
  let tempOsmCoords = null;

  if (btnOsm) {
    btnOsm.addEventListener('click', () => {
      if (!targetUpdateOrder || !targetUpdateOrder.address) return;
      if (osmBox) osmBox.style.display = 'block';
      if (osmStatus) osmStatus.textContent = '⏳ Đang tra cứu OpenStreetMap...';
      if (btnApplyOsm) btnApplyOsm.style.display = 'none';

      const cleanAddr = targetUpdateOrder.address.replace(/[<>]/g, '').trim();
      const queryUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanAddr)}&countrycodes=vn&limit=1`;

      fetch(queryUrl, { headers: { 'Accept': 'application/json' } })
        .then(res => res.json())
        .then(data => {
          if (data && data.length > 0 && data[0].lat && data[0].lon) {
            const lat = parseFloat(data[0].lat);
            const lng = parseFloat(data[0].lon);
            tempOsmCoords = { lat, lng, displayName: data[0].display_name };
            if (osmStatus) osmStatus.innerHTML = `✓ Tìm thấy: <strong>${lat.toFixed(6)}, ${lng.toFixed(6)}</strong> (${escapeHtml(data[0].display_name.slice(0, 45))}...)`;
            if (btnApplyOsm) btnApplyOsm.style.display = 'inline-block';
          } else {
            const info = extractStreetAndHouseNumber(cleanAddr);
            const fbQuery = `Đường ${info.street}, TP. Hồ Chí Minh`;
            return fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fbQuery)}&countrycodes=vn&limit=1`)
              .then(r => r.json())
              .then(d2 => {
                if (d2 && d2.length > 0 && d2[0].lat && d2[0].lon) {
                  const lat2 = parseFloat(d2[0].lat);
                  const lng2 = parseFloat(d2[0].lon);
                  tempOsmCoords = { lat: lat2, lng: lng2, displayName: d2[0].display_name };
                  if (osmStatus) osmStatus.innerHTML = `✓ Tìm thấy theo tuyến đường: <strong>${lat2.toFixed(6)}, ${lng2.toFixed(6)}</strong>`;
                  if (btnApplyOsm) btnApplyOsm.style.display = 'inline-block';
                } else {
                  if (osmStatus) osmStatus.textContent = '❌ Không tìm thấy tọa độ phù hợp trên OpenStreetMap';
                  if (btnApplyOsm) btnApplyOsm.style.display = 'none';
                }
              });
          }
        })
        .catch(err => {
          if (osmStatus) osmStatus.textContent = `❌ Lỗi kết nối OSM: ${err.message || 'Không thể tra cứu'}`;
          if (btnApplyOsm) btnApplyOsm.style.display = 'none';
        });
    });
  }

  if (btnApplyOsm) {
    btnApplyOsm.addEventListener('click', () => {
      if (tempOsmCoords && targetUpdateOrder) {
        targetUpdateOrder.lat = tempOsmCoords.lat;
        targetUpdateOrder.lng = tempOsmCoords.lng;
        targetUpdateOrder.isGpsHealed = true;
        targetUpdateOrder.isGpsOutlier = false;
        StorageService.saveOrders(currentOrders);
        renderApp();
        if (modal) modal.style.display = 'none';
        showToast('✓ Đã cập nhật tọa độ từ OpenStreetMap!', 'success');
      }
    });
  }

  // Lấy GPS máy tính
  const btnMyGps = document.getElementById('btnUpdMyGps');
  if (btnMyGps) {
    btnMyGps.addEventListener('click', () => {
      if (!targetUpdateOrder) return;
      if (!navigator.geolocation) {
        showToast('Trình duyệt không hỗ trợ GPS', 'error');
        return;
      }
      showToast('Đang lấy vị trí GPS hiện tại...', 'info');
      navigator.geolocation.getCurrentPosition(pos => {
        targetUpdateOrder.lat = pos.coords.latitude;
        targetUpdateOrder.lng = pos.coords.longitude;
        targetUpdateOrder.isGpsHealed = true;
        targetUpdateOrder.isGpsOutlier = false;
        StorageService.saveOrders(currentOrders);
        renderApp();
        if (modal) modal.style.display = 'none';
        showToast('✓ Đã cập nhật theo vị trí GPS máy tính!', 'success');
      }, err => {
        showToast(`Lỗi GPS: ${err.message || 'Không thể xác định vị trí'}`, 'error');
      }, { enableHighAccuracy: true, timeout: 10000 });
    });
  }

  // Lưu tọa độ thủ công hoặc dán link Google Maps
  const btnSaveManual = document.getElementById('btnUpdSaveManual');
  const manualInput = document.getElementById('updManualInput');
  if (btnSaveManual && manualInput) {
    btnSaveManual.addEventListener('click', () => {
      if (!targetUpdateOrder) return;
      const raw = manualInput.value.trim();
      if (!raw) {
        showToast('Vui lòng nhập tọa độ hoặc dán link Google Maps!', 'error');
        return;
      }
      const parsed = parseCoordsInput(raw);
      if (parsed) {
        targetUpdateOrder.lat = parsed.lat;
        targetUpdateOrder.lng = parsed.lng;
        targetUpdateOrder.isGpsHealed = true;
        targetUpdateOrder.isGpsOutlier = false;
        StorageService.saveOrders(currentOrders);
        renderApp();
        if (modal) modal.style.display = 'none';
        showToast(`✓ Đã lưu tọa độ [${parsed.lat}, ${parsed.lng}]!`, 'success');
      } else {
        showToast('Không nhận diện được tọa độ hợp lệ (cần dạng lat, lng)!', 'error');
      }
    });
  }
}

// ==========================================================
// MODAL DANH SÁCH ĐƠN CHƯA CÓ GPS
// ==========================================================
function setupDesktopUnmappedModal() {
  const modal = document.getElementById('unmappedModal');
  const btnClose = document.getElementById('btnCloseUnmappedModal');
  const unmappedChip = document.getElementById('dMapUnmappedChip');
  const listEl = document.getElementById('unmappedOrdersList');

  function openModal() {
    if (!modal || !listEl) return;
    const activeOrders = getActiveTripOrders();
    const unmapped = activeOrders.filter(o => !isValidCoordinate(o.lat, o.lng));

    listEl.innerHTML = '';
    if (unmapped.length === 0) {
      listEl.innerHTML = '<div style="font-size: 13px; color: #166534; background: #f0fdf4; padding: 12px; border-radius: 8px; text-align: center; font-weight: 600;">🎉 Tuyệt vời! Tất cả đơn trong chuyến đều đã có tọa độ GPS.</div>';
    } else {
      unmapped.forEach(o => {
        const routeNum = activeOrders.findIndex(item => item.id === o.id) + 1;
        const row = document.createElement('div');
        row.style.cssText = 'background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px;';
        row.innerHTML = `
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 2px;">
              <span style="background: #001f3f; color: #fff; font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 4px;">#${routeNum}</span>
              <strong style="font-size: 13px; color: #0f172a;">${escapeHtml(o.customerName || 'Khách lẻ')}</strong>
              <code style="font-size: 11px; color: #2563eb;">${escapeHtml(o.trackingCode || '')}</code>
            </div>
            <div style="font-size: 12px; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">📍 ${escapeHtml(o.address || 'Chưa có địa chỉ')}</div>
          </div>
          <button type="button" class="btn-quick-fix-loc" style="background: #2563eb; color: #fff; border: none; border-radius: 6px; padding: 6px 12px; font-size: 11.5px; font-weight: 700; cursor: pointer; white-space: nowrap;">
            📍 Định vị ngay
          </button>
        `;

        row.querySelector('.btn-quick-fix-loc').addEventListener('click', () => {
          modal.style.display = 'none';
          openDesktopUpdateLocModal(o, routeNum);
        });

        listEl.appendChild(row);
      });
    }

    modal.style.display = 'flex';
  }

  if (unmappedChip) {
    unmappedChip.addEventListener('click', openModal);
  }

  if (btnClose && modal) {
    btnClose.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  if (modal) {
    window.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  }
}

// ==========================================================
// MODAL: AI 9ROUTER TỐI ƯU HÓA LỘ TRÌNH (DESKTOP)
// ==========================================================
function setupDesktopAiRouteModal() {
  const btnOpen = document.getElementById('btnOpenAiRouteDesktop');
  const modal = document.getElementById('aiRouteModalDesktop');
  const btnClose = document.getElementById('btnCloseAiRouteModalDesktop');
  if (!btnOpen || !modal) return;

  const tabBtnOptimize = document.getElementById('tabBtnAiOptimizeDesktop');
  const tabBtnConfig = document.getElementById('tabBtnAiConfigDesktop');
  const panelOptimize = document.getElementById('tabPanelAiOptimizeDesktop');
  const panelConfig = document.getElementById('tabPanelAiConfigDesktop');

  const pendingCountEl = document.getElementById('aiPendingCountDesktop');
  const groupCountEl = document.getElementById('aiGroupCountDesktop');
  const ruleCountEl = document.getElementById('aiRuleCountDesktop');

  const modeSelect = document.getElementById('aiModeSelectDesktop');
  const chkAvoidUTurn = document.getElementById('aiAvoidUTurnDesktop');
  const chkClusterBuildings = document.getElementById('aiClusterBuildingsDesktop');

  const btnRun = document.getElementById('btnRunAiOptimizeDesktop');
  const runBtnText = document.getElementById('aiRunBtnTextDesktop');
  const runStatus = document.getElementById('aiRunStatusDesktop');

  const resultBox = document.getElementById('aiResultBoxDesktop');
  const resStops = document.getElementById('aiResStopsDesktop');
  const resDist = document.getElementById('aiResDistanceDesktop');
  const resEngine = document.getElementById('aiResEngineDesktop');
  const expEl = document.getElementById('aiExplanationDesktop');
  const previewList = document.getElementById('aiPreviewStopsListDesktop');

  const btnApply = document.getElementById('btnApplyAiRouteDesktop');
  const btnSync = document.getElementById('btnSyncAfterAiDesktop');

  // Config tab elements
  const inputEndpoint = document.getElementById('aiCfgEndpointDesktop');
  const inputModel = document.getElementById('aiCfgModelDesktop');
  const inputApiKey = document.getElementById('aiCfgApiKeyDesktop');
  const btnTestConn = document.getElementById('btnTestAiConnectionDesktop');
  const btnSaveCfg = document.getElementById('btnSaveAiConfigDesktop');
  const connStatus = document.getElementById('aiConnectionStatusDesktop');

  let lastOptimizedResult = null;

  // Tab switching
  if (tabBtnOptimize && tabBtnConfig) {
    tabBtnOptimize.addEventListener('click', () => {
      tabBtnOptimize.classList.add('active');
      tabBtnConfig.classList.remove('active');
      panelOptimize.classList.add('active');
      panelConfig.classList.remove('active');
    });

    tabBtnConfig.addEventListener('click', () => {
      tabBtnConfig.classList.add('active');
      tabBtnOptimize.classList.remove('active');
      panelConfig.classList.add('active');
      panelOptimize.classList.remove('active');
      loadAiConfig();
    });
  }

  function loadAiConfig() {
    const aiOpt = window.AIRouteOptimizer;
    if (!aiOpt) return;
    const cfg = aiOpt.getConfig();
    if (inputEndpoint) inputEndpoint.value = cfg.endpoint || '';
    if (inputModel) inputModel.value = cfg.model || '';
    if (inputApiKey) inputApiKey.value = cfg.apiKey || '';
  }

  function openModal() {
    loadAiConfig();
    const activeOrders = typeof getActiveTripOrders === 'function' ? getActiveTripOrders() : currentOrders;
    const pending = activeOrders.filter(o => o.status === 'pending');
    const rules = StorageService.getGroupRules ? StorageService.getGroupRules() : [];

    if (pendingCountEl) pendingCountEl.textContent = pending.length;
    if (groupCountEl) groupCountEl.textContent = currentGroups.length;
    if (ruleCountEl) ruleCountEl.textContent = rules.length;

    // Reset result box
    if (resultBox) resultBox.style.display = 'none';
    if (runStatus) runStatus.style.display = 'none';
    lastOptimizedResult = null;

    modal.style.display = 'flex';
  }

  function closeModal() {
    modal.style.display = 'none';
  }

  btnOpen.addEventListener('click', openModal);
  if (btnClose) btnClose.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Test Connection
  if (btnTestConn) {
    btnTestConn.addEventListener('click', async () => {
      const aiOpt = window.AIRouteOptimizer;
      if (!aiOpt) {
        showToast('Chưa nạp module AI Route Optimizer!', 'error');
        return;
      }
      connStatus.style.display = 'block';
      connStatus.style.background = '#f1f5f9';
      connStatus.style.color = '#334155';
      connStatus.textContent = '⏳ Đang kiểm tra kết nối đến 9Router...';
      btnTestConn.disabled = true;

      // Save temp config to test
      aiOpt.saveConfig({
        endpoint: inputEndpoint.value.trim(),
        model: inputModel.value.trim(),
        apiKey: inputApiKey.value.trim()
      });
      if (inputEndpoint) inputEndpoint.value = aiOpt.getEndpoint();

      const res = await aiOpt.testConnection();
      btnTestConn.disabled = false;
      if (res.success) {
        connStatus.style.background = '#f0fdf4';
        connStatus.style.color = '#166534';
        connStatus.textContent = '✓ ' + res.message;
        showToast('Kết nối 9Router thành công!', 'success');
      } else {
        connStatus.style.background = '#fef2f2';
        connStatus.style.color = '#991b1b';
        connStatus.textContent = '✕ Lỗi kết nối: ' + res.error;
        showToast('Không thể kết nối 9Router: ' + res.error, 'error');
      }
    });
  }

  // Save Config
  if (btnSaveCfg) {
    btnSaveCfg.addEventListener('click', () => {
      const aiOpt = window.AIRouteOptimizer;
      if (!aiOpt) return;
      aiOpt.saveConfig({
        endpoint: inputEndpoint.value.trim(),
        model: inputModel.value.trim(),
        apiKey: inputApiKey.value.trim()
      });
      if (inputEndpoint) inputEndpoint.value = aiOpt.getEndpoint();
      showToast('Đã lưu cấu hình 9Router!', 'success');
    });
  }

  // Run Optimization
  if (btnRun) {
    btnRun.addEventListener('click', async () => {
      const aiOpt = window.AIRouteOptimizer;
      if (!aiOpt) {
        showToast('Lỗi: Chưa nạp module AIRouteOptimizer!', 'error');
        return;
      }

      const activeOrders = typeof getActiveTripOrders === 'function' ? getActiveTripOrders() : currentOrders;
      const pending = activeOrders.filter(o => o.status === 'pending');
      if (pending.length === 0) {
        showToast('Không có đơn hàng nào đang ở trạng thái Chờ Giao!', 'warning');
        return;
      }

      const rules = StorageService.getGroupRules ? StorageService.getGroupRules() : [];
      const mode = modeSelect ? modeSelect.value : 'auto';
      const avoidUTurn = chkAvoidUTurn ? chkAvoidUTurn.checked : true;
      const clusterBuildings = chkClusterBuildings ? chkClusterBuildings.checked : true;
      const chkStrictOneWay = document.getElementById('aiStrictOneWayDesktop');
      const strictOneWay = chkStrictOneWay ? chkStrictOneWay.checked : true;

      btnRun.disabled = true;
      if (runBtnText) runBtnText.textContent = 'Đang phân tích & tối ưu...';
      if (runStatus) {
        runStatus.style.display = 'block';
        runStatus.textContent = '⏳ AI 9Router đang đọc địa chỉ và tính toán lộ trình tối ưu...';
      }

      let startTime = Date.now();
      let timer = setInterval(() => {
        const sec = Math.floor((Date.now() - startTime) / 1000);
        if (runStatus) {
          const currentText = runStatus.getAttribute('data-status-text') || 'AI đang phân tích & tối ưu lộ trình...';
          runStatus.textContent = `⏳ ${currentText} (${sec}s)`;
        }
      }, 1000);

      const desktopBounds = (typeof desktopMap !== 'undefined' && desktopMap && desktopMap.getBounds) ? {
        s: desktopMap.getBounds().getSouth(),
        w: desktopMap.getBounds().getWest(),
        n: desktopMap.getBounds().getNorth(),
        e: desktopMap.getBounds().getEast()
      } : null;

      try {
        const result = await aiOpt.optimizeRoute(pending, currentGroups, rules, {
          scenario: mode,
          avoidUTurn: avoidUTurn,
          clusterBuildings: clusterBuildings,
          strictOneWay: strictOneWay,
          bounds: desktopBounds,
          onProgress: (info) => {
            if (runStatus && info) {
              const txt = info.detail || info.text || 'Đang xử lý...';
              runStatus.setAttribute('data-status-text', txt);
              const sec = Math.floor((Date.now() - startTime) / 1000);
              runStatus.textContent = `⏳ ${txt} (${sec}s)`;
            }
          }
        });

        lastOptimizedResult = result;

        // Render preview
        if (resultBox) resultBox.style.display = 'block';
        if (resStops) resStops.textContent = result.orderedOrders.length;
        if (resDist) {
          const km = (result.totalDistance / 1000).toFixed(1);
          resDist.textContent = km + ' km';
        }
        if (resEngine) {
          resEngine.textContent = result.isAIEngine ? '🤖 9Router AI' : '⚡ Thuật toán Offline';
          resEngine.style.color = result.isAIEngine ? '#4f46e5' : '#059669';
        }

        if (expEl) {
          expEl.innerHTML = `<strong>Chiến lược:</strong> ${escapeHtml(result.explanation || 'Đã sắp xếp lộ trình theo trình tự di chuyển tối ưu.')}`;
        }

        if (previewList) {
          previewList.innerHTML = '';
          result.orderedOrders.forEach((item, idx) => {
            const stopNum = idx + 1;
            const row = document.createElement('div');
            row.className = 'ai-stop-row';
            row.innerHTML = `
              <span class="ai-stop-badge">#${stopNum}</span>
              <div style="flex: 1; min-width: 0;">
                <strong style="color: #0f172a;">${escapeHtml(item.customerName || 'Khách lẻ')}</strong>
                <span style="color: #64748b; font-size: 11px; margin-left: 4px;">(${escapeHtml(item.trackingCode || '')})</span>
                <div style="color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">📍 ${escapeHtml(item.address || 'Chưa có địa chỉ')}</div>
              </div>
              <span style="font-weight: 700; color: #b45309; font-size: 11px;">${formatCurrency(item.codAmount || 0)}</span>
            `;
            previewList.appendChild(row);
          });
        }

        showToast('Đã tính toán xong lộ trình tối ưu!', 'success');
      } catch (err) {
        console.error('Lỗi khi chạy tối ưu hóa AI:', err);
        showToast('Lỗi khi tối ưu: ' + (err.message || err), 'error');
      } finally {
        if (timer) clearInterval(timer);
        btnRun.disabled = false;
        if (runBtnText) runBtnText.textContent = 'Bắt Đầu AI Tối Ưu Lộ Trình (9Router)';
        if (runStatus) runStatus.style.display = 'none';
      }
    });
  }

  // Apply Route
  if (btnApply) {
    btnApply.addEventListener('click', () => {
      if (!lastOptimizedResult || !lastOptimizedResult.orderedOrders) {
        showToast('Chưa có kết quả tối ưu để áp dụng!', 'warning');
        return;
      }

      const orderedPendingIds = lastOptimizedResult.orderedOrders.map(o => o.id);
      const pendingMap = new Map();
      lastOptimizedResult.orderedOrders.forEach(o => pendingMap.set(o.id, o));

      // Tái sắp xếp currentOrders: các đơn pending theo thứ tự mới, các đơn gtc/gtb giữ nguyên
      const newOrders = [];
      const remainingOthers = [];

      currentOrders.forEach(o => {
        if (pendingMap.has(o.id)) {
          // pending order
        } else {
          remainingOthers.push(o);
        }
      });

      // Thêm các pending theo đúng thứ tự AI
      orderedPendingIds.forEach(id => {
        const found = currentOrders.find(o => o.id === id);
        if (found) newOrders.push(found);
      });

      // Thêm các đơn khác (đã giao xong hoặc thất bại) vào sau
      remainingOthers.forEach(o => newOrders.push(o));

      currentOrders = newOrders;
      StorageService.saveOrders(currentOrders);
      renderApp();
      showToast('🎉 Đã áp dụng lộ trình tối ưu AI vào hệ thống!', 'success');
      closeModal();
    });
  }

  // Sync to Mobile
  if (btnSync) {
    btnSync.addEventListener('click', () => {
      // Tự động áp dụng nếu có kết quả
      if (lastOptimizedResult && lastOptimizedResult.orderedOrders) {
        btnApply.click();
      }
      closeModal();
      const btnOpenQrSync = document.getElementById('btnOpenQrSyncModalDesktop');
      if (btnOpenQrSync) {
        btnOpenQrSync.click();
      }
    });
  }

  // Nút Quét bản đồ OpenStreetMap lọc đường 1 chiều trên Desktop
  const btnScanMapDesktop = document.getElementById('btnScanMapOneWayDesktop');
  if (btnScanMapDesktop) {
    btnScanMapDesktop.addEventListener('click', async () => {
      const aiOpt = window.AIRouteOptimizer;
      if (!aiOpt || !aiOpt.scanAreaOneWayFromMap) return;

      btnScanMapDesktop.disabled = true;
      btnScanMapDesktop.textContent = '⏳ Đang quét...';
      const activeOrders = typeof getActiveTripOrders === 'function' ? getActiveTripOrders() : currentOrders;
      const pending = activeOrders.filter(o => o.status === 'pending');
      const desktopBounds = (typeof desktopMap !== 'undefined' && desktopMap && desktopMap.getBounds) ? {
        s: desktopMap.getBounds().getSouth(),
        w: desktopMap.getBounds().getWest(),
        n: desktopMap.getBounds().getNorth(),
        e: desktopMap.getBounds().getEast()
      } : null;

      try {
        const streets = await aiOpt.scanAreaOneWayFromMap(pending, desktopBounds);
        const noteEl = document.getElementById('aiOneWayMapNoteDesktop');
        if (noteEl) noteEl.textContent = `✓ Đã lọc ${streets.length} tuyến đường 1 chiều từ OpenStreetMap!`;
        showToast(`✓ Đã lọc thành công ${streets.length} tuyến đường 1 chiều từ bản đồ!`, 'success');
      } catch(err) {
        showToast('Không thể quét dữ liệu bản đồ: ' + (err.message || 'Lỗi kết nối'), 'error');
      } finally {
        btnScanMapDesktop.disabled = false;
        btnScanMapDesktop.textContent = '🔄 Quét bản đồ (OSM)';
      }
    });
  }
}

