import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FileText, PlusCircle, Filter, Loader2, ArrowLeft, Search } from 'lucide-react';
import { Layout } from '../components/Layout';
import { ItemCard } from '../components/ItemCard';
import { api, Item, Shelf } from '../api/client';

export const AllItemsPage: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'in_use'>('all');
  const [shelfFilter, setShelfFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  useEffect(() => {
    Promise.all([
      api.getItems(),
      api.getShelves(),
    ])
      .then(([itemsData, shelvesData]) => {
        setItems(itemsData);
        setShelves(shelvesData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const categories = Array.from(new Set(items.map((i) => i.category).filter(Boolean)));

  const filteredItems = items.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (shelfFilter !== 'all' && item.shelf_id !== shelfFilter) return false;
    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const match =
        item.label.toLowerCase().includes(q) ||
        item.product_name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        (item.current_user_name || '').toLowerCase().includes(q) ||
        (item.last_user_name || '').toLowerCase().includes(q) ||
        (item.shelf_label || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const handleDownloadJSON = () => {
    window.location.href = api.getExportJsonUrl();
  };

  const handleDownloadCSV = () => {
    window.location.href = api.getExportCsvUrl();
  };

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-1.5 -ml-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold text-slate-800">全備品一覧</h1>
          </div>

          <button
            onClick={() => navigate(shelfFilter !== 'all' ? `/items/new?shelf_id=${shelfFilter}` : '/items/new')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>新規登録</span>
          </button>
        </div>

        {/* Action Buttons: [ JSON ] [ CSV ] */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadJSON}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 shadow-sm transition"
          >
            <FileText className="w-4 h-4 text-indigo-600" />
            <span>JSON</span>
          </button>

          <button
            onClick={handleDownloadCSV}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 shadow-sm transition"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>CSV</span>
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="relative">
            <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="一覧内を絞り込み検索..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {/* Status Filter */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                状態
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">すべて</option>
                <option value="available">貸出可能</option>
                <option value="in_use">使用中</option>
              </select>
            </div>

            {/* Shelf Filter */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                保管棚
              </label>
              <select
                value={shelfFilter}
                onChange={(e) => setShelfFilter(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">全区画</option>
                {shelves.map((s) => (
                  <option key={s.id} value={s.id}>
                    棚 {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                ジャンル
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">すべて</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Items List */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 px-1">
            <span>備品一覧 ({filteredItems.length}件)</span>
            {(search || statusFilter !== 'all' || shelfFilter !== 'all' || categoryFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                  setShelfFilter('all');
                  setCategoryFilter('all');
                }}
                className="text-indigo-600 hover:underline"
              >
                フィルター解除
              </button>
            )}
          </div>

          {loading ? (
            <div className="h-48 flex items-center justify-center bg-white rounded-2xl border border-slate-200">
              <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
              条件に一致する備品が見つかりませんでした
            </div>
          ) : (
            filteredItems.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))
          )}
        </div>
      </div>
    </Layout>
  );
};

