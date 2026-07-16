import { useState } from 'react';
import { clsx } from 'clsx';

export function CursorSpotlight({
  children,
  className,
  spotlightSize = 100,
  spotlightOpacity = 0.25,
  baseColor = 'rgb(2 6 23)',
  falloff = '60%',
  childrenClassName,
}) {
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [hovering, setHovering] = useState(false);

  return (
    <div
      role="img"
      aria-hidden={true}
      className={clsx('relative overflow-hidden', className)}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setPos({
          x: ((e.clientX - rect.left) / rect.width) * 100,
          y: ((e.clientY - rect.top) / rect.height) * 100,
        });
        setHovering(true);
      }}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="absolute inset-0" style={{ backgroundColor: baseColor }} />
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-150"
        style={{
          background: `radial-gradient(circle ${spotlightSize}px at ${pos.x}% ${pos.y}%, rgba(255,255,255,${spotlightOpacity}) 0%, transparent ${falloff})`,
          opacity: hovering ? 1 : 0,
        }}
      />
      {children && <div className={clsx('relative', childrenClassName)}>{children}</div>}
    </div>
  );
}

export default CursorSpotlight;
