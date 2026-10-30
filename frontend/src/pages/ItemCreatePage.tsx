import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UploadCloud, Image as ImageIcon, Loader2, ArrowLeft, Check } from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { usePassphrase } from '../context/PassphraseContext';
import { api, Shelf } from '../api/client';

const CATEGORIES = [
  'VR',
  'GPU/PC',
  '基板/センサ',
  '3Dプリンタ',
  '計測器',
  '工具',
  'ケーブル/アダプタ',
  'その他',
];

export const ItemCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { requireAuthorization } = usePassphrase();
  const [searchParams] = useSearchParams();
  const queryShelfId = searchParams.get('shelf_id') || searchParams.get('shelf') || '';

  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [productName, setProductName] = useState('');
  const [shelfId, setShelfId] = useState(queryShelfId);
  const [category, setCategory] = useState('VR');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const paramShelf = searchParams.get('shelf_id') || searchParams.get('shelf');
    if (paramShelf) {
      setShelfId(paramShelf);
    }
  }, [searchParams]);

  useEffect(() => {
    api.getShelves()
      .then((data) => {
        setShelves(data);
        // 棚の指定がなければ、先頭の棚を選んでおく
        setShelfId((current) => current || data[0]?.id || '');
      })
      .catch(console.error);
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) {
      setErrorMessage('品名を入力してください。');
      return;
    }
    if (!currentUser) {
      setErrorMessage('備品を登録するにはログインしてください。');
      return;
    }
    if (!shelfId) {
      setErrorMessage('棚の位置を選択してください。');
      return;
    }

    await requireAuthorization(async () => {
      try {
        setIsSubmitting(true);
        setErrorMessage(null);

        let imageId: string | undefined;
        // If a file was selected, upload it first
        if (imageFile) {
          const uploadRes = await api.uploadImage(imageFile);
          imageId = uploadRes.image_id;
        }

        const created = await api.createItem({
          product_name: productName.trim(),
          shelf_id: shelfId,
          category,
          description: description.trim(),
          image_id: imageId,
          user_id: currentUser.id,
        });

        // Redirect to item detail page
        navigate(`/items/${created.id}`);
      } catch (err: any) {
        setErrorMessage(err.message || '備品の登録に失敗しました。');
      } finally {
        setIsSubmitting(false);
      }
    });
  };

  return (
    <Layout>
      <div className="space-y-5">
        {/* Top Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 -ml-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-slate-800">備品の登録</h1>
        </div>

        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          {/* Product name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              品名 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="例: Meta Quest 3, RTX 4090"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            />
            <p className="mt-1 text-xs text-slate-400">管理番号(例: VR-001)は登録時に自動で付きます。</p>
          </div>

          {/* Shelf and Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                棚の位置 <span className="text-rose-500">*</span>
              </label>
              <select
                value={shelfId}
                onChange={(e) => setShelfId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition font-medium"
              >
                {shelves.length > 0 ? (
                  shelves.map((s) => (
                    <option key={s.id} value={s.id}>
                      棚 {s.label} ({s.description})
                    </option>
                  ))
                ) : (
                  <option value="">棚を読み込み中...</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                ジャンル / カテゴリ
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              備品の画像
            </label>
            <div className="flex flex-col sm:flex-row gap-3 items-center">
              <label className="flex-1 w-full border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50 hover:bg-indigo-50/30 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition text-center min-h-[120px]">
                {imagePreview ? (
                  <div className="relative w-full max-h-40 flex items-center justify-center overflow-hidden rounded-lg">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="max-h-36 object-contain rounded"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center text-white text-xs font-medium transition">
                      画像を変更
                    </div>
                  </div>
                ) : (
                  <>
                    <UploadCloud className="w-8 h-8 text-slate-400 mb-1.5" />
                    <span className="text-sm font-medium text-slate-700">画像を追加</span>
                    <span className="text-xs text-slate-400 mt-0.5">JPG, PNG, WebP対応</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              詳細情報
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="メーカー、型番、付属品、注意事項などを入力してください。"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            />
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>登録中...</span>
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  <span>登録</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
};

