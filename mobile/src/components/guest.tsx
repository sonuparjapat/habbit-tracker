import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, View } from 'react-native';
import { CATEGORIES } from '@/lib/catalog';
import { usePrefs } from '@/lib/prefs';
import { useTemplates } from '@/lib/queries';
import { goProtected, goSignIn } from '@/lib/requireAuth';
import { colors, gradients, radius } from '@/theme';
import { EquityChart } from './charts';
import { AlertCard, Button, Card, Icon, ProgressBar, Ring, Row, Screen, SectionTitle, TrackerIcon, Txt } from './ui';

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

/** Horizontal strip of templates, prioritising the user's chosen interests. */
export function TemplateStrip() {
  const { data } = useTemplates();
  const interests = usePrefs((s) => s.interests);
  if (!data?.length) return null;
  const list = interests.length ? [...data.filter((t) => interests.includes(t.category)), ...data.filter((t) => !interests.includes(t.category))] : data;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 20 }} style={{ marginHorizontal: -20, paddingLeft: 20 }}>
      {list.slice(0, 12).map((t) => (
        <Pressable key={t.slug} onPress={() => goProtected(`/tracker/new?category=${t.category}`)}>
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

/** Example report so guests see the value before signing up. */
export function SampleReport() {
  return (
    <View style={{ gap: 12 }}>
      <Card>
        <Row gap={16}>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="label">Sample month · trading</Txt>
            <Txt variant="hero" color={colors.green} style={{ fontSize: 32 }}>+3,600</Txt>
            <Txt variant="caption">12 trades · 8 days</Txt>
          </View>
          <Ring value={0.72} size={84} stroke={9} color={colors.amber}>
            <Txt variant="h3">72</Txt>
            <Txt variant="caption" style={{ fontSize: 10 }}>discipline</Txt>
          </Ring>
        </Row>
        <View style={{ marginTop: 20 }}>
          <EquityChart currency="USD" points={SAMPLE_CURVE} height={130} />
        </View>
      </Card>
      <AlertCard alert={{ level: 'danger', title: 'Breaking rules cost you 5,100', message: 'Within your rules you made 8,700. The trades that broke a rule took 5,100 back.' }} />
      <AlertCard alert={{ level: 'warning', title: 'Food is 46% of your spending', message: 'This is your biggest lever. Cutting it a little matters more than cutting everything else.' }} />
      <AlertCard alert={{ level: 'success', title: '14-day workout streak', message: 'Two weeks in a row. This is becoming who you are.' }} />
    </View>
  );
}

function Preview() {
  return (
    <View style={{ gap: 12 }}>
      <LinearGradient colors={gradients.green} style={{ borderRadius: radius.lg, padding: 22, gap: 6 }}>
        <Row gap={10}>
          <Icon name="shield-lock" size={26} />
          <Txt variant="h3">Trading day closed</Txt>
        </Row>
        <Txt style={{ opacity: 0.92 }}>Target reached. Close the terminal and walk away.</Txt>
      </LinearGradient>
      <Card style={{ gap: 12 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={10}>
            <TrackerIcon icon="wallet-outline" color={colors.green} size={36} />
            <Txt variant="h3">Daily budget</Txt>
          </Row>
          <Txt variant="mono" color={colors.amber}>82%</Txt>
        </Row>
        <ProgressBar value={0.82} color={colors.amber} />
        <Txt variant="caption">Almost at your limit — 180 left for today</Txt>
      </Card>
      <Card>
        <Row gap={10}>
          <TrackerIcon icon="smoking-off" color={colors.red} size={36} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">No smoking</Txt>
            <Row gap={4}>
              <Icon name="fire" size={14} color={colors.amber} />
              <Txt variant="caption" color={colors.amber}>23 clean days</Txt>
            </Row>
          </View>
          <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check-bold" size={22} />
          </View>
        </Row>
      </Card>
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
      <LinearGradient colors={['#271D5E', '#121628']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.xl, padding: 26, borderWidth: 1, borderColor: '#352B78' }}>
        <Txt variant="title" style={{ fontSize: 30, lineHeight: 37 }}>Keep the promises you make to yourself.</Txt>
        <Txt color="#B8BFD0" style={{ marginTop: 12 }}>
          Set your own limits for trading, spending, health or any habit — and get stopped before you break them.
        </Txt>
        {chosen.length ? (
          <Row gap={8} style={{ flexWrap: 'wrap', marginTop: 18 }}>
            {chosen.map((c) => (
              <Row key={c.key} gap={6} style={{ backgroundColor: c.color + '26', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 }}>
                <Icon name={c.icon} size={14} color={c.color} />
                <Txt variant="caption" color={colors.text} style={{ fontSize: 13 }}>{c.label}</Txt>
              </Row>
            ))}
          </Row>
        ) : null}
        <Button title="Get started — it’s free" icon="arrow-right" style={{ marginTop: 22 }} onPress={() => goSignIn('register')} />
      </LinearGradient>

      <SectionTitle>Start in seconds</SectionTitle>
      <TemplateStrip />

      <SectionTitle>How it feels</SectionTitle>
      <Preview />

      <SectionTitle>How it works</SectionTitle>
      <Card style={{ gap: 22 }}>
        {[
          ['Choose what matters', 'Trading, money, fitness, focus, or a habit to quit.'],
          ['Set your own limits', 'One trade a day. A daily budget. Five cigarettes max. Your rules.'],
          ['Get honest feedback', 'Streaks, rule breaks, and weekly & monthly reports that tell you the truth.'],
        ].map(([title, text], i) => (
          <Row key={title} gap={14} style={{ alignItems: 'flex-start' }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Txt variant="h3">{i + 1}</Txt>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Txt variant="h3">{title}</Txt>
              <Txt variant="caption">{text}</Txt>
            </View>
          </Row>
        ))}
      </Card>

      <SectionTitle>What your reports look like</SectionTitle>
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

      <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.xl, padding: 28, marginTop: 28, gap: 12, alignItems: 'center' }}>
        <Icon name="anchor" size={34} />
        <Txt variant="h2" center>One promise. Kept every day.</Txt>
        <Txt center style={{ opacity: 0.9 }}>That’s how discipline is built.</Txt>
        <Pressable onPress={() => goSignIn('register')} style={{ backgroundColor: colors.text, paddingHorizontal: 24, paddingVertical: 14, borderRadius: radius.md, marginTop: 6 }}>
          <Txt variant="h3" color={colors.bg}>Create free account</Txt>
        </Pressable>
      </LinearGradient>
    </Screen>
  );
}
