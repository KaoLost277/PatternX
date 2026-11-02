import { CheckCircleIcon, AlertTriangleIcon } from "./icons";

export interface CompletenessBadgeProps {
  share: number; // 0.0 to 1.0
  count?: number;
  total?: number;
  showIcon?: boolean;
  className?: string;
}

export function CompletenessBadge({
  share,
  count,
  total,
  showIcon = true,
  className = "",
}: CompletenessBadgeProps) {
  const percentage = Math.round(share * 100);

  let badgeColorClasses = "bg-success-surface border-success-border text-success-text";
  let label = "High Completeness";
  let IconComponent = CheckCircleIcon;

  if (percentage < 50) {
    badgeColorClasses = "bg-error-surface border-error-border text-error-text";
    label = "Low Completeness";
    IconComponent = AlertTriangleIcon;
  } else if (percentage < 90) {
    badgeColorClasses = "bg-warning-surface border-warning-border text-warning-text";
    label = "Moderate Completeness";
    IconComponent = AlertTriangleIcon;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${badgeColorClasses} ${className}`}
      title={`${percentage}% complete${count !== undefined && total !== undefined ? ` (${count.toLocaleString()} of ${total.toLocaleString()})` : ""}`}
      aria-label={`${label}: ${percentage}%`}
    >
      {showIcon && <IconComponent className="size-3.5 shrink-0" />}
      <span>{percentage}%</span>
    </span>
  );
}
