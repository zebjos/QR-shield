import Svg, { Rect } from 'react-native-svg';

/**
 * QR Shield mark — four QR corner brackets with a horizontal scan beam.
 * Dark ink #111827 for the brackets, cobalt #2563EB for the beam.
 * Pass `monochrome` to render the beam in the ink color (for stamp / icon
 * contexts where the brand blue would be lost).
 */
export function Logo({
  size = 48,
  ink = '#111827',
  beam = '#2563EB',
  monochrome = false,
}: {
  size?: number;
  ink?: string;
  beam?: string;
  monochrome?: boolean;
}) {
  const beamColor = monochrome ? ink : beam;
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256">
      <Rect x={46} y={50} width={60} height={18} fill={ink} />
      <Rect x={46} y={68} width={18} height={122} fill={ink} />
      <Rect x={46} y={190} width={60} height={18} fill={ink} />
      <Rect x={150} y={50} width={60} height={18} fill={ink} />
      <Rect x={192} y={68} width={18} height={122} fill={ink} />
      <Rect x={150} y={190} width={60} height={18} fill={ink} />
      <Rect x={46} y={121} width={164} height={14} fill={beamColor} />
    </Svg>
  );
}
