export default function TALoading() {
  return (
    <div className="container py-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-20 bg-gray-800 rounded animate-pulse" />
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-9 w-24 bg-gray-800 rounded animate-pulse" />
          ))}
        </div>
      </div>
      <div className="h-[560px] bg-gray-800/30 rounded-xl animate-pulse" />
    </div>
  );
}
