import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { colors, gradients, levelColor, radius, space } from '@/theme';
import type { Insight } from '@/lib/types';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 20, color = colors.text }: { name: string; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name as IconName} size={size} color={color} />;
}

export const haptic = {
  tap: () => Platform.OS !== 'web' && Haptics.selectionAsync().catch(() => {}),
  success: () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  error: () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
};

/* --------------------------------- Layout -------------------------------- */

export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  edges = ['top'],
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: ('top' | 'bottom')[];
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
            ) : undefined
          }>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.scrollContent, { flex: 1 }, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Row({ children, gap = space.sm, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

/* ---------------------------------- Text --------------------------------- */

type Variant = 'hero' | 'title' | 'h2' | 'h3' | 'body' | 'label' | 'caption' | 'mono';

export function Txt({
  children,
  variant = 'body',
  color,
  style,
  numberOfLines,
  center,
}: {
  children: ReactNode;
  variant?: Variant;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  center?: boolean;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[textStyles[variant], color ? { color } : null, center ? { textAlign: 'center' } : null, style]}>
      {children}
    </Text>
  );
}

const textStyles = StyleSheet.create({
  hero: { color: colors.text, fontSize: 40, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  h2: { color: colors.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  h3: { color: colors.text, fontSize: 16, fontWeight: '700' },
  body: { color: colors.text, fontSize: 15, lineHeight: 21 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  caption: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  mono: { color: colors.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
});

/* --------------------------------- Surfaces ------------------------------- */

export function Card({
  children,
  style,
  onPress,
  accent,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accent?: string;
  padded?: boolean;
}) {
  const body = (
    <LinearGradient
      colors={gradients.card}
      style={[styles.card, padded && { padding: space.lg }, accent ? { borderColor: accent } : null, style]}>
      {children}
    </LinearGradient>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.985 : 1 }], opacity: pressed ? 0.92 : 1 }]}>
      {body}
    </Pressable>
  );
}

export function SectionTitle({ children, action, onAction }: { children: ReactNode; action?: string; onAction?: () => void }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.md }}>
      <Txt variant="label">{children}</Txt>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10}>
          <Txt variant="caption" color={colors.primary} style={{ fontWeight: '700' }}>
            {action}
          </Txt>
        </Pressable>
      ) : null}
    </Row>
  );
}

/* --------------------------------- Controls ------------------------------- */

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const isGradient = variant === 'primary' || variant === 'danger' || variant === 'success';
  const grad = variant === 'danger' ? gradients.red : variant === 'success' ? gradients.green : gradients.primary;
  const fg = variant === 'ghost' ? colors.textMuted : colors.text;
  const inner = (
    <Row gap={8} style={{ justifyContent: 'center' }}>
      {loading ? <ActivityIndicator color={fg} size="small" /> : icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 14 : 16 }}>{title}</Text>
    </Row>
  );
  const pad = { paddingVertical: small ? 10 : 16, paddingHorizontal: small ? 14 : 20 };
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => [
        { opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        style,
      ]}>
      {isGradient ? (
        <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.button, pad]}>
          {inner}
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.button,
            pad,
            variant === 'secondary' && { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
          ]}>
          {inner}
        </View>
      )}
    </Pressable>
  );
}

export function Input({ label, hint, style, ...props }: TextInputProps & { label?: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Txt variant="label">{label}</Txt> : null}
      <TextInput
        placeholderTextColor={colors.textDim}
        selectionColor={colors.primary}
        style={[styles.input, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, style]}
        {...props}
      />
      {hint ? <Txt variant="caption">{hint}</Txt> : null}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  color = colors.primary,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
  icon?: string;
}) {
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      style={[
        styles.chip,
        selected && { backgroundColor: color + '26', borderColor: color },
      ]}>
      <Row gap={6}>
        {icon ? <Txt>{icon}</Txt> : null}
        <Text style={{ color: selected ? colors.text : colors.textMuted, fontWeight: '600', fontSize: 14 }}>{label}</Text>
      </Row>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              haptic.tap();
              onChange(o.value);
            }}
            style={[styles.segment, active && { backgroundColor: colors.surfaceHigh }]}>
            <Text style={{ color: active ? colors.text : colors.textMuted, fontWeight: '700', fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Txt variant="h3">{label}</Txt>
        {hint ? <Txt variant="caption">{hint}</Txt> : null}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          haptic.tap();
          onChange(v);
        }}
        trackColor={{ true: colors.primary, false: colors.surfaceHigh }}
        thumbColor={colors.text}
      />
    </Row>
  );
}

export function Stepper({ value, onChange, step = 1, min = 0 }: { value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  return (
    <Row gap={10}>
      <Pressable style={styles.stepBtn} onPress={() => { haptic.tap(); onChange(Math.max(min, value - step)); }}>
        <Icon name="minus" size={18} />
      </Pressable>
      <Txt variant="mono" style={{ minWidth: 36, textAlign: 'center' }}>{value}</Txt>
      <Pressable style={styles.stepBtn} onPress={() => { haptic.tap(); onChange(value + step); }}>
        <Icon name="plus" size={18} />
      </Pressable>
    </Row>
  );
}

/* ------------------------------ Data display ------------------------------ */

export function Stat({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Txt variant="label" style={{ fontSize: 11 }}>{label}</Txt>
      <Txt variant="mono" color={color} style={{ fontSize: 18 }}>{value}</Txt>
      {sub ? <Txt variant="caption" style={{ fontSize: 12 }}>{sub}</Txt> : null}
    </View>
  );
}

export function ProgressBar({ value, color = colors.primary, height = 8 }: { value: number; color?: string; height?: number }) {
  return (
    <View style={{ height, borderRadius: height, backgroundColor: colors.surfaceHigh, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: '100%', backgroundColor: color, borderRadius: height }} />
    </View>
  );
}

export function Ring({
  value,
  size = 120,
  stroke = 12,
  color = colors.primary,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceHigh} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - v)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

export function scoreColor(score: number | null) {
  if (score === null) return colors.textMuted;
  if (score >= 80) return colors.green;
  if (score >= 50) return colors.amber;
  return colors.red;
}

export function AlertCard({ alert }: { alert: Insight }) {
  const c = levelColor[alert.level];
  const icon = { danger: 'alert-octagon', warning: 'alert', success: 'check-decagram', info: 'information' }[alert.level];
  return (
    <View style={[styles.alert, { backgroundColor: c.bg, borderColor: c.fg + '55' }]}>
      <Icon name={icon} size={22} color={c.fg} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="h3" color={c.fg}>{alert.title}</Txt>
        <Txt variant="caption" color={colors.text} style={{ opacity: 0.85 }}>{alert.message}</Txt>
      </View>
    </View>
  );
}

export function TrackerIcon({ icon, color, size = 44 }: { icon: string; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        backgroundColor: color + '22',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Icon name={icon} size={size * 0.5} color={color} />
    </View>
  );
}

export function EmptyState({ icon, title, message, action, onAction }: { icon: string; title: string; message: string; action?: string; onAction?: () => void }) {
  return (
    <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 32 }}>
      <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={30} color={colors.primary} />
      </View>
      <Txt variant="h2" center>{title}</Txt>
      <Txt variant="caption" center style={{ maxWidth: 280 }}>{message}</Txt>
      {action && onAction ? <Button title={action} onPress={onAction} icon="plus" style={{ marginTop: 8 }} /> : null}
    </Card>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Card style={{ gap: 10, alignItems: 'center' }}>
      <Icon name="cloud-alert" size={32} color={colors.red} />
      <Txt variant="h3" center>Something went wrong</Txt>
      <Txt variant="caption" center>{(error as Error)?.message ?? 'Unknown error'}</Txt>
      {onRetry ? <Button title="Try again" variant="secondary" small onPress={onRetry} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: space.lg, paddingBottom: 120 },
  card: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  button: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 16,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  segmented: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: 4, borderWidth: 1, borderColor: colors.border },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm },
  stepBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  alert: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: radius.md, borderWidth: 1, alignItems: 'flex-start' },
});
