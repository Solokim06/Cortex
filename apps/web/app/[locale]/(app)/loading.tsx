export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="space-y-3">
        <div className="h-8 w-64 bg-accent/40 rounded" />
        <div className="h-4 w-96 bg-accent/30 rounded" />
      </div>

      {/* Card grid skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-36 bg-card/40 border border-border rounded-lg"
          />
        ))}
      </div>

      {/* Wide card skeleton */}
      <div className="h-48 bg-card/40 border border-border rounded-lg" />
    </div>
  );
}
