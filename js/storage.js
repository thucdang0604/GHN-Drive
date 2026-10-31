/**
 * storage.js - Quản lý lưu trữ LocalStorage cho web GHN
 * Đảm bảo dữ liệu và thứ tự sắp xếp được lưu tức thời và không bị mất khi thoát trình duyệt
 */

const STORAGE_KEY = 'ghn_orders_data_v1';
const GROUPS_STORAGE_KEY = 'ghn_order_groups_v1';
const GROUP_RULES_STORAGE_KEY = 'ghn_group_rules_v1';
const DELIVERY_PHOTO_DB = 'ghn_delivery_photos_v1';
let deliveryPhotoDbPromise;
let deliveryPhotoCleanupTimer;
const deliveryPhotoCache = new Map();

function openDeliveryPhotoDb() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  if (deliveryPhotoDbPromise) return deliveryPhotoDbPromise;
  deliveryPhotoDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DELIVERY_PHOTO_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('photos', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return deliveryPhotoDbPromise;
}

function isSafeDeliveryPhoto(value) {
  return typeof value === 'string' && value.length <= 8 * 1024 * 1024 && /^data:image\/(?:jpe?g|png|webp);base64,[a-z0-9+/=]+$/i.test(value);
}

function scheduleDeliveryPhotoCleanup(orders) {
  clearTimeout(deliveryPhotoCleanupTimer);
  const activeIds = new Set((orders || []).map(order => order.id).filter(Boolean));
  deliveryPhotoCleanupTimer = setTimeout(() => {
    openDeliveryPhotoDb().then(db => {
      if (!db) return;
      const transaction = db.transaction('photos', 'readwrite');
      const store = transaction.objectStore('photos');
      store.getAllKeys().onsuccess = event => {
        event.target.result.forEach(id => {
          if (!activeIds.has(id)) {
            store.delete(id);
            deliveryPhotoCache.delete(id);
          }
        });
      };
    }).catch(error => console.warn('Không dọn được ảnh giao hàng cũ:', error));
  }, 500);
}

export const StorageService = {
  /**
   * Lấy toàn bộ danh sách đơn hàng đã lưu
   */
  getOrders() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Lỗi khi đọc LocalStorage:', e);
      return [];
    }
  },

  /**
   * Lưu toàn bộ danh sách đơn hàng (bao gồm thứ tự đã sắp xếp)
   */
  saveOrders(orders) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
      scheduleDeliveryPhotoCleanup(orders);
      return true;
    } catch (e) {
      console.error('Lỗi khi ghi vào LocalStorage:', e);
      return false;
    }
  },

  saveDeliveryPhoto(orderId, photo) {
    if (!orderId || !isSafeDeliveryPhoto(photo)) return Promise.resolve(false);
    return openDeliveryPhotoDb().then(db => {
      if (!db) return false;
      return new Promise(resolve => {
        const transaction = db.transaction('photos', 'readwrite');
        transaction.objectStore('photos').put({ id: orderId, photo: photo, updatedAt: new Date().toISOString() });
        transaction.oncomplete = () => {
          deliveryPhotoCache.set(orderId, photo);
          resolve(true);
        };
        transaction.onerror = () => resolve(false);
        transaction.onabort = () => resolve(false);
      });
    }).catch(error => {
      console.error('Không lưu được ảnh giao hàng:', error);
      return false;
    });
  },

  loadDeliveryPhotos(orders) {
    return openDeliveryPhotoDb().then(db => {
      if (!db) return 0;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('photos', 'readwrite');
        const store = transaction.objectStore('photos');
        const request = store.getAll();
        const photosToLoad = [];
        let loaded = 0;
        request.onsuccess = () => {
          const stored = new Map(request.result.map(entry => [entry.id, entry.photo]));
          (orders || []).forEach(order => {
            const inlinePhoto = isSafeDeliveryPhoto(order.deliveryPhoto) ? order.deliveryPhoto : '';
            const photo = inlinePhoto || stored.get(order.id);
            if (photo && isSafeDeliveryPhoto(photo)) {
              if (inlinePhoto) store.put({ id: order.id, photo: inlinePhoto, updatedAt: order.deliveredAt || new Date().toISOString() });
              photosToLoad.push({ order: order, photo: photo, hasInlinePhoto: !!inlinePhoto });
              loaded++;
            }
          });
        };
        transaction.oncomplete = () => {
          photosToLoad.forEach(item => {
            deliveryPhotoCache.set(item.order.id, item.photo);
            item.order.hasStoredPhoto = true;
            if (item.hasInlinePhoto) delete item.order.deliveryPhoto;
          });
          resolve(loaded);
        };
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    });
  },

  getCachedDeliveryPhoto(orderId) {
    return deliveryPhotoCache.get(orderId) || '';
  },

  /**
   * Thêm một hoặc nhiều đơn hàng vào danh sách
   */
  addOrders(newOrders) {
    const current = this.getOrders();
    const formattedNew = newOrders.map(item => ({
      id: item.id || 'ghn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      trackingCode: item.trackingCode || '',
      tripCode: item.tripCode || '',
      customerName: item.customerName || '',
      phone: item.phone || '',
      address: item.address || '',
      codAmount: Number(item.codAmount) || 0,
      phaiThu: Number(item.phaiThu != null ? item.phaiThu : item.codAmount) || 0,
      gtbThu: Number(item.gtbThu) || 0,
      status: item.status || 'pending', // 'pending' | 'gtc' | 'gtb'
      notes: item.notes || '',
      groupId: item.groupId || 'group_ungrouped',
      lat: item.lat != null ? Number(item.lat) : null,
      lng: item.lng != null ? Number(item.lng) : null,
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));

    const updated = [...current, ...formattedNew];
    this.saveOrders(updated);
    return updated;
  },

  /**
   * Cập nhật trạng thái đơn hàng (GTB / GTC / Pending)
   */
  updateOrderStatus(orderId, status) {
    const current = this.getOrders();
    const updated = current.map(item => {
      if (item.id === orderId) {
        return {
          ...item,
          status: status,
          updatedAt: new Date().toISOString()
        };
      }
      return item;
    });
    this.saveOrders(updated);
    return updated;
  },

  /**
   * Cập nhật toàn bộ thứ tự mảng đơn hàng sau khi kéo thả / dịch chuyển
   */
  reorderOrders(newOrderedList) {
    this.saveOrders(newOrderedList);
    return newOrderedList;
  },

  /**
   * Dịch chuyển 1 đơn hàng lên hoặc xuống 1 bậc
   */
  moveOrder(orderId, direction) {
    const orders = this.getOrders();
    const index = orders.findIndex(o => o.id === orderId);
    if (index === -1) return orders;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= orders.length) return orders;

    // Hoán đổi vị trí
    const temp = orders[index];
    orders[index] = orders[targetIndex];
    orders[targetIndex] = temp;

    this.saveOrders(orders);
    return orders;
  },

  /**
   * Xóa 1 đơn hàng cụ thể
   */
  deleteOrder(orderId) {
    const orders = this.getOrders().filter(o => o.id !== orderId);
    this.saveOrders(orders);
    return orders;
  },

  /**
   * Xóa toàn bộ dữ liệu (Reset hoàn toàn)
   */
  clearAll() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(GROUPS_STORAGE_KEY);
    return [];
  },

  /**
   * Lấy danh sách các nhóm địa chỉ
   */
  getGroups() {
    try {
      const data = localStorage.getItem(GROUPS_STORAGE_KEY);
      if (!data) return [{ id: 'group_ungrouped', name: 'Chưa phân nhóm', isCollapsed: false }];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : [{ id: 'group_ungrouped', name: 'Chưa phân nhóm', isCollapsed: false }];
    } catch (e) {
      return [{ id: 'group_ungrouped', name: 'Chưa phân nhóm', isCollapsed: false }];
    }
  },

  /**
   * Lưu danh sách các nhóm địa chỉ
   */
  saveGroups(groups) {
    try {
      localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(groups));
      return true;
    } catch (e) {
      console.error('Lỗi khi lưu groups:', e);
      return false;
    }
  },

  /**
   * Lấy cấu hình phân nhóm tự động theo tên đường & số nhà (Group Rules)
   */
  getGroupRules() {
    try {
      const data = localStorage.getItem(GROUP_RULES_STORAGE_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Lỗi khi đọc Group Rules:', e);
      return [];
    }
  },

  /**
   * Lưu cấu hình phân nhóm tự động theo tên đường & số nhà (Group Rules)
   */
  saveGroupRules(rules) {
    try {
      localStorage.setItem(GROUP_RULES_STORAGE_KEY, JSON.stringify(rules || []));
      return true;
    } catch (e) {
      console.error('Lỗi khi ghi Group Rules:', e);
      return false;
    }
  },

  /**
   * Lấy cấu hình phân tuyến đội ngũ nhân viên (Fleet Dispatch)
   */
  getFleetDispatch() {
    try {
      const data = localStorage.getItem('ghn_fleet_dispatch_v1');
      if (!data) return null;
      return JSON.parse(data);
    } catch (e) {
      console.error('Lỗi khi đọc Fleet Dispatch:', e);
      return null;
    }
  },

  /**
   * Lưu cấu hình phân tuyến đội ngũ nhân viên (Fleet Dispatch)
   */
  saveFleetDispatch(dispatchData) {
    try {
      localStorage.setItem('ghn_fleet_dispatch_v1', JSON.stringify(dispatchData));
      return true;
    } catch (e) {
      console.error('Lỗi khi ghi Fleet Dispatch:', e);
      return false;
    }
  },

  /**
   * Xóa cấu hình phân tuyến đội ngũ nhân viên
   */
  clearFleetDispatch() {
    try {
      localStorage.removeItem('ghn_fleet_dispatch_v1');
      return true;
    } catch (e) {
      return false;
    }
  }
};


