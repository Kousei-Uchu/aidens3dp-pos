// Location: src/ui/Flowchart.tsx
// Draws a help-page flowchart with react-native-svg from the layout in lib/flowchart.ts. Anything the reader cannot parse is shown as text instead.
import React, { useMemo } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import Svg, { Defs, G, Marker, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { layoutFlowchart, parseFlowchart } from '../lib/flowchart';
import { useTheme } from './theme';
import { useUi } from './uiProfile';

const PAD = 10, LINE_H = 15;
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

export default function Flowchart({ source }: { source: string }) {
  const { c } = useTheme(); const k = useUi().textScale;
  const layout = useMemo(() => { try { const f = parseFlowchart(source); return f ? layoutFlowchart(f) : null; } catch { return null; } }, [source]);
  if (!layout) return (
    <View style={{ backgroundColor: c.fill, borderRadius: 10, padding: 12, marginVertical: 6 }}>
      <Text style={{ color: c.sub, fontSize: 12, marginBottom: 6 }}>This diagram cannot be drawn here. Its source:</Text>
      <ScrollView horizontal><Text selectable style={{ color: c.text, fontFamily: MONO, fontSize: 12 * Math.min(k, 1.25) }}>{source}</Text></ScrollView>
    </View>
  );
  const W = layout.width + PAD * 2, H = layout.height + PAD * 2;
  const byId = new Map(layout.nodes.map(n => [n.id, n]));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={{ backgroundColor: c.fill, borderRadius: 10, marginVertical: 6 }} contentContainerStyle={{ padding: 4 }}>
      <Svg width={W} height={H} accessibilityLabel={`Flowchart with ${layout.nodes.length} steps: ${layout.nodes.map(n => n.lines.join(' ')).join(', ')}`}>
        <Defs><Marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><Path d="M 0 0 L 10 5 L 0 10 z" fill={c.sub} /></Marker></Defs>
        <G x={PAD} y={PAD}>
          {layout.edges.map((e, i) => {
            const horiz = Math.abs(e.x2 - e.x1) >= Math.abs(e.y2 - e.y1) && !(Math.abs(e.x2 - e.x1) < 1);
            // a gentle S-curve: leave and arrive straight on, so arrows meet the faces squarely
            const mx = (e.x1 + e.x2) / 2, my = (e.y1 + e.y2) / 2;
            const d = Math.abs(e.x1 - e.x2) < 1 || Math.abs(e.y1 - e.y2) < 1 ? `M ${e.x1} ${e.y1} L ${e.x2} ${e.y2}` : horiz ? `M ${e.x1} ${e.y1} C ${mx} ${e.y1}, ${mx} ${e.y2}, ${e.x2} ${e.y2}` : `M ${e.x1} ${e.y1} C ${e.x1} ${my}, ${e.x2} ${my}, ${e.x2} ${e.y2}`;
            return (
              <G key={i}>
                <Path d={d} stroke={c.sub} strokeWidth={1.4} fill="none" strokeDasharray={e.back ? '4 3' : undefined} markerEnd="url(#arrow)" />
                {e.label ? <G><Rect x={mx - e.label.length * 3.1 - 4} y={my - 8} width={e.label.length * 6.2 + 8} height={16} rx={4} fill={c.fill} /><SvgText x={mx} y={my + 4} fontSize={11} fill={c.sub} textAnchor="middle">{e.label}</SvgText></G> : null}
              </G>
            );
          })}
          {layout.nodes.map(n => {
            const cx = n.x + n.w / 2, cy = n.y + n.h / 2; const first = cy - ((n.lines.length - 1) * LINE_H) / 2 + 4;
            const shape = n.shape === 'decision'
              ? <Polygon points={`${cx},${n.y} ${n.x + n.w},${cy} ${cx},${n.y + n.h} ${n.x},${cy}`} fill={c.card} stroke={c.warn} strokeWidth={1.4} />
              : <Rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.shape === 'round' ? n.h / 2 : 8} fill={c.card} stroke={c.line} strokeWidth={1.4} />;
            return (
              <G key={n.id}>
                {shape}
                {n.lines.map((l, i) => <SvgText key={i} x={cx} y={first + i * LINE_H} fontSize={12} fill={c.text} textAnchor="middle">{l}</SvgText>)}
              </G>
            );
          })}
        </G>
      </Svg>
    </ScrollView>
  );
}
