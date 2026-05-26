'use client';

import { useState } from 'react';
import { changeForwardTestStatus, changeForwardTestMode } from '@/lib/actions/forward-test.actions';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function ForwardTestList({ forwardTests, userId }: { forwardTests: any[]; userId: string }) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [modeModalOpen, setModeModalOpen] = useState(false);
  const [selectedTest, setSelectedTest] = useState<any | null>(null);
  const [confirmationInput, setConfirmationInput] = useState('');

  const handleStatusChange = async (id: string, newStatus: 'running' | 'paused' | 'stopped') => {
    setLoadingId(id);
    await changeForwardTestStatus(userId, id, newStatus);
    setLoadingId(null);
  };

  const handleModeChangeReq = (test: any) => {
    if (test.executionMode !== 'shadow') return; // For now only shadow -> auto
    setSelectedTest(test);
    setConfirmationInput('');
    setModeModalOpen(true);
  };

  const confirmAutoMode = async () => {
    if (!selectedTest) return;
    if (confirmationInput !== selectedTest.name) {
      toast.error('Onay metni eşleşmiyor.');
      return;
    }
    setLoadingId(selectedTest.id);
    setModeModalOpen(false);
    const res = await changeForwardTestMode(userId, selectedTest.id, 'auto', confirmationInput);
    if (!res.success) toast.error(res.error || 'Hata oluştu');
    else toast.success('Strateji Auto moda geçirildi!');
    setLoadingId(null);
  };

  if (!forwardTests || forwardTests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="text-gray-500 mb-3 text-4xl">🤖</div>
        <p className="text-sm text-gray-400 max-w-sm">
          No Forward Tests active. You can start a shadow test or auto-execution strategy from the AI Analysis page.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-gray-800/50">
            <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Strategy / Symbol</th>
            <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Mode</th>
            <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Status</th>
            <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Shadow PnL</th>
            <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">
          {forwardTests.map((test) => (
            <tr key={test.id} className="hover:bg-gray-800/20 transition-colors">
              <td className="py-3 px-4">
                <div className="font-medium text-gray-200">{test.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{test.symbol} • {test.interval.toUpperCase()}</div>
              </td>
              <td className="py-3 px-4 text-right">
                <button
                  onClick={() => handleModeChangeReq(test)}
                  disabled={loadingId === test.id || test.executionMode === 'auto'}
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide transition-colors ${
                    test.executionMode === 'auto' ? 'bg-purple-900/40 text-purple-400 cursor-default' :
                    test.executionMode === 'propose_only' ? 'bg-blue-900/40 text-blue-400 cursor-default' :
                    'bg-gray-800 text-gray-400 hover:bg-gray-700 cursor-pointer'
                  }`}
                  title={test.executionMode === 'shadow' ? 'Switch to Auto Execution' : ''}
                >
                  {test.executionMode.toUpperCase()}
                </button>
              </td>
              <td className="py-3 px-4 text-right">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide ${
                  test.status === 'running' ? 'bg-emerald-900/40 text-emerald-400' :
                  test.status === 'paused' ? 'bg-amber-900/40 text-amber-400' :
                  'bg-red-900/40 text-red-400'
                }`}>
                  {test.status.toUpperCase()}
                </span>
              </td>
              <td className="py-3 px-4 text-right">
                {test.executionMode === 'shadow' ? (
                  <span className={`font-mono text-sm ${test.shadowPnl > 0 ? 'text-emerald-400' : test.shadowPnl < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                    ${test.shadowPnl.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                ) : (
                  <span className="text-gray-600 text-xs">-</span>
                )}
              </td>
              <td className="py-3 px-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  {test.status === 'running' && (
                    <button 
                      onClick={() => handleStatusChange(test.id, 'paused')}
                      disabled={loadingId === test.id}
                      className="p-1.5 text-amber-400 hover:bg-amber-400/10 rounded transition-colors disabled:opacity-50"
                      title="Pause"
                    >
                      ⏸️
                    </button>
                  )}
                  {test.status === 'paused' && (
                    <button 
                      onClick={() => handleStatusChange(test.id, 'running')}
                      disabled={loadingId === test.id}
                      className="p-1.5 text-emerald-400 hover:bg-emerald-400/10 rounded transition-colors disabled:opacity-50"
                      title="Resume"
                    >
                      ▶️
                    </button>
                  )}
                  {test.status !== 'stopped' && (
                    <button 
                      onClick={() => handleStatusChange(test.id, 'stopped')}
                      disabled={loadingId === test.id}
                      className="p-1.5 text-red-400 hover:bg-red-400/10 rounded transition-colors disabled:opacity-50"
                      title="Stop"
                    >
                      ⏹️
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Auto-Execution Safety Gate */}
      <Dialog open={modeModalOpen} onOpenChange={setModeModalOpen}>
        <DialogContent className="bg-gray-900 border border-red-500/50 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              ⚠️ DİKKAT: Otomatik İşlem Modu
            </DialogTitle>
            <DialogDescription className="text-gray-400 pt-2 space-y-2">
              <p>
                <strong>{selectedTest?.name}</strong> stratejisini <span className="text-purple-400 font-semibold">AUTO</span> moduna geçiriyorsunuz.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-sm text-gray-300">
                <li>Strateji piyasa saatleri içinde <strong>gerçek simülasyon parasıyla</strong> işlem yapacaktır.</li>
                <li>Maksimum pozisyon büyüklüğünüz ve açık işlem limitiniz (Risk Caps) cüzdan ayarlarınız üzerinden denetlenecektir.</li>
                <li>Ters yönlü işlemler cüzdan bakiyenizi <strong>azaltabilir</strong>.</li>
              </ul>
              <div className="bg-red-500/10 p-3 rounded mt-4 border border-red-500/20 text-xs">
                Bu işlemi onaylamak için stratejinin adını eksiksiz yazın: <strong>{selectedTest?.name}</strong>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <input
              type="text"
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-sm text-white focus:border-red-500 outline-none"
              placeholder="Strateji adını yazın..."
            />
          </div>
          <DialogFooter>
            <button
              onClick={() => setModeModalOpen(false)}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white"
            >
              Vazgeç
            </button>
            <button
              onClick={confirmAutoMode}
              disabled={confirmationInput !== selectedTest?.name}
              className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded font-medium disabled:opacity-50 transition-colors"
            >
              Aktif Et
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
