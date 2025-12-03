import { createPriceAlertAction } from '@/lib/actions/alerts.actions';
import { CONDITION_OPTIONS } from '@/lib/constants';
import Link from 'next/link';
import AlertStockSelector from '@/components/AlertStockSelector';

type CreateAlertForSymbolPageProps = {
  params: Promise<{ symbol: string }>;
  searchParams?: Promise<{ company?: string }>
}

export default async function CreateAlertForSymbolPage(props: CreateAlertForSymbolPageProps) {
  const { symbol } = await props.params;
  const search = (await props.searchParams) || {};
  const upper = (symbol || '').toUpperCase();
  const company = search.company || upper;

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-xl border border-gray-700 bg-[#141414] p-6 shadow-xl">
        <h1 className="text-xl font-semibold text-white mb-6">Price Alert</h1>

        <form action={createPriceAlertAction} className="space-y-5">
          <AlertStockSelector defaultSymbol={upper} defaultCompany={company} />

          <div>
            <label className="block text-sm text-gray-300 mb-2">Alert Name</label>
            <input
              name="alertName"
              defaultValue={`${company || upper} at Target`}
              className="w-full rounded-md bg-[#0f0f0f] border border-gray-700 px-3 py-2 text-gray-100 focus:outline-none"
              placeholder="Apple at Discount"
            />
          </div>


          <div>
            <label className="block text-sm text-gray-300 mb-2">Alert type</label>
            <input value="Price" readOnly className="w-full rounded-md bg-[#0f0f0f] border border-gray-700 px-3 py-2 text-gray-400" />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-2">Condition</label>
            <select name="condition" className="w-full rounded-md bg-[#0f0f0f] border border-gray-700 px-3 py-2 text-gray-100">
              {CONDITION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-2">Threshold value</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input
                name="threshold"
                required
                type="number"
                step="0.01"
                min="0"
                placeholder="eg: 140"
                className="w-full rounded-md bg-[#0f0f0f] border border-gray-700 pl-7 pr-3 py-2 text-gray-100 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-2">Frequency</label>
            <select name="frequency" defaultValue="daily" disabled className="w-full rounded-md bg-[#0f0f0f] border border-gray-700 px-3 py-2 text-gray-100">
              <option value="daily">Once per day</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">We’ll check once a day and email if the condition is met.</p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Link href={`/stocks/${upper}`} className="px-4 py-2 rounded-md bg-gray-800 text-gray-200 hover:bg-gray-700">Cancel</Link>
            <button type="submit" className="ml-auto px-4 py-2 rounded-md bg-gradient-to-r from-yellow-300 to-yellow-500 text-black font-medium">
              Create Alert
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
