export interface User {
  id: string;
  first_name: string;
  last_name: string;
  grade: string;
  created_at: string;
}

// ログイン画面のサジェスト用 (名前と ID のみ)
export type UserSuggestion = Pick<User, 'id' | 'first_name' | 'last_name'>;

export const GRADES = [
  'B1', 'B2', 'B3', 'B4',
  'M1', 'M2',
  'D1', 'D2', 'D3',
  '教員', '研究員', 'OB/OG', 'その他'
];

// 画面に出すユーザー名 (名 姓)
export const getUserDisplayName = (user: Pick<User, 'first_name' | 'last_name'>): string =>
  `${user.first_name} ${user.last_name}`;

export interface Shelf {
  id: string;
  label: string;
  row: string;
  col: number;
  description: string;
  item_count: number;
  available_count: number;
}

export interface Item {
  id: string;
  label: string;
  product_name: string;
  shelf_id: string;
  shelf_label?: string | null;
  category: string;
  description: string;
  image_id?: string | null;
  image_url?: string | null;
  status: "available" | "in_use";
  current_user_id?: string | null;
  current_user_name?: string | null;
  last_user_name?: string | null;
  last_used_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsageLog {
  id: string;
  item_id: string;
  item_name: string;
  user_id: string;
  user_name: string;
  action: "register" | "delete" | "borrow" | "return";
  timestamp: string;
}

// 利用履歴の action ごとのバッジの色
export const LOG_ACTION_BADGE_CLASS: Record<UsageLog['action'], string> = {
  register: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  delete: 'bg-slate-100 text-slate-600 border border-slate-200',
  borrow: 'bg-rose-50 text-rose-700 border border-rose-200',
  return: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
};

export const AUTH_TOKEN_STORAGE_KEY = 'imlab_storage_auth_token';

export const getStoredAuthToken = (): string | null => {
  try {
    return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const setStoredAuthToken = (token: string): void => {
  try {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } catch (e) {
    console.error('Failed to save auth token to localStorage', e);
  }
};

export const removeStoredAuthToken = (): void => {
  try {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch (e) {
    console.error('Failed to remove auth token from localStorage', e);
  }
};

const getAuthHeaders = (extra: Record<string, string> = {}): Record<string, string> => {
  const headers: Record<string, string> = { ...extra };
  const token = getStoredAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

const RAW_BASE_URL =(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const API_PREFIX = RAW_BASE_URL ? `${RAW_BASE_URL}/api` : '/api';

export const getFullImageUrl = (path?: string | null): string | undefined => {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  return RAW_BASE_URL ? `${RAW_BASE_URL}${path}` : path;
};

export const api = {
  // Shelves
  async getShelves(): Promise<Shelf[]> {
    const res = await fetch(`${API_PREFIX}/shelves`);
    if (!res.ok) throw new Error('棚一覧の取得に失敗しました');
    return res.json();
  },

  async getShelf(shelfId: string): Promise<{ shelf: Shelf; items: Item[] }> {
    const res = await fetch(`${API_PREFIX}/shelves/${shelfId}`);
    if (!res.ok) throw new Error('棚の詳細取得に失敗しました');
    return res.json();
  },

  // Items
  async getItems(params?: {
    q?: string;
    shelf_id?: string;
    status?: string;
    category?: string;
    user_id?: string;
  }): Promise<Item[]> {
    const query = new URLSearchParams();
    if (params?.q) query.append('q', params.q);
    if (params?.shelf_id) query.append('shelf_id', params.shelf_id);
    if (params?.status) query.append('status', params.status);
    if (params?.category) query.append('category', params.category);
    if (params?.user_id) query.append('user_id', params.user_id);

    const res = await fetch(`${API_PREFIX}/items?${query.toString()}`);
    if (!res.ok) throw new Error('備品一覧の取得に失敗しました');
    return res.json();
  },

  async getItem(itemId: string): Promise<{ item: Item; shelf?: Shelf; logs: UsageLog[] }> {
    const res = await fetch(`${API_PREFIX}/items/${itemId}`);
    if (!res.ok) throw new Error('備品詳細の取得に失敗しました');
    return res.json();
  },

  async createItem(item: {
    product_name: string;
    shelf_id: string;
    category?: string;
    description?: string;
    image_id?: string;
    user_id: string;
  }): Promise<Item> {
    const res = await fetch(`${API_PREFIX}/items`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(item),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '備品の登録に失敗しました');
    }
    return res.json();
  },

  async uploadImage(file: File): Promise<{ image_id: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_PREFIX}/items/upload-image`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '画像のアップロードに失敗しました');
    }
    return res.json();
  },

  async borrowItem(itemId: string, userId: string): Promise<Item> {
    const res = await fetch(`${API_PREFIX}/items/${itemId}/borrow`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ user_id: userId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '備品の使用処理に失敗しました');
    }
    return res.json();
  },

  async returnItem(itemId: string, userId?: string): Promise<Item> {
    const res = await fetch(`${API_PREFIX}/items/${itemId}/return`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ user_id: userId || '' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '備品の返却処理に失敗しました');
    }
    return res.json();
  },

  async deleteItem(itemId: string, userId: string): Promise<void> {
    const res = await fetch(`${API_PREFIX}/items/${itemId}?user_id=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '備品の削除に失敗しました');
    }
  },

  // Users
  async getUser(userId: string): Promise<{ user: User; borrowed_items: Item[]; logs: UsageLog[] }> {
    const res = await fetch(`${API_PREFIX}/users/${userId}`);
    if (!res.ok) throw new Error('ユーザー情報の取得に失敗しました');
    return res.json();
  },

  async getUsersByGrade(grade: string): Promise<UserSuggestion[]> {
    const res = await fetch(`${API_PREFIX}/users?grade=${encodeURIComponent(grade)}`);
    if (!res.ok) throw new Error('ユーザー一覧の取得に失敗しました');
    return res.json();
  },

  async createUser(firstName: string, lastName: string, grade: string): Promise<User> {
    const res = await fetch(`${API_PREFIX}/users`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ first_name: firstName, last_name: lastName, grade }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'ユーザー登録に失敗しました');
    }
    return res.json();
  },

  async loginUser(firstName: string, lastName: string): Promise<User> {
    const res = await fetch(`${API_PREFIX}/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: firstName, last_name: lastName }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'ログインに失敗しました');
    }
    return res.json();
  },

  // Auth / Passphrase
  async verifyPassphrase(passphrase: string): Promise<{ valid: boolean; token: string }> {
    const res = await fetch(`${API_PREFIX}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '合言葉が正しくありません');
    }
    const data = await res.json();
    setStoredAuthToken(data.token);
    return data;
  },

  async checkAuthStatus(): Promise<boolean> {
    const token = getStoredAuthToken();
    if (!token) return false;
    try {
      const res = await fetch(`${API_PREFIX}/auth/check`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.authenticated) {
        removeStoredAuthToken();
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },

  // Logs
  async getLogs(limit: number = 50): Promise<UsageLog[]> {
    const res = await fetch(`${API_PREFIX}/logs?limit=${limit}`);
    if (!res.ok) throw new Error('ログの取得に失敗しました');
    return res.json();
  },

  // Export URLs
  getExportJsonUrl(): string {
    return `${API_PREFIX}/items/export/json`;
  },
  getExportCsvUrl(): string {
    return `${API_PREFIX}/items/export/csv`;
  }
};
