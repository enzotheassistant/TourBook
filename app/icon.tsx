import { ImageResponse } from 'next/og';

export const size = {
  width: 512,
  height: 512,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            // Glow uses the accent colour (in-between blue, oklch(70% 0.11 243)). Image generation can't read the
            // CSS --color-accent variable, so update this too if the accent changes.
            'radial-gradient(circle at top, rgba(92,166,221,0.3), transparent 42%), linear-gradient(180deg, #111827 0%, #05070b 100%)',
          color: '#f8fafc',
          fontSize: 240,
          fontWeight: 800,
          letterSpacing: -18,
          borderRadius: 112,
          border: '1px solid rgba(255,255,255,0.08)',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 28,
            borderRadius: 92,
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          T
        </div>
      </div>
    ),
    size,
  );
}
