import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, View } from 'react-native';
import { goProtected, goSignIn } from '@/lib/requireAuth';
import { TEMPLATES } from '@/lib/templates';
import { colors, gradients, radius } from '@/theme';
import { EquityChart } from './charts';
import { AlertCard, Button, Card, Icon, Ring, Row, Screen, SectionTitle, Stat, TrackerIcon, Txt } from './ui';

const FEATURES = [
  { icon: 'shield-lock', color: colors.green, title: 'Day lock', text: 'Target hit? The day closes. No “one more trade”.' },
  { icon: 'alert-octagon', color: colors.red, title: 'Rule-break log', text: 'Every break recorded — with your own excuse.' },
  { icon: 'trending-up', color: colors.amber, title: 'Overconfidence alerts', text: 'Warns you on winning streaks, before you blow it.' },
  { icon: 'chart-box', color: colors.blue, title: 'Weekly & monthly', text: 'Win rate, drawdown, emotions, weekdays.' },
  { icon: 'fire', color: '#EC4899', title: 'Habit streaks', text: 'Build or quit any habit, one day at a time.' },
  { icon: 'bell-ring', color: colors.primary, title: 'Smart reminders', text: 'Rules before market, journal after.' },
];

const STEPS = [
  { title: 'Set your rules', text: '1 trade a day, ₹1,000 target, ₹1,000 max loss — or any habit.' },
  { title: 'Log honestly', text: 'A quick checklist and how you feel before every trade.' },
  { title: 'See the truth', text: 'What following your rules earned, and what breaking them cost.' },
];

const SAMPLE_CURVE = [
  [1100, 1100], [2000, 2000], [3200, 3200], [4200, 4200], [2100, 5400], [3300, 6600], [2500, 7600], [3600, 8700],
].map(([actual, disciplined], i) => ({ date: String(i), actual: actual!, disciplined: disciplined! }));

function Logo() {
  return (
    <Row gap={10}>
      <LinearGradient colors={gradients.primary} style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="anchor" size={20} />
      </LinearGradient>
      <Txt variant="h2">Anchor</Txt>
    </Row>
  );
}

/** Tab-level prompt shown to guests instead of account data. */
export function GuestPrompt({ icon, title, message }: { icon: string; title: string; message: string }) {
  return (
    <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 28 }}>
      <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={28} color={colors.primary} />
      </View>
      <Txt variant="h2" center>{title}</Txt>
      <Txt variant="caption" center style={{ maxWidth: 290 }}>{message}</Txt>
      <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 8 }}>
        <Button title="Create free account" onPress={() => goSignIn('register')} />
        <Button title="I already have an account" variant="ghost" small onPress={() => goSignIn('login')} />
      </View>
    </Card>
  );
}

export function TemplateStrip() {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 16 }}>
      {TEMPLATES.map((t) => (
        <Pressable key={t.id} onPress={() => goProtected('/tracker/new')}>
          <LinearGradient
            colors={gradients.card}
            style={{ width: 150, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, gap: 10 }}>
            <TrackerIcon icon={t.icon} color={t.color} size={40} />
            <Txt variant="h3" numberOfLines={1}>{t.name}</Txt>
            <Txt variant="caption" numberOfLines={2} style={{ fontSize: 12 }}>{t.subtitle}</Txt>
          </LinearGradient>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** A realistic example report so guests can see the value before signing up. */
export function SampleReport() {
  return (
    <View style={{ gap: 12 }}>
      <Card>
        <Row gap={16}>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="label">Net P&amp;L · sample month</Txt>
            <Txt variant="hero" color={colors.green} style={{ fontSize: 32 }}>+₹3,600</Txt>
            <Txt variant="caption">12 trades · 8 days · 6🟢 2🔴</Txt>
          </View>
          <Ring value={0.72} size={84} stroke={9} color={colors.amber}>
            <Txt variant="h3">72</Txt>
            <Txt variant="caption" style={{ fontSize: 10 }}>discipline</Txt>
          </Ring>
        </Row>
        <View style={{ marginTop: 18 }}>
          <EquityChart currency="INR" points={SAMPLE_CURVE} height={140} />
        </View>
      </Card>
      <AlertCard
        alert={{
          level: 'danger',
          title: 'Breaking rules cost you ₹5,100',
          message: 'Within your rules you made ₹8,700. The trades that broke a rule took ₹5,100 back.',
        }}
      />
      <AlertCard
        alert={{
          level: 'warning',
          title: 'Winning streaks make you overconfident',
          message: 'After 3+ green days you broke rules on 50% of days, versus 10% otherwise.',
        }}
      />
    </View>
  );
}

export function GuestHome() {
  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', marginBottom: 20 }}>
        <Logo />
        <Pressable onPress={() => goSignIn('login')} hitSlop={10} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: colors.surfaceAlt }}>
          <Txt variant="caption" color={colors.text} style={{ fontWeight: '700' }}>Sign in</Txt>
        </Pressable>
      </Row>

      {/* Hero */}
      <LinearGradient colors={['#2A1F66', '#13182A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.xl, padding: 24, borderWidth: 1, borderColor: '#3A2F80' }}>
        <View style={{ alignSelf: 'flex-start', backgroundColor: colors.primarySoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, marginBottom: 14 }}>
          <Txt variant="caption" color="#C4B5FD" style={{ fontWeight: '700', fontSize: 12 }}>DISCIPLINE TRACKER</Txt>
        </View>
        <Txt variant="title" style={{ fontSize: 30, lineHeight: 36 }}>Keep the promises you make to yourself.</Txt>
        <Txt color={colors.textMuted} style={{ marginTop: 10 }}>
          Lock your trading day after one trade, build habits that stick, and see exactly what breaking your rules costs you.
        </Txt>
        <Button title="Get started — it's free" icon="arrow-right" style={{ marginTop: 20 }} onPress={() => goSignIn('register')} />
      </LinearGradient>

      {/* Lock screen preview */}
      <SectionTitle>Built for the moment you want one more trade</SectionTitle>
      <LinearGradient colors={gradients.green} style={{ borderRadius: radius.lg, padding: 20, alignItems: 'center', gap: 6 }}>
        <Icon name="shield-lock" size={40} />
        <Txt variant="h2" center>Your day is closed</Txt>
        <Txt variant="hero" center style={{ fontSize: 32 }}>+₹1,240</Txt>
        <Txt center style={{ opacity: 0.9 }}>Target reached. Close the terminal. Walk away.</Txt>
      </LinearGradient>
      <Txt variant="caption" center style={{ marginTop: 10 }}>
        Want to break the lock? A breathing pause and a written excuse first — and it’s recorded.
      </Txt>

      {/* How it works */}
      <SectionTitle>How it works</SectionTitle>
      <Card style={{ gap: 18 }}>
        {STEPS.map((s, i) => (
          <Row key={s.title} gap={14} style={{ alignItems: 'flex-start' }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Txt variant="h3">{i + 1}</Txt>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="h3">{s.title}</Txt>
              <Txt variant="caption">{s.text}</Txt>
            </View>
          </Row>
        ))}
      </Card>

      {/* Features */}
      <SectionTitle>Everything in one place</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
        {FEATURES.map((f) => (
          <View key={f.title} style={{ width: '48.5%' }}>
            <Card style={{ minHeight: 136, gap: 8 }}>
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: f.color + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={f.icon} size={20} color={f.color} />
              </View>
              <Txt variant="h3">{f.title}</Txt>
              <Txt variant="caption" style={{ fontSize: 12 }}>{f.text}</Txt>
            </Card>
          </View>
        ))}
      </View>

      {/* Templates */}
      <SectionTitle>Start in 10 seconds</SectionTitle>
      <TemplateStrip />

      {/* Sample insights */}
      <SectionTitle>What your report looks like</SectionTitle>
      <SampleReport />

      {/* Stats strip */}
      <Card style={{ marginTop: 20 }}>
        <Row>
          <Stat label="Free" value="100%" color={colors.green} />
          <Stat label="Setup" value="10 sec" />
          <Stat label="Excuses" value="0" color={colors.red} />
        </Row>
      </Card>

      {/* Final CTA */}
      <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.xl, padding: 24, marginTop: 24, gap: 12, alignItems: 'center' }}>
        <Icon name="anchor" size={34} />
        <Txt variant="h2" center>One rule. Kept every day.</Txt>
        <Txt center style={{ opacity: 0.9 }}>That’s how discipline is built.</Txt>
        <Pressable onPress={() => goSignIn('register')} style={{ backgroundColor: colors.text, paddingHorizontal: 22, paddingVertical: 13, borderRadius: radius.md, marginTop: 4 }}>
          <Txt variant="h3" color={colors.bg}>Create free account</Txt>
        </Pressable>
      </LinearGradient>
    </Screen>
  );
}
