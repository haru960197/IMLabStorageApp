import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, Package, Sparkles } from 'lucide-react';
import { Layout } from '../components/Layout';
import { ShelfGrid } from '../components/ShelfGrid';
import { ItemCard } from '../components/ItemCard';
import { api, Shelf, Item } from '../api/client';

export const MainPage: React.FC = () => {
  const navigate = useNavigate();
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Item[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadShelves();
  }, []);

  const loadShelves = async () => {
    try {
      setLoading(true);
      const data = await api.getShelves();
      setShelves(data);
    } catch (err) {
      console.error('Failed to load shelves', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        const results = await api.getItems({ q: searchQuery.trim() });
        setSearchResults(results);
      } catch (err) {
        console.error('Search failed', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Search Bar */}
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="absolute left-3.5 w-5 h-5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="備品を検索 (品名、管理番号、棚、ジャンル、使用者など)"
              className="w-full pl-11 pr-4 py-3 bg-white border border-slate-300 rounded-xl shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            />
            {isSearching && (
              <Loader2 className="absolute right-3.5 w-4 h-4 text-slate-400 animate-spin" />
            )}
          </div>

          {/* Search results overlay or list */}
          {searchQuery.trim() && (
            <div className="mt-3 bg-white border border-slate-200 rounded-xl p-3 shadow-lg max-h-80 overflow-y-auto space-y-2">
              <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-100 text-xs font-semibold text-slate-500">
                <span>検索結果 ({searchResults.length}件)</span>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-indigo-600 hover:underline"
                  >
                    クリア
                  </button>
                )}
              </div>
              {searchResults.length === 0 && !isSearching ? (
                <div className="py-6 text-center text-sm text-slate-500">
                  一致する備品が見つかりませんでした
                </div>
              ) : (
                searchResults.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))
              )}
            </div>
          )}
        </div>

        {/* Shelf Diagram */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
              <span>備品棚マップ</span>
              <span className="text-xs font-normal text-slate-500">(区画をタップして詳細表示)</span>
            </h2>
            <button
              onClick={() => navigate('/items')}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition"
            >
              全備品一覧 →
            </button>
          </div>

          {loading ? (
            <div className="h-64 flex items-center justify-center bg-slate-100 rounded-2xl">
              <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
            </div>
          ) : (
            <ShelfGrid shelves={shelves} />
          )}
        </div>

        {/* Quick Instructions / Help */}
        <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3.5 text-xs text-indigo-900 flex gap-2.5 items-start">
          <Sparkles className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold">使い方のヒント</p>
            <p className="text-indigo-700 leading-relaxed">
              棚の区画をタップすると、その棚にある備品一覧を確認できます。右上の [QR] ボタンから棚や備品のQRコードをスキャンして素早く開くこともできます。
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

