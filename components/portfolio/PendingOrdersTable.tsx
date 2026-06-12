'use client';

import { useState } from 'react';
import { cancelPendingOrder } from '@/lib/actions/pending-orders.actions';
import { toast } from 'sonner';

interface PendingOrder {
  _id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: string;
  quantity: number;
  triggerPrice: string | number;
  status: string;
  timeInForce: string;
  createdAt: string;
}

interface PendingOrdersTableProps {
  orders: PendingOrder[];
  userId: string;
}

export default function PendingOrdersTable({ orders, userId }: PendingOrdersTableProps) {
  const [cancelling, setCancelling] = useState<string | null>(null);

  const handleCancel = async (orderId: string) => {
    setCancelling(orderId);
    try {
      const res = await cancelPendingOrder(orderId);
      if (res.success) {
        toast.success('Emir iptal edildi');
      } else {
        toast.error(res.error || 'Emir iptal edilemedi');
      }
    } catch (e) {
      toast.error('Beklenmeyen bir hata oluştu');
    } finally {
      setCancelling(null);
    }
  };

  if (orders.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-gray-500">
        Aktif veya geçmiş bekleyen emir bulunmuyor.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-gray-400 uppercase bg-gray-800/50">
          <tr>
            <th className="px-4 py-3 font-medium">Sembol</th>
            <th className="px-4 py-3 font-medium">Yön</th>
            <th className="px-4 py-3 font-medium">Tür</th>
            <th className="px-4 py-3 font-medium text-right">Adet</th>
            <th className="px-4 py-3 font-medium text-right">Tetik Fiyatı</th>
            <th className="px-4 py-3 font-medium text-center">Süre</th>
            <th className="px-4 py-3 font-medium text-center">Durum</th>
            <th className="px-4 py-3 font-medium text-right">Tarih</th>
            <th className="px-4 py-3 font-medium text-right">İşlem</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">
          {orders.map((order) => {
            const isBuy = order.side === 'BUY';
            const price = Number(order.triggerPrice);
            const isActive = order.status === 'active';

            return (
              <tr key={order._id} className="hover:bg-gray-800/20 transition-colors">
                <td className="px-4 py-3 font-medium text-white">
                  {order.symbol}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    isBuy ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                  }`}>
                    {order.side}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-300">
                  {order.orderType.replace('_', ' ').toUpperCase()}
                </td>
                <td className="px-4 py-3 text-right text-gray-300 font-mono">
                  {order.quantity}
                </td>
                <td className="px-4 py-3 text-right text-white font-mono">
                  ${price.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-center text-gray-400 text-xs uppercase">
                  {order.timeInForce}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 rounded-full text-[10px] uppercase font-semibold ${
                    order.status === 'active' ? 'bg-blue-500/10 text-blue-400' :
                    order.status === 'triggered' ? 'bg-green-500/10 text-green-400' :
                    'bg-gray-700/50 text-gray-400'
                  }`}>
                    {order.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-500 text-xs">
                  {new Date(order.createdAt).toLocaleDateString('tr-TR')}
                </td>
                <td className="px-4 py-3 text-right">
                  {isActive && (
                    <button
                      onClick={() => handleCancel(order._id)}
                      disabled={cancelling === order._id}
                      className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                    >
                      {cancelling === order._id ? 'İptal ediliyor...' : 'İptal Et'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
