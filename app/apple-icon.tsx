import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';

export default function AppleIcon() {
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
            'radial-gradient(circle at top, rgba(16,185,129,0.26), transparent 40%), linear-gradient(180deg, #111827 0%, #05070b 100%)',
          color: '#f8fafc',
          fontSize: 88,
          fontWeight: 800,
          letterSpacing: -6,
          borderRadius: 40,
          border: '1px solid rgba(255,255,255,0.08)',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 10,
            borderRadius: 30,
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        />
        T
      </div>
    ),
    size,
  );
}
