import { create } from 'zustand';

interface SimulationModalState {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  setIsOpen: (open: boolean) => void;
}

export const useSimulationModal = create<SimulationModalState>((set) => ({
  isOpen: false,
  openModal: () => set({ isOpen: true }),
  closeModal: () => set({ isOpen: false }),
  setIsOpen: (open: boolean) => set({ isOpen: open }),
}));
