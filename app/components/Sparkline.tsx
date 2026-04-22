interface Props {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  glow?: string;
  fill?: boolean;
}

export function Sparkline({ values, width = 420, height = 60, color = 'var(--info)', glow = 'var(--info-glow)', fill = true }: Props) {
  if (values.length === 0) return null;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - (v / max) * (height - 4) - 2;
    return `${x},${y}`;
  });
  const linePath = `M ${points.join(' L ')}`;
  const areaPath = `${linePath} L ${(values.length - 1) * step},${height} L 0,${height} Z`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="spark-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"  stopColor={`rgba(${glow}, 0.35)`} />
          <stop offset="100%" stopColor={`rgba(${glow}, 0)`} />
        </linearGradient>
      </defs>
      {fill && <path d={areaPath} fill="url(#spark-grad)" />}
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => v === max && (
        <circle key={i} cx={i * step} cy={height - (v / max) * (height - 4) - 2} r={2.5} fill={color} />
      ))}
    </svg>
  );
}
