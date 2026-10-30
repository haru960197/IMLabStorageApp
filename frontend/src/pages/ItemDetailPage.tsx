import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Package,
  MapPin,
  User,
  Clock,
  QrCode,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Layout } from '../components/Layout';
import { api, Item, Shelf, UsageLog, getFullImageUrl, LOG_ACTION_BADGE_CLASS } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { usePassphrase } from '../context/PassphraseContext';

const LOG_ACTION_LABEL: Record<UsageLog['action'], string> = {
  register: '登録',
  delete: '削除',
  borrow: '借用開始',
  return: '返却完了',
};

export const ItemDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { requireAuthorization } = usePassphrase();

  const [item, setItem] = useState<Item | null>(null);
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadItemData(id);
    }
  }, [id]);

  const loadItemData = async (itemId: string) => {
    try {
      setLoading(true);
      const res = await api.getItem(itemId);
      setItem(res.item);
      setShelf(res.shelf || null);
      setLogs(res.logs || []);
    } catch (err) {
      console.error('Failed to load item', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBorrow = async () => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    if (!item) return;

    await requireAuthorization(async () => {
      try {
        setProcessing(true);
        setActionError(null);
        await api.borrowItem(item.id, currentUser.id);
        setActionSuccess('備品を使用中に設定しました。');
        setTimeout(() => setActionSuccess(null), 3500);
        loadItemData(item.id);
      } catch (err: any) {
        setActionError(err.message || '借用処理に失敗しました。');
      } finally {
        setProcessing(false);
      }
    });
  };

  const handleReturn = async () => {
    if (!item) return;

    await requireAuthorization(async () => {
      try {
        setProcessing(true);
        setActionError(null);
        await api.returnItem(item.id, currentUser?.id);
        setActionSuccess('備品を返却しました。貸出可能になりました。');
        setTimeout(() => setActionSuccess(null), 3500);
        loadItemData(item.id);
      } catch (err: any) {
        setActionError(err.message || '返却処理に失敗しました。');
      } finally {
        setProcessing(false);
      }
    });
  };

  const handleDelete = async () => {
    if (!item) return;
    if (!currentUser) {
      setActionError('備品を削除するにはログインしてください。');
      return;
    }
    if (!window.confirm(`備品「${item.label} ${item.product_name}」を削除してもよろしいですか？`)) {
      return;
    }

    await requireAuthorization(async () => {
      try {
        setProcessing(true);
        await api.deleteItem(item.id, currentUser.id);
        navigate('/items');
      } catch (err: any) {
        setActionError(err.message || '備品の削除に失敗しました。');
        setProcessing(false);
      }
    });
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

  if (!item) {
    return (
      <Layout>
        <div className="text-center py-12 space-y-3">
          <p className="text-slate-600">指定された備品が見つかりませんでした。</p>
          <button
            onClick={() => navigate('/items')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold"
          >
            全備品一覧を見る
          </button>
        </div>
      </Layout>
    );
  }

  const isAvailable = item.status === 'available';
  const itemUrl = `${window.location.origin}/items/${item.id}`;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Top Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 -ml-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition flex items-center gap-1 text-sm font-medium"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>戻る</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowQR(!showQR)}
              className="p-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-slate-700 text-xs font-medium flex items-center gap-1.5 transition"
              title="備品QRコードを表示"
            >
              <QrCode className="w-4 h-4 text-indigo-600" />
              <span className="hidden sm:inline">備品QRコード</span>
            </button>

            <button
              onClick={handleDelete}
              disabled={processing}
              className="p-2 border border-slate-200 hover:border-rose-300 hover:bg-rose-50 rounded-xl text-slate-500 hover:text-rose-600 text-xs font-medium flex items-center gap-1.5 transition"
              title="備品を削除"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">削除</span>
            </button>
          </div>
        </div>

        {/* QR Code Card if toggled */}
        {showQR && (
          <div className="bg-white p-5 rounded-2xl border border-indigo-200 shadow-lg text-center space-y-3 animate-fade-in">
            <div className="flex justify-center p-3 bg-white rounded-xl inline-block border border-slate-100 shadow-sm mx-auto">
              <QRCodeSVG value={itemUrl} size={150} level="M" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{item.label} {item.product_name}</p>
              <p className="text-xs text-slate-400 mt-0.5 break-all">{itemUrl}</p>
            </div>
            <p className="text-xs text-slate-500">
              このQRコードを印刷して備品本体に貼ることで、スマートフォンのカメラから直接この備品ページを開けます。
            </p>
          </div>
        )}

        {/* Action feedback notifications */}
        {actionSuccess && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {actionError && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm flex items-center gap-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Item Header Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-mono font-semibold text-slate-500">管理番号: {item.label}</p>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug">
                {item.product_name}
              </h1>
              {item.category && (
                <span className="inline-block mt-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded">
                  {item.category}
                </span>
              )}
            </div>

            {/* Status Badge */}
            <span
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold ${
                isAvailable
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              現在の状況: {isAvailable ? '貸出可能' : '使用中'}
            </span>
          </div>

          {/* Item Image */}
          <div className="w-full h-56 sm:h-72 rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-100">
            {getFullImageUrl(item.image_url) ? (
              <img
                src={getFullImageUrl(item.image_url)}
                alt={item.product_name}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center text-slate-400">
                <Package className="w-12 h-12 mb-2" />
                <span className="text-xs">画像未登録</span>
              </div>
            )}
          </div>

          {/* Details Table */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h2 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              詳細情報
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {/* Shelf Location */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-600">
                  <MapPin className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-medium">棚の位置:</span>
                </div>
                <Link
                  to={`/shelves/${item.shelf_id}`}
                  className="font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
                >
                  <span>棚 {item.shelf_label}</span>
                  <span className="text-xs">→</span>
                </Link>
              </div>

              {/* Current or Last User */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-600">
                  <User className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-medium">
                    {isAvailable ? '最後に使用した人:' : '現在の使用者:'}
                  </span>
                </div>
                <span className="font-bold text-slate-800">
                  {isAvailable
                    ? item.last_user_name || 'なし'
                    : item.current_user_name || '不明'}
                </span>
              </div>
            </div>

            {/* Description Notes */}
            {item.description && (
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs sm:text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {item.description}
              </div>
            )}
          </div>

          {/* Action Buttons: [ 使用 ] [ 返却 ] */}
          <div className="pt-4 grid grid-cols-2 gap-3 border-t border-slate-100">
            <button
              onClick={() => handleBorrow()}
              disabled={!isAvailable || processing}
              className={`py-3.5 px-4 rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center gap-2 ${
                isAvailable
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-lg'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {processing && isAvailable ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              <span>使用</span>
            </button>

            <button
              onClick={handleReturn}
              disabled={isAvailable || processing}
              className={`py-3.5 px-4 rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center gap-2 ${
                !isAvailable
                  ? 'bg-amber-500 hover:bg-amber-600 text-white hover:shadow-lg'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {processing && !isAvailable ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              <span>返却</span>
            </button>
          </div>

          {!currentUser && isAvailable && (
            <p className="text-[11px] text-center text-slate-400">
              ※ 「使用」を押すにはログインが必要です
            </p>
          )}
        </div>

        {/* Usage History Logs */}
        {logs.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-slate-500" />
              <span>利用履歴</span>
            </h2>

            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-sm">
              {logs.map((log) => (
                <div key={log.id} className="p-3 text-xs flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-slate-800">{log.user_name}</span>
                    <p className="text-slate-400">
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

