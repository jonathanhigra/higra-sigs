import { useEffect, useState } from 'react';
import { relativeDate, formatDateTime } from '../../utils/format';

/**
 * <RelativeTime value={post.created_at} />
 * Mostra "há 5 min" e atualiza automaticamente a cada minuto.
 * Tooltip nativo mostra a data absoluta.
 */
export default function RelativeTime({ value, className, style }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!value) return;
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, [value]);

  if (!value) return <span className={className} style={style}>—</span>;

  return (
    <time
      dateTime={new Date(value).toISOString()}
      title={formatDateTime(value)}
      className={className}
      style={style}
    >
      {relativeDate(value)}
    </time>
  );
}
