import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { createContext, useContext, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
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
import { colors, gradients, isDark, levelColor, radius, space, themed } from '@/theme';
import type { Insight } from '@/lib/types';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Text/icon colour forced by a coloured background (white on gradients, in both themes). */
const InkContext = createContext<string | null>(null);

/**
 * A coloured gradient panel: text and icons inside it are white in light and dark mode.
 * sheen: a soft band of light sweeps across it now and then (a glass reflection).
 * glow:  a coloured halo around it.
 */
export function Gradient({ children, sheen, glow, style, ...props }: ComponentProps<typeof LinearGradient> & { sheen?: boolean; glow?: string }) {
  return (
    <LinearGradient {...props} style={[style, sheen ? { overflow: 'hidden' } : null, glow ? { boxShadow: `0 10px 30px ${glow}66` } : null]}>
      <InkContext.Provider value="#FFFFFF">
        {children}
        {sheen ? <Sheen /> : null}
      </InkContext.Provider>
    </LinearGradient>
  );
}

/** A diagonal band of light that sweeps across its parent every few seconds (parent needs overflow: 'hidden'). */
export function Sheen({ every = 4200 }: { every?: number }) {
  const [x] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(x, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(every),
        Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [x, every]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -60,
        bottom: -60,
        width: 70,
        transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-160, 620] }) }, { rotate: '20deg' }],
      }}>
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
}

/** A number that counts up to its value (used for scores, savings, tree counts). */
export function CountUp({ value, format = (n) => String(Math.round(n)), duration = 900, ...txt }: { value: number; format?: (n: number) => string; duration?: number } & Omit<ComponentProps<typeof Txt>, 'children'>) {
  const [anim] = useState(() => new Animated.Value(0));
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setShown(v));
    Animated.timing(anim, { toValue: value, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => anim.removeListener(id);
  }, [anim, value, duration]);
  return <Txt {...txt}>{format(shown)}</Txt>;
}

export function Icon({ name, size = 20, color }: { name: string; size?: number; color?: string }) {
  const ink = useContext(InkContext);
  return <MaterialCommunityIcons name={name as IconName} size={size} color={color ?? ink ?? colors.text} />;
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
  const ink = useContext(InkContext);
  const tint = color ?? (ink && variant !== 'label' && variant !== 'caption' ? ink : ink ? 'rgba(255,255,255,0.82)' : null);
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[textStyles[variant], tint ? { color: tint } : null, center ? { textAlign: 'center' } : null, style]}>
      {children}
    </Text>
  );
}

const textStyles = themed(() => StyleSheet.create({
  hero: { color: colors.text, fontSize: 40, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  h2: { color: colors.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  h3: { color: colors.text, fontSize: 16, fontWeight: '700' },
  body: { color: colors.text, fontSize: 16, lineHeight: 23 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  caption: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  mono: { color: colors.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
}));

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
      {/* Glass: a soft light on the top edge, like a reflection */}
      <LinearGradient
        pointerEvents="none"
        colors={isDark() ? ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']}
        style={StyleSheet.absoluteFill}
        end={{ x: 0.5, y: 0.5 }}
      />
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 18, right: 18, height: 1, backgroundColor: isDark() ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,1)' }} />
      <InkContext.Provider value={null}>{children}</InkContext.Provider>
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
    <Row style={{ justifyContent: 'space-between', marginTop: space.xxl, marginBottom: 14 }}>
      <Txt variant="h3" style={{ fontSize: 18, flex: 1 }}>{children}</Txt>
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
  const fg = isGradient ? '#FFFFFF' : variant === 'ghost' ? colors.textMuted : colors.text;
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
        <LinearGradient
          colors={grad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.button, pad, !disabled && { boxShadow: `0 6px 20px ${grad[0]}59` }]}>
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

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onChange(!checked);
      }}
      hitSlop={6}
      style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 8,
          borderWidth: 2,
          borderColor: checked ? colors.primary : colors.borderStrong,
          backgroundColor: checked ? colors.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}>
        {checked ? <Icon name="check-bold" size={14} /> : null}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color = colors.textMuted, size = 40 }: { icon: string; onPress: () => void; label: string; color?: string; size?: number }) {
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}>
      <Icon name={icon} size={size * 0.5} color={color} />
    </Pressable>
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

/** One grey placeholder block that gently pulses while content loads. */
export function Skeleton({ height, width = '100%', radius: r = radius.md, style }: { height: number; width?: number | `${number}%`; radius?: number; style?: StyleProp<ViewStyle> }) {
  const [pulse] = useState(() => new Animated.Value(0.45));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View style={[{ height, width, borderRadius: r, backgroundColor: colors.surfaceHigh, overflow: 'hidden', opacity: pulse }, style]}>
      <Sheen every={300} />
    </Animated.View>
  );
}

/** Full-screen loading: a shimmering outline of a screen instead of a lonely spinner. */
export function Loading() {
  return (
    <View style={{ flex: 1, padding: space.lg, paddingTop: 70, gap: 14, backgroundColor: colors.bg }} accessibilityLabel="Loading" accessible>
      <Skeleton height={14} width="35%" radius={7} />
      <Skeleton height={30} width="70%" radius={10} />
      <Skeleton height={130} radius={radius.lg} style={{ marginTop: 10 }} />
      <Skeleton height={86} radius={radius.lg} />
      <Skeleton height={86} radius={radius.lg} />
      <Skeleton height={86} radius={radius.lg} />
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

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: 140 },
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
}));
