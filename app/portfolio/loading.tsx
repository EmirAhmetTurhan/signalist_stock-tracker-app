import { Loader2 } from 'lucide-react';

export default function PortfolioLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
      <h2 className="text-xl font-semibold text-gray-200">Portföy Yükleniyor...</h2>
      <p className="text-sm text-gray-500">Hesap bakiyeniz ve açık pozisyonlarınız getiriliyor.</p>
    </div>
  );
}
