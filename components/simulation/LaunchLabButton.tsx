'use client';

import { Button } from '@/components/ui/button';
import { useSimulationModal } from '@/lib/store/useSimulationModal';

export default function LaunchLabButton() {
  const { openModal } = useSimulationModal();
  
  return (
    <Button 
      onClick={openModal} 
      className="bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-semibold shadow-[0_0_15px_rgba(234,179,8,0.3)] transition-all"
    >
      Launch New Lab
    </Button>
  );
}
