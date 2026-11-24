import { Pressable, ScrollView, View } from 'react-native';
import { CATEGORIES } from '@/lib/catalog';
import { useAppConfig } from '@/lib/config';
import { usePrefs } from '@/lib/prefs';
import { useTemplates } from '@/lib/queries';
import { goProtected, goSignIn } from '@/lib/requireAuth';
import type { Category, CategoryKey, Template } from '@/lib/types';
import { colors, gradients, radius } from '@/theme';
import { AlertCard, Button, Card, Gradient, Icon, ProgressBar, Ring, Row, Screen, SectionTitle, TrackerIcon, Txt } from './ui';

/** What each life area looks like in practice — shown on the guest home. */
const AREA_EXAMPLES: Record<CategoryKey, string> = {
  fitness: 'Workout · Steps · Water · Sleep',
  mind: 'Meditate · Journal · Gratitude',
  productivity: 'Read · Study · Deep work · Wake early',
  quit: 'Smoking · Alcohol · Social media · Junk food',
  money: 'Daily budget · No-spend days · Saving',
  trading: 'Trade limits · Profit target · Loss limit',
  other: 'Anything you want to do — or stop doing',
};

function Logo() {
  return (
    <Row gap={10}>
      <Gradient colors={gradients.primary} style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="anchor" size={20} />
      </Gradient>
      <Txt variant="h2">Holdfast</Txt>
    </Row>
  );
}

/** Life areas switched on by the admin, with the guest's chosen interests first. */
function useAreas(): Category[] {
  const interests = usePrefs((s) => s.interests);
  const { settings } = useAppConfig();
  // Money stays visible even without budgets (it has habits like "Save daily"); trading can be switched off
  const areas = CATEGORIES.filter((c) => c.key !== 'trading' || settings.feature_trading);
  return [...areas.filter((c) => interests.includes(c.key)), ...areas.filter((c) => !interests.includes(c.key))];
}

/** Tab-level prompt shown to guests instead of account data. */
export function GuestPrompt({ icon, title, message }: { icon: string; title: string; message: string }) {
  return (
    <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 32 }}>
      <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={30} color={colors.primary} />
      </View>
      <Txt variant="h2" center>{title}</Txt>
      <Txt variant="caption" center style={{ maxWidth: 290 }}>{message}</Txt>
      <View style={{ alignSelf: 'stretch', gap: 6, marginTop: 10 }}>
        <Button title="Create free account" onPress={() => goSignIn('register')} />
        <Button title="I already have an account" variant="ghost" small onPress={() => goSignIn('login')} />
      </View>
    </Card>
  );
}

/** Take one template from each area in turn, so the strip is always varied. */
function interleave(list: Template[], order: CategoryKey[]) {
  const byArea = new Map<string, Template[]>();
  for (const t of list) byArea.set(t.category, [...(byArea.get(t.category) ?? []), t]);
  const out: Template[] = [];
  for (let round = 0; out.length < list.length; round++) {
    let added = false;
    for (const key of order) {
      const t = byArea.get(key)?.[round];
      if (t) {
        out.push(t);
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}

/** Horizontal strip of ready-made trackers, varied across life areas (chosen interests first). */
export function TemplateStrip() {
  const { data: all } = useTemplates();
  const areas = useAreas();
  const { settings } = useAppConfig();
  const data = all?.filter((t) => (t.type === 'trading' ? settings.feature_trading : t.type === 'spending' ? settings.feature_spending : true));
  if (!data?.length) return null;
  const list = interleave(data, areas.map((a) => a.key));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 20 }} style={{ marginHorizontal: -20, paddingLeft: 20 }}>
      {list.slice(0, 12).map((t) => (
        <Pressable key={t.slug} onPress={() => goProtected(`/tracker/new?category=${t.category}`)} accessibilityRole="button" accessibilityLabel={`Start with ${t.name}`}>
          <View style={{ width: 156, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 12 }}>
            <TrackerIcon icon={t.icon} color={t.color} size={42} />
            <View style={{ gap: 4 }}>
              <Txt variant="h3" numberOfLines={1}>{t.name}</Txt>
              <Txt variant="caption" numberOfLines={2} style={{ fontSize: 12, lineHeight: 17 }}>{t.subtitle}</Txt>
            </View>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** Grid of life areas — the first thing a newcomer should understand: this is for *their* goal. */
function AreaGrid() {
  const areas = useAreas();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }}>
      {areas.map((c) => (
        <Pressable
          key={c.key}
          onPress={() => goProtected(`/tracker/new?category=${c.key}`)}
          accessibilityRole="button"
          accessibilityLabel={`${c.label}: ${AREA_EXAMPLES[c.key]}`}
          style={({ pressed }) => ({
            width: '48.5%',
            minHeight: 124,
            padding: 16,
            gap: 10,
            borderRadius: radius.lg,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: pressed ? 0.85 : 1,
          })}>
          <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: c.color + '22', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={c.icon} size={21} color={c.color} />
          </View>
          <Txt variant="h3" numberOfLines={1}>{c.label}</Txt>
          <Txt variant="caption" style={{ fontSize: 12, lineHeight: 16 }} numberOfLines={2}>{AREA_EXAMPLES[c.key]}</Txt>
        </Pressable>
      ))}
    </View>
  );
}

function Check({ color }: { color: string }) {
  return (
    <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="check-bold" size={22} />
    </View>
  );
}

/** A realistic "Today" made of different kinds of habits. */
function DayPreview() {
  return (
    <View style={{ gap: 10 }}>
      <Card>
        <Row gap={12}>
          <TrackerIcon icon="dumbbell" color="#F59E0B" size={40} />
          <View style={{ flex: 1, gap: 3 }}>
            <Txt variant="h3">Workout</Txt>
            <Row gap={4}>
              <Icon name="fire" size={14} color={colors.amber} />
              <Txt variant="caption" color={colors.amber}>14 day streak</Txt>
            </Row>
          </View>
          <Check color="#F59E0B" />
        </Row>
      </Card>
      <Card style={{ gap: 12 }}>
        <Row gap={12}>
          <TrackerIcon icon="book-open-variant" color="#14B8A6" size={40} />
          <View style={{ flex: 1, gap: 3 }}>
            <Txt variant="h3">Read</Txt>
            <Txt variant="caption">15 / 20 pages</Txt>
          </View>
          <Txt variant="mono" color="#14B8A6">75%</Txt>
        </Row>
        <ProgressBar value={0.75} color="#14B8A6" height={6} />
      </Card>
      <Card>
        <Row gap={12}>
          <TrackerIcon icon="smoking-off" color="#F43F5E" size={40} />
          <View style={{ flex: 1, gap: 3 }}>
            <Txt variant="h3">No smoking</Txt>
            <Row gap={4}>
              <Icon name="shield-check" size={14} color={colors.green} />
              <Txt variant="caption" color={colors.green}>23 clean days</Txt>
            </Row>
          </View>
          <Check color="#F43F5E" />
        </Row>
      </Card>
      <Card style={{ gap: 12 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={12}>
            <TrackerIcon icon="wallet-outline" color="#14B8A6" size={40} />
            <View style={{ gap: 3 }}>
              <Txt variant="h3">Daily budget</Txt>
              <Txt variant="caption">180 left for today</Txt>
            </View>
          </Row>
          <Txt variant="mono" color={colors.amber}>82%</Txt>
        </Row>
        <ProgressBar value={0.82} color={colors.amber} />
      </Card>
    </View>
  );
}

/** Example progress report so guests see the value before signing up. */
export function SampleReport() {
  const week = [1, 1, 1, 0, 1, 1, 1];
  return (
    <View style={{ gap: 12 }}>
      <Card>
        <Row gap={18}>
          <Ring value={0.86} size={92} stroke={10} color={colors.primary}>
            <Txt variant="h2">86%</Txt>
          </Ring>
          <View style={{ flex: 1, gap: 8 }}>
            <Txt variant="label">Sample month · 4 habits</Txt>
            <Txt variant="h3">26 of 30 days kept</Txt>
            <Row gap={6}>
              {week.map((d, i) => (
                <View key={i} style={{ flex: 1, height: 26, borderRadius: 7, backgroundColor: d ? colors.primary : colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt variant="caption" style={{ fontSize: 10 }} color={d ? colors.text : colors.textDim}>{'MTWTFSS'[i]}</Txt>
                </View>
              ))}
            </Row>
          </View>
        </Row>
      </Card>
      <AlertCard alert={{ level: 'success', title: '21-day meditation streak', message: 'Three weeks in a row. This is becoming who you are.' }} />
      <AlertCard alert={{ level: 'warning', title: 'Wednesdays are your weak spot', message: 'You miss workouts most on Wednesdays. Plan that day in advance — or set a smaller goal.' }} />
      <AlertCard alert={{ level: 'info', title: 'Food is 46% of your spending', message: 'Your biggest lever. Cutting it a little matters more than cutting everything else.' }} />
    </View>
  );
}

export function GuestHome() {
  const interests = usePrefs((s) => s.interests);
  const chosen = CATEGORIES.filter((c) => interests.includes(c.key));

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', marginBottom: 24, marginTop: 4 }}>
        <Logo />
        <Pressable onPress={() => goSignIn('login')} hitSlop={10} style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 99, backgroundColor: colors.surfaceAlt }}>
          <Txt variant="caption" color={colors.text} style={{ fontWeight: '700' }}>Sign in</Txt>
        </Pressable>
      </Row>

      {/* Hero */}
      <Gradient colors={['#271D5E', '#121628']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} sheen style={{ borderRadius: radius.xl, padding: 26, borderWidth: 1, borderColor: '#352B78' }}>
        <Txt variant="title" style={{ fontSize: 30, lineHeight: 37 }}>Build habits that stick. Break the ones that don’t.</Txt>
        <Txt color="#B8BFD0" style={{ marginTop: 12 }}>
          Workouts, reading, sleep, quitting smoking, spending less — pick what matters to you, set your own goal, and Holdfast keeps you on track every day.
        </Txt>
        {chosen.length ? (
          <Row gap={8} style={{ flexWrap: 'wrap', marginTop: 18 }}>
            {chosen.map((c) => (
              <Row key={c.key} gap={6} style={{ backgroundColor: c.color + '26', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 }}>
                <Icon name={c.icon} size={14} color={c.color} />
                <Txt variant="caption" style={{ fontSize: 13, fontWeight: '600' }}>{c.label}</Txt>
              </Row>
            ))}
          </Row>
        ) : null}
        <Button title="Start for free" icon="arrow-right" style={{ marginTop: 22 }} onPress={() => goSignIn('register')} />
        <Txt variant="caption" center style={{ marginTop: 10, fontSize: 12 }}>Free · takes 10 seconds · your data stays private</Txt>
      </Gradient>

      <SectionTitle>What do you want to change?</SectionTitle>
      <AreaGrid />

      <SectionTitle>Your day, at a glance</SectionTitle>
      <DayPreview />

      <SectionTitle>Popular ways to start</SectionTitle>
      <TemplateStrip />

      <SectionTitle>Why people stick with it</SectionTitle>
      <Card style={{ gap: 20 }}>
        {[
          ['fire', colors.amber, 'Streaks you won’t want to break', 'Every day you show up adds to your streak — and you’ll be warned before it’s about to reset.'],
          ['trophy-outline', '#EC4899', 'Levels, XP and badges', 'Earn XP for every promise kept. Unlock badges as you grow. Missing a day costs you.'],
          ['shield-lock-outline', colors.green, 'Limits that hold you back', 'Set a daily limit — cigarettes, screen time, spending, trades — and get stopped before you cross it.'],
          ['chart-box-outline', colors.blue, 'Honest weekly & monthly reports', 'See your best days, weak spots and what’s really working.'],
        ].map(([icon, color, title, text]) => (
          <Row key={title} gap={14} style={{ alignItems: 'flex-start' }}>
            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={icon} size={20} color={color} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Txt variant="h3">{title}</Txt>
              <Txt variant="caption">{text}</Txt>
            </View>
          </Row>
        ))}
      </Card>

      <SectionTitle>What your progress looks like</SectionTitle>
      <SampleReport />

      <Card style={{ marginTop: 28, gap: 14 }}>
        {[
          ['lock-outline', 'Private by default — never sold, never shared'],
          ['bell-off-outline', 'No notifications unless you allow them'],
          ['delete-outline', 'Export or delete your data anytime'],
        ].map(([icon, text]) => (
          <Row key={text} gap={12}>
            <Icon name={icon!} size={20} color={colors.green} />
            <Txt variant="caption" color={colors.text} style={{ flex: 1 }}>{text}</Txt>
          </Row>
        ))}
      </Card>

      <Gradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} sheen glow={colors.primary} style={{ borderRadius: radius.xl, padding: 28, marginTop: 28, gap: 12, alignItems: 'center' }}>
        <Icon name="anchor" size={34} />
        <Txt variant="h2" center>Small steps. Every day.</Txt>
        <Txt center style={{ opacity: 0.9 }}>That’s how real change happens. Start with one habit today.</Txt>
        <Pressable onPress={() => goSignIn('register')} style={{ backgroundColor: colors.text, paddingHorizontal: 24, paddingVertical: 14, borderRadius: radius.md, marginTop: 6 }}>
          <Txt variant="h3" color={colors.bg}>Create free account</Txt>
        </Pressable>
      </Gradient>
    </Screen>
  );
}
