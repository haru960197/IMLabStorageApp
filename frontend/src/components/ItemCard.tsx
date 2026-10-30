import React from 'react';
import { Link } from 'react-router-dom';
import { Package, User, MapPin } from 'lucide-react';
import { Item, getFullImageUrl } from '../api/client';

interface ItemCardProps {
  item: Item;
  showShelf?: boolean;
}

export const ItemCard: React.FC<ItemCardProps> = ({ item, showShelf = true }) => {
  const isAvailable = item.status === 'available';
  const displayImageUrl = getFullImageUrl(item.image_url);

  return (
    <Link
      to={`/items/${item.id}`}
      className="group block bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm hover:shadow-md hover:border-indigo-300 transition duration-150"
    >
      <div className="flex gap-3.5 items-start">
        {/* Thumbnail */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0 flex items-center justify-center border border-slate-100">
          {displayImageUrl ? (
            <img
              src={displayImageUrl}
              alt={item.product_name}
              className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
              loading="lazy"
            />
          ) : (
            <Package className="w-7 h-7 text-slate-400" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-slate-900 text-sm sm:text-base group-hover:text-indigo-600 transition truncate">
              {item.product_name}
            </h3>
            {/* Status Badge */}
            <span
              className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-bold ${
                isAvailable
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {isAvailable ? '貸出可能' : '使用中'}
            </span>
          </div>

          {/* Label, Category & Shelf */}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span className="px-1.5 py-0.5 bg-slate-800 text-white rounded font-mono font-medium">
              {item.label}
            </span>
            {showShelf && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-medium">
                <MapPin className="w-3 h-3 text-slate-500" />
                {item.shelf_label}
              </span>
            )}
            {item.category && (
              <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded font-medium">
                {item.category}
              </span>
            )}
          </div>

          {/* Current Borrower or Last User */}
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <User className="w-3.5 h-3.5 text-slate-400" />
            {!isAvailable ? (
              <span>
                使用者: <span className="font-medium text-slate-800">{item.current_user_name || '不明'}</span>
              </span>
            ) : item.last_user_name ? (
              <span>
                最終使用者: <span className="text-slate-600">{item.last_user_name}</span>
              </span>
            ) : (
              <span className="text-slate-400">未使用</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};

