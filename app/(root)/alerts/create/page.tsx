import AlertForm from '@/components/alerts/AlertForm';

type CreateAlertPageProps = {
  searchParams?: Promise<{ symbol?: string; company?: string }>;
};

export default async function CreateAlertPage(props: CreateAlertPageProps) {
  const searchParams = (await props.searchParams) || {};
  const symbol = (searchParams.symbol || '').toUpperCase();
  const company = searchParams.company || symbol;
  const initialSymbol = symbol || 'AAPL';
  const initialCompany = company || initialSymbol;

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-xl border border-gray-700 bg-[#141414] p-6 shadow-xl">
        <h1 className="text-xl font-semibold text-white mb-6">Price Alert</h1>

        <AlertForm defaultSymbol={initialSymbol} defaultCompany={initialCompany} />
      </div>
    </div>
  );
}
