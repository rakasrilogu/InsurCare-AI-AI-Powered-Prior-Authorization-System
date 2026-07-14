import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; positive: boolean };
  variant?: 'default' | 'accent' | 'success' | 'warning';
}

const variantStyles = {
  default: 'bg-card shadow-card',
  accent: 'gradient-accent text-secondary-foreground',
  success: 'gradient-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
};

const StatCard = ({ title, value, subtitle, icon: Icon, trend, variant = 'default' }: StatCardProps) => {
  const isColored = variant !== 'default';

  return (
    <div className={`rounded-xl p-6 ${variantStyles[variant]} transition-all duration-300 hover:shadow-elevated`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-sm font-medium ${isColored ? 'opacity-80' : 'text-muted-foreground'}`}>{title}</p>
          <p className={`text-3xl font-bold mt-2 ${isColored ? '' : 'text-foreground'}`}>{value}</p>
          {subtitle && (
            <p className={`text-xs mt-1 ${isColored ? 'opacity-70' : 'text-muted-foreground'}`}>{subtitle}</p>
          )}
          {trend && (
            <p className={`text-xs mt-2 font-medium ${trend.positive ? 'text-success' : 'text-destructive'}`}>
              {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}% vs last week
            </p>
          )}
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isColored ? 'bg-[hsl(0,0%,100%)]/20' : 'bg-secondary/10'}`}>
          <Icon className={`w-6 h-6 ${isColored ? '' : 'text-secondary'}`} />
        </div>
      </div>
    </div>
  );
};

export default StatCard;
