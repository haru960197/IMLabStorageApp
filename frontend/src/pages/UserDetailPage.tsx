import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User as UserIcon, Package, RotateCcw, Clock, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { api, getUserDisplayName, LOG_ACTION_BADGE_CLASS, User, Item, UsageLog } from '../api/client';
import { ItemCard } from '../components/ItemCard';
import { useAuth } from '../context/AuthContext';

const LOG_ACTION_LABEL: Record<UsageLog['action'], string> = {
  register: '登録',
  delete: '削除',
  borrow: '借用',
  return: '返却',
};

export const UserDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [borrowedItems, setBorrowedItems] = useState<Item[]>([]);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadUserData(id);
    }
  }, [id]);

  const loadUserData = async (userId: string) => {
    try {
      setLoading(true);
      const res = await api.getUser(userId);
      setUser(res.user);
      setBorrowedItems(res.borrowed_items);
      setLogs(res.logs);
    } catch (err) {
      console.error('Failed to load user', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReturnItem = async (itemId: string, itemName: string) => {
    if (!user) return;
    try {
      await api.returnItem(itemId, user.id);
      setActionSuccess(`「${itemName}」を返却しました。`);
      setTimeout(() => setActionSuccess(null), 3500);
      loadUserData(user.id);
    } catch (err: any) {
      alert(err.message || '返却に失敗しました');
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout>
        <div className="text-center py-12 space-y-3">
          <p className="text-slate-600">ユーザーが見つかりませんでした。</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold"
          >
            メイン画面に戻る
          </button>
        </div>
      </Layout>
    );
  }

  const isSelf = currentUser?.id === user.id;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Back and Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 -ml-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-slate-800">ユーザー情報</h1>
        </div>

        {actionSuccess && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* User Profile Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xl flex items-center justify-center flex-shrink-0 border-2 border-indigo-200">
            {user.first_name.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 truncate">{getUserDisplayName(user)}</h2>
              {isSelf && (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-600 text-white rounded-full">
                  あなた
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-slate-600 mt-0.5">学年: {user.grade}</p>
          </div>
        </div>

        {/* Borrowed Items */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
              <Package className="w-4 h-4 text-indigo-600" />
              <span>借りている備品 ({borrowedItems.length}点)</span>
            </h3>
          </div>

          {borrowedItems.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
              現在借りている備品はありません
            </div>
          ) : (
            <div className="space-y-2.5">
              {borrowedItems.map((item) => (
                <div key={item.id} className="relative group">
                  <ItemCard item={item} />
                  {/* Quick return button */}
                  <div className="mt-1 flex justify-end">
                    <button
                      onClick={() => handleReturnItem(item.id, item.product_name)}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-lg text-xs font-semibold transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>返却する</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* User Activity History */}
        {logs.length > 0 && (
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-slate-500" />
              <span>最近の利用履歴</span>
            </h3>
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-sm">
              {logs.map((log) => (
                <div key={log.id} className="p-3 text-xs flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-800">{log.item_name}</span>
                    <p className="text-slate-400 mt-0.5">
                      {new Date(log.timestamp).toLocaleString('ja-JP')}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded font-bold ${LOG_ACTION_BADGE_CLASS[log.action]}`}
                  >
                    {LOG_ACTION_LABEL[log.action]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

