// Tiny shimmer-skeleton block. Use anywhere we wait on data.
import type { CSSProperties } from 'react';

interface Props {
  className?: string;
  style?: CSSProperties;
}

export const Skeleton = ({ className = '', style }: Props) => (
  <div
    className={`relative overflow-hidden rounded-md bg-white/[0.04] ${className}`}
    style={style}
  >
    <div
      className="absolute inset-0 -translate-x-full animate-shimmer"
      style={{
        background:
          'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)',
        backgroundSize: '200% 100%',
      }}
    />
  </div>
);

// Pre-canned skeleton for an order row.
export const OrderRowSkeleton = () => (
  <li className="card flex items-center gap-4 p-4">
    <Skeleton className="h-14 w-14 shrink-0" />
    <div className="flex-1 space-y-2">
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-3 w-2/5" />
    </div>
    <div className="space-y-2 text-right">
      <Skeleton className="ml-auto h-5 w-16" />
      <Skeleton className="ml-auto h-4 w-20" />
    </div>
  </li>
);

// Pre-canned skeleton for the status tracker (3 step rows + summary).
export const StatusTrackerSkeleton = () => (
  <div className="mt-10 space-y-3">
    <div className="card flex items-center gap-4 p-5">
      <Skeleton className="h-16 w-16 shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
    {[0, 1, 2].map((i) => (
      <div key={i} className="card flex items-center gap-4 p-4">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-2/5" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
    ))}
  </div>
);
