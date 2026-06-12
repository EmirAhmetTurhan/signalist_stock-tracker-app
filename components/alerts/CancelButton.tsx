'use client';

import { useRouter } from 'next/navigation';

export default function CancelButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="px-4 py-2 rounded-md bg-gray-800 text-gray-200 hover:bg-gray-700 transition-colors"
    >
      Cancel
    </button>
  );
}
