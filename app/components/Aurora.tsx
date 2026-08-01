import {
  Canvas,
  Fill,
  Shader,
  Skia,
} from "@shopify/react-native-skia";
import {
  memo,
  useMemo,
} from "react";
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";
import { useWindowDimensions } from "react-native";

const AURORA_SHADER = Skia.RuntimeEffect.Make(`
uniform float2 resolution;
uniform float time;
uniform float3 color1;
uniform float3 color2;
uniform float3 color3;
uniform float3 skyTop;
uniform float3 skyBottom;
uniform float speed;
uniform float intensity;
uniform float2 waveDirection;

half4 main(float2 xy) {
  float2 uv = xy / resolution;
  float2 direction = normalize(waveDirection);
  float wave = sin(dot(uv, direction) * 7.0 + time * speed * 0.8);
  wave += 0.5 * sin(dot(uv, direction) * 13.0 - time * speed * 0.45);
  wave = wave * 0.5 + 0.5;

  float horizon = smoothstep(0.1, 0.95, uv.y);
  float glow = smoothstep(0.2, 0.95, 1.0 - uv.y) * (0.35 + 0.65 * wave);
  float3 sky = mix(skyTop, skyBottom, uv.y);
  float3 aurora = mix(color1, color2, smoothstep(0.15, 0.75, uv.x));
  aurora = mix(aurora, color3, smoothstep(0.5, 1.0, uv.x));
  float veil = glow * (0.22 + 0.18 * horizon) * intensity;

  // Fade to fully transparent near the bottom edge so the canvas blends into
  // whatever sits behind it instead of ending in a hard-edged rectangle.
  float edgeFade = 1.0 - smoothstep(0.65, 1.0, uv.y);
  float3 color = mix(sky, aurora, veil) * edgeFade;

  return half4(color, edgeFade);
}
`)!;

export type AuroraProps = {
  width?: number;
  height?: number;
  auroraColors?: [string, string, string];
  skyColors?: [string, string];
  speed?: number;
  intensity?: number;
  waveDirection?: [number, number];
};

const DEFAULT_AURORA_COLORS = ["#b8a1ff", "#78d7d0", "#f7c6a3"] as const;
const DEFAULT_SKY_COLORS = ["#152238", "#273850"] as const;

// The default colors assume a dark backdrop. Over a light screen background
// the dark navy sky reads as a muddy smear, so light mode gets its own pastel
// preset instead.
export const AURORA_LIGHT_AURORA_COLORS = ["#FFC98B", "#BFEDE6", "#FFD3E0"] as const;
export const AURORA_LIGHT_SKY_COLORS = ["#FFF8EE", "#FDEFDD"] as const;

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((part) => part + part).join("")
    : normalized;
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
}

function Aurora({
  width: providedWidth,
  height: providedHeight,
  auroraColors = [...DEFAULT_AURORA_COLORS],
  skyColors = [...DEFAULT_SKY_COLORS],
  speed = 0.5,
  intensity = 1,
  waveDirection = [9, -9],
}: AuroraProps) {
  const { width: screenWidth } = useWindowDimensions();
  const width = providedWidth ?? screenWidth;
  const height = providedHeight ?? 300;
  const time = useSharedValue(0);

  useFrameCallback((frameInfo) => {
    if (frameInfo.timeSincePreviousFrame != null) {
      time.value += frameInfo.timeSincePreviousFrame / 1000;
    }
  });

  const colors = useMemo(() => ({
    color1: hexToRgb(auroraColors[0]),
    color2: hexToRgb(auroraColors[1]),
    color3: hexToRgb(auroraColors[2]),
    skyTop: hexToRgb(skyColors[0]),
    skyBottom: hexToRgb(skyColors[1]),
  }), [auroraColors, skyColors]);

  const uniforms = useDerivedValue(() => ({
    resolution: [width, height],
    time: time.value,
    ...colors,
    speed,
    intensity,
    waveDirection,
  }), [colors, height, intensity, speed, waveDirection, width]);

  return (
    <Canvas pointerEvents="none" style={{ width, height }}>
      <Fill>
        <Shader source={AURORA_SHADER} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}

export default memo(Aurora);
