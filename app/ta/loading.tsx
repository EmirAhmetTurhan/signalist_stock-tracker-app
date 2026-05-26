import { Loader2 } from 'lucide-react';

export default function TALoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
      <h2 className="text-xl font-semibold text-gray-200">Analizler Yükleniyor...</h2>
      <p className="text-sm text-gray-500">Teknik analiz verileri ve stratejiler getiriliyor.</p>
    </div>
  );
}
