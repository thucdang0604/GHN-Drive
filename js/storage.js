/**
 * storage.js - Quản lý lưu trữ LocalStorage cho web GHN
 * Đảm bảo dữ liệu và thứ tự sắp xếp được lưu tức thời và không bị mất khi thoát trình duyệt
 */

const STORAGE_KEY = 'ghn_orders_data_v1';
const GROUPS_STORAGE_KEY = 'ghn_order_groups_v1';

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
      return true;
    } catch (e) {
      console.error('Lỗi khi ghi vào LocalStorage:', e);
      return false;
    }
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
   * Dọn dẹp các đơn hàng cũ đã xử lý xong (Trạng thái là GTC hoặc GTB)
   * Trả về danh sách đơn còn lại (chỉ giữ lại đơn đang 'pending' hoặc chưa xong)
   */
  cleanProcessedOrders(onlyStatus = null) {
    const current = this.getOrders();
    let remaining;
    if (onlyStatus) {
      remaining = current.filter(o => o.status !== onlyStatus);
    } else {
      // Mặc định xóa tất cả đơn đã có trạng thái hoàn tất (GTC hoặc GTB)
      remaining = current.filter(o => o.status === 'pending');
    }
    this.saveOrders(remaining);
    return remaining;
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
   * Thêm dữ liệu mẫu ban đầu nếu người dùng chưa có đơn nào
   */
  loadSampleIfEmpty() {
    const current = this.getOrders();
    if (current.length === 0) {
      const sample = [
        {
          id: 'ghn_sample_1',
          trackingCode: 'VNGH80617648808',
          customerName: 'Ngọc Ánh',
          phone: '0969199184',
          address: 'Centec Tower, 72 74 Đường Nguyễn Thị Minh Khai, P. Võ Thị Sáu, Q. 3, TP.HCM',
          codAmount: 0,
          status: 'pending',
          groupId: 'group_ungrouped',
          lat: 10.779774,
          lng: 106.693156,
          createdAt: new Date().toISOString()
        },
        {
          id: 'ghn_sample_2',
          trackingCode: 'VNGH80617649912',
          customerName: 'Trần Minh',
          phone: '0908123456',
          address: 'Tầng 12, Centec Tower, 72 Nguyễn Thị Minh Khai, Q. 3',
          codAmount: 185000,
          status: 'pending',
          groupId: 'group_ungrouped',
          lat: 10.779774,
          lng: 106.693156,
          createdAt: new Date().toISOString()
        },
        {
          id: 'ghn_sample_3',
          trackingCode: 'VNGH80617651034',
          customerName: 'Phạm Thu Hương',
          phone: '0912345678',
          address: 'Tòa nhà Centec 72-74 Nguyễn Thị Minh Khai, Phường Võ Thị Sáu, Quận 3',
          codAmount: 320000,
          status: 'pending',
          groupId: 'group_ungrouped',
          lat: null,
          lng: null,
          createdAt: new Date().toISOString()
        },
        {
          id: 'ghn_sample_4',
          trackingCode: 'VNGH80617652156',
          customerName: 'Lê Văn Hùng',
          phone: '0987654321',
          address: 'Vincom Center Đồng Khởi, 72 Lê Thánh Tôn, Bến Nghé, Quận 1',
          codAmount: 250000,
          status: 'pending',
          groupId: 'group_ungrouped',
          lat: 10.778000,
          lng: 106.701800,
          createdAt: new Date().toISOString()
        },
        {
          id: 'ghn_sample_5',
          trackingCode: 'VNGH80617653278',
          customerName: 'Hoàng Lan',
          phone: '0933557799',
          address: '18 Nguyễn Thị Minh Khai, P. Đa Kao, Quận 1',
          codAmount: 95000,
          status: 'pending',
          groupId: 'group_ungrouped',
          lat: 10.787600,
          lng: 106.699800,
          createdAt: new Date().toISOString()
        },
        {
          id: 'ghn_sample_6',
          trackingCode: 'VNGH80617654390',
          customerName: 'Đặng Quốc Bảo',
          phone: '0977889900',
          address: '154/8 Pasteur, P. Bến Nghé, Quận 1',
          codAmount: 140000,
          status: 'pending',
          groupId: 'group_ungrouped',
          lat: 10.781200,
          lng: 106.698500,
          createdAt: new Date().toISOString()
        }
      ];
      this.saveOrders(sample);
      return sample;
    }
    return current;
  }
};

