import AlertForm from '@/components/alerts/AlertForm';

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
    <div className="h-full w-full flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-xl border border-gray-700/50 bg-[#141414]/80 backdrop-blur-md p-6 shadow-xl">
        <h1 className="text-xl font-semibold text-white mb-6">Price Alert</h1>

        <AlertForm defaultSymbol={upper} defaultCompany={company} />
      </div>
    </div>
  );
}
